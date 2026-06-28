// Lists all Clerk users. Admin only.
// Phase 6: now also returns publicMetadata.toolOverrides for per-tool access UI.
import { createClerkClient } from '@clerk/backend';
import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  try {
    const response = await clerk.users.getUserList({ limit: 100, orderBy: '-created_at' });
    const users = (response.data || response).map(u => ({
      id:             u.id,
      email:          u.emailAddresses?.[0]?.emailAddress || '',
      fullName:       [u.firstName, u.lastName].filter(Boolean).join(' ') || u.emailAddresses?.[0]?.emailAddress?.split('@')[0] || '',
      roles:          u.publicMetadata?.roles || [],
      role:           u.publicMetadata?.role  || '',
      toolOverrides:  u.publicMetadata?.toolOverrides || {},
      companyAccess:  u.publicMetadata?.companyAccess || {},
      // Full metadata so the frontend can read companyAccess via u.publicMetadata.*
      publicMetadata: u.publicMetadata || {},
      isAdmin:        (u.publicMetadata?.roles || []).includes('admin') || (u.publicMetadata?.role === 'admin'),
      confirmedAt:    u.emailAddresses?.[0]?.verification?.status === 'verified' ? u.createdAt : null,
      lastSignInAt:   u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
      createdAt:      u.createdAt   ? new Date(u.createdAt).toISOString()   : null,
      banned:         u.banned || false,
    }));

    return ok(users);
  } catch (e) {
    return err(500, e.message);
  }
};
