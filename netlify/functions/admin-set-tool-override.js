// Set / clear per-tool access overrides for a user (Phase 6 + audit fixes).
//
// Phase 7+ audit fixes added:
//   H-6: writes to audit_log on every override change
//   H-7: revokes the target user's active sessions so the change takes
//        effect immediately (otherwise they'd keep using the old permissions
//        until their JWT refreshes — up to 5 min window)

import { createClerkClient } from '@clerk/backend';
import { ok, err, CORS } from './_notion.js';
import { requireAdmin, getUser } from './_auth.js';
import { logAudit } from './_audit.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Mirror of src/constants/roles.js — keep in sync.
const NEVER_OVERRIDABLE_TO_NON_OVMG = [
  // 'playbook', // future
];

const VALID_TABS = new Set([
  'overview', 'my-day', 'contacts', 'tasks', 'outreach', 'social',
  'websites', 'tools', 'references',
  'ncnda', 'signature', 'email', 'financial',
  'team-goals', 'settings', 'admin',
]);

const VALID_ACTIONS = new Set(['grant', 'deny', 'clear']);

async function revokeUserSessions(userId) {
  // H-7: when an override changes, the user's existing JWT still has the old
  // toolOverrides. Force a re-auth by revoking all their active sessions.
  // List then revoke individually — Clerk doesn't have a single "revoke all
  // for user" call.
  try {
    const list = await clerk.sessions.getSessionList({ userId, status: 'active' });
    const sessions = list.data || list || [];
    for (const s of sessions) {
      try { await clerk.sessions.revokeSession(s.id); }
      catch (e) { console.warn('[admin-set-tool-override] revoke', s.id, e.message); }
    }
    return sessions.length;
  } catch (e) {
    console.warn('[admin-set-tool-override] session-revoke list failed:', e.message);
    return 0;
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const { userId, tab, action } = body;
  if (!userId)                                  return err(400, 'userId required');
  if (!tab || !VALID_TABS.has(tab))             return err(400, `Invalid tab: ${tab}`);
  if (!action || !VALID_ACTIONS.has(action))    return err(400, `Invalid action: ${action} (must be grant|deny|clear)`);

  try {
    const actor = await getUser(event);
    const target = await clerk.users.getUser(userId);
    const targetEmail = target.emailAddresses?.[0]?.emailAddress || '';
    const isTargetOvmg = targetEmail.endsWith('@onevibemediagroup.com');

    if (action === 'grant' && !isTargetOvmg && NEVER_OVERRIDABLE_TO_NON_OVMG.includes(tab)) {
      return err(400, `${tab} cannot be granted to non-OVMG accounts (hardcoded lock)`);
    }

    const previousOverrides = { ...(target.publicMetadata?.toolOverrides || {}) };
    const newOverrides      = { ...previousOverrides };
    if (action === 'clear') delete newOverrides[tab];
    else                    newOverrides[tab] = action;

    await clerk.users.updateUser(userId, {
      publicMetadata: {
        ...(target.publicMetadata || {}),
        toolOverrides: newOverrides,
      },
    });

    // H-7: force re-auth so the new permissions apply immediately.
    const revokedCount = await revokeUserSessions(userId);

    // H-6: audit log
    await logAudit({
      event,
      actor: { id: actor?.id, email: actor?.email },
      action: `tool_override.${action}`,
      target: { id: userId, email: targetEmail },
      meta: {
        tab,
        previousValue: previousOverrides[tab] || null,
        newValue:      action === 'clear' ? null : action,
        sessionsRevoked: revokedCount,
      },
    });

    return ok({
      userId,
      tab,
      action,
      toolOverrides: newOverrides,
      sessionsRevoked: revokedCount,
    });
  } catch (e) {
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message;
    console.error('[admin-set-tool-override]', msg);
    return err(500, msg);
  }
};
