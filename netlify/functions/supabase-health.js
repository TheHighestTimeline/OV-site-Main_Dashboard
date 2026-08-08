// netlify/functions/supabase-health.js
// Which Supabase project are the functions ACTUALLY talking to, and which of
// this repo's tables can they see? Requires Clerk auth. Safe to call from
// Settings, and mirrors the existing airtable-health.js.
//
// ─── Why this exists ─────────────────────────────────────────────────────────
// PostgREST answers a query against a table it cannot see with
//   "Could not find the table 'public.coo_events' in the schema cache"
// and that ONE message covers three completely different situations:
//
//   1. the migration was never run
//   2. it was run, but PostgREST's schema cache is stale
//   3. it was run against a DIFFERENT Supabase project than SUPABASE_URL points at
//
// Case 3 is the nasty one, because every check you can do from the dashboard
// says the table exists — you are just looking at a different database than the
// app is. There was no way to tell the three apart from inside the app, so the
// only debugging loop available was "re-run the migration and reload", which
// cannot possibly fix 2 or 3. This endpoint ends that loop by reporting the
// project ref the functions are bound to, so it can be compared against the
// dashboard URL in one glance.
//
// ─── What it does NOT return ─────────────────────────────────────────────────
// No keys, ever — only booleans for whether they are set. The project host is
// reported because it is not a secret (it is the public API origin); the service
// role key is, and it never leaves this process.

import { requireAuth } from './_auth.js';
import { corsFor } from './_http.js';
import { getSupabase } from './_supabase.js';

// Table → the file in this repo that creates it. Same map as _supabase.js's
// TABLE_SOURCE, plus the coo_* set, so the report can name the fix per table.
const EXPECTED = [
  { table: 'app_state',            file: 'supabase-app-state-schema.sql' },
  { table: 'call_reviews',         file: 'supabase-call-reviews-schema.sql' },
  { table: 'usage_events',         file: 'supabase-usage-events-schema.sql' },
  { table: 'audit_log',            file: 'audit-log-schema.sql' },
  { table: 'audio_logs',           file: 'supabase-audio-logs-schema.sql' },
  { table: 'bookings',             file: 'supabase-booking-schema.sql' },
  { table: 'client_platforms',     file: 'supabase-clients-platform-schema.sql' },
  { table: 'user_google_accounts', file: 'supabase-multi-account-schema.sql' },
  { table: 'coo_events',           file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_threads',          file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_messages',         file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_identities',       file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_signals',          file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_briefs',           file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_stage_events',     file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_sync_state',       file: 'migrations/0002_coo_threads_schema.sql' },
  { table: 'coo_workstream_digests', file: 'migrations/0002_coo_threads_schema.sql' },
];

/** The project ref out of https://<ref>.supabase.co — identifies the database. */
function projectRef(url) {
  try { return new URL(url).hostname.split('.')[0]; }
catch { return null; }
}

export const handler = async (event) => {
  const CORS = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const url = process.env.SUPABASE_URL || '';
  const report = {
    env: {
      SUPABASE_URL_set:               Boolean(url),
      SUPABASE_SERVICE_ROLE_KEY_set:  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    // THE line to compare against your dashboard URL
    // (https://supabase.com/dashboard/project/<ref>). If these two refs differ,
    // the migration went to a different database than the app reads.
    projectRef: projectRef(url),
    host: (() => { try { return new URL(url).host; } catch { return null; } })(),
    tables: [],
    missing: [],
    summary: '',
  };

  if (!report.env.SUPABASE_URL_set || !report.env.SUPABASE_SERVICE_ROLE_KEY_set) {
    report.summary = 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.';
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(report) };
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    report.summary = e.message;
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(report) };
  }

  // A HEAD count with limit 0 is the cheapest possible "can PostgREST see this
  // table" probe: no rows cross the wire, and a missing table still errors.
  for (const { table, file } of EXPECTED) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(0);
      if (error) {
        report.tables.push({ table, visible: false, file, error: error.message });
        report.missing.push({ table, file });
      } else {
        report.tables.push({ table, visible: true });
      }
    } catch (e) {
      report.tables.push({ table, visible: false, file, error: e.message });
      report.missing.push({ table, file });
    }
  }

  const files = [...new Set(report.missing.map(m => m.file))];
  report.summary = report.missing.length === 0
    ? `All ${report.tables.length} tables visible on project ${report.projectRef}.`
    : `${report.missing.length} of ${report.tables.length} tables not visible on project ${report.projectRef}. ` +
      `Unrun migrations would be: ${files.join(', ')}. ` +
      'If you have already run those, you ran them against a different project — compare this project ref with your Supabase dashboard URL.';

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(report, null, 2),
  };
};
