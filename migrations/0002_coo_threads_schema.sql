-- ============================================================================
-- OVMG Dashboard: COO Tab schema
-- Adds the cross-channel message layer that backs the COO tab.
--
-- Security model matches the existing codebase: every table has RLS ENABLED
-- with NO policies, which denies all access to anon and authenticated roles.
-- The service role bypasses RLS, and all access happens through Netlify
-- functions that are already gated by requireAuth / requireCoo. The browser
-- never talks to Supabase directly.
--
-- Naming: every object is prefixed coo_ so nothing collides with the existing
-- Phase 4 / Phase 7 tables.
--
-- v3: adds the evidence layer (coo_signals) and the unified timeline (coo_events).
-- v2: adds the Program / Workstream / Participation channel model. Stage now
-- lives on the participation (a contact inside one workstream), not on the
-- contact, because one person can sit in several workstreams at once and be at
-- a different stage in each.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

-- ── coo_identities ──────────────────────────────────────────────────────────
-- Every address, handle or number known for a person, mapped back to the
-- Airtable CRM Contacts record. This is the table that collapses one human's
-- email + WhatsApp + SMS into a single relationship row in the UI.
create table if not exists coo_identities (
  id                    uuid primary key default gen_random_uuid(),
  contact_airtable_id   text,                       -- recXXXXXXXXXXXXXX, nullable until matched
  channel               text not null check (channel in ('email','whatsapp','sms','call')),
  handle                text not null,              -- lowercased email, or E.164 phone
  display_name          text,
  verified              boolean not null default false,  -- true once a human confirmed the mapping
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (channel, handle)
);

create index if not exists coo_identities_contact_idx
  on coo_identities (contact_airtable_id);
create index if not exists coo_identities_unmatched_idx
  on coo_identities (created_at desc) where contact_airtable_id is null;

-- ── coo_threads ─────────────────────────────────────────────────────────────
-- One conversation on one channel. Multiple threads roll up to one contact.
create table if not exists coo_threads (
  id                      uuid primary key default gen_random_uuid(),
  channel                 text not null check (channel in ('email','whatsapp','sms','call')),
  external_thread_id      text not null,            -- Gmail threadId, WA wa_id, OpenPhone conversationId
  subject                 text,
  contact_airtable_id     text,
  opportunity_airtable_id text,                     -- the WORKSTREAM (child Opportunity)
  program_airtable_id     text,                     -- the PROGRAM (parent Opportunity)
  participation_airtable_id text,                   -- Participations recId. Subject routing target.
  entity                  text,                     -- mirrors Airtable Entity select, for filtering
  first_message_at        timestamptz,
  last_message_at         timestamptz,
  last_direction          text check (last_direction in ('inbound','outbound')),
  message_count           integer not null default 0,
  is_group                boolean not null default false,
  source                  text not null default 'live'
                            check (source in ('live','import','backfill')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (channel, external_thread_id)
);

create index if not exists coo_threads_contact_idx
  on coo_threads (contact_airtable_id, last_message_at desc);
create index if not exists coo_threads_recent_idx
  on coo_threads (last_message_at desc);
create index if not exists coo_threads_entity_idx
  on coo_threads (entity);
create index if not exists coo_threads_workstream_idx
  on coo_threads (opportunity_airtable_id, last_message_at desc);
create index if not exists coo_threads_participation_idx
  on coo_threads (participation_airtable_id, last_message_at desc);

-- Subject routing: a thread belongs to exactly ONE participation, mirroring the
-- locked CRM rule that an Activity links to exactly one company. When a contact
-- sits in several workstreams, default the thread to the participation with the
-- most recent activity and expose a manual reassign in the UI. Never fan a
-- single thread out across workstreams.

-- ── coo_messages ────────────────────────────────────────────────────────────
-- Individual messages. This is the only table that grows fast. It is the whole
-- reason this layer lives in Postgres and not in Airtable.
create table if not exists coo_messages (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null references coo_threads(id) on delete cascade,
  external_message_id text,
  channel             text not null check (channel in ('email','whatsapp','sms','call')),
  direction           text not null check (direction in ('inbound','outbound')),
  from_handle         text,
  to_handles          text[],
  sent_at             timestamptz not null,
  body                text,
  snippet             text,                          -- first 280 chars, for list rendering
  has_attachment      boolean not null default false,
  attachment_meta     jsonb,                         -- names, mime types, Drive links. Never file bytes.
  raw_ref             text,                          -- pointer back to Gmail/Graph/OpenPhone for full fetch
  search_tsv          tsvector generated always as (to_tsvector('english', coalesce(body,''))) stored,
  created_at          timestamptz not null default now(),
  unique (channel, external_message_id)
);

create index if not exists coo_messages_thread_idx
  on coo_messages (thread_id, sent_at desc);
create index if not exists coo_messages_search_idx
  on coo_messages using gin (search_tsv);
create index if not exists coo_messages_sent_idx
  on coo_messages (sent_at desc);

-- ── coo_briefs ──────────────────────────────────────────────────────────────
-- Cached AI summary per relationship. Regenerated on new inbound, stage change,
-- or on demand. Cached so opening the tab does not fire dozens of model calls.
create table if not exists coo_briefs (
  participation_airtable_id text primary key,
  contact_airtable_id text not null,
  workstream_airtable_id text,
  summary             text,
  open_asks           jsonb not null default '[]'::jsonb,
  last_commitment     text,
  suggested_next      text,
  source_message_ids  uuid[],                        -- provenance. Every claim traceable.
  model               text,
  generated_at        timestamptz not null default now(),
  stale               boolean not null default false
);

create index if not exists coo_briefs_stale_idx
  on coo_briefs (stale) where stale = true;
create index if not exists coo_briefs_contact_idx
  on coo_briefs (contact_airtable_id);

-- ── coo_workstream_digests ──────────────────────────────────────────────────
-- The channel-level view. Rolls every participation in one workstream into a
-- single read, so "where does bridge loan funding actually stand" is one glance
-- rather than opening seven threads.
create table if not exists coo_workstream_digests (
  workstream_airtable_id text primary key,
  program_airtable_id    text,
  summary                text,
  participant_count      integer not null default 0,
  stage_counts           jsonb not null default '{}'::jsonb,
  blocked_count          integer not null default 0,
  stalled_count          integer not null default 0,
  last_activity_at       timestamptz,
  generated_at           timestamptz not null default now(),
  stale                  boolean not null default false
);

-- ── coo_stage_events ────────────────────────────────────────────────────────
-- Append-only stage history. Airtable holds current stage; this holds how it
-- got there, which is what days-in-state and the stalled detector run on.
create table if not exists coo_stage_events (
  id                  uuid primary key default gen_random_uuid(),
  participation_airtable_id text not null,
  contact_airtable_id text,
  workstream_airtable_id text,
  from_stage          text,
  to_stage            text not null,
  evidence_type       text,   -- 'document','drive_access','message','manual'
  evidence_ref        text,   -- Airtable Documents recId, Drive file id, coo_messages.id
  changed_by          text,   -- Clerk user id
  note                text,
  created_at          timestamptz not null default now()
);

create index if not exists coo_stage_events_participation_idx
  on coo_stage_events (participation_airtable_id, created_at desc);
create index if not exists coo_stage_events_contact_idx
  on coo_stage_events (contact_airtable_id, created_at desc);

-- ── coo_sync_state ──────────────────────────────────────────────────────────
-- Cursor storage for each ingest source, so the reconciliation poll knows
-- where it left off and webhook gaps get healed rather than silently lost.
create table if not exists coo_sync_state (
  source          text primary key,   -- 'gmail','whatsapp','openphone'
  cursor          text,               -- Gmail historyId, WA timestamp, OpenPhone cursor
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

-- ── coo_events ──────────────────────────────────────────────────────────────
-- The unified timeline. Everything that ever happened with one participation,
-- in one ordered stream: messages, documents, access grants, calls, stage
-- changes, tasks. This is what renders the dotted vertical timeline in the UI,
-- and it is what the brief generator reads. Messages keep living in
-- coo_messages for full-text search; an event row points at them.
create table if not exists coo_events (
  id                        uuid primary key default gen_random_uuid(),
  participation_airtable_id text,
  contact_airtable_id       text,
  workstream_airtable_id    text,
  event_type                text not null check (event_type in (
                              'message_in','message_out','call','meeting',
                              'doc_sent','doc_signed','doc_received',
                              'access_requested','access_granted','access_revoked',
                              'stage_change','task_created','task_completed','note'
                            )),
  occurred_at               timestamptz not null,
  title                     text not null,          -- one line, rendered on the timeline
  detail                    text,
  actor                     text,                   -- 'us' | 'them' | 'system'
  source                    text not null           -- where it came from
                              check (source in ('gmail','drive','calendar','whatsapp',
                                                'openphone','granola','airtable','manual')),
  ref_message_id            uuid references coo_messages(id) on delete set null,
  ref_document_airtable_id  text,
  ref_drive_file_id         text,
  ref_url                   text,
  confidence                text not null default 'confirmed'
                              check (confidence in ('confirmed','inferred')),
  dedupe_key                text unique,            -- prevents replays creating duplicates
  created_at                timestamptz not null default now()
);

create index if not exists coo_events_participation_idx
  on coo_events (participation_airtable_id, occurred_at desc);
create index if not exists coo_events_contact_idx
  on coo_events (contact_airtable_id, occurred_at desc);
create index if not exists coo_events_workstream_idx
  on coo_events (workstream_airtable_id, occurred_at desc);
create index if not exists coo_events_type_idx
  on coo_events (event_type, occurred_at desc);

-- ── coo_signals ─────────────────────────────────────────────────────────────
-- Detected evidence that something changed in the real world: an NCNDA landed
-- in Drive signed, an eSignature completion email arrived, a Drive permission
-- was granted. A signal PROPOSES a resolution. It does not perform one, unless
-- it is deterministic (see `kind`).
--
-- Rule: signals propose, humans dispose. Silently closing a real obligation is
-- worse than a stale board. The only exception is deterministic signals, where
-- the fact is directly observable rather than inferred from a filename or a
-- subject line.
create table if not exists coo_signals (
  id                        uuid primary key default gen_random_uuid(),
  participation_airtable_id text,
  contact_airtable_id       text,
  signal_type               text not null check (signal_type in (
                              'ncnda_signed','doc_signed','access_granted',
                              'access_requested','doc_sent','meeting_held','reply_received'
                            )),
  kind                      text not null check (kind in ('deterministic','inferred')),
  -- deterministic: Drive permission list, calendar attendance. Auto-applies.
  -- inferred: filename match, email subject parse. Requires confirmation.
  confidence_score          numeric,                -- 0 to 1, inferred signals only
  source                    text not null check (source in ('gmail','drive','calendar','manual')),
  evidence_ref              text not null,          -- Drive file id, Gmail message id
  evidence_url              text,
  detected_at               timestamptz not null default now(),
  proposes_task_id          text,                   -- Airtable Master Action Board recId
  proposes_stage            text,                   -- stage id from stages.js
  status                    text not null default 'pending'
                              check (status in ('pending','confirmed','rejected','auto_applied')),
  resolved_by               text,                   -- Clerk user id
  resolved_at               timestamptz,
  dedupe_key                text unique,
  created_at                timestamptz not null default now()
);

create index if not exists coo_signals_pending_idx
  on coo_signals (status, detected_at desc) where status = 'pending';
create index if not exists coo_signals_participation_idx
  on coo_signals (participation_airtable_id, detected_at desc);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function coo_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['coo_identities','coo_threads','coo_sync_state'] loop
    execute format(
      'drop trigger if exists %I_touch on %I; '
      'create trigger %I_touch before update on %I '
      'for each row execute function coo_touch_updated_at();',
      t, t, t, t);
  end loop;
end $$;

-- ── Row Level Security: deny all, service role bypasses ─────────────────────
alter table coo_identities   enable row level security;
alter table coo_threads      enable row level security;
alter table coo_messages     enable row level security;
alter table coo_briefs       enable row level security;
alter table coo_workstream_digests enable row level security;
alter table coo_events   enable row level security;
alter table coo_signals  enable row level security;
alter table coo_stage_events enable row level security;
alter table coo_sync_state   enable row level security;

-- Intentionally no policies. Access is service-role only, gated in functions.
