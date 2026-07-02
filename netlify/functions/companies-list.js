import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_COMPANIES || 'Companies';

// No existing COMPANIES_MAP in _airtable.js, so this reads fields by name
// directly rather than going through toAirtableFields/fromAirtableRecord.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Name', direction: 'asc' }],
    });

    const companies = records.map(r => ({
      id:              r.id,
      name:            r.fields['Name'] || '',
      entityCode:      r.fields['Entity Code']?.name || r.fields['Entity Code'] || null,
      type:            r.fields['Type']?.name || r.fields['Type'] || null,
      status:          r.fields['Status']?.name || r.fields['Status'] || null,
      subjectDescriptor: r.fields['Subject Descriptor'] || '',
      website:         r.fields['Website'] || '',
      parentCompanyIds: r.fields['Parent Company'] || [],
    }));

    return ok(companies);
  } catch (e) {
    return err(500, e.message);
  }
};
