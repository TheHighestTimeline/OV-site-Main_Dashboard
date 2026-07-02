// notes-list — returns notes for a contact. As of 2026-07 notes live in the
// shared Activities table (see notes-create.js). Airtable's list endpoint
// has no native "linked record contains" filter without a formula that can
// see raw record IDs, so — same approach activities-list.js already uses —
// this fetches all Activities and filters client-side on the Contact array.
import { airtableList, fromAirtableRecord } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const ACTIVITIES_MAP = {
  title:   'Title',
  body:    'Body',
  summary: 'AI Summary',
  type:    'Type',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const contactId = event.queryStringParameters?.contactId;
  if (!contactId) return err(400, 'contactId is required');

  try {
    const records = await airtableList(TABLE(), { sort: [{ field: 'Date', direction: 'desc' }] });

    const notes = records
      .filter(r => (r.fields['Contact'] || []).includes(contactId))
      .map(r => ({
        ...fromAirtableRecord(r, ACTIVITIES_MAP),
        createdTime: r.createdTime || null,
      }))
      // Newest first, per COO Operating Manual Part 3 ("Activity timeline —
      // render notes newest-first"). Sort by createdTime (not just the Date
      // field, which is date-only and ties break arbitrarily otherwise).
      .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

    return ok(notes);
  } catch (e) {
    return err(500, e.message);
  }
};
