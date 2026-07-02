// notes-delete — deletes a note. Notes live in the shared Activities table
// as of 2026-07 (see notes-create.js).
import { airtableDelete } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');
    await airtableDelete(TABLE(), id);
    return ok({ id, deleted: true });
  } catch (e) {
    return err(500, e.message);
  }
};
