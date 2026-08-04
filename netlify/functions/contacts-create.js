import { airtableCreate, toAirtableFields, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { resolveCompanyNames } from './_companies.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, role, email, phone, status, type, relatesTo, owner, nextAction,
            nextActionDate, source, linkedin, segment, introducedBy, bio, notes,
            currentSummary, companyIds, referrerId, company } = body;
    if (!name) return err(400, 'name is required');

    const fields = toAirtableFields({
      name,
      role:           role           || '',
      email:          email          || '',
      phone:          phone          || '',
      status:         status         || 'Active',
      type:           type           || 'External',
      relatesTo:      Array.isArray(relatesTo) ? relatesTo : [],
      owner:          owner          || '',
      nextAction:     nextAction     || '',
      nextActionDate: nextActionDate || '',
      source:         source         || '',
      linkedin:       linkedin       || '',
      segment:        segment        || '',
      introducedBy:   introducedBy   || '',
      bio:            bio            || '',
      notes:          notes          || '',
      currentSummary: currentSummary || '',
    }, CONTACTS_MAP);

    // Linked records. Referred By is deliberately single: a person is introduced
    // by one person, and referral economics are paid on that one link.
    // A typed company name is resolved to a real record and linked. It used to
    // map to nothing at all, so it silently vanished on save — which is what
    // made "add the company first" an unwritten prerequisite nobody followed.
    const linkedCompanies = [...(Array.isArray(companyIds) ? companyIds : [])];
    let companySync = null;
    if (String(company || '').trim()) {
      companySync = await resolveCompanyNames([company]);
      for (const id of companySync.ids) if (!linkedCompanies.includes(id)) linkedCompanies.push(id);
    }
    if (linkedCompanies.length) fields['Companies'] = linkedCompanies;
    if (referrerId) fields['Referred By'] = [referrerId];

    const record = await airtableCreate(TABLE(), fields);
    return ok({
      id: record.id,
      name,
      companyIds: linkedCompanies,
      // Reported so the UI can say "created Acme" rather than leaving the user
      // wondering whether a new company appeared behind their back.
      companyCreated:     companySync?.created || [],
      possibleDuplicates: companySync?.possibleDuplicates || [],
    });
  } catch (e) {
    return err(500, e.message);
  }
};
