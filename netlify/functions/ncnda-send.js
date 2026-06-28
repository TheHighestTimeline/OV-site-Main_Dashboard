// NCNDA send + log (Phase 5 + Phase 7 audit fix H-3).
//
// AUDIT FIX H-3: user-controlled strings (notes, counterparty name/email) are
// now escaped before being appended to the Google Sheet, preventing formula
// injection (CVE-2014-3524 class). A leading '=', '+', '-', '@', '\t', or '\r'
// is prefixed with a single quote so Sheets treats the cell as plain text.
//
// Replaces the old Zapier webhook (hooks.zapier.com/hooks/catch/25092373/4yq1a1f/)
// with a Netlify function that does both jobs the Zap was doing:
//   1. Send the NCNDA via SignWell.
//   2. Append a row to the canonical Google Sheet "NCNDA Send Log".
//
// Required Netlify env vars: see comment block in phase-5 version (unchanged).

import { google } from 'googleapis';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';

// Canonical sheet — DO NOT CHANGE. Downstream automations read from this.
//   Sheet name: "NCNDA Send Log"
//   URL: https://docs.google.com/spreadsheets/d/1CRdgqZp22_zI_ot1A6lvmLWTZzzs3viq0jBfYIsp3F4/edit
// Hardcoded here to prevent drift (the old Zapier integration broke because the
// sheet ID drifted in a Zap edit). See PHASE_1_MANUAL_CHECKLIST.md.
const SHEET_ID    = '1CRdgqZp22_zI_ot1A6lvmLWTZzzs3viq0jBfYIsp3F4';
const SHEET_RANGE = 'A:G';

// AUDIT FIX H-3 — escape strings that Google Sheets would otherwise interpret
// as a formula. Any leading '=', '+', '-', '@', '\t', '\r', or '|' is prefixed
// with a single quote so Sheets treats the cell as a literal string.
function escapeForSheets(s) {
  if (s == null) return '';
  const str = String(s);
  if (/^[=+\-@\t\r|]/.test(str)) return "'" + str;
  return str;
}

function makeSheetsClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth: oAuth2Client });
}

async function appendSheetRow(values) {
  const sheets = makeSheetsClient();
  // AUDIT FIX H-3: escape EVERY value before appending. Defense in depth —
  // even if a future caller forgets to sanitize upstream, the sheet stays safe.
  const safeValues = values.map(escapeForSheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId:    SHEET_ID,
    range:            SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [safeValues] },
  });
}

async function sendViaSignWell({ counterpartyName, counterpartyEmail, triggererEmail }) {
  const apiKey                   = process.env.SIGNWELL_API_KEY;
  const templateId               = process.env.SIGNWELL_TEMPLATE_ID;
  const ownerName                = process.env.SIGNWELL_OWNER_NAME                || 'OneVibeMediaGroup';
  const ownerEmail               = process.env.SIGNWELL_OWNER_EMAIL               || 'carsten@onevibemediagroup.com';
  // These must match the placeholder names set on the template roles in SignWell
  // exactly (case-sensitive). If the template roles are renamed, update these vars.
  const ownerPlaceholder         = process.env.SIGNWELL_OWNER_PLACEHOLDER         || 'carsten gauslow';
  const counterpartyPlaceholder  = process.env.SIGNWELL_COUNTERPARTY_PLACEHOLDER  || 'counterparty legal name & company';

  if (!apiKey || !templateId) {
    return { skipped: true, reason: 'SIGNWELL_API_KEY or SIGNWELL_TEMPLATE_ID not set' };
  }

  const res = await fetch('https://www.signwell.com/api/v1/document_templates/documents/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key':    apiKey,
    },
    body: JSON.stringify({
      test_mode:    false,
      // SignWell's "Create Document from Template" endpoint expects template_id
      // as a single string. The old `template_ids: [{ id }]` form is rejected
      // with `invalid_keys: ["template_ids"]` (400). See developers.signwell.com
      // → Create Document from Template.
      template_id:  templateId,
      name:         `${counterpartyName} X OVMG NCNDA`,
      subject:      `Mutual NCNDA — ${counterpartyName} X OVMG`,
      message:      `Please review and sign the Mutual NCNDA. Triggered by ${triggererEmail}.`,
      // Sequential signing: owner first (signing_order: 1), counterparty
      // second (2). SignWell only emails the counterparty AFTER the owner
      // signs. Fixes the bug where both got the doc simultaneously with no
      // order and nobody signed first.
      // For TRULY auto-sign (no email to owner, signature pre-applied), set
      // an AutoSign rule on the Owner role in your SignWell template.
      with_signing_order: true,
      recipients: [
        { id: 'owner',        placeholder_name: ownerPlaceholder,        name: ownerName,        email: ownerEmail,        signing_order: 1 },
        { id: 'counterparty', placeholder_name: counterpartyPlaceholder, name: counterpartyName, email: counterpartyEmail, signing_order: 2 },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SignWell ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return { skipped: false, envelopeId: data.id, status: data.status };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const counterpartyName  = (body.counterparty_name  || body.counterpartyName  || '').trim();
  const counterpartyEmail = (body.counterparty_email || body.counterpartyEmail || '').trim().toLowerCase();
  const notes             = (body.notes              || '').trim();

  if (!counterpartyName)  return err(400, 'counterparty_name required');
  if (!counterpartyEmail) return err(400, 'counterparty_email required');

  // Triggerer identified from the authenticated user (never trust the body).
  const user = await getUser(event);
  const triggererEmail = user?.email || body.triggerer_email || 'unknown';

  // 1. Send via SignWell (or skip if not configured).
  let envelopeId = '';
  let status     = 'pending';
  let sendError  = null;
  try {
    const result = await sendViaSignWell({ counterpartyName, counterpartyEmail, triggererEmail });
    envelopeId = result.envelopeId || '';
    status     = result.skipped ? 'pending (signwell-skipped)' : (result.status || 'sent');
  } catch (e) {
    console.error('[ncnda-send] SignWell failed:', e.message);
    sendError = e.message;
    status    = 'error';
  }

  // 2. Always try to write to the canonical sheet — this is the part that was
  //    broken when only Zapier was doing it.
  let sheetError = null;
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const noteStr   = notes + (sendError ? `  [SignWell error: ${sendError}]` : '');
    // values passed in plaintext — appendSheetRow escapes each before sending.
    await appendSheetRow([
      timestamp,
      triggererEmail,
      counterpartyName,
      counterpartyEmail,
      envelopeId,
      status,
      noteStr,
    ]);
  } catch (e) {
    console.error('[ncnda-send] Sheets append failed:', e.message);
    sheetError = e.message;
  }

  if (sendError && sheetError) {
    return err(500, `Both failed. SignWell: ${sendError}. Sheets: ${sheetError}`);
  }

  return ok({
    envelopeId,
    status,
    loggedToSheet: !sheetError,
    sheetError,
    signWellError: sendError,
    signWellSkipped: status === 'pending (signwell-skipped)',
  });
};
