-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — Phase 10 booking pages schema
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists booking_pages (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   text not null,                -- Clerk user id of the owner
  slug            text not null unique,         -- public URL slug, e.g. 'tanner-intro-call'
  label           text not null,                -- 'Intro call (30 min)'
  description     text default '',
  duration_min    int  not null default 30,     -- meeting length in minutes
  buffer_min      int  default 5,               -- gap between consecutive meetings
  max_per_day     int  default 8,
  min_notice_hours int default 4,               -- can't book in less than X hours
  max_notice_days  int default 30,              -- can't book more than X days out
  -- Availability as JSON: array of day-of-week ranges
  -- e.g. [{ "dow": 1, "start": "09:00", "end": "17:00" }, ...]  (dow: 0=Sun..6=Sat)
  availability    jsonb default '[]'::jsonb,
  -- The Google Calendar this booking writes events to. NULL = owner's primary.
  target_calendar_id text,
  -- Auto-attach Google Meet?
  with_meet       boolean default true,
  active          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists booking_pages_owner_idx on booking_pages(owner_user_id);

drop trigger if exists trg_booking_pages_updated_at on booking_pages;
create trigger trg_booking_pages_updated_at
  before update on booking_pages
  for each row execute function set_updated_at();

-- Track each booking that happens so we can show owner a history + handle cancellations.
create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  booking_page_id   uuid references booking_pages(id) on delete cascade,
  google_event_id   text,                       -- the calendar event id
  recipient_name    text,
  recipient_email   text not null,
  recipient_notes   text default '',
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  meet_link         text,
  cancel_token      text unique,                -- recipient gets this in their email for cancellation
  status            text default 'confirmed',   -- confirmed | cancelled | rescheduled
  created_at        timestamptz default now(),
  cancelled_at      timestamptz
);

create index if not exists bookings_page_idx       on bookings(booking_page_id);
create index if not exists bookings_start_idx      on bookings(start_at);
create index if not exists bookings_cancel_idx     on bookings(cancel_token);

-- RLS — service-role only (the public booking endpoint uses service role on the server side).
alter table booking_pages enable row level security;
alter table bookings      enable row level security;
