// Dedicated endpoint for updating just the roles of an existing Clerk user.
// Phase 7+ audit fix H-6: writes to audit_log on role change.
import { createClerkClient } from '@clerk/backend';
import { ok, err, CORS } from './_notion.js';
import { requireAdmin, getUser } from './_auth.js';
import { logAudit } from './_audit.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const VALID_ROLES = ['admin', 'executive', 'operations', 'sales', 'finance'];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  try {
    const { id, roles } = JSON.parse(event.body || '{}');
    if (!id)                   return err(400, 'id is required');
    if (!Array.isArray(roles)) return err(400, 'roles must be an array');

    const cleanRoles = roles.filter(r => VALID_ROLES.includes(r));

    // Read current roles BEFORE updating so we can log the diff.
    let previousRoles = [];
    let targetEmail   = '';
    try {
      const target = await clerk.users.getUser(id);
      previousRoles = target.publicMetadata?.roles || [];
      targetEmail   = target.emailAddresses?.[0]?.emailAddress || '';
    } catch { /* ignore — if user fetch fails, role update will too */ }

    await clerk.users.updateUser(id, {
      publicMetadata: {
        roles: cleanRoles,
        role: cleanRoles[0] || '',
      },
    });

    // H-6: audit log
    const actor = await getUser(event);
    await logAudit({
      event,
      actor: { id: actor?.id, email: actor?.email },
      action: 'role.change',
      target: { id, email: targetEmail },
      meta: {
        previousRoles: previousRoles.sort(),
        newRoles:      [...cleanRoles].sort(),
        added:   cleanRoles.filter(r => !previousRoles.includes(r)),
        removed: previousRoles.filter(r => !cleanRoles.includes(r)),
      },
    });

    return ok({ id, roles: cleanRoles, updated: true });
  } catch (e) {
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message;
    return err(500, msg);
  }
};
