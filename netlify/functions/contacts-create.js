import { airtableCreate, toAirtableFields, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
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
            currentSummary, companyIds, referrerId } = body;
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
    if (Array.isArray(companyIds) && companyIds.length) fields['Companies'] = companyIds;
    if (referrerId) fields['Referred By'] = [referrerId];

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name });
  } catch (e) {
    return err(500, e.message);
  }
};
