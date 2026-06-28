# Google / Gmail Credential Setup — OVMG Dashboard (full redo guide)

This is the complete, from-scratch setup for the dashboard's Google integration
(Gmail send/read, Calendar, Sheets, Drive). Do it once. The `invalid_client`,
`redirect_uri_mismatch`, and `Insufficient Permission` errors are all **Google
Cloud Console + Netlify configuration**, not app code — the code is ready.

**Key fact:** there is **ONE** OAuth client (one Client ID + one Client Secret)
for the whole app. You do **not** create credentials per Gmail. Each person's
Gmail then authorizes that one app and gets its own token (stored automatically).

There are two ways email/calendar can authenticate. You can use either or both:
- **Path A — per-user connected accounts (recommended):** each teammate clicks
  "+ Add account" in the dashboard and connects their work Gmail. Mail sends
  *from their account*, inbox shows *their inbox*.
- **Path B — one shared system account:** a single `GMAIL_REFRESH_TOKEN` in
  Netlify (used as a fallback / for automated sends). Mail sends from one fixed
  address (`GMAIL_SENDER`).

Both paths use the **same** Client ID + Secret from Part 1.

---

## Part 1 — Google Cloud Console (one time)

Console: <https://console.cloud.google.com> — pick the correct project in the top
bar (the GCP project tied to the `onevibemediagroup.com` Workspace), or create a
new project.

### 1.1 Enable the APIs
**APIs & Services → Enabled APIs & services → + Enable APIs and services**, enable:
- **Gmail API**
- **Google Calendar API**
- **Google Sheets API**
- **Google Drive API**

### 1.2 OAuth consent screen
**APIs & Services → OAuth consent screen**
- **User type: Internal** (recommended) — restricts to `@onevibemediagroup.com`
  accounts, no Google verification needed, no test-user list. Choose **External**
  only if you must connect non-Workspace Gmail (e.g. a personal gmail.com); then
  you must **Publish** it (and add test users while in Testing).
- **Scopes → Add or remove scopes**, add all of:
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/gmail.modify`  ← lets the app send + read
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
- **Publishing status: Publish app.** (In "Testing", refresh tokens expire after
  ~7 days, so accounts silently disconnect every week.)

### 1.3 Create the OAuth client (the Client ID + Secret)
**APIs & Services → Credentials → + Create credentials → OAuth client ID**
- **Application type: Web application**
- **Name:** e.g. `OVMG Dashboard`
- **Authorized redirect URIs → + Add URI**, add **both** of these, exactly:
  ```
  https://ovmgdashboard.netlify.app/.netlify/functions/google-accounts-oauth-callback
  https://developers.google.com/oauthplayground
  ```
  - The first is for Path A (the dashboard "Add account" flow).
  - The second is only needed if you generate a Path B system token (Part 3).
  - If the live site ever uses a custom domain, also add that domain's version
    of the first URI.
- Click **Create**, then **copy the Client ID and Client Secret** — you need them
  in Part 2. (If you're fixing `invalid_client`: the values currently in Netlify
  don't match a real client. Either reuse this client's values, or if the old
  secret was lost/rotated, click the client → **Reset secret** and use the new one.)

---

## Part 2 — Netlify environment variables

Netlify → your site → **Site configuration → Environment variables**. Set:

| Variable | Value |
|---|---|
| `GMAIL_CLIENT_ID` | the Client ID from Part 1.3 |
| `GMAIL_CLIENT_SECRET` | the Client Secret from Part 1.3 |
| `GMAIL_SENDER` | default send-from address for the system account, e.g. `nathan@onevibemediagroup.com` |
| `GMAIL_REFRESH_TOKEN` | only for Path B — generated in Part 3 |
| `SUPABASE_URL` | already set (powers per-user account storage for Path A) |
| `SUPABASE_SERVICE_ROLE_KEY` | already set |
| `OVMG_TEAM_CALENDAR_ID` | optional — see Part 5 |

The redirect URI the app sends is built automatically from Netlify's `URL`
(defaults to `https://ovmgdashboard.netlify.app`) — you don't set it. Only set
`PUBLIC_URL` if you use a custom domain (then register that domain's callback URI
in Part 1.3 too).

**After changing env vars, trigger a redeploy** (Deploys → Trigger deploy) so the
functions pick up the new values.

---

## Part 3 — Path B: generate the shared system refresh token (optional)

Only needed if you want a single fallback sender (or for automations). Skip if
everyone uses Path A.

1. Go to the **OAuth 2.0 Playground**: <https://developers.google.com/oauthplayground>
2. Click the **⚙ gear (top right) → check "Use your own OAuth credentials"** →
   paste your **Client ID** and **Client Secret** from Part 1.3.
3. On the left, in **"Input your own scopes"**, paste:
   ```
   https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets
   ```
   Click **Authorize APIs**, sign in as the account you want as the system sender
   (e.g. nathan@onevibemediagroup.com), and approve.
4. Click **Exchange authorization code for tokens**.
5. Copy the **Refresh token** → set it as `GMAIL_REFRESH_TOKEN` in Netlify (Part 2)
   → redeploy.

> If you ever get a fresh token but the old one keeps being used, that's just the
> redeploy not having run yet.

---

## Part 4 — Path A: connect accounts in the dashboard (recommended)

After Parts 1–2 are done and the site is redeployed:

1. In the dashboard, open the **account switcher** (sidebar) or the **Calendar**
   tab and click **"+ Add account."**
2. Google shows the **account chooser** — pick the **work Gmail** you want to
   connect (the dashboard now always shows the chooser, so it won't silently grab
   a personal account). Approve the permissions.
3. Done — that account now powers your Calendar and Email. Repeat for each
   teammate / each account you want available. No per-account credentials.

> Each connected account is stored per-user in Supabase (`user_google_accounts`).
> If you previously connected an account *before* the Calendar/Gmail scopes were
> added, **remove and re-add it** so the new consent includes those scopes
> (otherwise you'll see `Insufficient Permission`).

---

## Part 5 — (optional) shared team calendar

By default events are created on each person's **primary** calendar. To write to
one shared calendar instead, set in Netlify:
```
OVMG_TEAM_CALENDAR_ID = <calendar ID, e.g. abc123@group.calendar.google.com>
```
Find it in Google Calendar → that calendar's **Settings → Integrate calendar →
Calendar ID**.

---

## Part 6 — NCNDA Sender (SignWell + Sheets log)

The **NCNDA Sender** tool (dashboard → Tools → NCNDA Sender, OVMG only) lives on
this **same** dashboard site. Its function `ncnda-send` does two things on each
send: (1) creates + sends the NCNDA via **SignWell**, and (2) appends a row to
the canonical **"NCNDA Send Log"** Google Sheet
(`1CRdgqZp22_zI_ot1A6lvmLWTZzzs3viq0jBfYIsp3F4`).

### 6.1 SignWell env vars

Netlify → this site → **Site configuration → Environment variables**:

| Variable | Required | Value |
|---|---|---|
| `SIGNWELL_API_KEY` | **yes** | SignWell → Settings → **API** → your API key |
| `SIGNWELL_TEMPLATE_ID` | **yes** | The NCNDA template's **ID** (the string in the template's URL, or from `GET /api/v1/document_templates`). **Not** the template's name. |
| `SIGNWELL_OWNER_NAME` | no | Signer-1 (OVMG) name. Defaults to `OneVibeMediaGroup`. |
| `SIGNWELL_OWNER_EMAIL` | no | Signer-1 (OVMG) email — signs **first**. Defaults to `carsten@onevibemediagroup.com`. |

> The code sends `template_id` (a single string). If you ever see
> `SignWell 400 … invalid_keys: ["template_ids"]`, the function is out of date —
> redeploy `master` (fixed 2026-05-31). If you see `Template not found` or
> `invalid key values`, the `SIGNWELL_TEMPLATE_ID` value is wrong.

### 6.2 Google Sheets logging (uses the Path B token)

The sheet append uses the **shared system token** — `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` from Parts 2–3 — so **no extra
Google env vars** are needed beyond those. Two requirements specific to NCNDA:

- `GMAIL_REFRESH_TOKEN` must include the **`…/auth/spreadsheets`** scope
  (it's in the Part 3 scope string). A token minted without it — or under
  different client credentials — makes the log fail with `unauthorized_client`.
- The account you authorized in Part 3 must have **edit access to the "NCNDA Send
  Log" sheet** (share it with that account if not).

### 6.3 Quick test

After setting the vars and **redeploying**: open the NCNDA Sender, send a test to
yourself. Success = green screen + envelope ID **and** a new row appears in the
NCNDA Send Log sheet. If only one half works, the response JSON names which side
failed (`signWellError` vs `sheetError`).

---

## Verify & troubleshoot

After setup, in the dashboard: Calendar should load, the Email inbox should load,
and sending from the HTML/Email tools should work.

| Symptom | Cause → Fix |
|---|---|
| `invalid_client` | `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` in Netlify don't match a real OAuth client. Re-copy them from Part 1.3 (reset the secret if lost) → redeploy. |
| `unauthorized_client` (e.g. NCNDA Sheets logging) | The `GMAIL_REFRESH_TOKEN` (Path B) was generated under **different** client credentials than the `GMAIL_CLIENT_ID`/`SECRET` now in Netlify — or in the Playground **without** "Use your own OAuth credentials," or **without** the `spreadsheets` scope. Re-generate it via **Part 3** (check "Use your own OAuth credentials" with the SAME client, include the `spreadsheets` scope) → set `GMAIL_REFRESH_TOKEN` → redeploy. The system account you authorize must also have access to the target sheet. |
| `invalid_grant` | The refresh token was revoked or expired (consent screen still in **Testing** = ~7-day expiry). **Publish app** (Part 1.2) and re-generate the token (Part 3). |
| `redirect_uri_mismatch` | The callback URI isn't registered exactly. Add `https://ovmgdashboard.netlify.app/.netlify/functions/google-accounts-oauth-callback` under the client's Authorized redirect URIs (Part 1.3). The exact value is also logged by `google-accounts-oauth-start` and returned as `redirectUri`. |
| `Insufficient Permission` (can't create events / send) | Scopes missing on the consent screen, or the account was connected before scopes were added. Add scopes (Part 1.2), then **remove + re-add** the account (Part 4). |
| Accounts disconnect every ~7 days | Consent screen is still in **Testing** — **Publish app** (Part 1.2). |
| "It wants me to log in with my personal Gmail" | That's just Google's account chooser — pick the **work** account. It doesn't affect your dashboard login (that's Clerk). |
| NCNDA: `SignWell 400 … invalid_keys: ["template_ids"]` | Function is out of date — the field is now `template_id` (string). Redeploy `master` (fixed 2026-05-31). See Part 6.1. |
| NCNDA: `SignWell … Template not found` / `invalid key values` | `SIGNWELL_TEMPLATE_ID` is wrong (using the name, an old/deleted ID, or blank). Set it to the template's real ID. Part 6.1. |
| NCNDA: `SIGNWELL_API_KEY or SIGNWELL_TEMPLATE_ID not set` | One of those env vars is missing on this site → add it (Part 6.1) → redeploy. |
| NCNDA: send works but no row in the sheet | Sheets half failed — check `sheetError` in the response. Usually `unauthorized_client` (regenerate token w/ `spreadsheets` scope, Part 3/6.2) or the system account lacks edit access to the sheet. |

The code paths (`google-accounts-oauth-*`, `_google.js`, `_gmail.js`,
`send-email`, `email-*`, `calendar-*`) are all in place and use the connected
account (env fallback) — they just need valid credentials from this guide.
