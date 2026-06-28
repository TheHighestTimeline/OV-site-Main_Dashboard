// google-accounts-list — Phase 8.
// Returns the list of Google accounts the authenticated user has connected.

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { listUserGoogleAccounts } from './_google.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');
    const accounts = await listUserGoogleAccounts(user.id);
    return ok({
      accounts: accounts.map(a => ({
        id:           a.id,
        email:        a.email,
        displayName:  a.display_name,
        avatarUrl:    a.avatar_url,
        scopes:       a.scopes,
        isActive:     a.is_active,
        createdAt:    a.created_at,
        lastUsedAt:   a.last_used_at,
      })),
      // include a flag so the UI can show "you don't have any connected accounts yet"
      hasConnectedAccount: accounts.length > 0,
    });
  } catch (e) {
    console.error('[google-accounts-list]', e.message);
    return err(500, e.message);
  }
};
