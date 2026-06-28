// Invites a user via Clerk. Admin only.
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
    const { email, name, roles = [], companyAccess } = JSON.parse(event.body || '{}');
    if (!email) return err(400, 'email is required');

    // Validate roles
    const cleanRoles = (Array.isArray(roles) ? roles : [roles]).filter(r => VALID_ROLES.includes(r));

    const isOvmgEmail = email.endsWith('@onevibemediagroup.com');

    // External users must have at least one role
    if (!isOvmgEmail && cleanRoles.length === 0) {
      return err(400, 'External (non-OVMG) users must be invited with at least one role (e.g. "sales")');
    }

    const siteUrl = process.env.URL || 'https://ovmgdashboard.netlify.app';

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        roles: cleanRoles,
        // keep legacy single-role field for back-compat
        role: cleanRoles[0] || '',
        ...(companyAccess && typeof companyAccess === 'object' ? { companyAccess } : {}),
      },
      redirectUrl: `${siteUrl}/`,
    });

    return ok({ invited: true, email, invitationId: invitation.id });
  } catch (e) {
    // Clerk throws structured errors
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message;
    return err(500, msg);
  }
};
