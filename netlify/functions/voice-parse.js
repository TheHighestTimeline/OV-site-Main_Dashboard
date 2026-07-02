// Takes a transcript + context (section, existing tasks/contacts) and uses
// Claude Sonnet to parse intent and return structured actions.
import Anthropic from '@anthropic-ai/sdk';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { logUsage, tokensFromAnthropic } from './_usage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const { transcript, context: ctx } = JSON.parse(event.body || '{}');
    if (!transcript) return err(400, 'transcript is required');

    const section      = ctx?.section || 'general';
    const systemPrompt = buildSystemPrompt(section, ctx);
    const userPrompt   = `Transcript: "${transcript}"\n\nReturn only valid JSON, no markdown, no explanation.`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-5',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    // FN-1: log to usage_events
    try {
      const u = await getUser(event);
      await logUsage({
        event, service: 'anthropic', surface: 'voice-parse',
        operation: 'messages.create', model: 'claude-sonnet-5',
        ...tokensFromAnthropic(response),
        user: u,
      });
    } catch (_) { /* swallow */ }

    const raw     = response.content[0].text.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed  = JSON.parse(jsonStr);

    return ok(parsed);
  } catch (e) {
    console.error('voice-parse error:', e);
    return err(500, e.message);
  }
};

function buildSystemPrompt(section, ctx) {
  const tasksJSON    = ctx?.tasks    ? JSON.stringify(ctx.tasks.slice(0, 30))    : '[]';
  const contactsJSON = ctx?.contacts ? JSON.stringify(ctx.contacts.slice(0, 20)) : '[]';
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
      "taskId": "<notion page id or null if no match>",
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

  if (section === 'audio-dump') {
    return `You are an AI assistant for a media company internal dashboard, reviewing a senior partner's
raw voice memo ("audio dump") so it can be triaged into concrete CRM/task actions. Today is ${today}.
Active tasks (JSON): ${tasksJSON}
Known contacts (JSON): ${contactsJSON}

Extract every distinct actionable item you can find. Return a JSON object with this exact shape
(use empty arrays for any category with nothing to report — never omit a key):
{
  "summary": "1-2 sentence summary of the whole memo",
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
vague summaries; a rambling memo should still yield structured entries wherever intent is clear.`;
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
