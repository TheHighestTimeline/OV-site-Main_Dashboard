-- user_notion_connections — Phase 16: Notion OAuth
-- Stores personal Notion access tokens per Clerk user.
-- Run this in the Supabase SQL editor at:
-- https://supabase.com/dashboard/project/vudfbomtmgjyqnyhyaha/sql

create table if not exists user_notion_connections (
  id              uuid default gen_random_uuid() primary key,
  user_id         text not null unique,
  access_token    text not null,
  workspace_id    text,
  workspace_name  text,
  workspace_icon  text,
  bot_id          text,
  owner           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- RLS: service role only (same pattern as other tables)
alter table user_notion_connections enable row level security;

-- notion_oauth_state: CSRF protection (same pattern as oauth_state for Google)
create table if not exists notion_oauth_state (
  state      text primary key,
  user_id    text not null,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '10 minutes'
);

alter table notion_oauth_state enable row level security;
