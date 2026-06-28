-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — Phase 7 Supabase schema
--
-- Paste this WHOLE FILE into the Supabase SQL Editor and run it.
-- It's safe to re-run (uses IF NOT EXISTS / ON CONFLICT everywhere).
--
-- Project URL: https://<your-project-ref>.supabase.co
-- ─────────────────────────────────────────────────────────────────────────────

-- ── resource_categories ─────────────────────────────────────────────────────
-- Buckets that group references in the UI (Finance, Legal, Marketing, etc.).
create table if not exists resource_categories (
  id          text primary key,            -- short slug, e.g. 'finance'
  label       text not null,               -- display name, e.g. 'Finance'
  icon        text default '◎',            -- single-char glyph for the UI
  sort_order  int  default 100,            -- lower = higher in the list
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── resources ──────────────────────────────────────────────────────────────
-- The thing the References tab and the Playbook cross-reference picker both
-- read from. One row = one named URL/resource/tool.
create table if not exists resources (
  id                      uuid primary key default gen_random_uuid(),
  category_id             text references resource_categories(id) on delete set null,
  title                   text not null,
  url                     text not null,
  type                    text default 'url',      -- 'url' | 'drive-doc' | 'drive-folder' | 'drive-sheet' | 'drive-slides' | 'dashboard-tool' | 'automation' | 'tally-form'
  description             text default '',         -- one-line summary
  owner                   text default '',         -- name or email of the responsible person
  pinned_in_references    boolean default true,    -- if true, shows on the References tab; if false, registry-only (for Playbook cross-refs)
  ovmg_only               boolean default false,   -- if true, only visible to @onevibemediagroup.com users
  tags                    text[] default '{}',     -- free-form tags for future filtering
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  created_by_user_id      text default '',         -- Clerk user id of the creator
  updated_by_user_id      text default ''
);

create index if not exists resources_category_idx     on resources(category_id);
create index if not exists resources_pinned_idx       on resources(pinned_in_references) where pinned_in_references = true;
create index if not exists resources_updated_at_idx   on resources(updated_at desc);

-- ── updated_at trigger (so we don't have to set it on every UPDATE) ────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_resources_updated_at          on resources;
create trigger trg_resources_updated_at
  before update on resources
  for each row execute function set_updated_at();

drop trigger if exists trg_categories_updated_at         on resource_categories;
create trigger trg_categories_updated_at
  before update on resource_categories
  for each row execute function set_updated_at();

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- The dashboard's Netlify functions use the SERVICE ROLE key, which bypasses
-- RLS — so RLS here mostly protects against accidents (browser using anon key,
-- direct REST API access with the anon key, etc.).
--
-- Posture:
--   - anon (public) role: no access
--   - authenticated role: SELECT only on non-ovmg_only rows
--   - service_role: all access (bypasses RLS by default)
--
alter table resource_categories enable row level security;
alter table resources          enable row level security;

drop policy if exists "anon_no_access_categories" on resource_categories;
drop policy if exists "authed_read_categories"    on resource_categories;
create policy "authed_read_categories"
  on resource_categories
  for select
  to authenticated
  using (true);

drop policy if exists "anon_no_access_resources" on resources;
drop policy if exists "authed_read_resources"    on resources;
create policy "authed_read_resources"
  on resources
  for select
  to authenticated
  using (ovmg_only = false);

-- ── Seed initial categories ────────────────────────────────────────────────
-- These mirror the categories that were hardcoded in the old References view.
-- Re-running the file is safe — ON CONFLICT does nothing.
insert into resource_categories (id, label, icon, sort_order) values
  ('finance',     'Finance',     '$',  10),
  ('legal',       'Legal',       '§',  20),
  ('hr',          'HR',          '◉',  30),
  ('marketing',   'Marketing',   '◈',  40),
  ('operations',  'Operations',  '⚒',  50),
  ('internal',    'Internal',    '◐',  60),
  ('community',   'Community',   '◎',  70),
  ('general',     'General',     '○',  99)
on conflict (id) do nothing;

-- ── Seed canonical resources from the old hardcoded References list ────────
-- Same three docs the old References.jsx used to seed via SEED_DOCS.
-- Re-running is safe: we use (title) as a conflict key.
do $$
begin
  -- Add a unique index on title for the ON CONFLICT below (one-time op).
  if not exists (
    select 1 from pg_indexes
    where tablename = 'resources' and indexname = 'resources_title_uniq'
  ) then
    create unique index resources_title_uniq on resources(title);
  end if;
end $$;

insert into resources (title, url, category_id, description, type, pinned_in_references, owner) values
  ('SEED Initiative',  'https://ovmgseed2.netlify.app/',     'community',
   'Sustainable Environmental + Equitable Development — comprehensive plan for channeling profits into community building around the data center.',
   'url', true, ''),
  ('OVMG Outreach',    'https://ovmoutreach.netlify.app/',   'marketing',
   'Outreach and marketing hub. Used for campaigns, partner introductions, and external brand communications.',
   'url', true, ''),
  ('OVMG Pipeline',    'https://ovmg-pipeline.netlify.app/', 'internal',
   'Live pipeline overview for active deals and opportunities across the portfolio.',
   'url', true, '')
on conflict (title) do nothing;

-- ── Done ───────────────────────────────────────────────────────────────────
-- After running this, go to Supabase → Settings → API to find your anon key
-- and service role key. Then add to Netlify env vars:
--   SUPABASE_URL                 = https://<your-project-ref>.supabase.co
--   SUPABASE_ANON_KEY            = (the public anon key)
--   SUPABASE_SERVICE_ROLE_KEY    = (the secret service role key — server only)
-- Then merge the Phase 7 PR and the References tab will load from Supabase.
