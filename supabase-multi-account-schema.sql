-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — Phase 8 multi-account schema
--
-- Paste into Supabase SQL Editor and run. Safe to re-run.
-- Requires Phase 7 schema (and audit-log schema) to already be in place.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists user_google_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,           -- Clerk user id of the account owner
  email           text not null,           -- the Google account email
  display_name    text default '',         -- "Tanner South"
  avatar_url      text default '',
  refresh_token   text not null,           -- needs to stay secret. RLS denies anon read.
  access_token    text default '',         -- may be empty/expired; refreshed on use
  access_expires  timestamptz,
  scopes          text[] default '{}',     -- which OAuth scopes this account granted
  is_active       boolean default false,   -- the currently-selected account for this user
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  last_used_at    timestamptz,
  -- One row per (user_id, email) pair. If a user re-OAuths the same Google
  -- account, we update the existing row rather than creating a duplicate.
  constraint user_google_accounts_user_email_uniq unique (user_id, email)
);

create index if not exists user_google_accounts_user_idx   on user_google_accounts(user_id);
create index if not exists user_google_accounts_active_idx on user_google_accounts(user_id, is_active) where is_active = true;

-- Update updated_at on UPDATE (reuses trigger from Phase 7 schema)
drop trigger if exists trg_user_google_accounts_updated_at on user_google_accounts;
create trigger trg_user_google_accounts_updated_at
  before update on user_google_accounts
  for each row execute function set_updated_at();

-- RLS — service-role only. Refresh tokens MUST never reach the browser.
alter table user_google_accounts enable row level security;
-- (no policies = denied for anon/authenticated; service_role bypasses RLS)

-- ── oauth_state ─────────────────────────────────────────────────────────────
-- Short-lived CSRF tokens for the OAuth flow. Created when user clicks
-- "+ Add account", looked up + deleted in the OAuth callback.
create table if not exists oauth_state (
  state        text primary key,             -- random token used as ?state= in OAuth URL
  user_id      text not null,                -- Clerk user id that initiated
  created_at   timestamptz default now(),
  expires_at   timestamptz default (now() + interval '10 minutes')
);

create index if not exists oauth_state_expires_idx on oauth_state(expires_at);

alter table oauth_state enable row level security;

-- Cleanup helper — call from a cron or in functions to GC expired states.
-- For now we delete-on-use in the callback; this just provides a backup.
-- (Tanner can schedule this via Supabase pg_cron later if needed.)
