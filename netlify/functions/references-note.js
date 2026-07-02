// references-note — saves reference-site feedback as an Activity record
// (Contact/Company left unlinked; this feedback isn't about a specific CRM
// contact). Previously pointed at a "Notes" table that never existed in
// Airtable, and silently swallowed the resulting error so the References
// tab always claimed "saved" even though nothing was written — fixed both:
// repointed at the real Activities table, and the catch block now reports
// the real failure instead of lying about success.
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';
import { airtableCreate } from './_airtable.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const { site, siteUrl, note, authorName, authorEmail } = JSON.parse(event.body || '{}');
    if (!site || !note) return err(400, 'site and note are required');

    const body = `Site: ${siteUrl || ''}\nFrom: ${authorName || ''} (${authorEmail || ''})\n\n${note}`;
    await airtableCreate(TABLE(), {
      Title: `[Ref Note] ${site} — ${authorName || authorEmail || 'Team'}`,
      Body:  body.slice(0, 10000),
      Type:  'Reference Feedback',
      Date:  new Date().toISOString().slice(0, 10),
    });
    return ok({ saved: true });
  } catch (e) {
    console.error('[references-note]', e.message);
    return err(500, e.message);
  }
};
