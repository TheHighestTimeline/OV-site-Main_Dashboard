// Patch a Companies record. Only the keys present in the body are written, so
// a partial save from one panel of the Companies tab never blanks a field that
// panel does not show.
import { airtableUpdate, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { COMPANIES_TBL, COMPANIES_MAP, stripEmpty } from './_companies.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id } = body;
    if (!id) return err(400, 'id is required');

    const update = {};
    for (const key of Object.keys(COMPANIES_MAP)) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    const fields = stripEmpty(toAirtableFields(update, COMPANIES_MAP));

    // Link fields are replaced wholesale when present, which is what the
    // chip-and-× editors in the UI send.
    if (body.parentCompanyIds !== undefined) {
      fields['Parent Company'] = Array.isArray(body.parentCompanyIds) ? body.parentCompanyIds : [];
    }
    if (body.contactIds !== undefined) {
      fields['CRM Contacts'] = Array.isArray(body.contactIds) ? body.contactIds : [];
    }

    if (!Object.keys(fields).length) return ok({ id, updated: false });

    await airtableUpdate(COMPANIES_TBL(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
