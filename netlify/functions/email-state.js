// email-state — lightweight UI state persistence for the Email tab.
// Stores last-viewed label + active draft per user in Airtable.
// Falls back to defaults so Email.jsx always works even if saves fail.
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { airtableList, airtableCreate, airtableUpdate } from './_airtable.js';

const TABLE = () => process.env.AIRTABLE_TABLE_EMAIL_STATE || 'Email State';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const user  = await getUser(event);
  const email = user?.email;
  if (!email) return err(401, 'Could not identify user');

  const defaults = { lastLabel: 'INBOX', lastThreadId: null, draftTo: '', draftSubject: '', draftBody: '' };

  if (event.httpMethod === 'GET') {
    try {
      const safe    = email.replace(/'/g, "\\'");
      const records = await airtableList(TABLE(), {
        filterByFormula: `{UserEmail} = '${safe}'`,
        maxRecords: 1,
      });
      if (!records.length) return ok(defaults);
      const f = records[0].fields;
      return ok({
        lastLabel:    f['LastLabel']    || 'INBOX',
        lastThreadId: f['LastThreadId'] || null,
        draftTo:      f['DraftTo']      || '',
        draftSubject: f['DraftSubject'] || '',
        draftBody:    f['DraftBody']    || '',
      });
    } catch {
      return ok(defaults); // soft-fail — Email.jsx always gets a usable state
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { lastLabel, lastThreadId, draftTo, draftSubject, draftBody } = JSON.parse(event.body || '{}');
      const fields = {
        UserEmail:    email,
        LastLabel:    (lastLabel    || 'INBOX').slice(0, 1000),
        LastThreadId: (lastThreadId || '').slice(0, 1000),
        DraftTo:      (draftTo      || '').slice(0, 1000),
        DraftSubject: (draftSubject || '').slice(0, 1000),
        DraftBody:    (draftBody    || '').slice(0, 10000),
      };
      const safe    = email.replace(/'/g, "\\'");
      const records = await airtableList(TABLE(), {
        filterByFormula: `{UserEmail} = '${safe}'`,
        maxRecords: 1,
      });
      if (records.length) {
        await airtableUpdate(TABLE(), records[0].id, fields);
      } else {
        await airtableCreate(TABLE(), fields);
      }
      return ok({ saved: true });
    } catch {
      return ok({ saved: true }); // soft-fail — don't break Email.jsx if table missing
    }
  }

  return err(405, 'Method not allowed');
};
