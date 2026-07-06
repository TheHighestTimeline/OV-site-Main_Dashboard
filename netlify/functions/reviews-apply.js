// Apply APPROVED actions from a call review to Airtable (2026-07 audit §4).
// The client sends the (possibly edited) subset of actions the reviewer
// checked. Each action is applied independently; partial failures are
// recorded rather than aborting the batch. This is the ONLY path from the
// review queue into the CRM.
//
// Action kinds:
//   { kind:'newTask',       task, priority?, owner?, dueDate?, entity? }
//   { kind:'taskUpdate',    taskId, newStatus?, note? }
//   { kind:'newContact',    name, company?, role?, email?, phone?, type? }
//   { kind:'contactNote',   contactId, title?, note }        → Activities row linked to contact
//   { kind:'note',          title, body }                    → Activities row (unlinked)
import { getSupabase } from './_supabase.js';
import { requireRole, getUser } from './_auth.js';
import { ok, err, CORS } from './_http.js';
import {
  airtableCreate, airtableUpdate, toAirtableFields,
  TASKS_MAP, CONTACTS_MAP,
} from './_airtable.js';

const TASKS_TABLE      = () => process.env.AIRTABLE_TABLE_TASKS      || 'Master Action Board';
const CONTACTS_TABLE   = () => process.env.AIRTABLE_TABLE_CONTACTS   || 'CRM Contacts';
const ACTIVITIES_TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

async function applyOne(action, meta) {
  switch (action.kind) {
    case 'newTask': {
      const obj = { task: action.task, status: action.status || 'Not Started' };
      if (action.priority) obj.priority = action.priority;
      if (action.dueDate)  obj.dueDate  = action.dueDate;
      if (action.entity)   obj.entity   = action.entity;
      if (action.taskType) obj.taskType = action.taskType;
      const rec = await airtableCreate(TASKS_TABLE(), toAirtableFields(obj, TASKS_MAP));
      return { id: rec.id, table: 'tasks' };
    }
    case 'taskUpdate': {
      if (!action.taskId) throw new Error('taskUpdate requires taskId');
      const obj = {};
      if (action.newStatus) obj.status = action.newStatus;
      const fields = toAirtableFields(obj, TASKS_MAP);
      // Append the note to Description so context isn't lost.
      if (action.note) fields['Description'] = `${action.note}\n(from ${meta.sourceLabel})`;
      const rec = await airtableUpdate(TASKS_TABLE(), action.taskId, fields);
      return { id: rec.id, table: 'tasks' };
    }
    case 'newContact': {
      const rec = await airtableCreate(CONTACTS_TABLE(), toAirtableFields({
        name:   action.name,
        role:   action.role   || '',
        email:  action.email  || '',
        phone:  action.phone  || '',
        status: 'Active',
        type:   action.type   || 'External',
        source: meta.sourceLabel,
      }, CONTACTS_MAP));
      return { id: rec.id, table: 'contacts' };
    }
    case 'contactNote': {
      if (!action.contactId) throw new Error('contactNote requires contactId');
      const fields = {
        'Title':      action.title || `Call note — ${meta.title}`,
        'Type':       'Call',
        'Source':     meta.sourceLabel,
        'Date':       (meta.callDate || new Date().toISOString()).slice(0, 10),
        'Body':       action.note || '',
        'AI Summary': meta.summary || '',
        'Contact':    [action.contactId],
      };
      const rec = await airtableCreate(ACTIVITIES_TABLE(), fields);
      return { id: rec.id, table: 'activities' };
    }
    case 'note': {
      const fields = {
        'Title':  action.title || `Note — ${meta.title}`,
        'Type':   'Note',
        'Source': meta.sourceLabel,
        'Date':   (meta.callDate || new Date().toISOString()).slice(0, 10),
        'Body':   action.body || '',
      };
      const rec = await airtableCreate(ACTIVITIES_TABLE(), fields);
      return { id: rec.id, table: 'activities' };
    }
    default:
      throw new Error(`Unknown action kind: ${action.kind}`);
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const gate = await requireRole(event, ['admin', 'executive', 'operations', 'senior_partner']);
  if (gate) return gate;
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const user = await getUser(event).catch(() => null);
    const { id, actions } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');
    if (!Array.isArray(actions)) return err(400, 'actions array is required');

    const sb = getSupabase();
    const { data: review, error: loadErr } = await sb.from('call_reviews').select('*').eq('id', id).single();
    if (loadErr || !review) return err(404, 'Review not found');
    if (review.status === 'approved') return err(409, 'Review already applied');

    const meta = {
      title:       review.title || 'call',
      summary:     review.summary || '',
      callDate:    review.call_date,
      sourceLabel: review.source === 'audio-dump' ? 'Audio Dump (reviewed)' : 'Call review (Granola)',
    };

    const applied = [];
    const failures = [];
    for (const action of actions) {
      try {
        const result = await applyOne(action, meta);
        applied.push({ ...action, result });
      } catch (e) {
        failures.push({ ...action, error: e.message });
      }
    }

    const status = failures.length === 0 ? 'approved' : applied.length > 0 ? 'partial' : 'error';
    await sb.from('call_reviews').update({
      status,
      applied_actions: applied,
      error:           failures.length ? JSON.stringify(failures).slice(0, 2000) : null,
      reviewed_by:     user?.email || null,
      reviewed_at:     new Date().toISOString(),
    }).eq('id', id);

    return ok({ status, appliedCount: applied.length, failures });
  } catch (e) {
    console.error('reviews-apply error:', e);
    return err(500, e.message);
  }
};
