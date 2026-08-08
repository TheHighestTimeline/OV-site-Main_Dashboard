// Shared Supabase client used by all functions (Phase 7+).
//
// Uses the SERVICE ROLE key — bypasses Row-Level Security. This is fine
// because every endpoint that imports this is gated by requireAuth /
// requireAdmin, so the gate happens at the Netlify-function layer, not at
// the database layer.
//
// Never expose the service role key to the browser. The frontend talks to
// the dashboard's Netlify functions, never to Supabase directly.
//
// Required Netlify env vars:
//   SUPABASE_URL                — e.g. https://<your-project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — the secret service-role JWT (NOT the anon key)
//
// Optional: SUPABASE_ANON_KEY if you ever want a client-side Supabase client
// for things like realtime subscriptions (not used in Phase 7).

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Belt-and-suspenders for the Node 18 WebSocket crash (see netlify.toml).
// @supabase/realtime-js throws "Node.js 18 detected without native WebSocket
// support" inside its RealtimeClient constructor — and supabase-js constructs
// that client eagerly in createClient(), even when realtime is never used.
// Node 22 ships a native global WebSocket so this is normally undefined, but if
// a function ever runs on an older runtime we hand realtime-js the `ws` polyfill
// so client construction can never crash a request again.
const WS_TRANSPORT = typeof WebSocket === 'undefined' ? ws : undefined;

let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in Netlify environment variables. See supabase-schema-phase-7.sql ' +
      'in the repo root for setup instructions.',
    );
  }

  _supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      autoConnect: false,
      ...(WS_TRANSPORT ? { transport: WS_TRANSPORT } : {}),
    },
  });
  return _supabase;
}

// ── Missing-table errors, translated into instructions ──────────────────────
//
// PostgREST answers a query against a table it cannot see with
//   "Could not find the table 'public.call_reviews' in the schema cache"
// which surfaces in the UI as a toast nobody can act on.
//
// This maps the table name back to the file that creates it. Worth having
// because the schema is spread across a dozen .sql files at the repo root plus
// migrations/, and there is no record of which have been applied — the only way
// anyone finds out is by hitting this error.
//
// BUT THE MESSAGE MUST NOT CLAIM THE MIGRATION IS UNRUN. It said exactly that
// for a while, and it cost real time: the wording is PostgREST's SCHEMA CACHE
// error, and that one string covers three different situations —
//
//   1. the migration was never run
//   2. it was run, but PostgREST's cached schema is stale
//   3. it was run against a DIFFERENT Supabase project than SUPABASE_URL points at
//
// Only the first is fixed by running the file. Told "run the migration", someone
// hitting 2 or 3 runs it, sees "Success", reloads, gets the identical error, and
// has no way to tell they are in a different case — because from the dashboard,
// the table plainly exists. Name all three and point at supabase-health, which
// reports the project ref the functions are actually bound to.
const TABLE_SOURCE = {
  call_reviews:         'supabase-call-reviews-schema.sql',
  usage_events:         'supabase-usage-events-schema.sql',
  audit_log:            'audit-log-schema.sql',
  app_state:            'supabase-app-state-schema.sql',
  audio_logs:           'supabase-audio-logs-schema.sql',
  audio_log_items:      'supabase-audio-logs-schema.sql',
  booking_pages:        'supabase-booking-schema.sql',
  bookings:             'supabase-booking-schema.sql',
  client_platforms:     'supabase-clients-platform-schema.sql',
  user_google_accounts: 'supabase-multi-account-schema.sql',
};

/**
 * Turn a Supabase/PostgREST error into something a human can act on.
 * Pass anything: an Error, a PostgrestError, or a string. Returns a message.
 */
export function explainSupabaseError(e) {
  const raw = typeof e === 'string' ? e : (e?.message || String(e || 'Unknown error'));

  const missing = raw.match(/Could not find the table '(?:public\.)?(\w+)'/i);
  if (missing) {
    const table = missing[1];
    // Every coo_* table ships in one migration, so name it rather than listing
    // nine separate entries above.
    const file = table.startsWith('coo_')
      ? 'migrations/0002_coo_threads_schema.sql'
      : TABLE_SOURCE[table];

    const where = file
      ? `Run ${file} in the Supabase SQL editor (it is additive and safe to re-run).`
      : 'Find the migration that creates it and run it in the Supabase SQL editor.';

    return `Supabase cannot see the "${table}" table. Three things cause this: ` +
      `(1) the migration was never run — ${where} ` +
      "(2) it was run but PostgREST's schema cache is stale — run: notify pgrst, 'reload schema'; " +
      '(3) it was run against a different Supabase project than this app reads. ' +
      'Settings → Supabase health shows which project ref the app is bound to — ' +
      'compare it with your Supabase dashboard URL.';
  }

  if (/schema cache/i.test(raw)) {
    return `${raw} — the migration may be unrun, the schema cache may be stale ` +
      "(notify pgrst, 'reload schema';), or the app may be pointed at a different Supabase project. " +
      'Check Settings → Supabase health.';
  }

  return raw;
}
