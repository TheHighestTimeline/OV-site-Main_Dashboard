// google-accounts-set-active — Phase 8.
// Sets which connected Google account is the user's "active" one.
// Subsequent calls to Gmail / Calendar / Drive use the active account.

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

    // Verify the account belongs to this user
    const { data: account, error: fetchErr } = await supabase
      .from('user_google_accounts')
      .select('id, user_id, email')
      .eq('id', accountId)
      .single();
    if (fetchErr || !account) return err(404, 'Account not found');
    if (account.user_id !== user.id) return err(403, 'Not your account');

    // Atomic switch: deactivate all of this user's accounts, then activate the one
    const { error: deactErr } = await supabase
      .from('user_google_accounts')
      .update({ is_active: false })
      .eq('user_id', user.id);
    if (deactErr) throw deactErr;

    const { error: actErr } = await supabase
      .from('user_google_accounts')
      .update({ is_active: true, last_used_at: new Date().toISOString() })
      .eq('id', accountId);
    if (actErr) throw actErr;

    return ok({ accountId, email: account.email, isActive: true });
  } catch (e) {
    console.error('[google-accounts-set-active]', e.message);
    return err(500, e.message);
  }
};
