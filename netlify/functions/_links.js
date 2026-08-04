// Inbound-link bookkeeping for CRM records.
//
// Deleting or merging a contact or a company is only safe if you know what
// points AT it first. Airtable has no referential integrity and no cascade: it
// simply drops the id out of every linking field, silently, and a task that was
// assigned to somebody becomes a task assigned to nobody with no trace that it
// ever was.
//
// So every destructive path in this codebase goes through here, and every one of
// them can be asked for a count BEFORE it acts. "Delete Greg Shore — 4 tasks,
// 2 deals and 11 activities point at him" is a decision. "Delete Greg Shore?"
// is a coin flip.
//
// One list read per table, never a per-record lookup: these run against the
// shared 5-req/sec limiter and an N+1 here would stall every other request.

import { airtableList, airtableUpdate } from './_airtable.js';

const CONTACTS      = () => process.env.AIRTABLE_TABLE_CONTACTS      || 'CRM Contacts';
const COMPANIES     = () => process.env.AIRTABLE_TABLE_COMPANIES     || 'Companies';
const DOCUMENTS     = () => process.env.AIRTABLE_TABLE_DOCUMENTS     || 'Documents';
const OPPORTUNITIES = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';
const TASKS         = () => process.env.AIRTABLE_TABLE_TASKS         || 'Master Action Board';
const ACTIVITIES    = () => process.env.AIRTABLE_TABLE_ACTIVITIES    || 'Activities';
const FOLDERS       = () => process.env.AIRTABLE_TABLE_FOLDERS       || 'Folders';

/**
 * Every field that can hold a CRM Contact id.
 *
 * `Assigned To` on the action board is the one that used to be missing, and it
 * is the most damaging omission of the set: merging a duplicate silently
 * unassigned every task that person owned.
 */
export function contactLinkSpecs() {
  const specs = [
    { table: DOCUMENTS(),     field: 'Contact',            label: 'documents'  },
    { table: OPPORTUNITIES(), field: 'Associated Contact', label: 'deals'      },
    { table: TASKS(),         field: 'Contact',            label: 'tasks'      },
    { table: TASKS(),         field: 'Assigned To',        label: 'assignments' },
    { table: ACTIVITIES(),    field: 'Contact',            label: 'activities' },
    { table: CONTACTS(),      field: 'Referred By',        label: 'referrals'  },
    { table: FOLDERS(),       field: 'Contact',            label: 'folders'    },
  ];
  const participations = process.env.AIRTABLE_TB_PARTICIPATIONS;
  if (participations) specs.push({ table: participations, field: 'Contact', label: 'paperwork rows' });
  return specs;
}

/** Every field that can hold a Companies id. */
export function companyLinkSpecs() {
  return [
    { table: CONTACTS(),      field: 'Companies',      label: 'people'    },
    { table: OPPORTUNITIES(), field: 'Companies',      label: 'deals'     },
    { table: DOCUMENTS(),     field: 'Company',        label: 'documents' },
    { table: ACTIVITIES(),    field: 'Company',        label: 'activities' },
    { table: FOLDERS(),       field: 'Company',        label: 'folders'   },
    { table: COMPANIES(),     field: 'Parent Company', label: 'subsidiaries' },
  ];
}

/**
 * Records that link to `recordId`, per spec. A table that cannot be read (it
 * does not exist in this base, or the field was renamed) yields an empty list
 * rather than failing the whole scan — a preview that 500s teaches people to
 * skip the preview.
 */
async function scan(specs, recordId) {
  const found = [];
  for (const spec of specs) {
    let records;
    try { records = await airtableList(spec.table); }
    catch { continue; }
    const hits = records.filter(r => (r.fields?.[spec.field] || []).includes(recordId) && r.id !== recordId);
    if (hits.length) found.push({ spec, hits });
  }
  return found;
}

/**
 * What points at this record, as `{ label: count }` plus a flat total.
 * Purely a read — nothing is written.
 */
export async function previewLinks(specs, recordId) {
  const found = await scan(specs, recordId);
  const counts = {};
  let total = 0;
  for (const { spec, hits } of found) {
    counts[spec.label] = (counts[spec.label] || 0) + hits.length;
    total += hits.length;
  }
  return { counts, total };
}

/**
 * `previewLinks` for several records at once, reading each table ONCE.
 *
 * The merge screen needs a count per candidate, and calling `previewLinks` in a
 * loop would re-list all seven tables per candidate — four duplicates in one
 * group is twenty-eight full table reads through a 5-req/sec limiter, which is
 * long enough that people stop opening the screen that prevents the data loss.
 */
export async function previewLinksMulti(specs, ids) {
  const wanted = new Set(ids);
  const out = Object.fromEntries(ids.map(id => [id, { counts: {}, total: 0 }]));

  for (const spec of specs) {
    let records;
    try { records = await airtableList(spec.table); }
    catch { continue; }
    for (const r of records) {
      if (wanted.has(r.id)) continue; // a record does not count as linking to itself
      for (const id of r.fields?.[spec.field] || []) {
        const bucket = out[id];
        if (!bucket) continue;
        bucket.counts[spec.label] = (bucket.counts[spec.label] || 0) + 1;
        bucket.total += 1;
      }
    }
  }
  return out;
}

/**
 * Repoint every link from `fromId` to `toId` (the merge path). De-duplicates,
 * because the survivor is often already linked to the same record.
 */
export async function repointLinks(specs, fromId, toId) {
  const found = await scan(specs, fromId);
  const moved = {};
  for (const { spec, hits } of found) {
    for (const r of hits) {
      const cur  = r.fields[spec.field] || [];
      const next = Array.from(new Set(cur.map(id => (id === fromId ? toId : id))));
      await airtableUpdate(spec.table, r.id, { [spec.field]: next });
    }
    moved[spec.label] = (moved[spec.label] || 0) + hits.length;
  }
  return moved;
}

/**
 * Drop `recordId` out of every link that holds it (the delete path).
 *
 * Airtable would do this on its own when the record is deleted. Doing it
 * explicitly first means the counts returned here are what actually changed,
 * so the toast can say "unlinked from 4 tasks" truthfully instead of guessing.
 */
export async function clearLinks(specs, recordId) {
  const found = await scan(specs, recordId);
  const cleared = {};
  for (const { spec, hits } of found) {
    for (const r of hits) {
      const next = (r.fields[spec.field] || []).filter(id => id !== recordId);
      await airtableUpdate(spec.table, r.id, { [spec.field]: next });
    }
    cleared[spec.label] = (cleared[spec.label] || 0) + hits.length;
  }
  return cleared;
}
