import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CLIENTS || 'OVM Clients DB';

// Lightweight list for form dropdowns: id + name (+ type).
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE());
    const clients = records.map(r => ({
      id:   r.id,
      name: r.fields?.['Client Name'] || '(unnamed client)',
      type: r.fields?.['Client Type'] || null,
    }));
    return ok(clients);
  } catch (e) {
    if (/403|404|not found/i.test(e.message)) return ok([]);
    return err(500, e.message);
  }
};
