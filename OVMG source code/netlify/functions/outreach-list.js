import { airtableList, fromAirtableRecord, OUTREACH_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OUTREACH || 'Outreach';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE());

    const leads = records.map(r => ({
      ...fromAirtableRecord(r, OUTREACH_MAP),
      airtableLink: r.fields['Airtable Link'] || '',
      createdTime:  r.createdTime || null,
      url:          null, // Notion page URL — not applicable in Airtable
    }));

    // Return same shape as Notion version so UI doesn't break
    return ok({ leads, databaseId: null });
  } catch (e) {
    if (e.message?.includes('403') || e.message?.includes('404') || e.message?.includes('not found')) {
      return ok({ leads: [], databaseId: null });
    }
    console.error('outreach-list error:', e);
    return err(500, e.message);
  }
};
