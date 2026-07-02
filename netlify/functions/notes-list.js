import { airtableList, fromAirtableRecord, NOTES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_NOTES || 'Notes';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const contactId = event.queryStringParameters?.contactId;
  if (!contactId) return err(400, 'contactId is required');

  try {
    // Linked Contact ID is a plain-text field storing the Airtable contact record ID
    const safe = contactId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const records = await airtableList(TABLE(), {
      filterByFormula: `{Linked Contact ID} = '${safe}'`,
      pageSize: 50,
    });

    const notes = records
      .map(r => ({
        ...fromAirtableRecord(r, NOTES_MAP),
        createdTime: r.createdTime || null,
      }))
      // Newest first, per COO Operating Manual Part 3 ("Activity timeline —
      // render notes newest-first"). Airtable's list API doesn't support
      // sorting by the built-in createdTime meta field, so sort client-side.
      .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

    return ok(notes);
  } catch (e) {
    return err(500, e.message);
  }
};
