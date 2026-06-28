// google-accounts-oauth-start — Phase 8.
// Generates the Google OAuth consent URL that the user is redirected to when
// they click "+ Add account" in the dashboard.
//
// Flow:
//   1. Dashboard POSTs here with the calling user's JWT
//   2. We mint a random `state` token, store it in oauth_state table tied to
//      the user (so the callback can verify CSRF + know who initiated)
//   3. Return the Google OAuth consent URL
//   4. Dashboard opens that URL in a popup or new tab
//   5. User consents → Google redirects to the callback function
//   6. Callback exchanges the code for tokens, stores in user_google_accounts

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { makeOAuthClient, REQUESTED_SCOPES, getRedirectUri } from './_google.js';
import crypto from 'crypto';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');

    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      return err(503, 'Google OAuth not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET missing)');
    }

    // CSRF state token — also used to identify the initiating user in the callback.
    const state = crypto.randomBytes(24).toString('hex');

    const supabase = getSupabase();

    supabase.from('oauth_state').delete()
      .lt('expires_at', new Date(Date.now() - 86400000).toISOString())
      .then(() => {}, () => {});

    const { error } = await supabase
      .from('oauth_state')
      .insert({ state, user_id: user.id });
    if (error) throw error;

    const client = makeOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',                 // get a refresh_token
      // 'select_account' ALWAYS shows Google's account chooser so you can pick
      // which Gmail to connect, instead of silently reusing the one you're
      // already signed into. 'consent' still forces a refresh_token.
      prompt: 'select_account consent',
      scope: REQUESTED_SCOPES,
      state,
      include_granted_scopes: true,
    });

    // Surface the exact redirect URI we send to Google. If you ever hit
    // `redirect_uri_mismatch`, THIS string must be registered verbatim under the
    // OAuth client's "Authorized redirect URIs" in Google Cloud Console.
    const redirectUri = getRedirectUri();
    console.log('[google-accounts-oauth-start] redirect_uri =', redirectUri);

    return ok({ url, state, redirectUri });
  } catch (e) {
    console.error('[google-accounts-oauth-start]', e.message);
    return err(500, e.message);
  }
};
