import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_FOLDERS || 'Folders';

// Folder registry — a lightweight container that documents get filed into.
// A folder is scoped to EITHER a company (company-shared) OR a single contact
// (per-contact), matching the both-level model. Company/Contact links may both
// be empty (a loose folder) but that's discouraged by the UI.
//
// Optional query params: ?companyId=recXXX  ?contactId=recXXX
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Folder Name', direction: 'asc' }],
    });

    let folders = records.map(r => ({
      id:          r.id,
      name:        r.fields['Folder Name'] || '',
      purpose:     r.fields['Purpose'] || '',
      companyIds:  r.fields['Company'] || [],
      contactIds:  r.fields['Contact'] || [],
      documentIds: r.fields['Documents'] || [],
    }));

    if (params.companyId) {
      folders = folders.filter(f => f.companyIds.includes(params.companyId));
    }
    if (params.contactId) {
      folders = folders.filter(f => f.contactIds.includes(params.contactId));
    }

    return ok(folders);
  } catch (e) {
    return err(500, e.message);
  }
};
