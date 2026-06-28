-- Playbook links (§3) — one live Notion page URL per playbook entry, scoped by
-- company. Admins edit these from the Playbook tab; everyone else just views the
-- iframe + the "Edit in Notion" link. Run this once in the Supabase SQL editor.
create table if not exists public.playbook_links (
  id                  uuid primary key default gen_random_uuid(),
  company             text not null default 'global',   -- 'global' (top-level) or a company slug (ovmg, ovm, …)
  name                text not null default 'Playbook',
  url                 text not null,
  position            int  not null default 0,
  created_by_user_id  text default '',
  updated_by_user_id  text default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists playbook_links_company_idx
  on public.playbook_links (company, position);

-- The Netlify functions use the service-role key and gate on Clerk admin, so
-- RLS here is just a backstop that denies anon/public access.
alter table public.playbook_links enable row level security;

-- Optional seed for the top-level playbook (matches the old hardcoded URL):
-- insert into public.playbook_links (company, name, url)
-- values ('global', 'OVMG Playbook',
--   'https://gusty-print-a19.notion.site/OneVibeMediaGroup-INC-20dec2c4642880e890cbeee0765717e2');
