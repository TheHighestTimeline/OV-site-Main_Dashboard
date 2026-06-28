-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — generic app_state key/value store
-- Backs Drive files, Drive templates, and company kanban boards (and any future
-- "just persist this JSON" feature). Run once in the Supabase SQL Editor.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_state (
  state_key   text primary key,        -- e.g. 'drive:ovmg', 'drive_templates:ovmg', 'kanban:ovm'
  data        jsonb,                    -- arbitrary JSON payload
  updated_at  timestamptz default now()
);

-- Enable RLS (Netlify functions use the service-role key, which bypasses it).
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
