-- Adds post_url to the social `posts` table so imported/existing posts can link
-- out to the live post (Existing Content cards render an "Open in <platform>"
-- button when post_url is set). Safe to re-run.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_url text;
