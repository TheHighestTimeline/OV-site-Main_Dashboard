#!/usr/bin/env node
/**
 * Airtable connection doctor (CLI).
 *
 * Same checks as the in-app Settings → Airtable connection panel, but runnable
 * without signing in — useful when you want to test a token before pasting it
 * into Netlify, or to confirm whether the problem is the token or the deploy.
 *
 *   # against whatever is in your shell / .env
 *   node scripts/airtable-doctor.mjs
 *
 *   # against the live Netlify environment (pulls the real deployed values)
 *   netlify env:import /dev/null >/dev/null 2>&1; netlify dev:exec node scripts/airtable-doctor.mjs
 *
 *   # against a token you are about to install
 *   AIRTABLE_TOKEN=patXXX AIRTABLE_BASE_ID=appXXX node scripts/airtable-doctor.mjs
 *
 * Exits 0 when everything is readable, 1 otherwise — safe to use in CI.
 */

import { readFileSync } from 'node:fs';

// ── Load .env / .env.local if present (no dependency on dotenv) ──────────────
for (const file of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key]) continue; // real env wins
      process.env[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  } catch { /* file absent — fine */ }
}

const REQUIRED_TABLES = {
  AIRTABLE_TABLE_CONTACTS:      'CRM Contacts',
  AIRTABLE_TABLE_TASKS:         'Master Action Board',
  AIRTABLE_TABLE_OPPORTUNITIES: 'Opportunities',
  AIRTABLE_TABLE_COMPANIES:     'Companies',
  AIRTABLE_TABLE_ACTIVITIES:    'Activities',
  AIRTABLE_TABLE_PROJECTS:      'Projects',
  AIRTABLE_TABLE_DOCUMENTS:     'Documents',
  AIRTABLE_TABLE_FOLDERS:       'Folders',
  AIRTABLE_TABLE_OUTREACH:      'Outreach',
  AIRTABLE_TABLE_GOALS:         'Goals',
  AIRTABLE_TABLE_FINANCIAL:     'Financial',
};

const OK   = '\x1b[32m✔\x1b[0m';
const BAD  = '\x1b[31m✖\x1b[0m';
const DIM  = s => `\x1b[2m${s}\x1b[0m`;
const BOLD = s => `\x1b[1m${s}\x1b[0m`;

function explain(status, apiMessage, ctx = {}) {
  const base = ctx.baseId ? `base ${ctx.baseId}` : 'the base';
  switch (status) {
    case 401:
      return 'AIRTABLE_TOKEN is invalid, revoked, or expired.\n     Fix: create a new token at https://airtable.com/create/tokens and update the Netlify env var.';
    case 403:
      return `The token is valid but is not authorised for ${base}${ctx.table ? ` / table "${ctx.table}"` : ''}.\n     Fix: open the token at https://airtable.com/create/tokens and confirm the base is listed under Access,\n     with scopes data.records:read, data.records:write and schema.bases:read.\n     Note: a token granted at WORKSPACE level loses access when the base moves to another workspace —\n     which is what a plan upgrade or workspace migration does.`;
    case 404:
      return ctx.table
        ? `Table "${ctx.table}" does not exist in ${base} (or the token cannot see it).\n     Fix: check the name, or set ${ctx.envKey || 'the matching AIRTABLE_TABLE_* var'} to the tbl… ID.`
        : `${base} was not found.\n     Fix: AIRTABLE_BASE_ID must be the app… segment of the base URL.`;
    case 429:
      return 'Rate limited by Airtable (5 req/s/base). Transient — retry.';
    case 0:
      return `Could not reach api.airtable.com at all: ${apiMessage}`;
    default:
      return apiMessage || `HTTP ${status}`;
  }
}

async function at(path, token) {
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

const msgOf = r => r.data?.error?.message || r.data?.error?.type || r.error || `HTTP ${r.status}`;

const token  = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;

console.log(BOLD('\nAirtable connection doctor\n'));

// ── 1. Credentials present and well-formed ───────────────────────────────────
if (!token || !baseId) {
  console.log(`${BAD} Missing ${[!token && 'AIRTABLE_TOKEN', !baseId && 'AIRTABLE_BASE_ID'].filter(Boolean).join(' and ')}`);
  console.log(DIM('     Set them in Netlify → Site configuration → Environment variables, then redeploy.'));
  console.log(DIM('     Env-var changes do NOT apply to an existing deploy — a new build is required.\n'));
  process.exit(1);
}
console.log(`${OK} AIRTABLE_TOKEN present ${DIM(`(${token.slice(0, 7)}…${token.slice(-4)})`)}`);
console.log(`${OK} AIRTABLE_BASE_ID present ${DIM(`(${baseId})`)}`);

if (!/^pat[A-Za-z0-9]/.test(token)) {
  console.log(`${BAD} Token does not start with "pat" — legacy API keys (key…) were switched off in Feb 2024 and always 401.`);
}
if (!/^app[A-Za-z0-9]{14}$/.test(baseId)) {
  console.log(`${BAD} "${baseId}" is not a valid base ID (expected 17 chars starting with "app").`);
}

// ── 2. Base reachable ────────────────────────────────────────────────────────
const meta = await at(`/v0/meta/bases/${baseId}/tables`, token);
if (!meta.ok) {
  console.log(`${BAD} Cannot read base metadata — HTTP ${meta.status}`);
  console.log(DIM(`     ${explain(meta.status, msgOf(meta), { baseId })}\n`));
  process.exit(1);
}
const tableNames = (meta.data.tables || []).map(t => t.name);
console.log(`${OK} Base reachable ${DIM(`(${tableNames.length} tables visible to this token)`)}`);

// ── 3. Every required table readable through the records API ─────────────────
// Metadata access and record access are separate scopes, so this is the check
// that actually mirrors what contacts-list / tasks-list do at runtime.
console.log(BOLD('\nRequired tables\n'));
let failures = 0;

for (const [envKey, defaultName] of Object.entries(REQUIRED_TABLES)) {
  const ref = process.env[envKey] || defaultName;
  const res = await at(`/v0/${baseId}/${encodeURIComponent(ref)}?maxRecords=1`, token);
  const src = process.env[envKey] ? 'env' : 'default name';
  if (res.ok) {
    const n = (res.data.records || []).length;
    console.log(`  ${OK} ${ref.padEnd(22)} ${DIM(`${src}${n ? '' : ' · table is empty'}`)}`);
  } else {
    failures++;
    console.log(`  ${BAD} ${ref.padEnd(22)} ${DIM(`HTTP ${res.status} — ${msgOf(res)}`)}`);
    console.log(DIM(`     ${explain(res.status, msgOf(res), { baseId, table: ref, envKey })}`));
  }
}

// ── 4. Verdict ───────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`${OK} ${BOLD('Connected.')} All ${Object.keys(REQUIRED_TABLES).length} required tables are readable.`);
  console.log(DIM('   If the dashboard is still empty, the deployed site has different env values than this shell —'));
  console.log(DIM('   check Netlify → Environment variables and redeploy.\n'));
  process.exit(0);
}
console.log(`${BAD} ${BOLD(`${failures} of ${Object.keys(REQUIRED_TABLES).length} required tables unreadable.`)}\n`);
process.exit(1);
