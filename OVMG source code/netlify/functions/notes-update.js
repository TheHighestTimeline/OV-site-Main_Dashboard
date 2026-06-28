import { airtableUpdate, NOTES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_NOTES || 'Notes';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { id, title, body } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');

    const fields = {};
    if (title !== undefined) fields[NOTES_MAP.title] = String(title || '');
    if (body  !== undefined) fields[NOTES_MAP.body]  = body || '';

    if (Object.keys(fields).length === 0) return err(400, 'No fields to update');

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
