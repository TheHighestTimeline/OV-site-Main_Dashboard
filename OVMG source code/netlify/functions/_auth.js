// Auth helper — validates Clerk JWT from Authorization: Bearer header.
import { createClerkClient, verifyToken } from '@clerk/backend';
import { CORS } from './_notion.js';

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

export async function requireAuth(event) {
  const payload = await verifyClerkToken(event);
  if (payload) return null;
  return unauth;
}

// requireFullAccess: has at least one non-sales role OR is OVMG email
export async function requireFullAccess(event) {
  const user = await getUser(event);
  if (!user) return unauth;
  const isOvmg       = user.email.endsWith('@onevibemediagroup.com');
  const hasFullAccess = isOvmg ||
    user.roles.includes('admin') ||
    user.roles.some(r => r !== 'sales');
  return hasFullAccess ? null : denied;
}

// requireAdmin: OVMG email or 'admin' role
export async function requireAdmin(event) {
  const user = await getUser(event);
  if (!user) return unauth;
  const isOvmg    = user.email.endsWith('@onevibemediagroup.com');
  const isAdmin   = isOvmg || user.roles.includes('admin') || user.role === 'admin';
  return isAdmin ? null : denied;
}

/**
 * requireRole(event, rolesAllowed)
 * Returns null if the user has at least one of the listed roles (or is OVMG email / admin).
 * Returns a 403 response otherwise.
 */
export async function requireRole(event, rolesAllowed = []) {
  const user = await getUser(event);
  if (!user) return unauth;
  const isOvmg  = user.email.endsWith('@onevibemediagroup.com');
  const isAdmin = isOvmg || user.roles.includes('admin');
  if (isAdmin) return null; // admins pass any role gate
  const allowed = user.roles.some(r => rolesAllowed.includes(r));
  return allowed ? null : denied;
}
