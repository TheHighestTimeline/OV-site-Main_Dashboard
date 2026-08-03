// Role gating for the Threads tab (WP2).
//
// Two roles, both built now rather than retrofitted later:
//   coo  — everything. Tanner and Carsten.
//   ops  — everything EXCEPT threads whose entity is a capital-raise
//          workstream. Ivan and Sofia.
//
// Hiding the nav item hides nothing: anyone can call the endpoint directly. So
// every /api/coo-* function validates server-side and returns 403 otherwise,
// and every list endpoint additionally filters rows by entity before returning.
//
// Admins pass the role gate (requireRole already grants that), but they are
// still subject to nothing here — admin is a superset of coo by design.

import { requireRole, getUser } from './_auth.js';

export const COO_ROLES = ['coo', 'ops'];

/**
 * Entities treated as capital raise. `ops` never sees threads on these.
 * Configurable because entity naming in Airtable is Tanner's to change without
 * a code deploy. The defaults match the Entity options in the live base that
 * correspond to fundraising rather than delivery or client work.
 */
export function capitalEntities() {
  const raw = process.env.COO_CAPITAL_ENTITIES;
  if (raw) return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return ['ovmg capital', 'capital', 'onevibe capital', 'ovmg raise'];
}

/** Gate for read endpoints: coo or ops (or admin). */
export async function requireCooOrOps(event) {
  return requireRole(event, COO_ROLES);
}

/** Gate for endpoints only the COO role may touch (manual scans, config). */
export async function requireCoo(event) {
  return requireRole(event, ['coo']);
}

/**
 * Returns a filter function for the requesting user.
 *
 * Call it once per request and apply it to every row before serialization. The
 * check is on the row's entity, not on the route, so a row that arrives through
 * a join or a nested list is filtered the same way as a top-level one.
 */
export async function entityFilterFor(event) {
  const user  = await getUser(event).catch(() => null);
  const roles = user?.roles || [];
  const isAdmin = roles.includes('admin');
  const isCoo   = roles.includes('coo');

  // coo and admin see everything.
  if (isAdmin || isCoo) return () => true;

  const blocked = capitalEntities();
  return (row) => {
    const entity = String(row?.entity || '').trim().toLowerCase();
    if (!entity) return true;              // unlabelled rows are not capital by assertion
    return !blocked.includes(entity);
  };
}

/** Convenience: filter an array of {entity} rows for this request. */
export async function filterByEntity(event, rows) {
  const keep = await entityFilterFor(event);
  return (rows || []).filter(keep);
}
