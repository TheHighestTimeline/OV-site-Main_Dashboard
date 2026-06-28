import { airtableList, fromAirtableRecord, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Full Name', direction: 'asc' }],
    });

    const contacts = records.map(r => {
      const c = fromAirtableRecord(r, CONTACTS_MAP);

      // Phone can come back as a number (Number field type) or array (Lookup/
      // linked-record field) instead of a string — normalise to string.
      if (typeof c.phone === 'number') c.phone = String(c.phone);
      if (Array.isArray(c.phone))      c.phone = c.phone.join(', ');

      // Company: try several possible field names (Notion exports vary).
      c.company = r.fields['Company']
               || r.fields['Organization']
               || r.fields['Company Name']
               || null;

      c.website = r.fields['Website'] || r.fields['URL'] || null;

      return c;
    });

    return ok(contacts);
  } catch (e) {
    return err(500, e.message);
  }
};
