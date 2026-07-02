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
    return `You are an AI assistant logging a voice note about ${contactName}.
Return:
{
  "summary": "one sentence summary of the note",
  "title": "short title for the note (5 words max)"
}`;
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
