// Shared helpers for the Participations table (WP2).
//
// A PARTICIPATION is one contact inside one workstream, and it is the record
// that carries the relationship STAGE.
//
// Why the stage cannot live on the contact: Greg Shore can be NCNDA Signed on
// the Bennettsville bridge loan and Initial Outreach on a future OVMG raise at
// the same moment. Both are true. A single field on his contact record can only
// hold one of them, so the junction is the only correct shape. It is also what
// lets one person appear in two workstreams without duplicating the person.
//
// The table id comes from AIRTABLE_TB_PARTICIPATIONS. Until that env var is
// set, every helper here degrades to an empty result rather than throwing, so
// the Threads tab renders an empty state instead of a 500 and the rest of the
// dashboard is untouched.

import {
  TB, listRecords, getRecord, createRecords, updateRecords,
  fromAirtableRecord, toAirtableFields, PARTICIPATIONS_MAP, esc, dateOnly,
} from './_airtable.js';

export const PARTICIPATIONS_TABLE = () =>
  process.env.AIRTABLE_TB_PARTICIPATIONS || TB.PARTICIPATIONS || '';

export function participationsConfigured() {
  return Boolean(PARTICIPATIONS_TABLE());
}

/** Human-readable reason to surface in the UI when the table is not wired yet. */
export const NOT_CONFIGURED_MSG =
  'Participations table is not configured. Create it in Airtable and set ' +
  'AIRTABLE_TB_PARTICIPATIONS in the Netlify environment.';

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * List participations. Returns [] (never throws) when the table is unconfigured,
 * so a half-provisioned environment degrades to an empty Threads tab.
 */
export async function listParticipations(opts = {}) {
  const table = PARTICIPATIONS_TABLE();
  if (!table) return [];
  try {
    const records = await listRecords(table, opts);
    return records.map(toParticipation);
  } catch (e) {
    console.error('[participations] list failed:', e.message);
    return [];
  }
}

export async function getParticipation(id) {
  const table = PARTICIPATIONS_TABLE();
  if (!table || !id) return null;
  const rec = await getRecord(table, id);
  return rec ? toParticipation(rec) : null;
}

/** All participations for one contact, across every workstream. */
export async function participationsForContact(contactId) {
  if (!contactId) return [];
  const all = await listParticipations();
  return all.filter(p => p.contactIds.includes(contactId));
}

/** All participations inside one workstream. */
export async function participationsForWorkstream(workstreamId) {
  if (!workstreamId) return [];
  const all = await listParticipations();
  return all.filter(p => p.workstreamIds.includes(workstreamId));
}

/**
 * Find the participation a contact's activity should route to.
 *
 * Subject routing rule: a thread belongs to exactly ONE participation, mirroring
 * the locked CRM rule that an Activity links to exactly one company. When a
 * contact sits in several workstreams we default to the one with the most recent
 * stage movement and let the UI reassign. Never fan one thread across
 * workstreams — that is how the same obligation ends up "resolved" in a place it
 * was never owed.
 */
export async function routeParticipation(contactId, { preferWorkstreamId } = {}) {
  const mine = await participationsForContact(contactId);
  if (!mine.length) return null;

  if (preferWorkstreamId) {
    const exact = mine.find(p => p.workstreamIds.includes(preferWorkstreamId));
    if (exact) return exact;
  }

  const active = mine.filter(p => p.status !== 'Inactive');
  const pool   = active.length ? active : mine;

  return pool.slice().sort((a, b) => {
    const at = a.stageEntered ? new Date(a.stageEntered).getTime() : 0;
    const bt = b.stageEntered ? new Date(b.stageEntered).getTime() : 0;
    return bt - at;
  })[0];
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Create a participation. `Stage Entered` is stamped on creation because
 * days-in-stage is meaningless without it, and a null there reads as "zero days"
 * which is the opposite of the truth for a record that has been sitting.
 */
export async function createParticipation(data) {
  const table = PARTICIPATIONS_TABLE();
  if (!table) throw new Error(NOT_CONFIGURED_MSG);

  const fields = toAirtableFields({
    ...data,
    stageEntered: dateOnly(data.stageEntered || new Date().toISOString()),
    status:       data.status || 'Active',
  }, PARTICIPATIONS_MAP);

  // An empty string on a singleSelect is not "blank" to Airtable, it is a
  // request to create a new option named "", which fails the whole write.
  for (const f of ['Stage', 'Waiting On', 'Entity', 'Status']) {
    if (fields[f] === '') delete fields[f];
  }

  const [rec] = await createRecords(table, [{ fields }]);
  return toParticipation(rec);
}

export async function updateParticipation(id, data) {
  const table = PARTICIPATIONS_TABLE();
  if (!table) throw new Error(NOT_CONFIGURED_MSG);

  const fields = toAirtableFields(data, PARTICIPATIONS_MAP);
  if (!Object.keys(fields).length) return getParticipation(id);

  const [rec] = await updateRecords(table, [{ id, fields }]);
  return toParticipation(rec);
}

// ── Shaping ──────────────────────────────────────────────────────────────────

function arr(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

export function toParticipation(record) {
  const p = fromAirtableRecord(record, PARTICIPATIONS_MAP);
  p.contactIds    = arr(p.contactIds);
  p.workstreamIds = arr(p.workstreamIds);
  p.workstreamId  = p.workstreamIds[0] || null;
  p.contactId     = p.contactIds[0] || null;
  return p;
}

/**
 * Build the "Name" primary field the same way everywhere: "Contact, Workstream".
 * Airtable primary fields are what show in linked-record chips, so a consistent
 * shape here is what keeps the base readable when someone opens it directly.
 */
export function participationName(contactName, workstreamName) {
  return [contactName, workstreamName].filter(Boolean).join(', ') || 'Untitled participation';
}

/** filterByFormula fragment matching a participation id inside a link field. */
export function linkContains(fieldName, recordId) {
  return `FIND("${esc(recordId)}", ARRAYJOIN({${fieldName}})) > 0`;
}
