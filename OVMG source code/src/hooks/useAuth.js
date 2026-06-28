import { useUser, useClerk } from '@clerk/clerk-react';
import {
  TAB_ACCESS, ALL_TABS, NEVER_OVERRIDABLE_TO_NON_OVMG,
} from '../constants/roles.js';

/**
 * useAuth - thin wrapper around Clerk's useUser hook.
 * Returns { user, loading, logout, openLogin }
 *
 * user shape:
 *   { id, email, fullName, roles[], allowedTabs (Set), isAdmin, hasFullAccess, isSales,
 *     toolOverrides, publicMetadata, clerkUser }
 *
 * Role resolution:
 *  1. @onevibemediagroup.com email  → full access, all tabs (back-compat)
 *  2. publicMetadata.roles[]        → primary source (multi-role system)
 *  3. publicMetadata.role (string)  → legacy fallback (kept for back-compat)
 *
 * Per-user overrides (Phase 6):
 *  publicMetadata.toolOverrides = { ncnda: 'grant', email: 'deny' }
 *  'grant' → add the tab to allowedTabs even if the user's role doesn't.
 *  'deny'  → remove the tab from allowedTabs even if the user's role does.
 *  Hardcoded NEVER_OVERRIDABLE_TO_NON_OVMG cannot be overridden for non-OVMG users.
 */
export function useAuth() {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut, openSignIn } = useClerk();

  const loading = !isLoaded;

  const normalize = (raw) => {
    if (!raw) return null;
    const email       = raw.primaryEmailAddress?.emailAddress || '';
    const roles       = raw.publicMetadata?.roles || [];
    const legacyRole  = raw.publicMetadata?.role  || '';
    const overrides   = raw.publicMetadata?.toolOverrides || {};
    const isOvmgEmail = email.endsWith('@onevibemediagroup.com');

    // Merge legacy single role into the array (no duplicates)
    const effectiveRoles = Array.from(new Set([
      ...roles,
      ...(legacyRole && !roles.includes(legacyRole) ? [legacyRole] : []),
    ]));

    const isAdmin      = isOvmgEmail || effectiveRoles.includes('admin');
    // hasFullAccess = at least one non-sales role, or OVMG email
    const hasFullAccess = isAdmin || effectiveRoles.some(r => r !== 'sales');
    const isSales       = (effectiveRoles.includes('sales') || legacyRole === 'sales') && !hasFullAccess;

    // Build the Set of allowed tab IDs.
    // Start from role defaults, then apply per-tool overrides.
    let baseAllowed;
    if (isOvmgEmail || effectiveRoles.includes('admin')) {
      // Admin / OVMG team gets everything by role
      baseAllowed = new Set(ALL_TABS);
    } else {
      baseAllowed = new Set(
        ALL_TABS.filter(tab => {
          const allowed = TAB_ACCESS[tab] || [];
          return effectiveRoles.some(r => allowed.includes(r));
        })
      );
    }

    // Apply per-tool overrides on top of role defaults.
    const allowedTabs = new Set(baseAllowed);
    Object.entries(overrides).forEach(([tab, action]) => {
      if (action === 'grant') {
        // Hard locks — non-OVMG users can NEVER access certain tabs even via override
        if (isOvmgEmail || !NEVER_OVERRIDABLE_TO_NON_OVMG.includes(tab)) {
          allowedTabs.add(tab);
        }
      } else if (action === 'deny') {
        allowedTabs.delete(tab);
      }
    });

    return {
      id:             raw.id,
      email,
      fullName:       raw.fullName || raw.firstName || email.split('@')[0],
      roles:          effectiveRoles,
      allowedTabs,
      isAdmin,
      hasFullAccess,
      isSales,
      toolOverrides:  overrides,
      publicMetadata: raw.publicMetadata || {},
      clerkUser:      raw,
    };
  };

  const user     = isSignedIn ? normalize(clerkUser) : null;
  const logout   = () => signOut();
  const openLogin = () => openSignIn();

  return { user, loading, logout, openLogin };
}
