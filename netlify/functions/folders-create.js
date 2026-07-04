import { airtableCreate } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_FOLDERS || 'Folders';

// Create a folder scoped to a company (company-shared) and/or a single contact
// (per-contact). At least one of companyIds / contactIds should be provided so
// the folder shows up somewhere — but neither is strictly required by Airtable.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, purpose, companyIds, contactIds } = body;

    if (!name || !name.trim()) return err(400, 'name is required');

    const fields = { 'Folder Name': name.trim() };
    if (purpose && purpose.trim())                        fields['Purpose'] = purpose.trim();
    if (Array.isArray(companyIds) && companyIds.length)   fields['Company'] = companyIds;
    if (Array.isArray(contactIds) && contactIds.length)   fields['Contact'] = contactIds;

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name: name.trim() });
  } catch (e) {
    return err(500, e.message);
  }
};
