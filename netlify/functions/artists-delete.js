import { airtableDelete } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CLIENTS || 'OVM Clients DB';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  if (!body.id) return err(400, 'id required');

  try {
    await airtableDelete(TABLE(), body.id);
    return ok({ id: body.id, deleted: true });
  } catch (e) {
    console.error('[social:artists-delete]', e.message);
    return err(500, e.message);
  }
};
