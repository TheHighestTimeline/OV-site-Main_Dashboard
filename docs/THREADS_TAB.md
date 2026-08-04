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
