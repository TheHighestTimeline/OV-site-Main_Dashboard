// Merge duplicate Companies records. Same two modes as contacts-merge.
//
// Duplicate companies are the more common failure of the two and the more
// damaging: every Activity routes to exactly one company, so two rows for
// "BrightSunSolr" split one relationship's history into two timelines and
// neither of them reads as the whole story. The contact form creating a company
// from a typed name (see `_companies.js`) is what makes near-duplicates possible
// at all, and this is the other half of that bargain — entry wins, cleanup
// happens here.
import { airtableList, airtableUpdate, airtableDelete, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { companyLinkSpecs, previewLinksMulti, repointLinks } from './_links.js';
import { COMPANIES_TBL, COMPANIES_MAP, stripEmpty } from './_companies.js';

const COMPARE_FIELDS = [
  'name', 'entityCode', 'shortCode', 'type', 'status', 'health', 'stage',
  'website', 'followUpDate', 'subjectDescriptor', 'summary', 'callsNotes', 'waitingOn',
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body  = JSON.parse(event.body || '{}');
    const specs = companyLinkSpecs();

    if (body.preview) {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (ids.length < 2) return err(400, 'preview needs at least two ids');

      const all  = await airtableList(COMPANIES_TBL());
      const byId = Object.fromEntries(all.map(r => [r.id, r]));
      // One pass over the linking tables for the whole group, not one per id.
      const links = await previewLinksMulti(specs, ids);

      const records = [];
      for (const id of ids) {
        const r = byId[id];
        if (!r) continue;
        const values = {};
        for (const key of COMPARE_FIELDS) {
          const airtableName = COMPANIES_MAP[key];
          if (!airtableName) continue;
          const raw = r.fields?.[airtableName];
          values[key] = raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw.name ?? null)
            : (raw ?? null);
        }
        records.push({
          id,
          name: r.fields?.['Name'] || '',
          createdTime: r.createdTime || null,
          values,
          links: links[id] || { counts: {}, total: 0 },
        });
      }
      return ok({ fields: COMPARE_FIELDS, records });
    }

    const keepId  = body.keepId;
    const dropIds = (Array.isArray(body.dropIds) ? body.dropIds : [body.dropId])
      .filter(Boolean)
      .filter(id => id !== keepId);

    if (!keepId)         return err(400, 'keepId is required');
    if (!dropIds.length) return err(400, 'at least one dropId is required');

    const moved = {};
    for (const dropId of dropIds) {
      const one = await repointLinks(specs, dropId, keepId);
      for (const [label, n] of Object.entries(one)) moved[label] = (moved[label] || 0) + n;
    }

    const survivorPatch = {};
    if (body.fields && typeof body.fields === 'object') {
      for (const key of COMPARE_FIELDS) {
        if (body.fields[key] !== undefined) survivorPatch[key] = body.fields[key];
      }
    }
    if (Object.keys(survivorPatch).length) {
      await airtableUpdate(COMPANIES_TBL(), keepId, stripEmpty(toAirtableFields(survivorPatch, COMPANIES_MAP)));
    }

    for (const dropId of dropIds) await airtableDelete(COMPANIES_TBL(), dropId);

    return ok({ merged: true, keepId, dropIds, reassigned: moved });
  } catch (e) {
    return err(500, e.message);
  }
};
