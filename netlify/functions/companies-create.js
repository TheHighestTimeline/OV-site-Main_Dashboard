// Create a Companies record.
//
// It refuses to create a second record for a name that already exists, matching
// through `companyKey` — the same normalisation the contact form uses, so a
// company typed on a contact and a company created here can never end up as two
// rows that only differ by "LLC". When the name already exists it returns that
// record with `matchedExisting: true` rather than erroring: the caller wanted a
// company by that name and now has one, which is the outcome either way.
import { airtableCreate, toAirtableFields, listRecordsLenient } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { COMPANIES_TBL, COMPANIES_MAP, companyKey, stripEmpty } from './_companies.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const body = JSON.parse(event.body || '{}');
    const name = String(body.name || '').trim();
    if (!name) return err(400, 'name is required');

    // Match before creating. A duplicate is recoverable but it still costs
    // somebody a merge, and the check is one list read.
    const key = companyKey(name);
    if (key) {
      const existing = await listRecordsLenient(COMPANIES_TBL(), { fields: ['Name'] }).catch(() => []);
      const hit = existing.find(r => companyKey(r.fields?.['Name']) === key);
      if (hit) {
        return ok({
          id: hit.id,
          name: hit.fields?.['Name'] || name,
          matchedExisting: true,
        });
      }
    }

    const fields = stripEmpty(toAirtableFields({
      name,
      entityCode:        body.entityCode        || '',
      shortCode:         body.shortCode         || '',
      type:              body.type              || '',
      status:            body.status            || '',
      website:           body.website           || '',
      subjectDescriptor: body.subjectDescriptor || '',
      summary:           body.summary           || '',
    }, COMPANIES_MAP));

    if (Array.isArray(body.parentCompanyIds) && body.parentCompanyIds.length) {
      fields['Parent Company'] = body.parentCompanyIds;
    }
    if (Array.isArray(body.contactIds) && body.contactIds.length) {
      fields['CRM Contacts'] = body.contactIds;
    }

    const record = await airtableCreate(COMPANIES_TBL(), fields);
    return ok({ id: record.id, name, matchedExisting: false });
  } catch (e) {
    return err(500, e.message);
  }
};
