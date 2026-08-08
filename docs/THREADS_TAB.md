# Threads Tab

Cross-channel relationship command center. Built 2026-08-03 against the
`OVMG_ThreadsTab_FULL_HANDOFF_20260803_FINAL` handoff, on branch
`claude/crm-tasking-threads-ecosystem-4s59w9`.

It exists to answer four questions in under ten seconds each:

1. Who owes me something, and how long have they owed it
2. Who do I owe something, and what
3. Where is each relationship in its lifecycle, and what is the next step
4. What can I delegate right now, with enough context that the assignee can act
   without asking

---

## 1. What Tanner must do before this works

Three things. Nothing below is code, and until they are done the Threads tab
renders an explanation rather than a board (deliberately — a half-provisioned
environment should not 500).

### 1a. Snapshot the base

Duplicate `OV Dashboard` to `OV Dashboard SNAPSHOT 2026-08-03` before any schema
change. Thirty seconds of insurance against a live dashboard.

### 1b. Create the `Participations` table

Description: *"One contact inside one workstream. Carries the relationship
stage. Created 2026-08 for the Threads tab."*

| Field | Type | Options |
|---|---|---|
| Name | singleLineText | primary. App writes "Contact, Workstream" |
| Contact | link | → CRM Contacts `tbl6MKKs3xXrYBPL4` |
| Workstream | link | → Opportunities `tblrYR26yf0xKlpiB` |
| Stage | singleSelect | Initial Outreach, NCNDA Sent, NCNDA Signed, Discovery Call, Contract Negotiation, Deal Finalization, Closed, Stalled, Archived |
| Stage Entered | date | drives days-in-stage |
| Owner | singleLineText | |
| Waiting On | singleSelect | Us, Them, Nobody |
| Next Action | singleLineText | |
| Next Action Date | date | |
| Blocking Item | singleLineText | |
| Entity | singleSelect | mirrors Opportunities `Entity` |
| Status | singleSelect | Active, Inactive |
| Thread Key | singleLineText | Supabase join key |
| Notes | multilineText | |

Only the nine capital stages here: a participation is always counterparty
paperwork.

Then set `AIRTABLE_TB_PARTICIPATIONS` to the new `tbl…` id in Netlify.

### 1c. Add fields to existing tables

**Opportunities** `tblrYR26yf0xKlpiB`
- `Parent Opportunity` — link to Opportunities (self-link). **Empty = Program,
  set = Workstream.** Companies already has `Parent Company` as precedent.
- `Lifecycle` — singleSelect: Capital, Delivery, Client. Optional; when unset it
  is inferred from the existing `Kind` field.
- `Goal` — long text. **Load-bearing:** creating a participation on a workstream
  with no Goal is refused.
- `Target Value` — currency.

**Master Action Board** `tblh8XdwnIxjYkPd9`
- `Focus` — singleSelect: Doing Now, Next Up
- `Focus Order` — number
- `Focus Set At` — date
- `Resolves On` — singleSelect: `access_granted`, `access_requested`,
  `doc_signed`, `doc_sent`, `meeting_held`, `reply_received`, `ncnda_signed`
  (values are the raw signal types, not display labels — a detector matches on
  them literally)
- `Participation` — link to Participations
- `Resolved By Signal` — checkbox
- `Context` — long text
- `Source Thread` — URL
- `Confirmed At` — date
- `Last Modified Time` — **recommended.** Triage's "delegated, unconfirmed"
  bucket and the Accountability view fall back to `createdTime` without it,
  which reads a task assigned and then edited daily as if it never moved.

**CRM Contacts** `tbl6MKKs3xXrYBPL4`
- `Participations` — reverse link (Airtable auto-creates this)
- `Channels Active` — multiSelect: Email, WhatsApp, SMS, Call

Stage fields do **not** go on CRM Contacts. If a prior attempt added them, leave
them and stop writing to them rather than deleting. Additive-only cuts both ways.

### 1d. Apply the Supabase migration

`migrations/0002_coo_threads_schema.sql`. Nine `coo_*` tables, RLS enabled with
no policies (matching the existing service-role model). Idempotent, safe to
re-run.

### 1e. Turn the scheduled jobs on, one at a time

**All four Threads cron schedules ship commented out in `netlify.toml`.** The
tab is fully usable without them: Threads → Queues → "Run a scan now" triggers
each detector by hand, which is how you watch what one actually writes before it
runs unattended.

Enable them in this order, uncommenting one block per deploy:

1. `coo-signals-scan-drive` — writes to Supabase, plus closes tasks it matches
2. `coo-signals-scan-gmail` — writes to Supabase only, proposes nothing else
3. `coo-stalled-scan` — writes to Participations only, no-ops until it exists
4. `coo-ingest-gmail` — **last.** The only Threads job that writes to the live
   Airtable base unattended (one Activity row per thread per day). Set
   `COO_SCAN_USER_ID` before enabling it, or it authenticates as the shared
   `GMAIL_REFRESH_TOKEN` account rather than yours.

### 1f. Assign Clerk roles and env vars

- Roles: `coo` (Tanner, Carsten), `ops` (Ivan, Sofia). Admins pass every gate.
- Env: see `.env.example`. The ones that matter most are
  `AIRTABLE_TB_PARTICIPATIONS`, `COO_SCAN_USER_ID`, `COO_CAPITAL_ENTITIES`,
  `COO_OUR_ADDRESSES`.

---

## 2. Architecture

```
SOURCE   Gmail API   Google Drive   (later: Calendar, WhatsApp, OpenPhone)
            |             |
INGEST   Netlify functions, scheduled. Normalize to one Message shape.
         Resolve sender to an Airtable Contact.
            |
MESSAGES Supabase Postgres, coo_* tables. Full-text search, timeline, signals.
            |
RECORD   Airtable appgZ4EvfGEI4owb7. Contacts, Companies, Opportunities,
         Participations, Master Action Board, Activities, Documents.
            |
UI       Threads tab. Clerk role gated, server-side on every endpoint.
```

**Message bodies never go in Airtable.** Record limits, no real full-text search,
and bulk writes into a base the live dashboard reads is the highest-risk thing
available. Airtable is the system of record for people, companies, deals,
documents and tasks. Messages live in Supabase and join on Contact ID.

### The channel model

```
PROGRAM                    Bennettsville
  └── WORKSTREAM           Bridge Loan Funding
        └── PARTICIPATION  Greg Shore    (stage: NCNDA Signed)
        └── PARTICIPATION  Adam Mayer    (stage: NCNDA Sent)
```

**Stage lives on the participation, not the contact.** Greg Shore can be NCNDA
Signed on the Bennettsville bridge loan and Initial Outreach on a future OVMG
raise at the same moment. Both are true, and a single field on his contact record
can only hold one. The junction is the only correct shape, and it is what lets
one person appear in two workstreams without duplicating the person.

**Subject routing:** a thread belongs to exactly one participation, mirroring the
locked CRM rule that an Activity links to exactly one company. When a contact
sits in several workstreams the default is the most recently active, with manual
reassign in the UI. A thread is never fanned across workstreams.

**Two groupings, deliberately different.** People groups by person (everything
Greg said). Opportunities, Triage and Pipeline group by participation (each row
needs a separate action). `PeopleView.jsx` and `OpportunitiesView.jsx` share one
`DetailPane.jsx` but never share a grouping.

### Lifecycles

`src/lib/stages.js` is the single source of truth. `netlify/functions/_stages.js`
re-exports it so the server and the UI can never disagree about what a stage
means (esbuild inlines the cross-tree import; verified at build time).

- **Capital** — counterparty paperwork. All Participations, and `Kind = Deal`.
- **Delivery** — internal build work. `Kind = Workstream`.
- **Client** — OVM, Amplify accounts.
- **Universal** — `Stalled` (auto-entered after 21 days inactive) and `Archived`
  (terminal, requires a note). No Won/Lost split.

Lifecycle is inferred, not configured: `inferLifecycle()` reads the existing
`Kind` field and the entity.

---

## 3. The evidence layer

**The problem it solves:** the board goes stale not because work stops but
because *completion is never detected*. The NCNDA was signed and filed, Drive
access was granted, the document was sent. Nobody ticked the box.

**The rule: signals propose, humans dispose.**

| Detector | Source | Signal | Kind | Status |
|---|---|---|---|---|
| Data room permission list | Drive `permissions.list` | `access_granted` | **deterministic** | built |
| Access request mail | Gmail "requested access" | `access_requested` | inferred | built |
| eSignature completion | Gmail (Google / DocuSign / Dropbox Sign) | `doc_signed` | inferred | built |
| Outbound with attachment | Gmail sent mail | `doc_sent` | inferred | built |
| Signed doc lands in Drive | Drive `files.list` | `doc_signed` | inferred | **not built** |
| Meeting occurred | Calendar past event | `meeting_held` | deterministic | **not built** |

A **deterministic** signal auto-applies (`status = 'auto_applied'`) and stays
visible so it can be reversed. An **inferred** signal creates a pending row in
the Resolved? queue with evidence linked and changes nothing until confirmed. On
the timeline, inferred events render hollow and tagged UNCONFIRMED.

Do not blur this line. Silently closing an obligation that was not met is far
worse than a stale board, because a stale board is at least visibly wrong.

**Every signal is scoped to a participation.** The Drive scanner resolves the
folder's owning workstream from the Opportunities `Data Room` field, and if the
matched contact has no participation in *that* workstream the signal is left
unattached rather than attached to a different one. A grant on the bridge loan
data room must never close a task on another raise.

**Evidence gates on stages.** `NCNDA Signed` requires a Documents record with a
Signed Date. This is what catches "they told me it was signed" when nothing was
executed. The refusal is a 409 with `code: EVIDENCE_REQUIRED`, surfaced in the UI
as a decision with an explicit override that demands a written reason and is
recorded as an override in `coo_stage_events`.

**`dedupe_key` on every write.** Polling replays are guaranteed and duplicate
timeline entries destroy trust in the view faster than anything else.

---

## 4. What was built

### Netlify functions

| File | Does |
|---|---|
| `_airtable.js` | **extended.** Added `TB` / `FLD` id maps, a 5-req/sec limiter every call now passes through, `listRecords` / `createRecords` / `updateRecords` (batched at 10, always PATCH), `esc`, `dateTime`, `getSelectOptions`. All previous exports untouched. |
| `_participations.js` | Read/write/route the Participations junction. Degrades to empty, never throws, when unconfigured. |
| `_cooAccess.js` | `requireCoo`, `requireCooOrOps`, and `entityFilterFor` — a per-request row filter so `ops` never receives capital-entity rows. |
| `_stages.js` | Server-side re-export of `src/lib/stages.js`. |
| `_drive.js` | Drive client, `permissions.list`, `files.list`. Installed as supplied. |
| `coo-threads-data.js` | The single read backing the tab. Four list reads joined in memory instead of an N+1 through the rate limiter. |
| `coo-participation-upsert.js` | Create/update. Enforces the sprawl rule and refuses duplicate pairings. |
| `coo-stage-advance.js` | The stage machine and its evidence gates. Writes stage history, creates the next-action task, wires `Resolves On`. |
| `coo-triage.js` | Seven buckets. |
| `coo-events-list.js`, `coo-note-create.js` | Timeline read and write. Installed as supplied. |
| `coo-ingest-gmail.js` | Threads/messages/events, one Activity per thread per day, identity resolution. |
| `coo-identities.js` | Unmatched queue plus manual merge, with history backfill on link. |
| `coo-signals.js` | The Resolved? queue: list, confirm, reject, scoped task closure. |
| `coo-signals-scan-drive.js` | The deterministic detector. Reads data rooms from Opportunities. |
| `coo-signals-scan-gmail.js` | Three inferred detectors. |
| `coo-stalled-scan.js` | 21-day stall, and revival back to the prior stage. |
| `coo-brief-generate.js` | The brief, with `source_message_ids` provenance. |
| `coo-delegate.js` | Assign with the relationship context composed into `Context`. |
| `coo-accountability.js` | Delegation by assignee, and the referral tree. |
| `coo-voice-apply.js` | Applies confirmed voice actions. Inbox lane for incomplete tasks. |
| `tasks-focus.js` | The Today list and its cap of five. |

### Frontend

- `src/views/Threads.jsx` — the tab, six views behind a switcher.
- `src/views/threads/` — `OpportunitiesView`, `PeopleView`, `TriageView`,
  `PipelineView`, `AccountabilityView`, `QueuesView`, `DetailPane`,
  `VoiceCapture`, `shared.jsx`.
- `src/components/Timeline.jsx` — the dotted timeline plus the note composer.
- `src/components/TodayCard.jsx` — on Overview.
- `src/lib/stages.js` — the stage machine.
- Nav item, route, `g h` shortcut, `threads` in `TAB_ACCESS`, `coo` / `ops` roles.

### Migration

- `migrations/0002_coo_threads_schema.sql`

---

## 5. Assumptions made

Every one of these is a judgment call, not something the handoff specified.

1. **The handoff's `_airtable.js` was merged, not installed.** A working
   `_airtable.js` already existed with a different API (name-and-map oriented,
   `AIRTABLE_TOKEN`, no limiter) and roughly forty functions import it.
   Overwriting it would have broken every one. The supplied surface (`TB`, `FLD`,
   `listRecords`, `updateRecords`, `esc`, `dateTime`) was added alongside, and
   the limiter now wraps *both* APIs. `AIRTABLE_API_KEY` is accepted as an alias
   for `AIRTABLE_TOKEN`.
2. **Migrations live in `migrations/`, not `db/migrations/`.** The repo already
   has `migrations/0001_full_schema.sql`. The handoff's path would have created a
   second convention.
3. **Styling reads `constants.js`, not `_shared.jsx`.** The handoff named
   `_shared.jsx` (`T`, `SERIF`, `btn`), but that file is scoped to the Social
   sub-components; every *view* in this app imports `C`, `SERIF`, `SANS`, `MONO`
   from `constants.js`. New components follow the views. This also means the tab
   follows the dark-mode toggle, which `_shared.jsx` tokens do not.
4. **`useVoice` has a different shape than the supplied `Timeline.jsx` assumed.**
   The real hook returns `{ phase, start, stop, audioBlob, audioMime, error,
   reset }`, not `{ isRecording, transcript, … }`. Timeline was rewritten around
   the real hook plus `transcribeAudio` from `api.js`.
5. **The Threads nav item is gated on the `coo`/`ops` roles explicitly, not on
   `canAccess`.** `canAccess` grants any `@onevibemediagroup.com` address every
   tab, but `requireRole` on the server does not. Using `canAccess` would have
   shown the tab to people who then get a 403 from every request it makes.
6. **A seventh Triage bucket, "Evidence missing," was added.** The handoff lists
   six, but the stated acceptance test (the Zurlia case: a counterparty claiming
   an NCNDA was signed when no executed document exists) requires that
   contradiction to surface *without anyone looking for it*. None of the six
   buckets catch it. The Monday SOP already calls for exactly this audit by hand;
   the bucket makes it automatic.
7. **`coo_id_map` was not created.** The handoff specifies it for the Notion to
   Airtable crosswalk, but Notion is already fully retired in this tree (see §6).
   An empty table for a completed migration is dead weight.
8. **Pipeline does not reuse the Kanban components.** `AmplifyKanban` /
   `DatacenterKanban` / `kanban-cards-*` are bound to the Supabase `kanban_cards`
   schema with its own lanes and positions. Participations live in Airtable and
   carry a stage validated by the stage machine. Bridging them would mean either
   mirroring every participation into `kanban_cards` (two sources of truth for
   one stage) or rewriting the card components' data layer. Neither is additive.
   Columns come from `stagesFor('capital')`; moving a card calls
   `coo-stage-advance`, so the evidence gate still applies.
9. **Card movement is a menu, not drag-and-drop.** Drag would have required the
   forked data layer above. The stage machine is the point, not the gesture.
10. **`Resolves On` option values are raw signal types** (`access_granted`, not
    "Access granted"). Detectors match them literally.
11. **"Completed this week" uses last-modified as a proxy** for a completion
    date, which Airtable does not provide. Labelled as such in the UI.
12. **`COO_CAPITAL_ENTITIES` defaults are guesses** (`ovmg capital`, `capital`,
    `onevibe capital`, `ovmg raise`). The real Entity option names were not in
    the handoff. **Set this explicitly before relying on the `ops` restriction.**
    Rows with a blank entity are treated as not-capital and are visible to `ops`.
13. **Gmail ingest uses a bounded recent window, not a `historyId` cursor.**
    First run backfills `COO_GMAIL_BACKFILL_DAYS` (default 30), subsequent runs
    two days, capped at `COO_GMAIL_MAX_THREADS` per run. A true `historyId`
    cursor is the better long-term shape; a cold start on it would have spent an
    hour and a rate limit backfilling years of mail.
14. **The brief writes into CRM Contacts `Current Summary`.** That field is
    already described in the base as intended to be AI-refreshed from notes and
    transcripts, so this keeps one summary rather than building a second.
15. **`voice-parse` uses `claude-sonnet-5`,** the model already configured in
    `_voiceParse.js`. The handoff said `claude-sonnet-4-6`; the code won.

---

## 6. Conflicts found between the handoff and the code

The handoff said the code wins where they disagree. These are the disagreements.

| Handoff says | Reality | Resolution |
|---|---|---|
| WP0: the tree is a flat dump needing reorganization | The local tree is already `src/` + `netlify/functions/` + `migrations/`, no duplicates, no mismatched filenames | **No reorg performed.** The flat dump was a bad commit on the GitHub branch only. |
| WP1: retire Notion, ~128 files import `_notion.js`, ~40 use the client | **Notion is already fully retired.** `_notion.js` does not exist; `_http.js` already exists with a better CORS implementation than the supplied version (an explicit origin allowlist rather than `*`). `grep -r "_notion" netlify/functions` returns nothing. | **WP1 was already done.** No migration performed. The remaining "notion" strings are a `DB` constant block in `constants.js`, a `notionUrl()` helper, and comments. Harmless but dead — see §8. |
| `requireRole` needs adding to `_auth.js` | It already exists, with the exact signature specified | Reused as-is. |
| Repo is public; sensitive business documents are world-readable | `.gitignore` already excludes `*.docx *.xlsx *.pdf *.csv *.zip`, and `git ls-files` returns **zero** tracked files with those extensions | **Nothing to flag.** See §7. |
| Supplied `_http.js` should be installed | The existing one is strictly better (origin allowlist vs `*`) | **Not installed.** Existing kept. |
| Supplied `_airtable.js` should be installed | Would break ~40 existing callers | **Merged.** See assumption 1. |

---

## 7. Sensitive files (WP0)

The handoff listed ~15 business documents expected to be world-readable in a
public repo. **None of them are tracked.** Verified:

```
git ls-files | grep -iE '\.(xlsx|docx|pdf|csv|zip)$'   → empty
git ls-files | grep -E '^\.env'                        → empty
```

A text-source scan for `sk-ant-`, `sk-proj-`, `ghp_`, `AIzaSy` across all
`.js/.jsx/.md/.toml/.json` came back clean. `.env` and `.env.local` are
gitignored.

The `.gitignore` comment records that these were moved to `_MOVE_TO_DRIVE/` in a
July 2026 audit. **Deleting from HEAD does not remove them from history** — if
they were ever committed, making the repo private or rewriting history is still
Tanner's call. That is the one item here that code cannot settle.

Nine `.md` files remain tracked at the repo root, including
`CRM_Cleanup_Review.md` and `NCNDA-Sender-SOP.md`. They are process docs, not
counterparty data, but they do describe internal process on a public repo.
Flagging, not acting.

---

## 8. Not built, and why

Everything here is a deliberate stop, not an oversight.

1. **Signed-doc-in-Drive detector.** The `files.list` half of `_drive.js` is
   installed and ready. The matching heuristic (a filename containing a
   counterparty name and "executed") needs real filenames from the actual data
   rooms to tune, and a badly tuned inferred detector floods the Resolved? queue
   until people stop reading it.
2. **Calendar meeting-held detector.** Straightforward (`calendar-list-events.js`
   exists), but it needs the attendee-to-contact matching rules settled first.
3. **WhatsApp and SMS.** Explicitly deferred by the handoff. When SMS lands, the
   interim capture is forwarding to Gmail with subject `SMS: <name>`, which flows
   through the existing ingest.
4. **Reply-from-inside-the-app.** Draft-and-hand-off only: the detail pane opens
   a prepopulated Gmail compose. Templated outbound to capital sources starts to
   look like solicitation conduct and a "non-binding" label does not govern that
   classification. Keeping a human on every send is the safe default until
   counsel says otherwise.
5. **Program-level digest pane.** Program roll-ups are computed and shown on the
   rail; a dedicated program detail pane is not built. Workstream is the level
   where the work actually is.
6. **`coo_workstream_digests` caching.** The table exists in the migration but
   digests are computed live in `coo-threads-data.js`. At current volume that is
   cheaper than maintaining a cache. Wire the table if the tab gets slow.
7. **The `Documents` write-back from a confirmed `doc_signed` signal.**
   Confirming the signal closes the task, but a human still files the Documents
   record with its Signed Date. Auto-creating a document record from an email
   subject line would fabricate the exact evidence the gate is checking for.

---

## 9. Verification status

| Check | Status |
|---|---|
| `npm run build` passes | ✅ |
| `npx eslint src netlify/functions` — zero errors in new files | ✅ (20 errors remain, all pre-existing) |
| Existing tabs unaffected | ✅ additive only; the one edit to a shared file is `api.js`'s `req()` attaching `status`/`code`/`body` to thrown errors, which is backwards compatible |
| Non-COO user gets 403 from `coo-*` endpoints | ✅ by construction (`requireRole`), **not verified by live call** |
| `ops` cannot see capital-entity threads | ✅ by construction (`entityFilterFor` on every list), **needs `COO_CAPITAL_ENTITIES` set to be meaningful** |
| No secrets in any commit | ✅ |
| Migration idempotent | ✅ `create table if not exists` throughout |
| Every AI call logs through `logUsage` | ✅ `coo-brief-generate` logs under surface `coo-brief`; voice goes through the existing `_voiceParse` path |
| Airtable traffic through the limiter | ✅ every call routes through `airtableRequest` |
| Deterministic auto-applies, inferred only proposes | ✅ |
| Re-running a scan creates zero duplicates | ✅ by `dedupe_key`, **not verified against a live base** |
| One contact in two workstreams renders two participations | ✅ by construction |
| People sorts produce the documented ordering, terminal last | ✅ |
| Today caps at five, swap prompt on a sixth | ✅ 409 `FOCUS_FULL` |
| Work on a branch, not `main` | ✅ |

**Nothing has been run against the live Airtable base or Supabase.** No
credentials were available in this environment. Every acceptance test in the
handoff that requires live data (grant Drive access and watch a task close; the
Zurlia contradiction appearing on Triage) is **unverified** and needs a pass once
§1 is done.

---

## 10. Exact next step for whoever picks this up

0. **The cron schedules are off.** That is deliberate, not an oversight — see
   §1e. Use Queues → "Run a scan now" until you have seen each job's output.
1. Do §1 in order: snapshot, create Participations, add the fields, run the
   migration, set env vars and roles.
2. Open Threads. It should render the "not connected yet" panel until
   `AIRTABLE_TB_PARTICIPATIONS` is set, then an empty board.
3. Create one workstream: an Opportunity with `Parent Opportunity` set and a
   `Goal` filled in. Add one participation to it.
4. Queues → "Gmail ingest". Expect unmatched identities. Clear a few, and check
   that the person's timeline fills in (the backfill is the thing to verify).
5. Queues → "Drive permissions". **Expect it to look like it did nothing** —
   the first run per folder seeds a baseline by design. Run it again after
   granting a test account access; within one cycle a task with
   `Resolves On = access_granted` on that participation should auto-complete and
   a timeline entry should appear. **This is the single most valuable thing to
   verify**, because it is the one detector allowed to act on its own.
6. Try to move a participation to `NCNDA Signed` with no signed Documents record.
   It must refuse with the evidence message. That refusal working is the whole
   reason the layer exists.
7. Set `COO_CAPITAL_ENTITIES` to the real entity names, then log in as an `ops`
   user and confirm those threads are absent — from a direct API call, not just
   the UI.
8. Then build the two remaining detectors (§8.1, §8.2) with real filenames in
   hand.

---

## 14. Terminal task statuses (added 2026-08-04)

Master Action Board's `Status` field has eleven options, not the eight in
`src/constants.js`. The drift matters because the extra ones include `Archive`,
and **`Archive` is how the board is actually cleared**: at the time of writing it
is 138 of 200 records, and there is not a single `Done` record in the table.

The code originally treated only `Done` and `Canceled` as finished, so 69 percent
of the board counted as live work in Triage, the Today card, participation
open-task counts, Accountability, and the daily reminder email.

`TERMINAL_TASK_STATUSES` in `src/lib/stages.js` is now the single list:

```
Done · Complete · Canceled · Archive · Archived
```

Use `isTerminalTaskStatus(status)` rather than comparing strings. It is
case-insensitive and trims. Every call site routes through it:
`coo-triage`, `coo-threads-data`, `coo-signals`, `coo-signals-scan-drive`
(including its filterByFormula), `coo-voice-apply`, `coo-accountability`,
`tasks-focus`, `reminders-daily`, plus `Overview.jsx`, `ContactProfile.jsx` and
`MyDay.jsx` on the client.

**If someone adds a twelfth status option, classify it in that one list.** The
whole reason this bug existed is that the answer to "is this task finished" was
written out longhand in eleven different places and only two of them agreed.


---

## 15. Supabase migrations: which have actually been run

**Nothing tracks this.** The schema is spread across a dozen `.sql` files at the
repo root plus `migrations/`, and there is no applied-migrations table, so the
only way anyone discovers an unrun migration is by hitting a PostgREST error:

```
Could not find the table 'public.call_reviews' in the schema cache
```

`explainSupabaseError()` in `_supabase.js` now translates that into the name of
the file to run, and every Supabase-backed endpoint routes its errors through it.

**Known unrun as of 2026-08-04:**

| File | Creates | Symptom while unrun |
|---|---|---|
| `supabase-call-reviews-schema.sql` | `call_reviews` | Review tab errors on load. `granola-poll` has been failing every 15 minutes since it was scheduled. |
| `migrations/0002_coo_threads_schema.sql` | the nine `coo_*` tables | Threads timeline, notes, signals, briefs and both queues all error. The Opportunities and People views still render, since they read Airtable. |

**Do NOT run `migrations/0001_full_schema.sql` to "catch up".** Despite its
header claiming it is safe to re-run, it opens with `DROP TABLE ... CASCADE` on
44 tables. It is a from-scratch baseline, not an idempotent migration. Running it
against the live database destroys everything in those tables.

Both files listed above are `create table if not exists` throughout and are
genuinely safe to run and re-run.

---

## 16. Why the tab was empty after the env var was set (2026-08-04)

`AIRTABLE_TB_PARTICIPATIONS` was set correctly and the Participations table was
fully provisioned. The tab was still empty, for two reasons that had nothing to
do with the environment.

### 16a. Every Opportunity was a program, so nothing was selectable

The rail is built from `Parent Opportunity`: empty = Program, set = Workstream.
All 40 Opportunities in the base had it empty. So the rail rendered 40 programs,
each of which expanded to *"No workstreams yet"* — no digest, no cards, nothing
to click, and nowhere a participation could go.

`coo-threads-data.js` now demotes a childless program to a workstream:

```js
const hasChildren = new Set(opps.map(o => o.parentId).filter(Boolean));
o.isProgram = o.isProgram && hasChildren.has(o.id);
```

A top-level opportunity with nothing nested under it is not an umbrella over
anything, it *is* the work, so it carries participations directly. Nesting still
works exactly as before the moment anything sets `Parent Opportunity` — that
record becomes a program again and its children appear under it. This is what
makes a flat base usable without a migration.

The rail also stops labelling everything "Unparented" when there are no programs
at all; with a flat base the header reads "Workstreams".

### 16b. There was no way to create a participation

`coo-participation-upsert.js` shipped, and `upsertParticipation()` was bound in
`src/api.js`, but nothing in the UI ever called it. A participation is the only
record that carries a relationship stage, so with none in the base every view in
the tab is an empty state by construction. It looked like a broken deploy.

`src/views/threads/AddParticipant.jsx` is the missing form. It is reachable from
two places in the Opportunities view: the workstream digest header, and the
"No participants yet" empty state.

### 16c. The Goal gate is now satisfiable without leaving the app

The sprawl rule stands — the server still refuses a participation on a workstream
with no Goal. But no Opportunity in the base had a Goal, so the rule was
unsatisfiable from the UI and every attempt would have been refused.

The create path now accepts an optional `goal` alongside the first participation
and writes it to the workstream in the same request. The form asks for it only
when the workstream has none, and marks it required. `opportunities-update.js`
also accepts `goal` and `parentId` now, so nesting and goals can be set from the
app rather than only in Airtable.

### 16d. Empty string on a singleSelect

`entity` fell back to `''` when a workstream had no Entity. Airtable does not
read `''` as blank on a singleSelect — it reads it as a request to create a new
option named `""` and fails the entire write. `createParticipation()` now strips
empty strings from `Stage`, `Waiting On`, `Entity` and `Status`, and the upsert
sends `null` rather than `''`.

### What still has to happen by hand

Nothing, to get the first card on the board. Open Threads → Opportunities, pick
any workstream in the rail, click **Add participant**, give the workstream a goal
and pick the person. The Supabase-backed surfaces (timeline, notes, briefs,
queues) stay dark until `migrations/0002_coo_threads_schema.sql` is run — see
section 15 — but the board, stages, triage and delegation all work off Airtable
alone.

---

## 17. People shows every contact, not only tracked ones (2026-08-04)

The People view was derived purely from participations. With none in the base it
rendered *"No people yet"* over a CRM holding 114 of them, which reads as a
broken tab rather than an empty one — and offered no path from a contact to a
tracked relationship.

**Checked first whether the pairing could be seeded automatically. It cannot.**
The contact↔opportunity graph does not exist anywhere in the base:

| Source | Contact + Opportunity pairs |
|---|---|
| `CRM Contacts.Opportunities` | 0 of 114 |
| `Opportunities.Associated Contact` | 0 of 40 |
| `Documents` (Contact + Deal/Opportunity) | 0 of 51 |
| `Master Action Board` (Contact + Opportunity) | 14, all internal staff |

The 14 task pairings are Tanner South and Carsten Gauslow against OVMG's own
deals. They are owners, not counterparties, and seeding participations from them
would assert that OVMG staff are parties to OVMG's own raises. No backfill was
written.

So People now folds in every CRM contact. A person with participations renders as
before — stage, urgency, workstream chips. A person without renders as a dashed
roster row with no stage and no urgency dot, because they genuinely have neither,
plus an **Add to workstream** button. Untracked rows sort below everything
including Closed and Archived: someone with no participation has no state to be
behind on and must never displace someone who does.

A scope filter (`Everyone` / `In a workstream` / `Not tracked`) with live counts
keeps the roster from drowning the working set once the tracked list grows.

`AddParticipant` now serves both directions. From Opportunities the workstream is
fixed and you pick the person; from People the person is fixed and you pick the
workstream. Whichever side is fixed renders as a header instead of a picker.

---

## 18. Suggested links: backfilling participations from the CRM (2026-08-04)

Section 17 concluded the contact↔opportunity graph could not be seeded. That was
right about the *link fields* and wrong about the base as a whole. The signal is
in the **names**: a contact's counterparty company is "BrightSunSolr" and the
deal is called "BrightSunSolr JV / Blaze Merger". `coo-participation-suggest.js`
matches on that.

### Sources checked and rejected

| Source | Why rejected |
|---|---|
| `Opportunities.Companies` | Records which OneVibe entity OWNS the deal, not the counterparty. 10 of 11 point at OneVibeMediaGroup. Joining through it pairs all 13 internal staff with all 8 OVMG deals — ~104 records asserting your own team is on the other side of your own raises. |
| `Master Action Board` Contact + Opportunity | All 14 pairs are Tanner South and Carsten Gauslow against OVMG deals. Owners, not counterparties. |
| `CRM Contacts.Opportunities` | Empty on all 114. |
| `Documents` Contact + Deal | Empty on all 51. |

### The rule that is used

A contact's **external** company name against an opportunity name, two ways:

1. The whole normalised company name appears in the deal name — catches `808 Amp`
   in "808 Amp JV" and `Pro Performance` in "Pro Performance - Website", where no
   single token is distinctive enough to trust on its own.
2. A token of four or more characters that is not in the `NOISE` list appears —
   catches `genesis` in "Genesis 'Box' Program".

`NOISE` holds both corporate filler (`llc`, `group`, `capital`, `solutions`) and
ordinary English that shows up in company names (`family`, `office`, `world`,
`energy`). That second half is load-bearing: without `family`, "Miho Family
Offices" matches "Friends & Family Tier" — a plausible-looking link between two
unrelated things, which is the exact failure this feature must not produce.

Internal companies are excluded via `Type = Internal`, a non-empty `Entity Code`,
or a name starting `OneVibe`/`OVMG` (two legacy records carry neither flag).

### Nothing writes without a tick

GET returns proposals and writes nothing. POST writes only the rows the user
ticked, grouped by workstream so the required Goal is asked for once per group
rather than once per person. Every row shows its match reason on screen — a
proposal you cannot check is a write with extra steps.

Against the base as of 2026-08-04 this produces **13 proposals across 9
workstreams**, all correct on inspection: five BrightSunSolr people onto the JV,
Mark Bedore onto four Everything Rave workstreams, plus Genesis, 808 Amp,
Sustopia and Pro Performance. The button is in the Threads header and hides
itself once 25 participations exist, since it is an onboarding tool.

---

## 19. The rail groups by entity (2026-08-04)

Forty opportunities in one flat list is a dump you scroll, not a rail you
navigate. The program level cannot carry the grouping because `Parent
Opportunity` is empty across the whole base, but `Entity` is set on 39 of 40 and
maps to how the business is actually divided, so that is the axis the rail uses.

The tree is **Entity → Program → Workstream**, and it collapses to Entity →
Workstream while nothing is parented — which is the state the base is in. Setting
`Parent Opportunity` on anything makes the middle level appear for that entity
without any other change.

Also in the rail:
- A filter box, shown once there are more than eight rows. Filtering force-opens
  every section, since making the user re-open collapsed groups to see their own
  search hits defeats the search.
- Deals sort above internal workstreams inside each entity. A counterparty deal
  is what you came here to work; an internal build should not sit above it.
- A filled dot marks a Deal, a hollow one an internal Workstream, read straight
  off the existing `Kind` field.
- Entities sort by live participant count, then alphabetically. The no-entity
  bucket always sinks last — it is the one that needs cleaning up.

---

## 20. Epic → Story → Task (2026-08-04)

The model, in Tanner's words: *"there's a main opportunity then sub opportunities
within that... each one of those people would be a subopportunity."*

| Level | Airtable | Example |
|---|---|---|
| **Epic** | Opportunity, `Parent Opportunity` empty | OVMG X Genesis — Bennettsville $20M Bridge Loan |
| **Story** | Opportunity, `Parent Opportunity` set | OVMG X Loan Solutions — Adam Shore |
| **Task** | Master Action Board, linked to either | Send the redlined term sheet |

A **story is one thread**, not one person. A two-person email chain is still one
thread, so a story links a LIST of contacts. Splitting it per person would mean
tracking the same conversation in two places and resolving it in neither. The
People view is where the by-person grouping lives; the two are deliberately
different and must not be unified.

### Two new fields on Opportunities

`Lane` — the kanban column. **Future Plans, Submitted, In Work, Waiting On,
Closing, Done, Archive.** It exists because the legacy `Stage` select carries 19
historical options and the Airtable API cannot edit an existing select's choices.
The old board aliased those nineteen into six columns, which always lied about
where a card really sat. All 41 records were backfilled on 2026-08-04
(Exploring/Lead → Future Plans, Structuring/Proposal → Submitted,
Active/In build/Negotiation → In Work, Delivered/Closed Won → Done,
Closed Lost → Archive). `Stage` is kept for history and is still editable on the
card, but it no longer decides the column.

`Paperwork Stage` — the NCNDA tag on a story, on the Capital ladder. Separate
from Lane because "In Work" and "NCNDA Signed" are different facts and collapsing
them loses one of them.

Dragging a card writes `Lane` only. It does **not** rewrite `Stage`: moving
something to "In Work" must not silently flatten a record that says "Due
diligence" into something less specific.

### The three panes

Rail = epics grouped by entity. Centre = that epic's stories, sorted by lane then
by overdue count, with Done/Archive folded behind a toggle. Right = the story
opened: lane and paperwork as save-on-change dropdowns, who is on the thread,
open tasks with due dates, and the timeline.

### Dropdown ordering

Contact and workstream pickers sort A–Z. Lane and Paperwork Stage do **not** —
they are sequences, and sorting them alphabetically would put Archive first and
Waiting On last.

### Still open

- Participations and stories both express "who is on this thread". Participations
  carry the per-person paperwork stage and the evidence gate; a story carries the
  thread-level tag. They coexist: the People view now attaches people to stories
  rather than to epics. Collapsing the two is a later decision, not a silent one.
- Triage, Pipeline and Accountability still read participations, so they are
  unaffected by this change.

---

## 21. What a participation is, and why it stays (2026-08-04)

Tanner, reasonably: *"I just can't really remember what the participation portion
of this is for."*

**A participation is not the event log.** The log is `coo_events` in Supabase and
it keys off a person, a deal, OR a sub-opportunity — the story timeline uses the
sub-opportunity id and never touches a participation.

**A participation is one person's paperwork inside one thread.** Stage, evidence
gate, days-in-stage, stage-change history.

It predates sub-opportunities and was the original answer to "Greg is NCNDA
Signed here and Initial Outreach there". Sub-opportunities now answer that too,
which is why the two looked redundant. They are not quite: a story tracks the
thread, a participation tracks each person on it. **Two people on one email chain
sign weeks apart**, and that is the case the per-person row exists for.

Decision (Tanner, 2026-08-04): **keep both, make the lower layer invisible.**

- `coo-story-save.js` is now the only write path for a sub-opportunity. Saving one
  reconciles its paperwork rows: a contact added to the thread gets a row opened
  at the thread's current stage (so adding a second person to a thread already at
  NCNDA Sent does not reset them to the beginning); a contact removed has their
  row marked **Inactive, never deleted** — the stage history and evidence would go
  with it, and taking someone off a thread is routinely a correction.
- The story detail pane lists each person with their own stage dropdown. Changing
  it routes through `coo-stage-advance`, so the NCNDA evidence gate and the stage
  history still apply per person.
- Nobody edits a participation directly. There is no UI for it and there should
  not be one.

The thread-level `Paperwork Stage` on the story stays as the headline tag; the
per-person rows underneath are the truth. Triage, Pipeline, Accountability and
the brief continue to read participations unchanged.

### Rules that survived this

- A story with no Goal still gets no paperwork rows. The save succeeds and says
  why, rather than half-failing.
- `entity` is written as `null`, never `''` — Airtable reads an empty string on a
  singleSelect as a request to create an option named `""` and rejects the write.

---

## 22. Opportunity popup: hierarchy, links, tasks, cost (2026-08-04)

### Level is derived, never stored

The Level dropdown reads Epic when `Parent Opportunity` is empty and Story when
it is set. Switching it does not write a flag — it sets or clears the link. That
is deliberate: a stored level plus a link is two facts that can disagree, and
then neither is trustworthy.

Consequences that fall out of the same rule:
- Picking **Story** holds the choice until you name the parent, rather than
  writing a half-state. The warning says so.
- Picking **Epic** clears the parent. Its own children are untouched.
- **Linking an existing opportunity as a child writes on the child**, because the
  child is the one gaining a parent — which is exactly what turns it from an epic
  into a story. Unlinking promotes it back.
- A story whose parent is missing still renders at the top level. Nothing is ever
  hidden by a broken link.

Parent is single-select (one deal owns a thread); children are added one at a
time from a dropdown listing every other opportunity, annotated with where it
currently sits so a re-parent is a visible act rather than a silent steal.

### Contacts are multi-select

`Associated Contact` was always a `multipleRecordLinks` field; the UI just hid
the picker once one contact was attached. It now stays visible and filters out
whoever is already linked. Airtable's `prefersSingleRecordLink` flag on that
field only affects Airtable's own UI and cannot be changed through the API.

### Links

`Data Room` and `Contracts URL` are real url fields — they are asked for on every
deal. Everything else is a named pair in `Extra Links`, stored as a JSON array
because Airtable has no repeating-group field and a column per document would not
scale. A bare `drive.google.com/…` is normalised to `https://` first, or the
browser treats it as a relative path. Malformed JSON on the record degrades to
"no extra links" rather than taking out `opportunities-list`.

### Tasks are fully editable in place

Name, status, priority, due date, and **which opportunity the task belongs to**.
Re-pointing the link from here is the point: a task filed against the wrong deal
is something you notice while looking at that deal, and making you leave for the
Tasks tab is why it never gets fixed. The board reloads after a write, so a task
moved elsewhere actually leaves the list.

### Deal Cost

New currency field beside Deal Value. A site worth $40M that costs $6M to acquire
needs both numbers or the pipeline reads as pure upside. The popup header shows
value in green and cost in red.

### Not done

Converting an opportunity into a **task** — the third level in the dropdown — is
not built. It is a cross-table move (create on Master Action Board, retire the
opportunity) and it deletes a record's stage history, so it wants an explicit
confirm flow rather than a dropdown option that looks like the other two.

---

## 23. The Companies tab (2026-08-04)

Companies were already the routing key for the whole CRM — an Activity links to
exactly one, Documents and Folders are filed under one, an Opportunity's
counterparty is one, a contact's employer is one — and the table was reachable
from exactly two places: a chip on a contact row, and the picker in the
opportunity popup. From neither could you create a company, edit one, see the
whole list, or find out that four rows existed for the same counterparty.

That absence is what made §b's free-text Company box map to nothing for so long.
There was nowhere to send anyone.

`src/views/Companies.jsx` is the list: name, type, status, **people**, **deals**,
last activity, website. Row opens the existing `CompanySnapshot`; ✎ edits; ×
deletes with a preview (§25).

**The counts come from the child tables, not the company's link fields.** An
Opportunity that links to a company does not necessarily appear in that
company's `Opportunities` field — the link is only two-sided when somebody filled
in both — and a count that reads low because of a one-sided link is worse than no
count, because it looks authoritative. `companies-list.js` joins CRM Contacts,
Opportunities and Activities to compute them, behind `?rollups=0` so the pickers
that only want names do not pay for three extra table reads.

Four scopes, and the fourth is the working list:

| Scope | Is |
|---|---|
| Everyone | all of them |
| Ours | has an Entity Code, is typed Internal, or is named OneVibe/OVMG |
| Counterparties | everything else |
| **Nothing linked** | no people and no deals — a typo from the contact form, or a record somebody made and abandoned |

`Ours` needs the name check because two legacy records carry neither an Entity
Code nor `Type = Internal`, the same exception `coo-participation-suggest.js`
already handles.

New endpoints: `companies-create`, `companies-update`, `companies-delete`,
`companies-merge`. Create **matches before it creates**, through the same
`companyKey` the contact form uses, and returns the existing record with
`matchedExisting: true` rather than erroring — the caller wanted a company by
that name and now has one either way. The toast says which happened, because
silently "creating" a company that already existed is how people conclude the
button is broken.

`companyKey` moved to `src/lib/companyName.js` and `_companies.js` re-exports it
(the `_stages.js` shim pattern). The tab's duplicate detection and the server's
name resolution now cannot drift — if they normalised differently the tab would
flag pairs the server already treats as one record, or miss pairs it had just
silently created a second row for.

---

## 24. The merge screen (2026-08-04)

The old one asked you to pick a record and pressed merge. Everything on the
records you did not pick was deleted, sight unseen.

Duplicates are almost never one full record and one empty one. The 2023 row has
the phone number; the row somebody made last week has the LinkedIn and the right
title. **Picking a survivor wholesale threw away real data every single time**,
and there was no way to know what had just been lost.

`src/views/MergeReview.jsx` serves both contacts and companies:

1. Records side by side, **field by field**, with the ones that actually disagree
   marked. Fields where every record agrees are collapsed — they are not a
   decision.
2. The winning value is picked **per field**, independently of which record
   survives. Survivor = which id keeps the links. Field picks = which values the
   merged record ends up holding.
3. **Defaults cannot empty anything.** Each field starts on the survivor's value,
   or — where the survivor is blank — the first non-blank value from any of the
   others. Merging without touching a thing can only add data to the survivor.
4. **What points at each record is shown before you choose.** "4 tasks · 2 deals ·
   11 activities" is invisible from a name and an email, and it is the whole
   answer to which id should live.

The default survivor is the record carrying the **most inbound links**, not the
oldest and not the first alphabetically. Repointing links is the one step of a
merge that can silently half-fail, so the default does the least of it.

Contact company links are **unioned, never chosen**: somebody who worked at two
of the duplicated employers worked at both.

### Finding them, in `src/lib/duplicates.js`

The old rule was "same email, or byte-identical name". It missed the same person
entered twice under a work and a personal address, and it missed punctuation
differences — and it *fired* on a shape that is not a duplicate at all: two
different people who share an inbox. Merging those destroys a real contact.

Three keys, unioned — email, normalised name, last ten phone digits — with one
guard: **an email match alone is not enough when the names are clearly different
people.** Sharing `info@` is common; being the same person under two unrelated
names is not.

Normalisation detail that is load-bearing and was wrong on the first pass (the
test caught it): apostrophes and periods are **deleted**, so `O'Brien` folds to
`obrien` and matches `OBrien`. Everything else non-alphanumeric becomes a space,
so hyphenated `Mary-Jane` still matches spaced `Mary Jane`. Turning apostrophes
into spaces instead silently stops the detector firing on the single most common
spelling difference there is.

`src/lib/duplicates.test.js` covers all of it, including the shared-inbox refusal.

---

## 25. Deleting contacts and companies (2026-08-04)

Two calls, deliberately. `GET ?id=…` returns what points at the record and writes
nothing; `DELETE` removes it. The UI runs the preview first so the confirm can
name the damage — *"4 tasks, 2 deals and 11 activities point at them and will be
unlinked"* — instead of asking "are you sure?" about a record whose weight is
invisible from a table row.

A contact carrying real work is nearly always one you meant to **merge or bench**,
not delete, and that only becomes obvious when you can see the weight. Both
confirm dialogs say so in as many words.

`netlify/functions/_links.js` is the shared bookkeeping — `previewLinks`,
`repointLinks`, `clearLinks` — used by delete and merge on both tables. One list
read per table, never a per-record lookup, since these run through the shared
5-req/sec limiter.

**It fixes a real omission in the old merge.** `Assigned To` on Master Action
Board links to CRM Contacts and was not in the merge's link list, so merging a
duplicate silently unassigned every task that person owned. It is in the shared
list now, along with `Folders.Contact` and Participations when configured.

Merge repoints links **before** deleting. If the delete ran first, a failure
halfway through repointing would leave records pointing at an id that no longer
exists, which Airtable renders as a blank link with no way to tell what it was.

---

## 26. Granola + Gmail auto-logging (2026-08-04)

The Contacts board decides who "needs follow-up" from `Last Contacted`, and
nothing wrote that field except a human pressing Log Contact. So the board
flagged people you emailed that morning as untouched — and the flag is the thing
the entire tab is organised around. Every one of those conversations existed, in
Gmail and in Granola, and none of it reached the CRM.

### The line this draws

"Signals propose, humans dispose" (§3) holds, and it is a rule about *inference*.
It is worth being exact about which half of this job is inference:

| | |
|---|---|
| **THAT** a conversation happened | deterministic. Gmail has the thread, Granola has the call. **Auto-logged.** |
| **WHAT** was agreed in it | inferred. **Stays in the review queue.** |

So `crm-autolog.js` writes Activity rows and `Last Contacted`, and writes nothing
else. No task is created, no stage advances, no obligation is closed. Granola's
action extraction (`granola-poll` → `call_reviews` → Review tab) is untouched and
is still the only path from a transcript to a commitment.

### Why it does not reuse `coo-ingest-gmail`

That job does the same Activity write, but only as a side effect of a full
Supabase ingest: it needs `migrations/0002_coo_threads_schema.sql`, which is
known-unrun (§15), and it dedupes against `coo_events` — so today it throws
before it ever reaches the Airtable write. This runs on Airtable alone and works
in the base as it actually stands. Both are idempotent and neither double-writes
once the migration is applied, because both key off the same per-thread-per-day
identity.

### Dedupe without a schema change

Activities has no dedupe column and adding one is a manual step, so the key rides
in the Body as a trailing marker:

```
[autolog:gmail:<threadId>:<contactId>:<YYYY-MM-DD>]
[autolog:granola:<documentId>]
```

One list read collects the markers already present. Re-running produces the same
rows, any number of times.

### Where it refuses to guess

- **Contacts resolve by email, exactly.** Granola often supplies only a display
  name, so an exact normalised full-name match is the fallback — and a name held
  by two contacts matches neither, because that is a duplicate for §24 to settle,
  not a match.
- **Unmatched participants are reported, never created.** They are the actionable
  output of a run: a name in that list means the conversation reached nobody's
  timeline, and the fix is one contact record.
- **Company is set only when there is exactly one candidate.** An Activity routes
  to a single company by the locked CRM rule, so "several candidates" and "no
  answer" are the same case, and the row still lands on the contact's timeline
  where it is useful.
- **`Last Contacted` only ever moves forward.** A backfill picking up a
  three-week-old thread must not drag a fresh relationship backwards and fire the
  follow-up flag on somebody you spoke to yesterday.
- **Internal threads are skipped.** A thread with only our own addresses is a
  memo, not a relationship. `AUTOLOG_OUR_DOMAINS` (plus `COO_OUR_ADDRESSES`)
  decides who is us — set it, because a wrong list logs internal memos as
  counterparty relationships.

One Activity per **thread per person per day** for mail (a busy chain is one
timeline line, not forty) and one per **call** for Granola, linked to every
attendee, because a call is a single event where a mail thread is a copy each.

**The schedule ships commented out** in `netlify.toml`, same as the Threads jobs
and for the same reason: it writes to the live base unattended. Run it from
**Settings → Auto-logging → Run now** first and read the unmatched list — that is
what tells you whether the "us" configuration is right.

---

## 27. The opportunity popup got the screen (2026-08-04)

§22 added level, links, per-task editing and deal cost to the popup, on top of
the eleven fields that were already there — into a modal capped at 500px. It had
become a scroll tunnel where the close button and the save row were both off
screen, and the tasks (the stated *point* of the popup) were always below the
fold.

`Modal` now takes a `size`: `default` (500 / 580 tablet, unchanged), `wide` (880,
used by the merge screen), and `full`. At `full` the title bar and the footer
stop scrolling with the body — that is the point of the size, not decoration: in
a long editor the close and save controls are what you reach for.

The popup itself is two panes on desktop, split by **what you are doing** rather
than by field type:

- **The deal** — lane, paperwork, stage, entity, priority, kind, value, cost,
  close date, probability, type (now three columns), next step, other party,
  data room, notes.
- **Who and what it touches** — companies, contacts, hierarchy, links, tasks.

Mobile collapses to one column and keeps the existing full-bleed sheet.

### Two things that were single-value and should not have been

**Multi-people on the create form.** `Associated Contact` was always a
`multipleRecordLinks` field. The popup was fixed in §22; the *create* form still
kept only the first pick, so a deal created with three people on it arrived with
one and the other two had to be added afterwards — which is the step that never
happens. It is a chip list with a picker that stays visible, the same shape as
the popup. This also fixes an edit-path bug: saving through the form used to
collapse an existing multi-contact deal down to its first contact.

**Create a company from the popup.** Same reasoning as Add contact in §cf67928:
the counterparty's company turns up mid-deal, and sending you to another tab to
create it and back here to link it is exactly why deals sit with no company on
them and every Activity about them routes nowhere. Because it goes through
`companies-create`, typing a name that already exists **links that record** rather
than making a near-duplicate, and the toast says which happened.

## 28. Cards that fit, and Thread as a tab (2026-08-08)

### The shrunk card was unreadable

Two panes and a four-column field grid inside a 500px modal produced selects
reading `In W…`, `Not…`, `Dea…`. Both layouts now collapse — one pane, two
columns — until the card is expanded. The Tasks and Thread tabs open full-width
unconditionally, because a six-lane board cannot be read through a keyhole, and
the task lanes narrow when compact so the board fits without a sideways scroll.

The task-count bubble only renders when there are tasks. A count of zero is not
information, it is a badge asking to be checked.

### Thread is a tab on the card

Previously the deal timeline lived only in the Threads tab, one navigation away
from the record it describes. It is now a tab on the card, next to Tasks, which
is where the question "what has happened on this" is actually asked.

**What it reads, and why that matters.** The first cut read only `coo_events`,
which needs `migrations/0002_coo_threads_schema.sql` — known-unrun (§15). On a
real deal that produced paperwork dates and nothing else: no conversation, which
is the entire point. But `crm-autolog` (§26) has been filing every Gmail thread
and Granola transcript into **Airtable Activities** against the deal's contacts
and companies the whole time. The tab reads those, so the history is real today
rather than after a migration. `coo_events` still layers in when the tables
exist; when every read fails, a note says the message-level half is missing
rather than leaving an empty timeline implying nothing happened.

`activities-list` gained `?contactIds=&companyIds=` (comma-separated). A deal's
history is the union of its people's conversations, and asking one contact at a
time would be N round trips against a rate-limited base to re-filter one list.

**Direction is tracked.** "Waiting on a response" is a claim about the last time
*they* spoke; an outbound email is not an answer. That drives a standing line
above the timeline: conversation opened on this date, and where it sits now —
waiting on them, ball back here, or last movement was paperwork. The timeline is
the evidence for it.

## 29. Companies: shrunk, expanded, and a weekly history (2026-08-08)

The company snapshot got what the deal cards got. It opens shrunk and expands to
full screen, and the choice is remembered — which size you want is a habit, not
a per-company decision, and re-expanding on every open was the whole annoyance.

**A bio ahead of the history.** The Overview leads with "Who they are": type,
status, stage, health, codes, counts, and the subject descriptor. Everything
else on the record is what has *happened*; this is what is *true*.

**The Thread tab, bucketed by week.** Every logged call, email and meeting,
every signed document, every dated commitment lands in the week it happened.
Nothing is typed twice — the tab reads what the base already recorded, which is
the only way a weekly history keeps itself current. The header answers the one
question you open it for: how long since we last heard from them, where "heard
from" means an activity, not a task due date on our own calendar.

`company-detail` now sorts activities by date *before* slicing to 80, and
returns `Subject Descriptor`. Slicing in Airtable's arbitrary order dropped whole
weeks out of the middle of the story.

**The tab strip no longer draws a scrollbar.** `overflow-x: auto` on a horizontal
tab row put a stray rule under the tabs. Hidden via `.ovmg-no-scrollbar`
(`index.html`) plus the inline Firefox/IE properties; wheel, trackpad and touch
still scroll it.

## 30. Suggestions as a count, not a list (2026-08-08)

Three suggesters now share one interaction: a button reading **"N suggested
links — review"**, opening a screen with select-all, bulk **Link N**, and a
gated **Skip the rest**. Learning three patterns is two too many.

- **People on a deal** — same company, or their company's name in the deal name.
- **Tasks with no home** — `crm-suggest?unlinkedTasks=1`. Ranks a shared project
  above a company named in the task above words shared with the deal's name, and
  holds that last case to two distinctive tokens or one long one. "Send deck"
  filed under the first deal containing "deck" is exactly the quiet wrong link
  the confidence tiers exist to prevent.
- **Drive documents** — `drive-suggest?kind=…&id=…`, on deals, contacts,
  companies and tasks.

### Rejections are remembered, in both directions

Dismissing a suggestion writes it to `localStorage` under
`ovmg.suggestions.dismissed`, keyed per record. **Unlinking a person from a deal
does the same** — that is a verdict on the suggester, and without it the same
person is proposed again on the next render, which reads as the app arguing with
a decision just made. Linking one by hand clears the rejection.

**"Skip the rest" is gated.** It discards every remaining suggestion
permanently and an accidental click would be silent, so it asks once.

### The Drive scanner

`drive-suggest` lists recently modified files (folders excluded — you link a
document, not a directory), skips anything already carrying a Documents row, and
matches filenames against the record plus the people and companies around it. A
signed NCNDA is far more likely to be named after the counterparty than the deal.

- **Matching on the Drive file id**, not the URL: one document is reachable
  through several link shapes, and matching on the string would re-suggest files
  already filed.
- **Two distinctive words, or one at least seven characters.** The noise list
  covers what appears in half the Drive — `final`, `draft`, `signed`,
  `agreement`, `notes`, `deck` — because matching on one of those is how a
  meeting-notes doc gets filed under whichever deal has "notes" in its name.
- **No Google connection returns an empty list with a note**, not an error. An
  optional integration should not make a card look broken.
- **Cached for three minutes** at module scope. The Drive listing and the
  Documents read are identical for every record; opening five cards would
  otherwise mean five scans for one answer. Short on purpose — a document filed
  a minute ago should stop being suggested.

Accepting one calls `drive-link`, which creates a Documents row pointed at the
record — or, for a task, **appends** to its own `Task Links` JSON, because losing
a link somebody added by hand would be the worst outcome of a convenience.

`guessType` only names the unambiguous cases, and only from choices the Type
select already has. Airtable reads an unknown option as "create this option" and
rejects the whole write; and a wrong Type is worse than none, since Type is what
the NCNDA detector and the compliance gate read. A plain NDA falls through to
`Other` on purpose — it is not an NCNDA, and there is no NDA choice.
