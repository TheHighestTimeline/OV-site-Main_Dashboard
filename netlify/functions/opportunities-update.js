import { airtableUpdate, toAirtableFields, OPPORTUNITIES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';

function normType(type, kanbanType) {
  if (type === undefined && kanbanType === undefined) return undefined;
  const v = (type || kanbanType || '').toString().toLowerCase();
  if (v === 'internal') return 'Internal';
  if (v === 'external') return 'External';
  return null; // explicit unset
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

  const { id, name, stage, dealValue, closeDate, notes, entity, type, kanbanType,
          companyIds, contactIds, projectIds } = body;
  if (!id) return err(400, 'id is required');

  try {
    const update = {};
    if (name      !== undefined) update.name      = name;
    if (stage     !== undefined) update.stage     = stage;
    if (notes     !== undefined) update.notes     = notes;
    if (dealValue !== undefined) update.dealValue = dealValue != null && dealValue !== '' ? Number(dealValue) : null;
    if (closeDate !== undefined) update.closeDate = closeDate || null;
    if (entity    !== undefined) update.entity    = entity || null;
    const t = normType(type, kanbanType);
    if (t !== undefined) update.type = t;

    const fields = toAirtableFields(update, OPPORTUNITIES_MAP);
    // Linked-record fields (arrays of record IDs). Passing [] clears the link.
    if (companyIds !== undefined) fields['Companies']          = Array.isArray(companyIds) ? companyIds : [];
    if (contactIds !== undefined) fields['Associated Contact'] = Array.isArray(contactIds) ? contactIds : [];
    if (projectIds !== undefined) fields['Projects']           = Array.isArray(projectIds) ? projectIds : [];

    if (Object.keys(fields).length === 0) return ok({ id, updated: false });
    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
