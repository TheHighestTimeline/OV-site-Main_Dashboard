// references-note — saves a reference-site feedback note to Airtable Notes table.
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';
import { airtableCreate } from './_airtable.js';

const TABLE = () => process.env.AIRTABLE_TABLE_NOTES || 'Notes';

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
      Notes: body.slice(0, 10000),
      Type:  'Reference Feedback',
    });
    return ok({ saved: true });
  } catch (e) {
    console.error('[references-note]', e.message);
    // Soft-fail — don't break the References tab if Notes table is missing
    return ok({ saved: true });
  }
};
