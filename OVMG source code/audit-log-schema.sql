-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — Audit log table (Phase 7 audit fix H-6)
--
-- Paste into Supabase SQL Editor and run. Safe to re-run.
-- Requires the Phase 7 schema (resources / resource_categories) to be in place.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz default now(),
  actor_user_id   text,                      -- Clerk user id of the actor
  actor_email     text,                      -- denormalized for easy reading
  action          text not null,             -- e.g. 'role.change', 'tool_override.grant'
  target_user_id  text,                      -- the affected user (for user-targeted actions)
  target_email    text,
  meta            jsonb default '{}'::jsonb, -- before/after, reason, etc.
  ip              text,                      -- request IP if available
  user_agent      text
);

create index if not exists audit_log_occurred_at_idx on audit_log(occurred_at desc);
create index if not exists audit_log_actor_idx       on audit_log(actor_user_id, occurred_at desc);
create index if not exists audit_log_target_idx      on audit_log(target_user_id, occurred_at desc);
create index if not exists audit_log_action_idx      on audit_log(action, occurred_at desc);

-- RLS — locked to service-role only. The Cost Transparency Dashboard (Phase 14)
-- will surface this to admins via a Netlify function, not direct queries.
alter table audit_log enable row level security;
-- (no policies = denied for anon/authenticated; service_role bypasses RLS)
