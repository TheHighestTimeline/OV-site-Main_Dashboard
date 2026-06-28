// Shared Gmail API client used by all email functions.
import { google } from 'googleapis';
import { getActiveGoogleClient } from './_google.js';

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

// Legacy single-account client (env GMAIL_REFRESH_TOKEN). Kept as a fallback.
export const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// Preferred: a Gmail client for the user's ACTIVE connected Google account (the
// one they picked via the dashboard's "Add account" flow). This is what makes
// "send/read from whatever Gmail I want" work. Falls back to the env account
// when the user hasn't connected one (getActiveGoogleClient handles that).
export async function getGmail(userId) {
  try {
    const { oauth2Client } = await getActiveGoogleClient(userId);
    return google.gmail({ version: 'v1', auth: oauth2Client });
  } catch {
    // If no connected account AND no env fallback is configured, fall back to
    // the legacy client so behavior is never worse than before.
    return gmail;
  }
}

// Recursively extract the best body from a message payload.
// Prefers text/html, falls back to text/plain wrapped in <pre>.
export function extractBody(payload) {
  if (!payload) return '';

  // Leaf node with data
  if (payload.body?.data) {
    const text = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    if (payload.mimeType === 'text/plain') {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0;line-height:1.5">${escaped}</pre>`;
    }
    return text;
  }

  if (!payload.parts) return '';

  // multipart — prefer HTML part
  const html = payload.parts.find(p => p.mimeType === 'text/html');
  if (html) return extractBody(html);

  const plain = payload.parts.find(p => p.mimeType === 'text/plain');
  if (plain) return extractBody(plain);

  // Recurse into nested multipart
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

// Get a header value from a message's headers array
export function getHeader(headers = [], name) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}
