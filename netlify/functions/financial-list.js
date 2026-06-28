import { airtableList, fromAirtableRecord, FINANCIAL_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_FINANCIAL || 'Financial';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE());

    const items = records.map(r => {
      const item    = fromAirtableRecord(r, FINANCIAL_MAP);
      const target  = item.target        ?? 0;
      const current = item.currentAmount ?? 0;
      item.progress = target > 0 ? current / target : 0;
      return item;
    });

    return ok(items);
  } catch (e) {
    if (e.message?.includes('403') || e.message?.includes('404') || e.message?.includes('not found')) {
      return ok([]);
    }
    return err(500, e.message);
  }
};
