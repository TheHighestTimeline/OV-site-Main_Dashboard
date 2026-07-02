import { airtableList, fromAirtableRecord } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_DOCUMENTS || 'Documents';

const DOCUMENTS_MAP = {
  name:       'Name',
  type:       'Type',
  driveLink:  'Drive Link',
  signedDate: 'Signed Date',
  version:    'Version',
};

// Optional query params: ?contactId=recXXX  ?companyId=recXXX
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Name', direction: 'asc' }],
    });

    let documents = records.map(r => {
      const d = fromAirtableRecord(r, DOCUMENTS_MAP);
      d.type            = d.type?.name || d.type || null;
      d.tags            = r.fields['Tags'] || [];
      d.contactIds      = r.fields['Contact'] || [];
      d.companyIds      = r.fields['Company'] || [];
      d.opportunityIds  = r.fields['Deal/Opportunity'] || [];
      return d;
    });

    if (params.companyId) {
      documents = documents.filter(d => d.companyIds.includes(params.companyId));
    }
    if (params.contactId) {
      documents = documents.filter(d => d.contactIds.includes(params.contactId));
    }

    return ok(documents);
  } catch (e) {
    return err(500, e.message);
  }
};
