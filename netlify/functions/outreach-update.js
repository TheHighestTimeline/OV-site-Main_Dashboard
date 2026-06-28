import { airtableGet, airtableUpdate, toAirtableFields, OUTREACH_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OUTREACH || 'Outreach';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'PATCH') return err(405, 'Method not allowed');

  try {
    const { id, status, assignedTo, notes, emailSent, dmSent, nextAction, updateNote } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');

    const update = {};
    if (status     !== undefined) update.status     = status;
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    if (notes      !== undefined) update.notes      = notes;
    if (nextAction !== undefined) update.nextAction = nextAction;
    if (emailSent  !== undefined) update.emailSent  = !!emailSent;
    if (dmSent     !== undefined) update.dmSent     = !!dmSent;

    // Inline note: fetch existing Notes field, append timestamp + text, write back
    if (updateNote && String(updateNote).trim()) {
      const record = await airtableGet(TABLE(), id);
      const existing = record.fields?.['Notes'] || '';
      const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const appended = existing
        ? `${existing}\n[${ts}] ${updateNote.trim()}`
        : `[${ts}] ${updateNote.trim()}`;
      update.notes = appended;
    }

    const fields = toAirtableFields(update, OUTREACH_MAP);
    if (Object.keys(fields).length === 0) return ok({ id, updated: false });

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    console.error('outreach-update error:', e);
    return err(500, e.message);
  }
};
