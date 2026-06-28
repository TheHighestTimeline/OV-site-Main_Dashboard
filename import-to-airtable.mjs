// import-to-airtable.mjs
// Run once: node import-to-airtable.mjs
// Creates 5 new tables in your Airtable base and imports all CSV data.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const TOKEN   = process.env.AIRTABLE_TOKEN;   // set in your shell before running
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appgZ4EvfGEI4owb7';
const BASE_URL = 'https://api.airtable.com/v0';

async function air(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data?.error || data)}`);
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Parse CSV string handling quoted fields with commas/newlines
function parseCSV(text) {
  const lines = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (c === '"') {
      if (inQ && n === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(cur); cur = '';
      lines.push(row); row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); lines.push(row); }
  return lines;
}

function cleanVal(v) {
  if (!v) return '';
  // Strip Notion page links
  v = v.replace(/\s*\(https:\/\/app\.notion\.com\/[^)]*\)/g, '');
  v = v.replace(/\s*\(https:\/\/[^)]*notion[^)]*\)/g, '');
  // Strip mailto:
  v = v.replace(/^mailto:/i, '');
  return v.trim().slice(0, 10000);
}

const CSV_FILES = {
  'All Amplify Tasks':   'All Amplify Tasks 293ec2c464288115a979fb0ca1d5bb4f_all.csv',
  'Solar Tasks':         'Solar Tasks 2cbec2c4642881f0b227db03b8912f4b_all.csv',
  'Amplify Tasks':       'Amplify Tasks 304ec2c46428803faa14e5299999752a_all.csv',
  'Amplify Projects':    'Amplify Projects 293ec2c4642881bbb5e5d717d4e9a5bb_all.csv',
  'Amplify Ambassadors': 'Amplify Ambassadors 2cdec2c4642880de9d89e318e3b671fa_all.csv',
};

// Resolve directory relative to this script (works on Windows)
const CSV_DIR = dirname(fileURLToPath(import.meta.url));

async function createTable(name, headers) {
  console.log(`\nCreating table: ${name} (${headers.length} fields)`);
  const fields = headers.map((h, i) => ({
    name: h,
    type: 'singleLineText',
  }));
  // Primary field must be first
  const res = await air('POST', `/meta/bases/${BASE_ID}/tables`, { name, fields });
  console.log(`  ✓ Created table ${name} (id: ${res.id})`);
  return res.id;
}

async function importRows(tableId, tableName, headers, rows) {
  const BATCH = 10;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const records = chunk.map(row => {
      const fields = {};
      headers.forEach((h, idx) => {
        const v = cleanVal(row[idx] ?? '');
        if (v) fields[h] = v;
      });
      return { fields };
    }).filter(r => Object.keys(r.fields).length > 0);

    if (records.length === 0) continue;

    try {
      await air('POST', `/${BASE_ID}/${tableId}`, { records, typecast: true });
      imported += records.length;
      process.stdout.write(`\r  ${tableName}: ${imported}/${rows.length} rows`);
    } catch (e) {
      console.error(`\n  Error on batch ${i}-${i+BATCH}: ${e.message}`);
    }
    await sleep(250); // stay under rate limit
  }
  console.log(`\n  ✓ Done — ${imported} rows imported`);
}

async function main() {
  console.log('=== Airtable CSV Importer ===\n');

  for (const [tableName, filename] of Object.entries(CSV_FILES)) {
    const filePath = join(CSV_DIR, filename);
    let text;
    try {
      text = readFileSync(filePath, 'utf-8').replace(/^﻿/, ''); // strip BOM
    } catch (e) {
      console.error(`Could not read ${filename}: ${e.message}`);
      console.error(`  Make sure the CSV files are in the same folder as this script.`);
      continue;
    }

    const lines = parseCSV(text);
    if (lines.length < 2) { console.log(`${tableName}: empty, skipping`); continue; }

    const headers = lines[0];
    const rows    = lines.slice(1).filter(r => r.some(v => v.trim()));

    try {
      const tableId = await createTable(tableName, headers);
      await sleep(500);
      await importRows(tableId, tableName, headers, rows);
    } catch (e) {
      console.error(`Failed on ${tableName}: ${e.message}`);
    }
  }

  console.log('\n=== All done ===');
}

main().catch(console.error);
