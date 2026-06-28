import { airtableList, fromAirtableRecord, GOALS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_GOALS || 'Goals';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Quarter', direction: 'asc' }],
    });

    const goals = records.map(r => {
      const g = fromAirtableRecord(r, GOALS_MAP);
      g.progress = g.progress ?? 0;
      g.category = Array.isArray(g.category) ? g.category : (g.category ? [g.category] : []);
      return g;
    });

    return ok(goals);
  } catch (e) {
    if (e.message?.includes('403') || e.message?.includes('404') || e.message?.includes('not found')) {
      return ok([]);
    }
    return err(500, e.message);
  }
};
