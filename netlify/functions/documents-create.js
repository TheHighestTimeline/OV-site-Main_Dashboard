import { airtableCreate, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_DOCUMENTS || 'Documents';

const DOCUMENTS_MAP = {
  name:       'Name',
  type:       'Type',
  driveLink:  'Drive Link',
  signedDate: 'Signed Date',
  version:    'Version',
};

// Airtable attachment URLs expire after a few hours, so this table never
// stores the file itself — Drive is the source of truth and driveLink is
// required. See CRM build plan, Section 4.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      name, type, driveLink, signedDate, version, tags,
      contactIds, companyIds, opportunityIds,
    } = body;

    if (!name) return err(400, 'name is required');
    if (!driveLink) return err(400, 'driveLink is required — Drive is the source of truth for the file itself, Airtable only stores the link');

    const fields = toAirtableFields({
      name,
      type:       type   || 'Other',
      driveLink,
      signedDate: signedDate || '',
      version:    version    || '',
    }, DOCUMENTS_MAP);

    if (Array.isArray(tags) && tags.length)                     fields['Tags']             = tags;
    if (Array.isArray(contactIds) && contactIds.length)         fields['Contact']          = contactIds;
    if (Array.isArray(companyIds) && companyIds.length)         fields['Company']          = companyIds;
    if (Array.isArray(opportunityIds) && opportunityIds.length) fields['Deal/Opportunity'] = opportunityIds;

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name });
  } catch (e) {
    return err(500, e.message);
  }
};
