// netlify/functions/airtable-health.js
// Checks Airtable integration health: env vars, base access, table presence.
// Requires Clerk auth. Safe to call from the Settings page.
// Optional body: { testWrite: true } to also test write+delete on a live table.

import { requireAuth } from './_auth.js';
import { corsFor } from './_notion.js';

// ── Required core env vars ────────────────────────────────────────────────────
const REQUIRED_CORE = ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID'];

// ── Table env vars — required for tables the app actively uses ────────────────
// Key = env var name; Value = default table name used if env var not set.
const REQUIRED_TABLE_VARS = {
  AIRTABLE_TABLE_CONTACTS:      'CRM Contacts',
  AIRTABLE_TABLE_TASKS:         'Master Action Board',
  AIRTABLE_TABLE_OPPORTUNITIES: 'Opportunities',
  AIRTABLE_TABLE_COMPANIES:     'Companies',
  AIRTABLE_TABLE_NOTES:         'Notes',
  AIRTABLE_TABLE_OUTREACH:      'Outreach',
  AIRTABLE_TABLE_GOALS:         'Goals',
  AIRTABLE_TABLE_FINANCIAL:     'Financial',
};

// ── Optional table env vars — not blocking but reported ──────────────────────
const OPTIONAL_TABLE_VARS = {
  AIRTABLE_TABLE_PROJECTS:          'Projects',
  AIRTABLE_TABLE_TIMELINE:          'Project Timeline',
  AIRTABLE_TABLE_CLIENT_POSTS:      'Client Posts',
  AIRTABLE_TABLE_CLIENTS:           'OVM Clients DB',
  AIRTABLE_TABLE_REFERENCE_LIBRARY: 'Reference Library',
  AIRTABLE_TABLE_ASSET_LIBRARY:     'Source Asset Library',
};

const AT_BASE = 'https://api.airtable.com/v0';

async function atFetch(path, token) {
  try {
    const res = await fetch(`https://api.airtable.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: {}, error: e.message };
  }
}

export const handler = async (event) => {
  const cors = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  let testWrite = false;
  try {
    testWrite = JSON.parse(event.body || '{}').testWrite === true;
  } catch {}

  const report = {
    timestamp:      new Date().toISOString(),
    env:            {},
    base:           null,
    tables:         {},
    optionalTables: {},
    missing:        { envVars: [], tables: [] },
    writeTest:      null,
    ready:          false,
    summary:        '',
  };

  // ── 1. Check env vars ────────────────────────────────────────────────────────
  for (const key of REQUIRED_CORE) {
    const present = !!process.env[key];
    report.env[key] = present;
    if (!present) report.missing.envVars.push(key);
  }
  for (const key of Object.keys(REQUIRED_TABLE_VARS)) {
    const present = !!process.env[key];
    report.env[key] = present;
    if (!present) report.missing.envVars.push(key);
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    report.summary = 'Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID — cannot proceed.';
    return respond(200, report, cors);
  }

  // ── 2. Check base access ────────────────────────────────────────────────────
  const baseRes = await atFetch(`/v0/meta/bases/${baseId}`, token);
  report.base = {
    status: baseRes.status,
    ok:     baseRes.ok,
    id:     baseId,
    name:   baseRes.data?.name || null,
    error:  baseRes.ok ? null : (baseRes.data?.error?.message || `HTTP ${baseRes.status}`),
  };

  if (!baseRes.ok) {
    report.summary = `Cannot reach Airtable base (${baseRes.status}). Check AIRTABLE_BASE_ID and token permissions.`;
    return respond(200, report, cors);
  }

  // ── 3. Fetch table list ─────────────────────────────────────────────────────
  const tablesRes = await atFetch(`/v0/meta/bases/${baseId}/tables`, token);
  const tableList = tablesRes.data?.tables || [];

  // Build lookup: lowercase name → table object
  const byName = new Map(tableList.map(t => [t.name.toLowerCase(), t]));
  const byId   = new Map(tableList.map(t => [t.id, t]));

  function tableExists(nameOrId) {
    if (!nameOrId) return false;
    return byId.has(nameOrId) || byName.has(nameOrId.toLowerCase());
  }

  // ── 4. Check required tables ────────────────────────────────────────────────
  for (const [envKey, defaultName] of Object.entries(REQUIRED_TABLE_VARS)) {
    const ref   = process.env[envKey] || defaultName;
    const found = tableExists(ref);
    report.tables[envKey] = { envVar: envKey, configured: ref, found };
    if (!found) report.missing.tables.push(ref);
  }

  // ── 5. Check optional tables ────────────────────────────────────────────────
  for (const [envKey, defaultName] of Object.entries(OPTIONAL_TABLE_VARS)) {
    const ref = process.env[envKey] || defaultName;
    report.optionalTables[envKey] = { configured: ref, found: tableExists(ref) };
  }

  // ── 6. Optional write test ──────────────────────────────────────────────────
  // Creates a test record in Master Action Board then immediately deletes it.
  // Only runs when the caller explicitly passes { testWrite: true }.
  if (testWrite) {
    const testTable = process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board';
    try {
      const createRes = await fetch(
        `${AT_BASE}/${baseId}/${encodeURIComponent(testTable)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { 'Task Name': '__airtable_health_check__ (auto-deleted)' },
            typecast: true,
          }),
        }
      );
      const created = await createRes.json().catch(() => ({}));

      if (createRes.ok && created.id) {
        // Clean up immediately
        await fetch(
          `${AT_BASE}/${baseId}/${encodeURIComponent(testTable)}/${created.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
        report.writeTest = { ok: true, table: testTable, recordId: created.id, deleted: true };
      } else {
        report.writeTest = {
          ok: false,
          table: testTable,
          error: created?.error?.message || `HTTP ${createRes.status}`,
        };
      }
    } catch (e) {
      report.writeTest = { ok: false, error: e.message };
    }
  }

  // ── 7. Overall readiness ────────────────────────────────────────────────────
  report.ready = (
    report.missing.envVars.length === 0 &&
    report.missing.tables.length === 0 &&
    report.base.ok
  );

  const missingCount = report.missing.envVars.length + report.missing.tables.length;
  if (report.ready) {
    report.summary = `All checks passed. Base "${report.base.name}" is accessible and all required tables are present.`;
  } else {
    report.summary = `${missingCount} issue(s) found: ${[
      ...report.missing.envVars.map(v => `missing env var ${v}`),
      ...report.missing.tables.map(t => `table "${t}" not found`),
    ].join('; ')}`;
  }

  return respond(200, report, cors);
};

function respond(code, body, headers) {
  return {
    statusCode: code,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  };
}
