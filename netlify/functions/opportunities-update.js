import { airtableUpdate, toAirtableFields, OPPORTUNITIES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
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
          nextStep, dataRoom, priority, kind, otherParty, probability, goal,
          lane, paperworkStage, dealCost, contractsUrl, extraLinks, level,
          companyIds, contactIds, projectIds, parentId } = body;
  if (!id) return err(400, 'id is required');

  try {
    const update = {};
    if (name      !== undefined) update.name      = name;
    if (stage     !== undefined) update.stage     = stage;
    if (notes     !== undefined) update.notes     = notes;
    if (dealValue !== undefined) update.dealValue = dealValue != null && dealValue !== '' ? Number(dealValue) : null;
    if (closeDate !== undefined) update.closeDate = closeDate || null;
    if (entity    !== undefined) update.entity    = entity || null;
    if (nextStep  !== undefined) update.nextStep  = nextStep;
    if (dataRoom  !== undefined) update.dataRoom  = dataRoom;
    if (priority  !== undefined) update.priority  = priority || null;
    if (kind      !== undefined) update.kind      = kind || null;
    if (otherParty !== undefined) update.otherParty = otherParty;
    if (goal      !== undefined) update.goal      = goal;
    // null, never '': Airtable reads '' on a singleSelect as a request to create
    // an option named "" and rejects the whole write.
    if (lane           !== undefined) update.lane           = lane || null;
    if (level          !== undefined) update.level          = level || null;
    if (paperworkStage !== undefined) update.paperworkStage = paperworkStage || null;
    if (dealCost     !== undefined) update.dealCost     = dealCost != null && dealCost !== '' ? Number(dealCost) : null;
    if (contractsUrl !== undefined) update.contractsUrl = contractsUrl || '';
    // Stored as JSON text: Airtable has no repeating-group field. Serialised
    // here so a malformed array can never reach the record.
    if (extraLinks !== undefined) {
      update.extraLinks = Array.isArray(extraLinks)
        ? JSON.stringify(extraLinks
            .filter(l => l && String(l.url || '').trim())
            .map(l => ({ label: String(l.label || '').trim().slice(0, 120), url: String(l.url).trim() })))
        : '';
    }
    // Airtable percent fields store a 0–1 fraction; the UI works in 0–100.
    if (probability !== undefined) update.probability = probability != null && probability !== '' ? Number(probability) / 100 : null;
    const t = normType(type, kanbanType);
    if (t !== undefined) update.type = t;

    const fields = toAirtableFields(update, OPPORTUNITIES_MAP);
    // Linked-record fields (arrays of record IDs). Passing [] clears the link.
    if (companyIds !== undefined) fields['Companies']          = Array.isArray(companyIds) ? companyIds : [];
    if (contactIds !== undefined) fields['Associated Contact'] = Array.isArray(contactIds) ? contactIds : [];
    if (projectIds !== undefined) fields['Projects']           = Array.isArray(projectIds) ? projectIds : [];
    // Self-link. Empty = this opportunity is a Program (umbrella); set = it is a
    // Workstream nested under one. Passing null/'' promotes it back to a Program.
    if (parentId !== undefined) {
      if (parentId === id) return err(400, 'An opportunity cannot be its own parent.');
      fields['Parent Opportunity'] = parentId ? [parentId] : [];
      // Gaining a parent makes it a story by definition. Clearing one does NOT
      // force Epic: an unparented story is a real state, and that is exactly the
      // record waiting to be attached.
      if (parentId && level === undefined) fields['Level'] = 'Story';
    }

    if (Object.keys(fields).length === 0) return ok({ id, updated: false });
    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
