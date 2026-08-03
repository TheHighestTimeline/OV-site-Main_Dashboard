// Shared AI parsing core — used by voice-parse.js (interactive), the Granola
// poller, and the call-ingest webhook so every transcript goes through ONE
// prompt + parsing path (2026-07 audit §4).
//
// Robust structured parsing (§1.3): a FORCED tool call guarantees valid JSON.
// Long sections get a large output budget so big memos never truncate. One
// retry on failure.
import Anthropic from '@anthropic-ai/sdk';
import { logUsage, tokensFromAnthropic } from './_usage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LONG_SECTIONS = new Set(['audio-dump', 'my-day', 'call-review']);

export async function parseTranscript({ transcript, section = 'general', ctx = {}, event = null, user = null }) {
  const systemPrompt = buildSystemPrompt(section, ctx);
  try { return await callParse({ systemPrompt, transcript, section, event, user }); }
  catch (e1) {
    console.warn('parseTranscript first attempt failed, retrying:', e1.message);
    return await callParse({ systemPrompt, transcript, section, event, user });
  }
}

async function callParse({ systemPrompt, transcript, section, event, user }) {
  const response = await anthropic.messages.create({
    model:       'claude-sonnet-5',
    max_tokens:  LONG_SECTIONS.has(section) ? 8192 : 2048,
    system:      systemPrompt,
    tools: [{
      name:         'emit_result',
      description:  'Emit the structured result. The object must follow the exact shape described in the system prompt.',
      input_schema: { type: 'object' },
    }],
    tool_choice: { type: 'tool', name: 'emit_result' },
    messages:    [{ role: 'user', content: `Transcript: "${transcript}"` }],
  });

  try {
    await logUsage({
      event, service: 'anthropic', surface: `voice-parse:${section}`,
      operation: 'messages.create', model: 'claude-sonnet-5',
      ...tokensFromAnthropic(response),
      user,
    });
  } catch (_) { /* swallow */ }

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (toolBlock?.input && typeof toolBlock.input === 'object') return toolBlock.input;

  const textBlock = response.content.find(b => b.type === 'text');
  if (textBlock) {
    const jsonStr = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(jsonStr);
  }
  throw new Error('Model returned no structured output');
}

// ── Prompt builder ────────────────────────────────────────────────────────────
export function buildSystemPrompt(section, ctx) {
  // Compact {id,...} records for FAR more tasks/contacts (§1.3) — matching
  // quality degraded exactly as the CRM grew. 200 compact rows is still cheap.
  const compactTask    = t => ({ id: t.id, task: t.task || t.name, status: t.status, owner: t.owner, dueDate: t.dueDate });
  const compactContact = c => ({ id: c.id, name: c.name, company: c.company, email: c.email });
  const tasksJSON    = ctx?.tasks    ? JSON.stringify(ctx.tasks.slice(0, 200).map(compactTask))       : '[]';
  const contactsJSON = ctx?.contacts ? JSON.stringify(ctx.contacts.slice(0, 200).map(compactContact)) : '[]';
  const today        = new Date().toISOString().slice(0, 10);

  if (section === 'my-day') {
    return `You are an AI assistant for a media company internal dashboard. Today is ${today}.
The user has just recorded a voice memo about their workday. Your job is to:
1. Match what they said against their active tasks
2. Identify status updates, new tasks, and notes

Active tasks (JSON):
${tasksJSON}

Return a JSON object with this exact shape:
{
  "summary": "1-2 sentence summary of the day",
  "taskUpdates": [
    {
      "taskId": "<record id or null if no match>",
      "taskTitle": "<matched task name>",
      "newStatus": "<Done|In Progress|Not Started|On Hold|Waiting On Response|Needs Attention|Submitted|Canceled|null>",
      "note": "<what the user said about this task>",
      "confidence": 0.0-1.0
    }
  ],
  "newTasks": [
    { "task": "<task description>", "priority": "High|Medium|Low", "category": [] }
  ],
  "notes": [
    { "title": "<short title>", "body": "<full note text>" }
  ]
}

Match tasks by semantic similarity. Only include tasks the user actually mentioned. Use null taskId if no task matches.`;
  }

  if (section === 'new-task' || section === 'task-update') {
    return `You are an AI assistant parsing a voice command for task management. Today is ${today}.
Active tasks: ${tasksJSON}

For a new task command, return:
{
  "task": { "task": "...", "owner": "...", "priority": "High|Medium|Low", "status": "Not Started", "dueDate": "YYYY-MM-DD or null" }
}

For an update command, return:
{
  "newStatus": "Done|In Progress|Not Started|On Hold|Waiting On Response|Needs Attention|Submitted|Canceled|null",
  "summary": "brief description of the update"
}

Parse natural language like "mark it done", "finished that", "push to next week", etc.`;
  }

  // ── threads: capture into the Threads ecosystem (WP10) ─────────────────────
  // Returns tasks with the links the board actually needs (entity, owner, due
  // date, opportunity, participation) rather than a bare title. A task missing
  // entity, owner or due date lands in the Inbox lane instead of on the board,
  // so the parser is told to leave fields null rather than guess them.
  //
  // The client ALWAYS shows a confirm screen before any of this is written.
  // Entity and owner get guessed wrong often enough that writing blind poisons
  // the board, and a poisoned board is abandoned within a week.
  if (section === 'threads') {
    const participationsJSON = ctx?.participations
      ? JSON.stringify(ctx.participations.slice(0, 150).map(p => ({
          id: p.id, contact: p.contactName, workstream: p.workstreamName,
          stage: p.stageLabel, entity: p.entity,
        })))
      : '[]';
    const workstreamsJSON = ctx?.workstreams
      ? JSON.stringify(ctx.workstreams.slice(0, 100).map(w => ({ id: w.id, name: w.name, entity: w.entity })))
      : '[]';

    return `You are parsing a spoken update from the COO of OneVibe Media Group into structured
actions for the Threads tab. Today is ${today}.

Active tasks (JSON): ${tasksJSON}
Known contacts (JSON): ${contactsJSON}
Participations, meaning one person inside one workstream (JSON): ${participationsJSON}
Workstreams (JSON): ${workstreamsJSON}

Return a JSON object with this exact shape. Never omit a key; use empty arrays and nulls.
{
  "summary": "one sentence on what was said",
  "newTasks": [
    {
      "actionName": "<concrete action, imperative>",
      "entity": "<entity name from the lists above, or null>",
      "owner": "<person's name if one was named, or null>",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "High|Medium|Low",
      "opportunityId": "<workstream id from the list, or null>",
      "participationId": "<participation id from the list, or null>",
      "contactId": "<contact id from the list, or null>",
      "confidence": 0.0-1.0
    }
  ],
  "taskUpdates": [
    { "taskId": "<id from active tasks, or null>", "taskTitle": "<matched name>",
      "newStatus": "<Done|In Progress|Not Started|On Hold|Waiting On Response|Needs Attention|Submitted|Canceled|null>",
      "note": "<what was said>", "confidence": 0.0-1.0 }
  ],
  "focusRequests": [
    { "taskId": "<id from active tasks, or null>", "taskTitle": "<matched name>",
      "focus": "Doing Now|Next Up", "confidence": 0.0-1.0 }
  ],
  "stageChanges": [
    { "participationId": "<id from participations>", "toStage": "<stage name>",
      "note": "<what was said>", "confidence": 0.0-1.0 }
  ],
  "notes": [
    { "participationId": "<id or null>", "contactId": "<id or null>", "text": "<the note>" }
  ]
}

RULES:
- NEVER invent an id. If you cannot match confidently against the lists above, use null.
  A null lands the item in a review lane, which is recoverable. A wrong id is not.
- Leave entity, owner or dueDate null when they were not actually said. Do not infer an
  entity from the topic. Tasks missing those fields go to an Inbox lane on purpose.
- "put X on today's list" or "I'm doing X today" is a focusRequest with focus "Doing Now",
  not a new task, when X matches an existing task.
- Convert relative dates to absolute YYYY-MM-DD based on today.
- Stage names must come from this list: Initial Outreach, NCNDA Sent, NCNDA Signed,
  Discovery Call, Contract Negotiation, Deal Finalization, Closed, Stalled, Archived.
- Do not use em dashes.`;
  }

  if (section === 'new-contact') {
    return `You are an AI assistant parsing a voice command to add a new contact to a CRM.
Return:
{
  "contact": {
    "name": "...", "company": "...", "role": "...",
    "email": "...", "phone": "...",
    "type": "External|Internal", "status": "Active"
  }
}
Use empty string for any field not mentioned.`;
  }

  // audio-dump and call-review share the same extraction shape — call-review
  // additionally knows it is reading a MEETING transcript with attendees.
  if (section === 'audio-dump' || section === 'call-review') {
    const intro = section === 'call-review'
      ? `You are an AI assistant for a media company internal dashboard, reviewing the transcript of a
recorded call/meeting so it can be triaged into concrete CRM/task actions that a human will
APPROVE before anything is written. Attendees (if known): ${JSON.stringify(ctx?.attendees || [])}. Today is ${today}.`
      : `You are an AI assistant for a media company internal dashboard, reviewing a senior partner's
raw voice memo ("audio dump") so it can be triaged into concrete CRM/task actions. Today is ${today}.`;
    return `${intro}
Active tasks (JSON): ${tasksJSON}
Known contacts (JSON): ${contactsJSON}

Extract every distinct actionable item you can find. Return a JSON object with this exact shape
(use empty arrays for any category with nothing to report — never omit a key):
{
  "summary": "1-2 sentence summary of the whole ${section === 'call-review' ? 'call' : 'memo'}",
  "taskUpdates": [
    { "taskId": "<id or null if no confident match>", "taskTitle": "<matched task name>",
      "newStatus": "<Done|In Progress|Not Started|On Hold|Waiting On Response|Needs Attention|Submitted|Canceled|null>",
      "note": "<what was said about this task>", "confidence": 0.0-1.0 }
  ],
  "newTasks": [
    { "task": "<description>", "owner": "<name if mentioned>", "priority": "High|Medium|Low", "dueDate": "YYYY-MM-DD or null" }
  ],
  "newContacts": [
    { "name": "...", "company": "...", "role": "...", "email": "...", "phone": "...", "type": "External|Internal" }
  ],
  "contactUpdates": [
    { "contactId": "<id or null if no confident match>", "name": "<matched contact name>", "note": "<what was said>" }
  ],
  "notes": [
    { "title": "<short title, 5 words max>", "body": "<full note text>" }
  ]
}

Only match an existing taskId/contactId when you are confident — otherwise leave it null and let the
new-task/new-contact arrays or a plain note carry the content. Prefer specific, actionable items over
vague summaries; a rambling ${section === 'call-review' ? 'call' : 'memo'} should still yield structured entries wherever intent is clear.
Convert relative dates to absolute YYYY-MM-DD based on today.`;
  }

  if (section === 'contact-note') {
    const contactName = ctx?.contactName || 'this contact';
    return `You are an AI assistant logging a voice note about ${contactName} in a CRM. Today is ${today}.
The user just spoke a note after (or about) an interaction with this contact. Capture the note AND pull
out any follow-up actions they mentioned or clearly implied ("I need to send the deck", "circle back next
week", "remind me to call Friday"). Convert relative dates to absolute YYYY-MM-DD based on today.

Return a JSON object with this exact shape (use an empty array / null when nothing applies - never omit a key):
{
  "summary": "one sentence summary of the note",
  "title": "short title for the note (5 words max)",
  "tasks": [
    { "task": "<concrete action, imperative>", "dueDate": "YYYY-MM-DD or null",
      "priority": "High|Medium|Low", "taskType": "Task|Reminder" }
  ],
  "nextAction": "<the single most important next move in a few words, or null>",
  "nextActionDate": "YYYY-MM-DD or null"
}

Use "Reminder" as taskType for time-based nudges ("remind me to...", "follow up on...") and "Task" for
concrete deliverables. Only include tasks that were actually expressed - do not invent busywork.`;
  }

  if (section === 'contact-suggest') {
    const contactName = ctx?.contactName || 'this contact';
    return `You are a relationship-management strategist for OneVibe, a media company. Today is ${today}.
Given a CRM contact and their recent notes/activity, recommend the single best next move.
Contact + history are provided in the transcript field as JSON.

Return a JSON object with this exact shape (never omit a key):
{
  "summary": "2-3 sentence synthesis of where this relationship stands",
  "nextAction": "the concrete next move in a few words",
  "nextActionDate": "YYYY-MM-DD (a sensible target based on urgency/staleness)",
  "reasoning": "one sentence on why this is the right next step for ${contactName}"
}`;
  }

  if (section === 'contact-draft') {
    const contactName = ctx?.contactName || 'this contact';
    return `You are drafting a warm, concise follow-up message from a OneVibe partner to ${contactName}. Today is ${today}.
The contact + recent notes/activity are provided in the transcript field as JSON. Write a ready-to-send
message that references the relationship context naturally, has a clear ask or next step, and sounds human
(not templated). Keep it under 120 words. ${ctx?.channel === 'text' ? 'Make it a short SMS/DM - 2-3 sentences, no subject line.' : 'Format as an email with a subject line.'}

Return a JSON object with this exact shape:
{
  "subject": "${ctx?.channel === 'text' ? 'null (no subject for texts)' : 'a short email subject line'}",
  "message": "the full message body"
}`;
  }

  if (section === 'contact-prioritize') {
    return `You are a business-development chief of staff for OneVibe. Today is ${today}.
You are given a list of CRM contacts (with last-contacted staleness, status, next action, and a one-line
note snippet) in the transcript field as JSON. Rank who the user should reach out to today and why.

Return a JSON object with this exact shape:
{
  "ranked": [
    { "contactId": "<id from the input>", "name": "<name>",
      "reason": "one sentence on why they're a priority now",
      "suggestedAction": "the concrete move (call, email, send X)" }
  ]
}
Return at most 8, most urgent first. Weigh staleness, Active status, and overdue next-action dates.`;
  }

  return `You are an AI assistant for a media company internal dashboard. Today is ${today}.
Active tasks: ${tasksJSON}
Contacts: ${contactsJSON}

Return a JSON object:
{
  "summary": "what you understood",
  "actions": [
    { "type": "create_task|update_task|add_note|add_contact|other", "description": "..." }
  ]
}`;
}
