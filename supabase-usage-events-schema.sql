-- ─────────────────────────────────────────────────────────────────────────────
-- OVMG Dashboard — usage_events schema (Phase 14)
-- Stores per-call AI usage so the Cost Transparency Dashboard can aggregate.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists usage_events (
  id                bigserial primary key,
  occurred_at       timestamptz default now(),
  user_id           text,
  service           text not null,           -- 'anthropic' | 'openai' | 'google' | 'netlify' | etc.
  surface           text default '',         -- where in the dashboard ('social-ai-campaign' | 'voice-parse' | 'ncnda-send' | ...)
  operation         text,                    -- 'messages' | 'chat.completions' | 'function_call'
  model             text,                    -- nullable; for AI calls
  input_tokens      int default 0,
  output_tokens     int default 0,
  estimated_cost_usd numeric default 0,
  metadata          jsonb default '{}'::jsonb
);

create index if not exists usage_events_occurred_idx on usage_events(occurred_at desc);
create index if not exists usage_events_service_idx  on usage_events(service, occurred_at desc);
create index if not exists usage_events_user_idx     on usage_events(user_id, occurred_at desc);

alter table usage_events enable row level security;
