-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_full_schema.sql
-- Full OVMG Dashboard schema — Phase 0 baseline
-- Safe to re-run: drops and recreates all dashboard tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Drop existing tables in dependency order (CASCADE handles FKs) ──────────
-- This ensures a clean slate even if previous partial migrations ran.
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS user_integration_tokens CASCADE;
DROP TABLE IF EXISTS drive_files_cache CASCADE;
DROP TABLE IF EXISTS drive_folders CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS datacenter_calculator_inputs CASCADE;
DROP TABLE IF EXISTS datacenter_documents_checklist CASCADE;
DROP TABLE IF EXISTS datacenter_projects CASCADE;
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS post_assets CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS client_platforms CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS managed_sites CASCADE;
DROP TABLE IF EXISTS ncnda_sends CASCADE;
DROP TABLE IF EXISTS email_drafts CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS kanban_card_tasks CASCADE;
DROP TABLE IF EXISTS kanban_card_attachments CASCADE;
DROP TABLE IF EXISTS kanban_cards CASCADE;
DROP TABLE IF EXISTS kanban_lanes CASCADE;
DROP TABLE IF EXISTS kanban_boards CASCADE;
DROP TABLE IF EXISTS playbook_blocks CASCADE;
DROP TABLE IF EXISTS playbook_pages CASCADE;
DROP TABLE IF EXISTS playbook_spaces CASCADE;
DROP TABLE IF EXISTS bookmarks CASCADE;
DROP TABLE IF EXISTS reference_tag_links CASCADE;
DROP TABLE IF EXISTS reference_tags CASCADE;
DROP TABLE IF EXISTS reference_comments CASCADE;
DROP TABLE IF EXISTS "references" CASCADE;
DROP TABLE IF EXISTS audio_log_items CASCADE;
DROP TABLE IF EXISTS audio_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS booking_pages CASCADE;
DROP TABLE IF EXISTS calendar_events_cache CASCADE;
DROP TABLE IF EXISTS calendar_accounts CASCADE;
DROP TABLE IF EXISTS task_attachments CASCADE;
DROP TABLE IF EXISTS task_comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS contact_comments CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS user_company_access CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ─── Utility function: auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Helper macro to attach the trigger to any table
-- Usage: SELECT attach_updated_at('table_name');
CREATE OR REPLACE FUNCTION attach_updated_at(tbl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %I;
     CREATE TRIGGER trg_%1$s_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    tbl, tbl, tbl
  );
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. USERS / ACCESS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id       text UNIQUE NOT NULL,
  email          text UNIQUE NOT NULL,
  full_name      text,
  avatar_url     text,
  role           text NOT NULL DEFAULT 'member'
                   CHECK (role IN ('admin','executive','operations','sales','finance','member','senior_partner','read_only')),
  is_active      boolean NOT NULL DEFAULT true,
  last_seen_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
SELECT attach_updated_at('users');
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

-- ─── Companies ───────────────────────────────────────────────────────────────
CREATE TABLE companies (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         text UNIQUE NOT NULL,   -- 'ovmg' | 'ovm' | 'ovtv' | etc.
  label        text NOT NULL,
  color_hex    text,
  logo_url     text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('companies');

INSERT INTO companies (slug, label, color_hex) VALUES
  ('ovmg',        'OneVibe Media Group', '#d96b3a'),
  ('ovm',         'OVM',                 '#2c5d8a'),
  ('ovtv',        'OVTV',                '#2f7d5f'),
  ('ovf',         'OneVibe Fest',        '#b48a1e'),
  ('amplify',     'Amplify',             '#7c3d8f'),
  ('carbonsponge','Carbon Sponge',       '#3a7d44'),
  ('ovd',         'OVD',                 '#8a5c2c'),
  ('ovv',         'OVV',                 '#5c2c8a')
ON CONFLICT (slug) DO NOTHING;

-- ─── User ↔ Company access ────────────────────────────────────────────────────
CREATE TABLE user_company_access (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin','executive','operations','sales','finance','member','senior_partner','read_only')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_uca_user    ON user_company_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uca_company ON user_company_access(company_id);

-- ─── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  before_json  jsonb,
  after_json   jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_company   ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at DESC);


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CONTACTS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE contacts (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         uuid REFERENCES companies(id) ON DELETE SET NULL,
  owner_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  full_name          text NOT NULL,
  email              text,
  phone              text,
  title              text,
  organization       text,
  linkedin_url       text,
  avatar_url         text,
  status             text DEFAULT 'active',
  source             text,
  tags               text[],
  notes_md           text,
  last_contacted_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
SELECT attach_updated_at('contacts');
CREATE INDEX IF NOT EXISTS idx_contacts_company    ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner      ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email      ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm  ON contacts USING gin(full_name gin_trgm_ops);

CREATE TABLE contact_comments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body_md      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('contact_comments');
CREATE INDEX IF NOT EXISTS idx_contact_comments_contact ON contact_comments(contact_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. TASKS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE tasks (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     uuid REFERENCES companies(id) ON DELETE SET NULL,
  parent_id      uuid REFERENCES tasks(id) ON DELETE CASCADE,   -- sub-tasks
  assignee_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  creator_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description_md text,
  status         text NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started','in_progress','waiting','on_hold','done','cancelled')),
  priority       text DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high','urgent')),
  progress_pct   smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  due_date       date,
  start_date     date,
  tags           text[],
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
SELECT attach_updated_at('tasks');
CREATE INDEX IF NOT EXISTS idx_tasks_company   ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_date);

CREATE TABLE task_comments (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  body_md    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
SELECT attach_updated_at('task_comments');
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

CREATE TABLE task_attachments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploader_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. CALENDAR
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE calendar_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'google',
  provider_email  text NOT NULL,
  access_token    text,
  refresh_token   text,
  token_expires_at timestamptz,
  is_primary      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('calendar_accounts');
CREATE INDEX IF NOT EXISTS idx_cal_accounts_user ON calendar_accounts(user_id);

CREATE TABLE calendar_events_cache (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       uuid NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  calendar_id      text,
  title            text,
  description      text,
  location         text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  is_all_day       boolean NOT NULL DEFAULT false,
  recurrence_rule  text,
  attendees_json   jsonb,
  raw_json         jsonb,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_cal_events_account  ON calendar_events_cache(account_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_starts   ON calendar_events_cache(starts_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_ends     ON calendar_events_cache(ends_at);

CREATE TABLE booking_pages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug            text UNIQUE NOT NULL,
  title           text NOT NULL,
  description_md  text,
  duration_min    integer NOT NULL DEFAULT 30,
  buffer_min      integer NOT NULL DEFAULT 5,
  availability_json jsonb,
  questions_json  jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('booking_pages');
CREATE INDEX IF NOT EXISTS idx_booking_pages_owner ON booking_pages(owner_id);

CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_page_id  uuid NOT NULL REFERENCES booking_pages(id) ON DELETE CASCADE,
  guest_name       text NOT NULL,
  guest_email      text NOT NULL,
  guest_phone      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  timezone         text NOT NULL DEFAULT 'America/New_York',
  status           text NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('pending','confirmed','cancelled','no_show')),
  answers_json     jsonb,
  notes            text,
  cal_event_id     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('bookings');
CREATE INDEX IF NOT EXISTS idx_bookings_page     ON bookings(booking_page_id);
CREATE INDEX IF NOT EXISTS idx_bookings_starts   ON bookings(starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_email    ON bookings(guest_email);


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. AUDIO LOGS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE audio_logs (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id       uuid REFERENCES companies(id) ON DELETE SET NULL,
  file_name        text NOT NULL,
  file_url         text NOT NULL,
  duration_sec     integer,
  transcript_raw   text,
  transcript_clean text,
  parse_result_json jsonb,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','transcribing','parsed','reviewed','archived')),
  reviewed_by_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('audio_logs');
CREATE INDEX IF NOT EXISTS idx_audio_logs_uploader ON audio_logs(uploader_id);
CREATE INDEX IF NOT EXISTS idx_audio_logs_company  ON audio_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audio_logs_status   ON audio_logs(status);

CREATE TABLE audio_log_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audio_log_id   uuid NOT NULL REFERENCES audio_logs(id) ON DELETE CASCADE,
  item_type      text NOT NULL CHECK (item_type IN ('task','contact','note','event','other')),
  content_json   jsonb NOT NULL,
  approved       boolean,
  approved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at    timestamptz,
  linked_entity_type text,
  linked_entity_id   uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audio_log_items_log  ON audio_log_items(audio_log_id);
CREATE INDEX IF NOT EXISTS idx_audio_log_items_type ON audio_log_items(item_type);


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. REFERENCES
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE "references" (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  created_by_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  type            text NOT NULL DEFAULT 'document'
                    CHECK (type IN ('document','link','file','template','sop','script','other')),
  category        text,
  title           text NOT NULL,
  body_md         text,
  url             text,
  file_url        text,
  pinned_user_ids uuid[],
  is_pinned_global boolean NOT NULL DEFAULT false,
  tags            text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
SELECT attach_updated_at('references');
CREATE INDEX IF NOT EXISTS idx_references_company  ON "references"(company_id);
CREATE INDEX IF NOT EXISTS idx_references_category ON "references"(category);
CREATE INDEX IF NOT EXISTS idx_references_type     ON "references"(type);
CREATE INDEX IF NOT EXISTS idx_references_title_trgm ON "references" USING gin(title gin_trgm_ops);

CREATE TABLE reference_comments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_id uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body_md      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('reference_comments');
CREATE INDEX IF NOT EXISTS idx_ref_comments_ref ON reference_comments(reference_id);

CREATE TABLE reference_tags (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  label      text NOT NULL,
  color_hex  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, label)
);

CREATE TABLE reference_tag_links (
  reference_id uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES reference_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (reference_id, tag_id)
);

CREATE TABLE bookmarks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. PLAYBOOK
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE playbook_spaces (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  title        text NOT NULL,
  icon         text,
  color_hex    text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_private   boolean NOT NULL DEFAULT false,
  owner_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('playbook_spaces');
CREATE INDEX IF NOT EXISTS idx_pb_spaces_company ON playbook_spaces(company_id);

CREATE TABLE playbook_pages (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id     uuid NOT NULL REFERENCES playbook_spaces(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES playbook_pages(id) ON DELETE CASCADE,
  title        text NOT NULL,
  icon         text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('playbook_pages');
CREATE INDEX IF NOT EXISTS idx_pb_pages_space  ON playbook_pages(space_id);
CREATE INDEX IF NOT EXISTS idx_pb_pages_parent ON playbook_pages(parent_id);

CREATE TABLE playbook_blocks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id      uuid NOT NULL REFERENCES playbook_pages(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES playbook_blocks(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'paragraph',
  content_json jsonb NOT NULL DEFAULT '{}',
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('playbook_blocks');
CREATE INDEX IF NOT EXISTS idx_pb_blocks_page   ON playbook_blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_pb_blocks_parent ON playbook_blocks(parent_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 8. KANBAN
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE kanban_boards (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  owner_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  is_default   boolean NOT NULL DEFAULT false,
  settings_json jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('kanban_boards');
CREATE INDEX IF NOT EXISTS idx_kanban_boards_company ON kanban_boards(company_id);

CREATE TABLE kanban_lanes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id     uuid NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  title        text NOT NULL,
  color_hex    text,
  sort_order   integer NOT NULL DEFAULT 0,
  wip_limit    integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('kanban_lanes');
CREATE INDEX IF NOT EXISTS idx_kanban_lanes_board ON kanban_lanes(board_id);

CREATE TABLE kanban_cards (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lane_id        uuid NOT NULL REFERENCES kanban_lanes(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description_md text,
  priority       text DEFAULT 'medium',
  due_date       date,
  labels         text[],
  sort_order     integer NOT NULL DEFAULT 0,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
SELECT attach_updated_at('kanban_cards');
CREATE INDEX IF NOT EXISTS idx_kanban_cards_lane     ON kanban_cards(lane_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_assignee ON kanban_cards(assignee_id);

CREATE TABLE kanban_card_attachments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id      uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kc_attachments_card ON kanban_card_attachments(card_id);

CREATE TABLE kanban_card_tasks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id      uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_kct_card ON kanban_card_tasks(card_id);
CREATE INDEX IF NOT EXISTS idx_kct_task ON kanban_card_tasks(task_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 9. EMAIL / OUTREACH
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE email_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'google',
  provider_email  text NOT NULL,
  display_name    text,
  access_token    text,
  refresh_token   text,
  token_expires_at timestamptz,
  is_primary      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('email_accounts');
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);

CREATE TABLE email_drafts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  from_account_id uuid REFERENCES email_accounts(id) ON DELETE SET NULL,
  to_addresses    text[],
  cc_addresses    text[],
  bcc_addresses   text[],
  subject         text,
  body_html       text,
  body_text       text,
  ai_prompt       text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','sent','failed')),
  sent_at         timestamptz,
  scheduled_for   timestamptz,
  thread_id       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('email_drafts');
CREATE INDEX IF NOT EXISTS idx_email_drafts_author  ON email_drafts(author_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_company ON email_drafts(company_id);

CREATE TABLE ncnda_sends (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_name  text NOT NULL,
  recipient_email text NOT NULL,
  company_name    text,
  template_version text,
  sent_at         timestamptz,
  opened_at       timestamptz,
  signed_at       timestamptz,
  document_url    text,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','opened','signed','voided')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('ncnda_sends');
CREATE INDEX IF NOT EXISTS idx_ncnda_sender ON ncnda_sends(sender_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 10. MANAGED SITES
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE managed_sites (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       uuid REFERENCES companies(id) ON DELETE SET NULL,
  name             text NOT NULL,
  url              text,
  netlify_site_id  text,
  github_repo      text,
  github_branch    text DEFAULT 'main',
  status           text DEFAULT 'unknown',
  last_deploy_at   timestamptz,
  last_deploy_status text,
  notes_md         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('managed_sites');
CREATE INDEX IF NOT EXISTS idx_managed_sites_company ON managed_sites(company_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 11. CLIENTS / SOCIAL
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  name            text NOT NULL,
  logo_url        text,
  website         text,
  status          text DEFAULT 'active',
  contract_start  date,
  contract_end    date,
  monthly_retainer numeric(12,2),
  notes_md        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
SELECT attach_updated_at('clients');
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);

CREATE TABLE client_platforms (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform     text NOT NULL,   -- 'instagram' | 'tiktok' | 'youtube' | etc.
  handle       text,
  profile_url  text,
  follower_count bigint,
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('client_platforms');
CREATE INDEX IF NOT EXISTS idx_client_platforms_client ON client_platforms(client_id);

CREATE TABLE posts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform_id     uuid REFERENCES client_platforms(id) ON DELETE SET NULL,
  creator_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  title           text,
  caption         text,
  platform        text,
  post_type       text DEFAULT 'feed',
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('idea','draft','in_review','approved','scheduled','posted','archived')),
  scheduled_for   timestamptz,
  posted_at       timestamptz,
  provider_post_id text,
  likes           integer,
  comments        integer,
  shares          integer,
  reach           integer,
  impressions     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
SELECT attach_updated_at('posts');
CREATE INDEX IF NOT EXISTS idx_posts_client   ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status   ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);

CREATE TABLE post_assets (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_assets_post ON post_assets(post_id);

CREATE TABLE ads (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  campaign_name   text,
  ad_name         text,
  status          text DEFAULT 'draft',
  budget_daily    numeric(10,2),
  budget_total    numeric(10,2),
  spend_to_date   numeric(10,2),
  impressions     bigint,
  clicks          bigint,
  conversions     bigint,
  starts_at       date,
  ends_at         date,
  provider_ad_id  text,
  raw_json        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('ads');
CREATE INDEX IF NOT EXISTS idx_ads_client   ON ads(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_platform ON ads(platform);


-- ═════════════════════════════════════════════════════════════════════════════
-- 12. DATACENTER PROJECTS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE datacenter_projects (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  name            text NOT NULL,
  location        text,
  status          text DEFAULT 'prospecting',
  mw_capacity     numeric(10,2),
  total_sqft      integer,
  investment_usd  numeric(18,2),
  notes_md        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
SELECT attach_updated_at('datacenter_projects');
CREATE INDEX IF NOT EXISTS idx_dc_projects_company ON datacenter_projects(company_id);

CREATE TABLE datacenter_documents_checklist (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     uuid NOT NULL REFERENCES datacenter_projects(id) ON DELETE CASCADE,
  category       text NOT NULL,
  item_name      text NOT NULL,
  is_complete    boolean NOT NULL DEFAULT false,
  completed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at   timestamptz,
  notes          text,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dc_checklist_project ON datacenter_documents_checklist(project_id);

CREATE TABLE datacenter_calculator_inputs (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     uuid NOT NULL REFERENCES datacenter_projects(id) ON DELETE CASCADE,
  scenario_name  text NOT NULL DEFAULT 'default',
  inputs_json    jsonb NOT NULL DEFAULT '{}',
  outputs_json   jsonb,
  saved_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
SELECT attach_updated_at('datacenter_calculator_inputs');
CREATE INDEX IF NOT EXISTS idx_dc_calc_project ON datacenter_calculator_inputs(project_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 13. DRIVE
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE drive_folders (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'google',
  provider_folder_id text NOT NULL,
  name              text NOT NULL,
  parent_folder_id  uuid REFERENCES drive_folders(id) ON DELETE CASCADE,
  is_root           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider, provider_folder_id)
);
SELECT attach_updated_at('drive_folders');
CREATE INDEX IF NOT EXISTS idx_drive_folders_company ON drive_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_user    ON drive_folders(user_id);

CREATE TABLE drive_files_cache (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  folder_id         uuid REFERENCES drive_folders(id) ON DELETE CASCADE,
  provider_file_id  text NOT NULL,
  name              text NOT NULL,
  mime_type         text,
  size_bytes        bigint,
  web_view_url      text,
  thumbnail_url     text,
  owner_email       text,
  modified_at       timestamptz,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(folder_id, provider_file_id)
);
CREATE INDEX IF NOT EXISTS idx_drive_files_folder ON drive_files_cache(folder_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 14. GOALS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE goals (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  owner_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  target       numeric(18,4) NOT NULL,
  current      numeric(18,4) NOT NULL DEFAULT 0,
  unit         text,
  due_date     date,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','achieved','cancelled','paused')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
SELECT attach_updated_at('goals');
CREATE INDEX IF NOT EXISTS idx_goals_company ON goals(company_id);
CREATE INDEX IF NOT EXISTS idx_goals_owner   ON goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_goals_status  ON goals(status);


-- ═════════════════════════════════════════════════════════════════════════════
-- 15. USER INTEGRATION TOKENS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE user_integration_tokens (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL,      -- 'notion' | 'google' | 'slack' | etc.
  provider_account text,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text[],
  extra_json       jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, provider_account)
);
SELECT attach_updated_at('user_integration_tokens');
CREATE INDEX IF NOT EXISTS idx_integration_tokens_user ON user_integration_tokens(user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 16. GENERIC COMMENTS (universal comments table for all entities)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity       text NOT NULL,
  entity_id    text NOT NULL,
  author_id    text NOT NULL,
  author_name  text NOT NULL DEFAULT '',
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — SKIPPED
-- ═════════════════════════════════════════════════════════════════════════════
-- This app uses Clerk for auth, not Supabase Auth. The Netlify functions
-- connect via the service_role key which bypasses RLS. Auth checks happen
-- in _auth.js at the function layer. RLS policies removed to avoid errors.
