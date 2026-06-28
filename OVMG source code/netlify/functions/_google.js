// Shared multi-account Google API client factory (Phase 8).
//
// Returns an OAuth2 client configured with the requesting user's currently
// active Google account credentials. Falls back to the env-based GMAIL_*
// credentials for users who haven't connected a personal Google account yet
// (single-account backwards compat).
//
// All Google-using functions (gmail-*, calendar-*, drive-*) should use this
// instead of building their own OAuth2 client. That way the active-account
// switching just works everywhere automatically.
//
// Required env vars:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET — the OAuth client credentials
//     (reused from the existing Gmail integration; same OAuth app)
//   GMAIL_REFRESH_TOKEN — fallback account's refresh token (used when the
//     user hasn't connected their own account)
//   GMAIL_SENDER — fallback account's email
//   PUBLIC_URL or URL — used to build the OAuth redirect URI

import { google } from 'googleapis';
import { getSupabase } from './_supabase.js';

// The redirect URI registered in Google Cloud Console.
// MUST match exactly what's listed in the OAuth client's "Authorized redirect URIs".
// Defaults to the deployed Netlify URL; override with PUBLIC_URL env var.
export function getRedirectUri() {
  const base = process.env.PUBLIC_URL
            || process.env.URL
            || 'https://ovmgdashboard.netlify.app';
  return `${base.replace(/\/$/, '')}/.netlify/functions/google-accounts-oauth-callback`;
}

// Scopes requested when a user connects a new Google account.
// Keep this in sync with what the dashboard actually uses (Gmail, Calendar, Drive metadata).
export const REQUESTED_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

// ── Build an OAuth2 client (no tokens yet) ──────────────────────────────────
export function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    getRedirectUri(),
  );
}

// ── Build an OAuth2 client populated with a specific account's tokens ──────
export function clientForTokens({ refresh_token, access_token, access_expires }) {
  const c = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    getRedirectUri(),
  );
  c.setCredentials({
    refresh_token,
    access_token,
    expiry_date: access_expires ? new Date(access_expires).getTime() : undefined,
  });
  return c;
}

// ── Get the active Google account for a Clerk user ─────────────────────────
// Returns { account, oauth2Client } or, if the user hasn't connected an
// account, falls back to the env-based "system" account.
export async function getActiveGoogleClient(userId) {
  if (userId) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('user_google_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
      if (!error && data?.refresh_token) {
        // Update last_used_at (fire and forget)
        supabase.from('user_google_accounts')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', data.id)
          .then(() => {}, () => {});
        return {
          account: {
            id: data.id, email: data.email, displayName: data.display_name,
            avatarUrl: data.avatar_url, scopes: data.scopes,
          },
          oauth2Client: clientForTokens(data),
          source: 'user-account',
        };
      }
    } catch (e) {
      console.warn('[_google] active account lookup failed, falling back to env:', e.message);
    }
  }

  // Fallback — env-based single account (matches the old _gmail.js behavior)
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('No Google account connected for this user, and GMAIL_REFRESH_TOKEN is not set.');
  }
  const c = makeOAuthClient();
  c.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return {
    account: {
      id: 'system',
      email: process.env.GMAIL_SENDER || 'system@onevibemediagroup.com',
      displayName: 'OVMG System',
      avatarUrl: '',
      scopes: REQUESTED_SCOPES,
    },
    oauth2Client: c,
    source: 'env-fallback',
  };
}

// ── Convenience: list all connected accounts for a user ────────────────────
export async function listUserGoogleAccounts(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_google_accounts')
    .select('id, email, display_name, avatar_url, scopes, is_active, created_at, last_used_at')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
