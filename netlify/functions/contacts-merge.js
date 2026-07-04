import { airtableList, airtableUpdate, airtableDelete } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const CONTACTS      = () => process.env.AIRTABLE_TABLE_CONTACTS      || 'CRM Contacts';
const DOCUMENTS     = () => process.env.AIRTABLE_TABLE_DOCUMENTS     || 'Documents';
const OPPORTUNITIES = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';
const TASKS         = () => process.env.AIRTABLE_TABLE_TASKS         || 'Master Action Board';
const ACTIVITIES    = () => process.env.AIRTABLE_TABLE_ACTIVITIES    || 'Activities';

// Every table that links to a CRM contact, and the link field name.
// When we merge `dropId` into `keepId`, we rewrite each of these so no linked
// record (document, deal, task, activity, referral) is orphaned before the
// duplicate contact is deleted.
function linkSpecs() {
  return [
    { table: DOCUMENTS(),     field: 'Contact' },
    { table: OPPORTUNITIES(), field: 'Associated Contact' },
    { table: TASKS(),         field: 'Contact' },
    { table: ACTIVITIES(),    field: 'Contact' },
    { table: CONTACTS(),      field: 'Referred By' }, // contacts referred BY the dup
  ];
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { keepId, dropId } = JSON.parse(event.body || '{}');
    if (!keepId || !dropId) return err(400, 'keepId and dropId are required');
    if (keepId === dropId)  return err(400, 'keepId and dropId must differ');

    const moved = {};
    for (const { table, field } of linkSpecs()) {
      let records;
      try { records = await airtableList(table); } catch { continue; } // table unreachable → skip
      const affected = records.filter(r => (r.fields?.[field] || []).includes(dropId) && r.id !== dropId);
      for (const r of affected) {
        const cur = r.fields[field] || [];
        // swap dropId → keepId, de-duplicating (keep may already be linked)
        const next = Array.from(new Set(cur.map(id => (id === dropId ? keepId : id))));
        await airtableUpdate(table, r.id, { [field]: next });
      }
      if (affected.length) moved[table] = affected.length;
    }

    // Finally, delete the duplicate contact record.
    await airtableDelete(CONTACTS(), dropId);

    return ok({ merged: true, keepId, dropId, reassigned: moved });
  } catch (e) {
    return err(500, e.message);
  }
};
