// Updates a Clerk user (roles, fullName, ban/unban). Admin only.
import { createClerkClient } from '@clerk/backend';
import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const VALID_ROLES = ['admin', 'executive', 'operations', 'sales', 'finance', 'pm', 'member', 'senior_partner', 'read_only'];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  try {
    const { id, roles, fullName, banned, companyAccess, publicMetadata } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');

    const updates = {};

    // Whether any metadata change was requested
    const metaChange = roles !== undefined || companyAccess !== undefined || publicMetadata !== undefined;

    if (metaChange) {
      // Clerk REPLACES publicMetadata wholesale, so start from the existing
      // metadata to avoid wiping roles / toolOverrides / companyAccess.
      let existingMeta = {};
      try {
        const current = await clerk.users.getUser(id);
        existingMeta = current.publicMetadata || {};
      } catch { /* fall through with empty */ }

      // Merge any caller-supplied publicMetadata object first (e.g. companyAccess
      // nested inside it from the Access modal), then apply explicit params.
      let nextMeta = { ...existingMeta };
      if (publicMetadata && typeof publicMetadata === 'object') {
        nextMeta = { ...nextMeta, ...publicMetadata };
      }
      if (roles !== undefined) {
        const cleanRoles = (Array.isArray(roles) ? roles : [roles]).filter(r => VALID_ROLES.includes(r));
        nextMeta.roles = cleanRoles;
        nextMeta.role  = cleanRoles[0] || '';
      }
      if (companyAccess !== undefined && companyAccess !== null) {
        nextMeta.companyAccess = companyAccess;
      }
      updates.publicMetadata = nextMeta;
    }

    // Name update
    if (fullName !== undefined) {
      const parts = (fullName || '').trim().split(/\s+/);
      updates.firstName = parts[0] || '';
      updates.lastName  = parts.slice(1).join(' ') || '';
    }

    if (Object.keys(updates).length > 0) {
      await clerk.users.updateUser(id, updates);
    }

    // Ban / unban (separate Clerk call)
    if (banned === true) {
      await clerk.users.banUser(id);
    } else if (banned === false) {
      await clerk.users.unbanUser(id);
    }

    return ok({ id, updated: true });
  } catch (e) {
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message;
    return err(500, msg);
  }
};
