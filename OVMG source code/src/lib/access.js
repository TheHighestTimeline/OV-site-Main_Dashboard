// ─────────────────────────────────────────────────────────────────────────────
// Access control helper — Phase 0 rebuild.
//
// The single source of truth for "can this user see this tool?". Replaces the
// scattered `user.hasFullAccess` checks throughout the codebase.
//
// Precedence (highest first):
//   1. Hardcoded NEVER_OVERRIDABLE_TO_NON_OVMG list   (no override can bypass)
//   2. Per-user override 'deny'                       (admin explicitly denied)
//   3. Per-user override 'grant'                      (admin explicitly granted)
//   4. OVMG email OR 'admin' role                     (full access by default)
//   5. Company-scoped access (user_company_access)    (for 'company:slug' IDs)
//   6. Role default from TAB_ACCESS                   (role-based)
//   7. Deny                                            (everything else)
//
// Per-user overrides are stored on the Clerk user's publicMetadata:
//   {
//     ...,
//     toolOverrides: {
//       ncnda: 'grant',     // explicitly allow this user to use NCNDA
//       email: 'deny',      // explicitly deny — overrides their role default
//     }
//   }
//
// Company-scoped access:
//   canAccess(user, 'company:slug')  — checks if user can see that company section
//   canAccess(user, 'company:slug:subtab') — checks access to a specific sub-tab
//
// Read-only users:
//   canAccess returns true for read_only users on most tabs, but canMutate()
//   returns false. Use canMutate() to gate create/edit/delete actions.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TAB_ACCESS,
  NEVER_OVERRIDABLE_TO_NON_OVMG,
  COMPANY_META,
} from '../constants/roles.js';

// Per-company read/write grants set by an admin in the Access panel, stored on
// the Clerk user's publicMetadata.companyAccess = { [slug]: { read, write } }.
function getCompanyAccessMap(user) {
  return user?.clerkUser?.publicMetadata?.companyAccess
      || user?.publicMetadata?.companyAccess
      || user?.companyAccess
      || {};
}

// Does any of the user's roles grant this company by default (TAB_ACCESS)?
function roleHasCompany(user, slug) {
  const allowedRoles = TAB_ACCESS[`company:${slug}`] || [];
  return (user.roles || []).some(r => allowedRoles.includes(r));
}

/**
 * canAccess(user, toolId, companySlug?) → boolean
 *
 * Pass the user object from useAuth (which already includes roles, allowedTabs,
 * etc.) along with the tab/tool id you want to check.
 *
 * toolId formats:
 *   'overview'               — top-level tab
 *   'company:ovmg'           — company section
 *   'company:ovmg:calendar'  — company sub-tab (companySlug overrides prefix)
 *
 * companySlug (optional): if provided, automatically prefixes the check as
 *   'company:{companySlug}' — convenient when you already have the slug in scope.
 */
export function canAccess(user, toolId, companySlug) {
  if (!user || !toolId) return false;

  // Normalise: if companySlug provided, build the full company tab id
  const resolvedId = companySlug
    ? `company:${companySlug}${toolId ? `:${toolId}` : ''}`
    : toolId;

  const email     = user.email || '';
  const isOvmg    = email.endsWith('@onevibemediagroup.com');
  const overrides = user.clerkUser?.publicMetadata?.toolOverrides
                  || user.publicMetadata?.toolOverrides
                  || {};
  const override  = overrides[resolvedId];

  // ── Handle company:slug:subtab format ─────────────────────────────────────
  // e.g. 'company:ovmg:calendar' → check the company section access first,
  // then check that the sub-tab is in the company's allowed sub_tabs list.
  if (resolvedId.startsWith('company:')) {
    const parts = resolvedId.split(':');  // ['company', 'slug', 'subtab?']
    const slug    = parts[1];
    const subtab  = parts[2];

    // Admin / OVMG email → full access to all companies
    if (isOvmg || user.isAdmin) {
      if (!subtab) return true;
      const meta = COMPANY_META[slug];
      return meta ? meta.sub_tabs.includes(subtab) || isOvmg || user.isAdmin : false;
    }

    // Check company-level access: role defaults OR an explicit per-company
    // read grant from the admin Access panel (companyAccess[slug].read).
    const ca = getCompanyAccessMap(user)[slug];
    const hasCompanyAccess = roleHasCompany(user, slug) || !!ca?.read;
    if (!hasCompanyAccess) return false;

    // If a subtab was specified, check it's in the allowed list for this company
    if (subtab) {
      const meta = COMPANY_META[slug];
      if (!meta) return false;
      return meta.sub_tabs.includes(subtab);
    }

    return true;
  }

  // 1. Hard locks — non-OVMG, non-admin users can NEVER access these tabs,
  // even if granted via the per-tool override panel. Admins always get through
  // so co-founders with personal email addresses can still use restricted tools.
  if (!isOvmg && !user.isAdmin && NEVER_OVERRIDABLE_TO_NON_OVMG.includes(resolvedId)) {
    return false;
  }

  // 2. Explicit deny always wins.
  if (override === 'deny') return false;

  // 3. Explicit grant wins (subject to #1).
  if (override === 'grant') return true;

  // 4. OVMG email + admin role get everything.
  if (isOvmg || user.isAdmin) return true;

  // 5. Role-based default from TAB_ACCESS.
  const allowedRoles = TAB_ACCESS[resolvedId] || [];
  return (user.roles || []).some(r => allowedRoles.includes(r));
}

/**
 * canMutate(user, toolId?, companySlug?) → boolean
 *
 * Returns false for read_only users — they can see pages but cannot create,
 * edit, or delete records. All other roles that pass canAccess() can mutate.
 *
 * Usage:
 *   if (!canMutate(user)) return;   // block save/delete
 *   <Btn disabled={!canMutate(user)}>Save</Btn>
 */
export function canMutate(user, toolId, companySlug) {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('read_only') && !user.isAdmin) return false;

  // Company-scoped writes: admins / OVMG always pass. Otherwise the user needs
  // either role-based access to the company OR an explicit write grant from the
  // Access panel (companyAccess[slug].write). A read-only grant (read but not
  // write) lets them view the company but blocks create/edit/delete.
  if (companySlug) {
    if (!canAccess(user, toolId || '', companySlug)) return false;
    const isOvmg = (user.email || '').endsWith('@onevibemediagroup.com');
    if (isOvmg || user.isAdmin) return true;
    if (roleHasCompany(user, companySlug)) return true;
    const ca = getCompanyAccessMap(user)[companySlug];
    return !!ca?.write;
  }

  // If a toolId is provided, they must also have access to that tool
  if (toolId) return canAccess(user, toolId, companySlug);
  return true;
}

/**
 * Returns the set of all tab IDs the user can access (sorted by ALL_TABS order
 * if you import it elsewhere — this returns a plain array of permitted IDs).
 */
export function allowedToolIds(user, allTabs) {
  return (allTabs || []).filter(t => canAccess(user, t));
}

/**
 * gate(user, toolId, ifAllowed, ifDenied) — small ergonomic helper for JSX.
 * Returns ifAllowed when canAccess passes, otherwise ifDenied (or null).
 */
export function gate(user, toolId, ifAllowed, ifDenied = null) {
  return canAccess(user, toolId) ? ifAllowed : ifDenied;
}

/**
 * gateCompany(user, slug, subtab?) — shorthand for company-scoped gate.
 */
export function gateCompany(user, slug, subtab) {
  return canAccess(user, subtab || '', slug);
}
