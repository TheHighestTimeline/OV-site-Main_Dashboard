-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — fix missing owner_user_id column on booking_pages
-- Run this in Supabase SQL Editor if you see
-- "column booking_pages.owner_user_id does not exist".
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE booking_pages ADD COLUMN IF NOT EXISTS owner_user_id text;

CREATE INDEX IF NOT EXISTS booking_pages_owner_idx ON booking_pages(owner_user_id);
