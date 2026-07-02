import { airtableGet, airtableUpdate, toAirtableFields, TASKS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, task, status, priority, owner, dueDate, dealCategory, taskType, entity, type,
            contactIds, relatedProjectIds, opportunityIds, clientIds, updateNote } = body;
    if (!id) return err(400, 'id is required');

    const update = {};
    if (task         !== undefined) update.task         = task;
    if (status       !== undefined) update.status       = status;
    if (priority     !== undefined) update.priority     = priority;
    if (owner        !== undefined) update.owner        = owner;
    if (dueDate      !== undefined) update.dueDate      = dueDate || null;
    if (taskType     !== undefined) update.taskType     = taskType || null;
    if (entity       !== undefined) update.entity       = entity || null;
    if (type         !== undefined) update.type         = type || null;
    if (dealCategory !== undefined) update.dealCategory = Array.isArray(dealCategory) ? dealCategory : [dealCategory].filter(Boolean);

    // Inline note: append timestamp + text to the Description field, preserving prior content.
    if (updateNote && String(updateNote).trim()) {
      const record = await airtableGet(TABLE(), id);
      const existing = record.fields?.['Description'] || '';
      const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const appended = existing
        ? `${existing}\n[${ts}] ${updateNote.trim()}`
        : `[${ts}] ${updateNote.trim()}`;
      update.notes = appended;
    }

    const fields = toAirtableFields(update, TASKS_MAP);
    // Linked-record fields (arrays of record IDs). Passing [] clears the link.
    if (contactIds        !== undefined) fields['Contact']         = Array.isArray(contactIds)        ? contactIds        : [];
    if (relatedProjectIds !== undefined) fields['Related Project'] = Array.isArray(relatedProjectIds) ? relatedProjectIds : [];
    if (opportunityIds    !== undefined) fields['Opportunity']     = Array.isArray(opportunityIds)    ? opportunityIds    : [];
    if (clientIds         !== undefined) fields['Client']          = Array.isArray(clientIds)         ? clientIds         : [];

    if (Object.keys(fields).length === 0) return ok({ id, updated: false });

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
