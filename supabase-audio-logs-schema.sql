-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — audio_logs table schema (safe to re-run)
-- Run this in Supabase SQL Editor if you see "column audio_url does not exist"
-- or "column kind does not exist" errors.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the table if it was never created (first-time setup)
CREATE TABLE IF NOT EXISTS audio_logs (
  id          uuid primary key default gen_random_uuid(),
  kind        text,                     -- 'senior_partner' | 'employee'
  transcript  text,
  status      text default 'pending_review',  -- pending_review | reviewed | imported
  audio_url   text,                     -- reserved for future use (set to null for now)
  duration_s  int,                      -- recording duration in seconds
  user_id     text,                     -- Clerk user id
  user_name   text,                     -- display name at time of recording
  review_notes text,
  created_at  timestamptz default now()
);

-- Add any missing columns to an existing table (safe on a fresh table too)
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS kind        text;
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS audio_url   text;
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS duration_s  int;
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS user_name   text;
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS review_notes text;
ALTER TABLE audio_logs ADD COLUMN IF NOT EXISTS file_name   text;

-- file_name was created NOT NULL on the live DB but we no longer store raw
-- audio (founders drop transcripts). Drop the constraint so transcript-only
-- logs save cleanly; the create function still supplies a synthetic name.
ALTER TABLE audio_logs ALTER COLUMN file_name DROP NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS audio_logs_kind_idx   ON audio_logs(kind);
CREATE INDEX IF NOT EXISTS audio_logs_status_idx ON audio_logs(status);
CREATE INDEX IF NOT EXISTS audio_logs_user_idx   ON audio_logs(user_id);
CREATE INDEX IF NOT EXISTS audio_logs_date_idx   ON audio_logs(created_at);

-- Enable RLS (service-role key used by Netlify functions bypasses it)
ALTER TABLE audio_logs ENABLE ROW LEVEL SECURITY;
