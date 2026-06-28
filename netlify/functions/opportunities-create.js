import { airtableCreate, toAirtableFields, OPPORTUNITIES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';

// Accepts either `type` ("Internal"/"External") or legacy `kanbanType`
// ("internal"/"external") and normalises to the Airtable option name.
function normType(type, kanbanType) {
  const v = (type || kanbanType || '').toString().toLowerCase();
  if (v === 'internal') return 'Internal';
  if (v === 'external') return 'External';
  return undefined;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

  const { name, stage, dealValue, closeDate, notes, entity, type, kanbanType,
          companyIds, contactIds, projectIds } = body;
  if (!name) return err(400, 'name is required');

  try {
    const obj = { name, stage: stage || 'Lead', notes: notes || '' };
    if (dealValue != null && dealValue !== '') obj.dealValue = Number(dealValue);
    if (closeDate)  obj.closeDate = closeDate;
    if (entity)     obj.entity    = entity;
    const t = normType(type, kanbanType);
    if (t)          obj.type      = t;

    const fields = toAirtableFields(obj, OPPORTUNITIES_MAP);
    // Linked-record fields (arrays of record IDs).
    if (Array.isArray(companyIds) && companyIds.length) fields['Companies']          = companyIds;
    if (Array.isArray(contactIds) && contactIds.length) fields['Associated Contact'] = contactIds;
    if (Array.isArray(projectIds) && projectIds.length) fields['Projects']           = projectIds;

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name });
  } catch (e) {
    return err(500, e.message);
  }
};
