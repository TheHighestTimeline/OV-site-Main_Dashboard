-- Review queue for AI-proposed CRM writes (2026-07 audit §4).
-- Sources: the Granola poller, the call-ingest webhook, and Audio Dump.
-- NOTHING touches Airtable until a human approves items on the Review page.
-- Run this in the Supabase SQL editor.

create table if not exists call_reviews (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'granola',   -- granola | audio-dump | webhook
  external_id       text unique,                        -- granola doc id (idempotency; null for audio dumps)
  title             text,
  call_date         timestamptz,
  attendees         jsonb not null default '[]',
  transcript        text,
  summary           text,
  proposed_actions  jsonb not null default '{}',        -- the parseTranscript() output
  status            text not null default 'pending',    -- pending | approved | partial | dismissed | error
  applied_actions   jsonb not null default '[]',        -- what was actually written on approve
  error             text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists call_reviews_status_idx  on call_reviews (status);
create index if not exists call_reviews_created_idx on call_reviews (created_at desc);

-- Service-role access only (all reads/writes go through Netlify functions).
alter table call_reviews enable row level security;
