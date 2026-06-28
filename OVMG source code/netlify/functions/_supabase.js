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
