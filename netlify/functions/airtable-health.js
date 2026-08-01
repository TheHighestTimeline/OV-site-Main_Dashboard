// netlify/functions/airtable-health.js
// Airtable connection doctor. Answers, in one call, the only question that
// matters when the CRM renders empty: *which* layer is broken — the token, the
// base grant, or a single table?
//
// Admin-only (it reports env-var presence and table names, and the optional
// write test touches the live Master Action Board).
// Optional body: { testWrite: true } to also test write+delete on a live table.

import { requireAdmin } from './_auth.js';
import { corsFor } from './_http.js';

// ── Required core env vars ────────────────────────────────────────────────────
const REQUIRED_CORE = ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID'];

// ── Tables the app actively reads/writes ──────────────────────────────────────
// Key = env var name; Value = default table name used when the env var is unset.
// Leaving one of these env vars unset is NOT a failure — every function falls
// back to the default name below, so the fallback is the supported setup. Only
// a table that cannot actually be read is a failure.
const REQUIRED_TABLE_VARS = {
  AIRTABLE_TABLE_CONTACTS:      'CRM Contacts',
  AIRTABLE_TABLE_TASKS:         'Master Action Board',
  AIRTABLE_TABLE_OPPORTUNITIES: 'Opportunities',
  AIRTABLE_TABLE_COMPANIES:     'Companies',
  AIRTABLE_TABLE_ACTIVITIES:    'Activities',   // notes live here — there is no 'Notes' table
  AIRTABLE_TABLE_PROJECTS:      'Projects',
  AIRTABLE_TABLE_DOCUMENTS:     'Documents',
  AIRTABLE_TABLE_FOLDERS:       'Folders',
  AIRTABLE_TABLE_OUTREACH:      'Outreach',
  AIRTABLE_TABLE_GOALS:         'Goals',
  AIRTABLE_TABLE_FINANCIAL:     'Financial',
};

// ── Optional table env vars — not blocking but reported ──────────────────────
const OPTIONAL_TABLE_VARS = {
  AIRTABLE_TABLE_CLIENTS:           'OVM Clients DB',
  AIRTABLE_TABLE_AMPLIFY_PROJECTS:  'Amplify Projects',
  AIRTABLE_TABLE_TIMELINE:          'Project Timeline',
  AIRTABLE_TABLE_CLIENT_POSTS:      'Client Posts',
  AIRTABLE_TABLE_REFERENCE_LIBRARY: 'Reference Library',
  AIRTABLE_TABLE_ASSET_LIBRARY:     'Source Asset Library',
  AIRTABLE_TABLE_EMAIL_STATE:       'Email State',
};

// Primary (first) field of each table, used by the write test.
const PRIMARY_FIELD = { AIRTABLE_TABLE_TASKS: 'Action Name' };

const AT_BASE = 'https://api.airtable.com/v0';

// ── Turn an Airtable HTTP status into a cause a human can act on ─────────────
// This is the whole point of the endpoint: a 401 and a 403 look identical in
// the UI (empty table) but need completely different fixes.
function explain(status, apiMessage, ctx = {}) {
  const base = ctx.baseId ? `base ${ctx.baseId}` : 'the base';
  switch (status) {
    case 401:
      return 'AIRTABLE_TOKEN is invalid, revoked, or expired. Create a new personal access token at airtable.com/create/tokens and update the Netlify env var.';
    case 403:
      return `The token is valid but is not authorised for ${base}${ctx.table ? ` / table "${ctx.table}"` : ''}. Open the token at airtable.com/create/tokens and confirm (a) the base is listed under Access, and (b) the scopes data.records:read, data.records:write and schema.bases:read are all ticked. A token scoped to a whole workspace loses access when the base is moved to a different workspace — which is exactly what a plan upgrade or workspace migration does.`;
    case 404:
      return ctx.table
        ? `Table "${ctx.table}" does not exist in ${base} (or the token cannot see it). Check the table name, or set the matching AIRTABLE_TABLE_* env var to its tbl… ID.`
        : `${base} was not found. Check AIRTABLE_BASE_ID — it is the app… segment of the base URL.`;
    case 422:
      return `Airtable rejected the request as malformed: ${apiMessage}. Usually a renamed field or a bad view name.`;
    case 429:
      return 'Rate limited by Airtable (5 requests/second/base). Transient — retry.';
    case 0:
      return `Could not reach api.airtable.com at all: ${apiMessage}`;
    default:
      return apiMessage || `HTTP ${status}`;
  }
}

async function atFetch(path, token) {
  try {
    const res  = await fetch(`https://api.airtable.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: {}, error: e.message };
  }
}

// Live read probe — the only check that actually proves the app can pull rows.
// Schema metadata can succeed while record reads fail (different scope), so we
// hit the records endpoint the real functions use.
async function probeTable(baseId, token, tableRef) {
  const res = await atFetch(
    `/v0/${baseId}/${encodeURIComponent(tableRef)}?maxRecords=1`,
    token
  );
  if (res.ok) {
    return { ok: true, status: 200, sampleRecords: (res.data?.records || []).length };
  }
  const apiMsg = res.data?.error?.message || res.data?.error?.type || res.error || `HTTP ${res.status}`;
  return {
    ok:     false,
    status: res.status,
    error:  apiMsg,
    cause:  explain(res.status, apiMsg, { baseId, table: tableRef }),
  };
}

export const handler = async (event) => {
  const cors = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const authErr = await requireAdmin(event);
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
    usingDefaults:  [],
    writeTest:      null,
    ready:          false,
    summary:        '',
  };

  // ── 1. Check env vars ──────────────────────────────────────────────────────
  // Only the two core vars are mandatory. Table vars are optional overrides.
  for (const key of REQUIRED_CORE) {
    const present = !!process.env[key];
    report.env[key] = present;
    if (!present) report.missing.envVars.push(key);
  }
  for (const key of Object.keys({ ...REQUIRED_TABLE_VARS, ...OPTIONAL_TABLE_VARS })) {
    const present = !!process.env[key];
    report.env[key] = present;
    if (!present) report.usingDefaults.push(key);
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    report.summary = `Missing ${report.missing.envVars.join(' and ')} in the Netlify environment — no Airtable call can succeed. Add them under Site configuration → Environment variables, then redeploy (env changes only take effect on a new deploy).`;
    return respond(200, report, cors);
  }

  // Cheap shape check — catches a pasted-wrong value before blaming Airtable.
  if (!/^pat[A-Za-z0-9]/.test(token)) {
    report.env.AIRTABLE_TOKEN_FORMAT =
      'Does not start with "pat" — legacy Airtable API keys (key…) were switched off in Feb 2024 and always return 401. Replace it with a personal access token.';
  }
  if (!/^app[A-Za-z0-9]{14}$/.test(baseId)) {
    report.env.AIRTABLE_BASE_ID_FORMAT =
      `"${baseId}" is not a valid base ID. It must be the 17-character app… segment of the base URL.`;
  }

  // ── 2. Check base access ───────────────────────────────────────────────────
  const baseRes = await atFetch(`/v0/meta/bases/${baseId}/tables`, token);
  const baseApiMsg = baseRes.data?.error?.message || baseRes.data?.error?.type || baseRes.error || `HTTP ${baseRes.status}`;
  report.base = {
    status: baseRes.status,
    ok:     baseRes.ok,
    id:     baseId,
    error:  baseRes.ok ? null : baseApiMsg,
    cause:  baseRes.ok ? null : explain(baseRes.status, baseApiMsg, { baseId }),
  };

  if (!baseRes.ok) {
    report.summary = `Cannot reach Airtable base ${baseId} (HTTP ${baseRes.status}). ${report.base.cause}`;
    return respond(200, report, cors);
  }

  // ── 3. Table list from base metadata ───────────────────────────────────────
  const tableList = baseRes.data?.tables || [];
  const byName = new Map(tableList.map(t => [t.name.toLowerCase(), t]));
  const byId   = new Map(tableList.map(t => [t.id, t]));
  const findTable = (ref) => (ref ? (byId.get(ref) || byName.get(ref.toLowerCase()) || null) : null);

  report.base.name       = null; // /meta/bases/{id}/tables does not return the base name
  report.base.tableCount = tableList.length;

  // ── 4. Required tables — exist in schema AND readable via the records API ──
  const requiredEntries = Object.entries(REQUIRED_TABLE_VARS);
  const probes = await Promise.all(
    requiredEntries.map(([envKey, defaultName]) =>
      probeTable(baseId, token, process.env[envKey] || defaultName)
    )
  );

  requiredEntries.forEach(([envKey, defaultName], i) => {
    const ref   = process.env[envKey] || defaultName;
    const found = !!findTable(ref);
    const probe = probes[i];
    report.tables[envKey] = {
      envVar:      envKey,
      configured:  ref,
      source:      process.env[envKey] ? 'env' : 'default',
      foundInSchema: found,
      readable:    probe.ok,
      status:      probe.status,
      records:     probe.ok ? probe.sampleRecords : null,
      error:       probe.ok ? null : probe.error,
      cause:       probe.ok ? null : probe.cause,
    };
    if (!probe.ok) report.missing.tables.push(ref);
  });

  // ── 5. Optional tables — reported, never blocking ──────────────────────────
  for (const [envKey, defaultName] of Object.entries(OPTIONAL_TABLE_VARS)) {
    const ref = process.env[envKey] || defaultName;
    report.optionalTables[envKey] = { configured: ref, foundInSchema: !!findTable(ref) };
  }

  // ── 6. Optional write test ─────────────────────────────────────────────────
  // Creates a test record in Master Action Board then immediately deletes it.
  // Proves the token carries data.records:write, not just read.
  if (testWrite) {
    const testTable    = process.env.AIRTABLE_TABLE_TASKS || REQUIRED_TABLE_VARS.AIRTABLE_TABLE_TASKS;
    const primaryField = PRIMARY_FIELD.AIRTABLE_TABLE_TASKS;
    try {
      const createRes = await fetch(
        `${AT_BASE}/${baseId}/${encodeURIComponent(testTable)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { [primaryField]: '__airtable_health_check__ (auto-deleted)' },
            typecast: true,
          }),
        }
      );
      const created = await createRes.json().catch(() => ({}));

      if (createRes.ok && created.id) {
        // Clean up immediately
        const delRes = await fetch(
          `${AT_BASE}/${baseId}/${encodeURIComponent(testTable)}/${created.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
        report.writeTest = {
          ok: true, table: testTable, recordId: created.id, deleted: delRes.ok,
          ...(delRes.ok ? {} : { warning: `Test record ${created.id} could not be deleted — remove it manually from ${testTable}.` }),
        };
      } else {
        const apiMsg = created?.error?.message || created?.error?.type || `HTTP ${createRes.status}`;
        report.writeTest = {
          ok:    false,
          table: testTable,
          field: primaryField,
          error: apiMsg,
          cause: explain(createRes.status, apiMsg, { baseId, table: testTable }),
        };
      }
    } catch (e) {
      report.writeTest = { ok: false, error: e.message, cause: explain(0, e.message) };
    }
  }

  // ── 7. Overall readiness ───────────────────────────────────────────────────
  const unreadable = Object.values(report.tables).filter(t => !t.readable);
  report.ready = report.base.ok && unreadable.length === 0;

  if (report.ready) {
    const total = Object.keys(report.tables).length;
    report.summary = `Connected. Base ${baseId} is reachable and all ${total} required tables are readable.`;
  } else {
    // Every table failing the same way means the problem is the token/base
    // grant, not the tables — say so instead of listing 11 identical errors.
    const statuses = new Set(unreadable.map(t => t.status));
    if (unreadable.length === Object.keys(report.tables).length && statuses.size === 1) {
      report.summary = `Every table failed with HTTP ${[...statuses][0]} — this is a token/base-access problem, not a table problem. ${unreadable[0].cause}`;
    } else {
      report.summary = `${unreadable.length} table(s) unreadable: ${unreadable
        .map(t => `"${t.configured}" (HTTP ${t.status})`)
        .join('; ')}`;
    }
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
