-- Adds edit_url to playbook_links so each playbook can have a separate
-- "Edit in Notion" URL (notion.so) distinct from the iframe display URL
-- (gusty-print.notion.site). Safe to re-run.
ALTER TABLE playbook_links ADD COLUMN IF NOT EXISTS edit_url text;
