#!/usr/bin/env node
// scripts/audit-notion-airtable-coverage.mjs
// Compares Notion database record counts against Airtable table record counts.
// Outputs a markdown coverage report.
//
// Usage:
//   node scripts/audit-notion-airtable-coverage.mjs
//
// Requires env vars (copy from .env or set in your terminal):
//   NOTION_TOKEN, AIRTABLE_TOKEN, AIRTABLE_BASE_ID
//   plus optional NOTION_OUTREACH_DB_ID
//
// Run from the project root.

import 'dotenv/config';

// ── Notion DB IDs (from _notion.js) ─────────────────────────────────────────
const NOTION_DBS = {
  CRM:           { id: '311ec2c4642881c2af03f92bb583f4ba', label: 'CRM' },
  TASKS:         { id: '311ec2c46428817a9cb8c18ea82101b0', label: 'Tasks' },
  OPPORTUNITIES: { id: '311ec2c4642881418073e7a92dbcf265', label: 'Opportunities' },
  GOALS:         { id: '5baaa13aba09464aa686122518fd63e8', label: 'Goals' },
  FINANCIAL:     { id: '20eec2c4642881608f64f87fd778f27e', label: 'Financial' },
  COMPANIES:     { id: '312ec2c4642880aea5facc7396fb9327', label: 'Companies' },
  NOTES:         { id: '314ec2c4642880e28bd2000b1bc2224d', label: 'Notes (Calls/Notes)' },
  DOCS:          { id: '95c93721af8e468e81f0a2c5cc4c7350', label: 'Docs (legacy)' },
  OUTREACH:      { id: process.env.NOTION_OUTREACH_DB_ID || '', label: 'Outreach / Sales Pipeline' },
};

// ── Expected Airtable tables (name as it appears in the base) ────────────────
const AIRTABLE_TABLES = [
  { envVar: 'AIRTABLE_TABLE_CONTACTS',       name: 'CRM Contacts',       notionKey: 'CRM' },
  { envVar: 'AIRTABLE_TABLE_TASKS',          name: 'Master Action Board', notionKey: 'TASKS' },
  { envVar: 'AIRTABLE_TABLE_OPPORTUNITIES',  name: 'Opportunities',       notionKey: 'OPPORTUNITIES' },
  { envVar: 'AIRTABLE_TABLE_COMPANIES',      name: 'Companies',           notionKey: 'COMPANIES' },
  { envVar: 'AIRTABLE_TABLE_NOTES',          name: 'Notes',               notionKey: 'NOTES' },
  { envVar: 'AIRTABLE_TABLE_OUTREACH',       name: 'Outreach',            notionKey: 'OUTREACH' },
  { envVar: 'AIRTABLE_TABLE_GOALS',          name: 'Goals',               notionKey: 'GOALS' },
  { envVar: 'AIRTABLE_TABLE_FINANCIAL',      name: 'Financial',           notionKey: 'FINANCIAL' },
  { envVar: 'AIRTABLE_TABLE_REFERENCE_LIBRARY', name: 'Reference Library', notionKey: 'DOCS' },
];

const notionToken   = process.env.NOTION_TOKEN;
const airtableToken = process.env.AIRTABLE_TOKEN;
const airtableBase  = process.env.AIRTABLE_BASE_ID;

if (!notionToken)   { console.error('ERROR: NOTION_TOKEN not set'); process.exit(1); }
if (!airtableToken) { console.error('ERROR: AIRTABLE_TOKEN not set'); process.exit(1); }
if (!airtableBase)  { console.error('ERROR: AIRTABLE_BASE_ID not set'); process.exit(1); }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function notionCount(dbId) {
  if (!dbId) return { count: null, error: 'ID not set' };
  let count = 0, cursor;
  try {
    do {
      const res = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) return { count: null, error: data?.message || `HTTP ${res.status}` };
      count += (data.results || []).length;
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);
    return { count };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

async function airtableCount(tableName) {
  let count = 0, offset;
  try {
    do {
      const params = new URLSearchParams({ pageSize: '100', fields: ['_id'] });
      if (offset) params.set('offset', offset);
      const res = await fetch(
        `https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(tableName)}?${params}`,
        { headers: { Authorization: `Bearer ${airtableToken}` } }
      );
      const data = await res.json();
      if (!res.ok) return { count: null, error: data?.error?.message || `HTTP ${res.status}` };
      count += (data.records || []).length;
      offset = data.offset || null;
    } while (offset);
    return { count };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

async function getAirtableTables() {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${airtableBase}/tables`, {
    headers: { Authorization: `Bearer ${airtableToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return (data.tables || []).map(t => t.name);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n⏳ Fetching Airtable table list…');
let existingAirtableTables = [];
try {
  existingAirtableTables = await getAirtableTables();
  console.log(`   Found ${existingAirtableTables.length} tables in base.`);
} catch (e) {
  console.error('ERROR fetching Airtable tables:', e.message);
  process.exit(1);
}

console.log('\n⏳ Counting records in Notion databases…');
const notionResults = {};
for (const [key, db] of Object.entries(NOTION_DBS)) {
  process.stdout.write(`   ${db.label}… `);
  notionResults[key] = await notionCount(db.id);
  console.log(notionResults[key].error ? `ERROR: ${notionResults[key].error}` : notionResults[key].count);
}

console.log('\n⏳ Counting records in Airtable tables…');
const airtableResults = {};
for (const t of AIRTABLE_TABLES) {
  const tableName = process.env[t.envVar] || t.name;
  const exists = existingAirtableTables.some(n => n.toLowerCase() === tableName.toLowerCase());
  if (!exists) {
    airtableResults[t.notionKey] = { count: null, error: 'Table not found in base', tableName };
    console.log(`   ${tableName}: ❌ NOT FOUND`);
  } else {
    process.stdout.write(`   ${tableName}… `);
    airtableResults[t.notionKey] = { ...await airtableCount(tableName), tableName };
    const r = airtableResults[t.notionKey];
    console.log(r.error ? `ERROR: ${r.error}` : r.count);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────
const lines = [];
const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
lines.push(`# Notion → Airtable Coverage Report`);
lines.push(`\nGenerated: ${ts} UTC`);
lines.push(`\n## Record Counts\n`);
lines.push(`| Notion DB | Notion Records | Airtable Table | Airtable Records | Delta | Status |`);
lines.push(`|-----------|---------------|----------------|-----------------|-------|--------|`);

const missing = [];
let totalNotionRecords = 0;
let totalAirtableRecords = 0;

for (const t of AIRTABLE_TABLES) {
  const ndb    = NOTION_DBS[t.notionKey];
  const nr     = notionResults[t.notionKey];
  const ar     = airtableResults[t.notionKey];
  const nCount = nr?.count ?? '—';
  const aCount = ar?.count ?? '—';
  const delta  = (typeof nCount === 'number' && typeof aCount === 'number')
    ? aCount - nCount : '—';
  let status;
  if (ar?.error?.includes('not found') || ar?.error?.includes('Not found')) {
    status = '❌ Missing table';
    missing.push(ar?.tableName || t.name);
  } else if (typeof nCount === 'number' && typeof aCount === 'number') {
    status = aCount >= nCount ? '✅ OK' : `⚠️ ${nCount - aCount} records short`;
    totalNotionRecords  += nCount;
    totalAirtableRecords += aCount;
  } else {
    status = nr?.error ? `⚠️ Notion: ${nr.error}` : ar?.error ? `⚠️ AT: ${ar.error}` : '—';
  }
  lines.push(`| ${ndb.label} | ${nCount} | ${ar?.tableName || t.name} | ${aCount} | ${delta} | ${status} |`);
}

lines.push(`\n**Totals:** ${totalNotionRecords} Notion records → ${totalAirtableRecords} Airtable records`);

if (missing.length > 0) {
  lines.push(`\n## Missing Airtable Tables (need to be created)\n`);
  missing.forEach(t => lines.push(`- ${t}`));
}

// Tables in Airtable that have no Notion equivalent (extra tables)
const mappedNames = new Set(AIRTABLE_TABLES.map(t => (process.env[t.envVar] || t.name).toLowerCase()));
const extraTables = existingAirtableTables.filter(n => !mappedNames.has(n.toLowerCase()));
if (extraTables.length > 0) {
  lines.push(`\n## Airtable Tables with No Notion Equivalent (already Supabase-backed or new)\n`);
  extraTables.forEach(t => lines.push(`- ${t}`));
}

const report = lines.join('\n');
console.log('\n' + '─'.repeat(60));
console.log(report);
console.log('─'.repeat(60));

// Save report to file
import { writeFileSync } from 'fs';
const outPath = './scripts/audit-report-' + new Date().toISOString().slice(0, 10) + '.md';
writeFileSync(outPath, report, 'utf8');
console.log(`\n✅ Report saved to ${outPath}`);
