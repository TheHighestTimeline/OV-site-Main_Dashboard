# Setup Notes — July 2026 Upgrade Wave

Everything below was implemented in code. These are the **manual steps** needed to activate each piece. Work top-to-bottom; the first section is required before deploying.

## 1. REQUIRED before next deploy

### 1.1 Clerk — roles now actually gate access
The `@onevibemediagroup.com = admin` bypass is removed (client + server). Now:

- **Set your admin role**: Clerk Dashboard → Users → (you) → Public metadata → `{ "roles": ["admin"] }`. Do the same for Carsten/any other admin. Until you do, you're covered by the bootstrap allowlist (`tanner@onevibemediagroup.com`, or the `ADMIN_EMAILS` env var).
- **OVMG employees with no roles** now default to `member` (all normal tabs, no admin). Assign real roles from the dashboard's Admin panel.
- **Restrict signups to OVMG emails**: Clerk Dashboard → **Restrictions** → enable **Allowlist** and add `onevibemediagroup.com` as an allowed email domain. (This is a Clerk-side setting; the app additionally holds non-OVMG accounts with no roles at a "pending approval" screen.)

### 1.2 Netlify env vars (new)
| Var | Purpose | Required? |
|---|---|---|
| `ADMIN_EMAILS` | comma-separated bootstrap admins | recommended (defaults to tanner@) |
| `BUG_REPORT_TO` | where bug reports go | defaults to tanner@ |
| `REMINDER_EMAILS` | daily/weekly digest recipients | recommended |
| `GRANOLA_API_TOKEN` | enables the 15-min Granola poller | for §3 |
| `GRANOLA_API_BASE` | override API base if needed | optional |
| `INGEST_SECRET` | secret for the `call-ingest` webhook (Zapier fallback) | for §3 fallback |
| `POLL_SECRET` | lets you trigger scheduled functions manually via `x-poll-secret` header | optional |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` / `TWILIO_WHATSAPP_TO` | WhatsApp reminders | optional — email works without them |

### 1.3 Supabase — run the new schema
Run `supabase-call-reviews-schema.sql` in the Supabase SQL editor (creates `call_reviews` for the Review queue).

### 1.4 Repo cleanup — finish it in git
All business docs (contracts, proposals, spreadsheets, CSV exports) were moved to `_MOVE_TO_DRIVE/` and gitignored. **Upload that folder to the OVMG Shared Drive, then delete it locally.** Run `git add -A` so git records the removals (note: git files themselves were not touched — your local git index reported a version newer than the sandbox's git, so commit from your machine as usual).

### 1.5 Install new dev deps
`npm install` (adds eslint/prettier/vitest). Then `npm test` (smoke tests) and `npm run lint` work.

## 2. Review queue (Granola → approve → CRM)
- **Poller**: `granola-poll` runs every 15 min (netlify.toml schedule). It no-ops until `GRANOLA_API_TOKEN` is set. Heads-up: Granola's API surface has shifted between versions — if the poller logs errors about endpoints, the tolerant readers in `granola-poll.js` are the place to adjust (or just use the webhook below, which is version-proof).
- **Webhook fallback**: point Zapier/Make ("new Granola meeting" trigger) at `POST /.netlify/functions/call-ingest` with header `x-ingest-secret: $INGEST_SECRET` and body `{ externalId, title, callDate, attendees, transcript }`.
- **Audio dumps** now also land in the Review queue automatically after recording.
- The **Review** tab (with pending-count badge) shows every staged call; approve/edit/dismiss per item. Only approved items write to Airtable.

## 3. Things to verify on your iPhone (fixes shipped)
1. Voice recording end-to-end (My Day + Audio Dump + contact voice notes) — the mp4 handling bug is fixed, but confirm on-device.
2. Install the PWA: Safari → Share → Add to Home Screen. Mic permission works from the installed app on iOS 16+.
3. Inputs no longer zoom the page when focused (16px on mobile).
4. Bottom tab bar (My Day / Tasks / Contacts / Kanban) + company pill in the top bar.

## 4. New features cheat-sheet
- **Company scope pill** (top bar, desktop + mobile): filters Contacts, Tasks, Kanban, References globally; persisted per device.
- **Per-company kanban lanes**: open a company's Kanban (or scope the main board to a company) → "⚙ Lanes" to rename/reorder/recolor/add lanes. Each lane maps to a canonical stage so the all-up board stays consistent. Lane assignments live in app_state — no Airtable schema change.
- **Global search**: ⌘K / Ctrl-K anywhere, or the Search pill — contacts, tasks, deals, documents, references. Documents/references open their link directly.
- **Company HQ tab**: first tab of every company. Amplify's HQ Google Doc and the OneVibe HQ docx are pre-linked; link the rest via "Link HQ doc" (admin only). Tip: convert `OneVibe HQ FINAL.docx` to a native Google Doc so the tabbed version embeds live.
- **Bug reports**: sidebar → "Report a bug" — emails you the report with view/device/console context.
- **Daily reminders** (7am ET) + **Friday slippage report** email `REMINDER_EMAILS`; WhatsApp too once Twilio vars are set.
- **My Day → "Who should you reach out to today?"** — AI-ranked outreach list with one-click task creation.
- **Opportunity form** now links a CRM contact (Associated Contact field).

## 5. Deploy checklist
1. `npm install`
2. Clerk: set roles + domain allowlist (§1.1)
3. Netlify: add env vars (§1.2)
4. Supabase: run `supabase-call-reviews-schema.sql`
5. `npm run build` locally to confirm, then push
6. After deploy: send a test bug report, run a test audio dump, check the Review tab
