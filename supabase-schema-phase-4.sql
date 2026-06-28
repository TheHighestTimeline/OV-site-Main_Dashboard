-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4 schema additions:
--   • resource_pins          — per-user pins on references
--   • bookmark_folders       — user-defined bookmark folders
--   • bookmark_items         — references inside bookmark folders
--   • resource_comments      — comments on reference cards
-- ─────────────────────────────────────────────────────────────────────────────

-- resource_pins: tracks which references each user has pinned.
create table if not exists resource_pins (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,            -- Clerk user ID
  resource_id uuid not null references resources(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (user_id, resource_id)
);

create index if not exists resource_pins_user_idx on resource_pins(user_id);

-- bookmark_folders: user-defined folders for grouping references.
create table if not exists bookmark_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,            -- Clerk user ID
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

create index if not exists bookmark_folders_user_idx on bookmark_folders(user_id);

-- bookmark_items: which resources are in each folder.
create table if not exists bookmark_items (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references bookmark_folders(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  sort_order  int  not null default 0,
  created_at  timestamptz default now(),
  unique (folder_id, resource_id)
);

create index if not exists bookmark_items_folder_idx on bookmark_items(folder_id);

-- resource_comments: comments / discussion on reference cards.
create table if not exists resource_comments (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references resources(id) on delete cascade,
  user_id      text not null,           -- Clerk user ID
  author_name  text not null default '',
  body         text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists resource_comments_resource_idx on resource_comments(resource_id);
create index if not exists resource_comments_user_idx     on resource_comments(user_id);

-- Optional: add a `company` column to resources if it doesn't exist yet.
-- (the resources-upsert function already passes it; this just ensures the column exists)
alter table resources add column if not exists company text default '';
