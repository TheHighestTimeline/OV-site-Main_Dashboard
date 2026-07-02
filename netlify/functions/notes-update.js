// notes-update — edits a note. Notes live in the shared Activities table
// as of 2026-07 (see notes-create.js).
import { airtableUpdate } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const ACTIVITIES_MAP = {
  title: 'Title',
  body:  'Body',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { id, title, body } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');

    const fields = {};
    if (title !== undefined) fields[ACTIVITIES_MAP.title] = String(title || '');
    if (body  !== undefined) fields[ACTIVITIES_MAP.body]  = body || '';

    if (Object.keys(fields).length === 0) return err(400, 'No fields to update');

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
