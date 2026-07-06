// Auth helper — validates Clerk JWT from Authorization: Bearer header.
import { createClerkClient, verifyToken } from '@clerk/backend';
import { CORS } from './_http.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Extract and verify the Clerk session JWT from the request
async function verifyClerkToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    // Prefer networkless verification when the PEM public key is provided
    // (CLERK_JWT_KEY) — avoids the JWKS network fetch that fails in some
    // runtimes ("Failed to resolve JWK during verification"). Falls back to
    // networkful (secretKey only) when the key isn't set.
    const opts = { secretKey: process.env.CLERK_SECRET_KEY };
    if (process.env.CLERK_JWT_KEY) {
      // Normalize literal "\n" (from single-line .env values) into real newlines.
      opts.jwtKey = process.env.CLERK_JWT_KEY.replace(/\\n/g, '\n');
    }
    return await verifyToken(token, opts);
  } catch (e) {
    console.error('[_auth] verifyToken failed:', e?.message || String(e));
    return null;
  }
}

// Returns full user object including email — used when email identity is needed.
export async function getUser(event) {
  const payload = await verifyClerkToken(event);
  if (!payload) return null;
  try {
    const u     = await clerk.users.getUser(payload.sub);
    const email = u.emailAddresses?.[0]?.emailAddress || '';
    const roles = u.publicMetadata?.roles || [];
    const role  = u.publicMetadata?.role  || '';
    // Merge legacy single role
    const effectiveRoles = Array.from(new Set([
      ...roles,
      ...(role && !roles.includes(role) ? [role] : []),
    ]));
    return {
      id:             payload.sub,
      email,
      fullName:       [u.firstName, u.lastName].filter(Boolean).join(' ') || email.split('@')[0],
      publicMetadata: u.publicMetadata || {},
      roles:          effectiveRoles,
      role,
    };
  } catch {
    return null;
  }
}

const unauth = { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
const denied = { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Access denied' }) };

// ── SECURITY FIX (2026-07 audit §1.1) ────────────────────────────────────────
// Previously ANY @onevibemediagroup.com email was treated as a full admin by
// every server-side gate, which made the whole role system decorative for
// employees. Admin is now granted ONLY by the 'admin' role in Clerk
// publicMetadata, plus a small bootstrap allowlist (ADMIN_EMAILS env var,
// comma-separated) so the owner can never lock himself out before roles are
// assigned. The company domain is used for signup allowlisting (see Clerk
// dashboard → Restrictions), NOT for privilege escalation.
const BOOTSTRAP_ADMINS = (process.env.ADMIN_EMAILS || 'tanner@onevibemediagroup.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isAdminUser(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  return user.roles.includes('admin') || user.role === 'admin' || BOOTSTRAP_ADMINS.includes(email);
}

// OVMG employees whose roles were never set get the default 'member' role so
// the app keeps working for the team — WITHOUT admin rights. External accounts
// get no default role (they must be granted roles explicitly).
export function effectiveRolesFor(user) {
  if (!user) return [];
  if (user.roles.length > 0) return user.roles;
  return (user.email || '').toLowerCase().endsWith('@onevibemediagroup.com') ? ['member'] : [];
}

export async function requireAuth(event) {
  const payload = await verifyClerkToken(event);
  if (payload) return null;
  return unauth;
}

// requireFullAccess: admin, or at least one non-sales role
export async function requireFullAccess(event) {
  const user = await getUser(event);
  if (!user) return unauth;
  const roles = effectiveRolesFor(user);
  const hasFullAccess = isAdminUser(user) || roles.some(r => r !== 'sales');
  return hasFullAccess ? null : denied;
}

// requireAdmin: 'admin' role or bootstrap allowlist ONLY (no domain bypass)
export async function requireAdmin(event) {
  const user = await getUser(event);
  if (!user) return unauth;
  return isAdminUser(user) ? null : denied;
}

/**
 * requireRole(event, rolesAllowed)
 * Returns null if the user has at least one of the listed roles (or is admin).
 * Returns a 403 response otherwise.
 */
export async function requireRole(event, rolesAllowed = []) {
  const user = await getUser(event);
  if (!user) return unauth;
  if (isAdminUser(user)) return null; // admins pass any role gate
  const allowed = effectiveRolesFor(user).some(r => rolesAllowed.includes(r));
  return allowed ? null : denied;
}
