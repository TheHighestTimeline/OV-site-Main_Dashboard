// google-accounts-oauth-callback — Phase 8.
// Google redirects here after the user consents (or denies). Exchanges the
// auth code for tokens, fetches the user's Google profile to know which email
// just connected, stores everything in user_google_accounts.
//
// Returns an HTML page that closes the popup (or redirects back to the
// dashboard if not in a popup). Errors render as an HTML error page so the
// user sees something useful.
//
// Note: this function is NOT auth-protected by Clerk because Google calls it
// without our session JWT. CSRF protection comes from the `state` token we
// minted in google-accounts-oauth-start and stored in oauth_state.

import { CORS } from './_notion.js';
import { getSupabase } from './_supabase.js';
import { makeOAuthClient } from './_google.js';
import { google } from 'googleapis';

function htmlResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    body,
  };
}

function errorPage(msg) {
  return htmlResponse(`<!doctype html>
<html><head><meta charset="utf-8"><title>Google connection failed</title>
<style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#fbf8f2;color:#0e1014;max-width:520px;margin:0 auto}
h1{font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 12px}
.err{padding:14px 16px;background:#f1d6d6;border-radius:8px;color:#b03a3a;font-size:13px}
.note{margin-top:18px;font-size:12px;color:#6b7180}</style></head>
<body><h1>Couldn't connect Google account</h1>
<div class="err">${msg.replace(/[<>]/g, '')}</div>
<div class="note">You can close this tab and try again from the dashboard.</div>
</body></html>`, 400);
}

function successPage(email) {
  // Closes the popup if opened as one. Otherwise just shows a confirmation
  // that the user can close.
  return htmlResponse(`<!doctype html>
<html><head><meta charset="utf-8"><title>Google account connected</title>
<style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:40px;background:#fbf8f2;color:#0e1014;text-align:center}
h1{font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 8px}
.ok{display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:#2f7d5f;color:#fff;font-size:32px;margin-bottom:12px}
.email{font-family:'Courier New',monospace;font-size:13px;color:#3a4050;padding:6px 12px;background:#f4f0e6;border-radius:6px;display:inline-block;margin-top:6px}
.note{margin-top:18px;font-size:12px;color:#6b7180}</style></head>
<body>
<div class="ok">✓</div>
<h1>Connected</h1>
<div class="email">${email.replace(/[<>]/g, '')}</div>
<div class="note">You can close this tab. The dashboard will pick up the new account on next page load.</div>
<script>
  // If we were opened as a popup, signal the opener + close.
  if (window.opener) {
    try { window.opener.postMessage({ type: 'ovmg.google.account.connected', email: ${JSON.stringify(email)} }, '*'); } catch(e) {}
    setTimeout(() => window.close(), 1200);
  }
</script>
</body></html>`);
}

export const handler = async (event) => {
  // Parse query string params (Google sends them via GET redirect)
  const params = event.queryStringParameters || {};
  const code  = params.code;
  const state = params.state;
  const error = params.error;

  if (error) {
    return errorPage(`Google returned: ${error}`);
  }
  if (!code || !state) {
    return errorPage('Missing code or state parameter from Google.');
  }

  try {
    const supabase = getSupabase();

    // CSRF check — state must exist + not expired + tied to a user
    const { data: stateRow, error: stateErr } = await supabase
      .from('oauth_state')
      .select('*')
      .eq('state', state)
      .single();
    if (stateErr || !stateRow) {
      return errorPage('OAuth state token invalid or expired. Start the connection again from the dashboard.');
    }
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      return errorPage('OAuth state token expired. Start the connection again.');
    }
    const userId = stateRow.user_id;

    // Exchange the code for tokens
    const oauth2 = makeOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return errorPage(
        "Google didn't return a refresh token. " +
        "This usually means you've previously authorized this app — go to " +
        "<a href='https://myaccount.google.com/permissions'>your Google permissions</a>, " +
        "remove this app's access, then try again. (We use prompt=consent so this shouldn't happen often.)",
      );
    }

    oauth2.setCredentials(tokens);

    // Get profile info — email, name, picture
    const userinfo = await google.oauth2('v2').userinfo.get({ auth: oauth2 });
    const profile = userinfo.data;
    const email = profile.email || '';
    if (!email) return errorPage('Google returned no email on the profile.');

    // Compute scopes actually granted
    const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);

    // Upsert into user_google_accounts (unique on user_id+email)
    const { error: upErr } = await supabase
      .from('user_google_accounts')
      .upsert({
        user_id:        userId,
        email,
        display_name:   profile.name        || '',
        avatar_url:     profile.picture     || '',
        refresh_token:  tokens.refresh_token,
        access_token:   tokens.access_token || '',
        access_expires: tokens.expiry_date  ? new Date(tokens.expiry_date).toISOString() : null,
        scopes:         grantedScopes,
        last_used_at:   new Date().toISOString(),
      }, { onConflict: 'user_id,email' });
    if (upErr) throw upErr;

    // If this is the user's first account, make it active automatically.
    const { count } = await supabase
      .from('user_google_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (count === 1) {
      await supabase
        .from('user_google_accounts')
        .update({ is_active: true })
        .eq('user_id', userId);
    }

    // Delete the state token (one-time use)
    await supabase.from('oauth_state').delete().eq('state', state);

    return successPage(email);
  } catch (e) {
    console.error('[google-accounts-oauth-callback]', e.message);
    return errorPage('Connection failed: ' + e.message);
  }
};
