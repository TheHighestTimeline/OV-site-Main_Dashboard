// netlify/functions/amplify-projects-update.js
// PATCH a single Amplify Projects record (primarily used to update Status via kanban drag).
import { airtableUpdate } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_AMPLIFY_PROJECTS || 'Amplify Projects';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, status, notes, priority, dueDate } = body;

    if (!id) return err(400, 'id is required');

    const fields = {};
    if (status    !== undefined) fields['Status']        = status;
    if (notes     !== undefined) fields['Internal Notes'] = notes;
    if (priority  !== undefined) fields['Priority']      = priority;
    if (dueDate   !== undefined) fields['Due Date']      = dueDate || null;

    if (!Object.keys(fields).length) return err(400, 'No fields to update');

    const rec = await airtableUpdate(TABLE(), id, fields);
    return ok({ id: rec.id });
  } catch (e) {
    return err(500, e.message);
  }
};
