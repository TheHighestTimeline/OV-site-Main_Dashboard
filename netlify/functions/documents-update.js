import { airtableUpdate, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_DOCUMENTS || 'Documents';

const DOCUMENTS_MAP = {
  name:       'Name',
  type:       'Type',
  driveLink:  'Drive Link',
  signedDate: 'Signed Date',
  expires:    'Expiry Date',
  version:    'Version',
  entity:     'Entity',
};

// Partial update — only fields present in the body are touched. Powers:
//   • renaming a document
//   • moving a document into / out of a folder  (folderIds → 'Folder')
//   • re-tagging, re-linking contacts/companies
// To clear a link (e.g. move a doc OUT of all folders) pass an empty array.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      id, name, type, driveLink, signedDate, version, expires, entity,
      tags, folderIds, contactIds, companyIds, opportunityIds,
    } = body;

    if (!id) return err(400, 'id is required');

    // Scalar / single-select fields go through the map so partial updates
    // don't clobber untouched columns.
    const scalar = {};
    if (name       !== undefined) scalar.name       = name;
    if (type       !== undefined) scalar.type       = type;
    if (driveLink  !== undefined) scalar.driveLink  = driveLink;
    if (signedDate !== undefined) scalar.signedDate = signedDate;
    if (expires    !== undefined) scalar.expires    = expires;
    if (version    !== undefined) scalar.version    = version;
    if (entity     !== undefined) scalar.entity     = entity;
    const fields = toAirtableFields(scalar, DOCUMENTS_MAP);

    // Link / multi-select fields — an empty array is a meaningful value here
    // (it clears the link), so we set whenever the key is present.
    if (tags           !== undefined) fields['Tags']             = Array.isArray(tags) ? tags : [];
    if (folderIds      !== undefined) fields['Folder']           = Array.isArray(folderIds) ? folderIds : [];
    if (contactIds     !== undefined) fields['Contact']          = Array.isArray(contactIds) ? contactIds : [];
    if (companyIds     !== undefined) fields['Company']          = Array.isArray(companyIds) ? companyIds : [];
    if (opportunityIds !== undefined) fields['Deal/Opportunity'] = Array.isArray(opportunityIds) ? opportunityIds : [];

    if (Object.keys(fields).length === 0) return ok({ id, updated: false });

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
