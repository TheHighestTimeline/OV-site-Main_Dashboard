import { airtableList, fromAirtableRecord } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
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

    // A deal's history is the union of its people's conversations, and asking
    // for them one at a time would be N round trips against a rate-limited base
    // to re-filter the same list. Comma-separated ids, matched on either link.
    if (params.contactIds || params.companyIds) {
      const wantContacts = new Set(String(params.contactIds || '').split(',').filter(Boolean));
      const wantCompanies = new Set(String(params.companyIds || '').split(',').filter(Boolean));
      activities = activities.filter(a =>
        a.contactIds.some(id => wantContacts.has(id)) ||
        a.companyIds.some(id => wantCompanies.has(id)));
    }

    return ok(activities);
  } catch (e) {
    return err(500, e.message);
  }
};
