// google-accounts-remove — Phase 8.
// Disconnects a Google account from a user. Revokes the refresh token on
// Google's side too, so the dashboard immediately loses access.

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const accountId = body.accountId || body.id;
  if (!accountId) return err(400, 'accountId required');

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');
    const supabase = getSupabase();

    const { data: account, error: fetchErr } = await supabase
      .from('user_google_accounts')
      .select('*')
      .eq('id', accountId)
      .single();
    if (fetchErr || !account) return err(404, 'Account not found');
    if (account.user_id !== user.id) return err(403, 'Not your account');

    // Best-effort revoke on Google's side (don't fail the call if this errors)
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.refresh_token)}`, {
        method: 'POST',
      });
    } catch (e) {
      console.warn('[google-accounts-remove] revoke failed (non-fatal):', e.message);
    }

    const { error: delErr } = await supabase
      .from('user_google_accounts')
      .delete()
      .eq('id', accountId);
    if (delErr) throw delErr;

    return ok({ accountId, removed: true, email: account.email });
  } catch (e) {
    console.error('[google-accounts-remove]', e.message);
    return err(500, e.message);
  }
};
