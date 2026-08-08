// Merge duplicate CRM contacts.
//
// Two modes on one endpoint:
//
//   POST { preview: true, ids: [...] }
//       Reads only. Returns each candidate's field values side by side and a
//       count of what links to it, so the merge screen can show which record is
//       actually carrying the history before anybody picks a survivor.
//
//   POST { keepId, dropIds: [...], fields? }
//       Repoints every inbound link onto `keepId`, optionally writes `fields`
//       onto the survivor (the field-by-field picks made on the merge screen),
//       then deletes the dropped records.
//
// WHY THE FIELD PATCH EXISTS: picking a survivor wholesale loses data every
// time, because duplicates are rarely one good record and one empty one — the
// old row has the phone number and the new row has the LinkedIn. The screen
// lets you take the best value per field; this applies that choice in the same
// call so there is no window where the survivor is half-merged.
//
// Order matters. Links are repointed BEFORE the delete: if the delete ran first,
// a failure halfway through repointing would leave records pointing at a record
// id that no longer exists, which Airtable renders as a blank link with no way
// to tell what it used to be.
import { airtableList, airtableUpdate, airtableDelete, toAirtableFields, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { contactLinkSpecs, previewLinksMulti, repointLinks } from './_links.js';

const CONTACTS = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

// Shown on the merge screen, in this order. Link fields are deliberately absent:
// they are unioned automatically, never chosen, because dropping one side of a
// link loses a relationship rather than a spelling.
const COMPARE_FIELDS = [
  'name', 'email', 'phone', 'role', 'linkedin', 'type', 'status', 'owner',
  'source', 'segment', 'introducedBy', 'nextAction', 'nextActionDate',
  'lastContactedAt', 'currentSummary', 'bio', 'notes',
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const specs = contactLinkSpecs();

    // ── Preview ──────────────────────────────────────────────────────────────
    if (body.preview) {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (ids.length < 2) return err(400, 'preview needs at least two ids');

      const all = await airtableList(CONTACTS());
      const byId = Object.fromEntries(all.map(r => [r.id, r]));
      // One pass over the linking tables for the whole group, not one per id.
      const links = await previewLinksMulti(specs, ids);

      const records = [];
      for (const id of ids) {
        const r = byId[id];
        if (!r) continue;
        const values = {};
        for (const key of COMPARE_FIELDS) {
          const airtableName = CONTACTS_MAP[key];
          if (!airtableName) continue;
          const raw = r.fields?.[airtableName];
          values[key] = raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw.name ?? null)
            : (raw ?? null);
        }
        records.push({
          id,
          name: r.fields?.['Full Name'] || '',
          createdTime: r.createdTime || null,
          companyIds: r.fields?.['Companies'] || [],
          values,
          links: links[id] || { counts: {}, total: 0 },
        });
      }
      return ok({ fields: COMPARE_FIELDS, records });
    }

    // ── Merge ────────────────────────────────────────────────────────────────
    const keepId  = body.keepId;
    // `dropId` (singular) is the original shape and still works.
    const dropIds = (Array.isArray(body.dropIds) ? body.dropIds : [body.dropId])
      .filter(Boolean)
      .filter(id => id !== keepId);

    if (!keepId)        return err(400, 'keepId is required');
    if (!dropIds.length) return err(400, 'at least one dropId is required');

    const moved = {};
    for (const dropId of dropIds) {
      const one = await repointLinks(specs, dropId, keepId);
      for (const [label, n] of Object.entries(one)) moved[label] = (moved[label] || 0) + n;
    }

    // Companies is a union, not a choice: a person who worked at two of the
    // duplicated employers worked at both, and picking one erases the other.
    const survivorPatch = {};
    if (body.fields && typeof body.fields === 'object') {
      for (const key of COMPARE_FIELDS) {
        if (body.fields[key] !== undefined) survivorPatch[key] = body.fields[key];
      }
    }
    const fields = Object.keys(survivorPatch).length
      ? toAirtableFields(survivorPatch, CONTACTS_MAP)
      : {};

    if (Array.isArray(body.companyIds)) {
      fields['Companies'] = Array.from(new Set(body.companyIds));
    }
    if (Object.keys(fields).length) await airtableUpdate(CONTACTS(), keepId, fields);

    for (const dropId of dropIds) await airtableDelete(CONTACTS(), dropId);

    return ok({ merged: true, keepId, dropIds, reassigned: moved });
  } catch (e) {
    return err(500, e.message);
  }
};
