-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — Phase 12 Clients/Social Platform schema (v1 scaffold)
--
-- Tables for the upgraded Clients tab — visual platform mockups, CSV bulk
-- import, approval workflow. UI for these features ships in a follow-up; this
-- migration just lays the foundation.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── posts ──────────────────────────────────────────────────────────────────
-- Each row = one social post draft. The existing Notion CLIENTS DB stays as
-- the source of truth for the client roster; posts reference clients by their
-- Notion page id so we don't duplicate client metadata.
create table if not exists posts (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null,           -- Notion page id of the client (from Notion CRM/Companies)
  platform          text not null,           -- 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'threads'
  caption           text default '',
  hashtags          text default '',
  type              text default 'photo',    -- 'photo' | 'video' | 'carousel' | 'reel' | 'short'
  media_urls        jsonb default '[]'::jsonb,  -- array of media URLs (Supabase Storage / Drive)
  scheduled_at      timestamptz,
  status            text default 'draft',    -- 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'posted'
  approval_state    text default 'none',     -- denormalized for quick filtering
  approval_comment  text default '',
  quality_score     int,                     -- 1-10 from AI enrichment
  tags              text[] default '{}',
  ai_generated      boolean default false,
  source_csv_batch  text,                    -- if imported via CSV, this groups them
  created_by_user_id text,
  approved_by_user_id text,
  approved_at       timestamptz,
  posted_at         timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists posts_client_idx       on posts(client_id);
create index if not exists posts_status_idx       on posts(status);
create index if not exists posts_scheduled_idx    on posts(scheduled_at);
create index if not exists posts_csv_batch_idx    on posts(source_csv_batch);

drop trigger if exists trg_posts_updated_at on posts;
create trigger trg_posts_updated_at
  before update on posts
  for each row execute function set_updated_at();

-- ── approval_comments ─────────────────────────────────────────────────────
-- Thread of comments on a post during approval. Lightweight — for revision
-- workflows.
create table if not exists approval_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references posts(id) on delete cascade,
  author_user_id text,
  author_email text,
  body        text,
  created_at  timestamptz default now()
);

create index if not exists approval_comments_post_idx on approval_comments(post_id, created_at desc);

-- ── csv_imports ───────────────────────────────────────────────────────────
-- Audit trail of CSV bulk imports.
create table if not exists csv_imports (
  id              uuid primary key default gen_random_uuid(),
  batch_id        text unique not null,
  client_id       text not null,
  imported_by_user_id text,
  rows_imported   int default 0,
  rows_failed     int default 0,
  error_log       jsonb default '[]'::jsonb,
  created_at      timestamptz default now()
);

-- RLS — service-role only.
alter table posts                  enable row level security;
alter table approval_comments      enable row level security;
alter table csv_imports            enable row level security;
