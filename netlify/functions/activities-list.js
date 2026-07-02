import { airtableList, fromAirtableRecord } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const ACTIVITIES_MAP = {
  title:     'Title',
  type:      'Type',
  source:    'Source',
  date:      'Date',
  body:      'Body',
  driveLink: 'Drive Link',
  aiSummary: 'AI Summary',
};

// Optional query params: ?contactId=recXXX  ?companyId=recXXX
// Airtable's list endpoint has no native "linked record contains" filter
// without a formula, so filtering by contact/company happens here in JS —
// same approach tasks-list.js uses for owner/project name resolution.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Date', direction: 'desc' }],
    });

    let activities = records.map(r => {
      const a = fromAirtableRecord(r, ACTIVITIES_MAP);
      a.type = a.type?.name || a.type || null;
      a.source = a.source?.name || a.source || null;
      a.contactIds = r.fields['Contact'] || [];
      a.companyIds = r.fields['Company'] || [];
      return a;
    });

    if (params.contactId) {
      activities = activities.filter(a => a.contactIds.includes(params.contactId));
    }
    if (params.companyId) {
      activities = activities.filter(a => a.companyIds.includes(params.companyId));
    }

    return ok(activities);
  } catch (e) {
    return err(500, e.message);
  }
};
