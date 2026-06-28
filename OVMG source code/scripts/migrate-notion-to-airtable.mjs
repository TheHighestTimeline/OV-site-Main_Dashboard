#!/usr/bin/env node
// scripts/migrate-notion-to-airtable.mjs
// Migrates records from Notion databases to Airtable tables.
//
// Usage:
//   node scripts/migrate-notion-to-airtable.mjs              # dry run (default)
//   node scripts/migrate-notion-to-airtable.mjs --live       # live migration
//   node scripts/migrate-notion-to-airtable.mjs --db CRM     # one database only
//   node scripts/migrate-notion-to-airtable.mjs --db CRM --live
//
// Requires env vars:
//   NOTION_TOKEN, AIRTABLE_TOKEN, AIRTABLE_BASE_ID
//   Optional: NOTION_OUTREACH_DB_ID
//
// Safety guarantees:
//   - Dry run by default. Pass --live to actually write.
//   - NEVER deletes Notion records.
//   - NEVER deletes Airtable records.
//   - Preserves original Notion Page ID in "Notion Page ID" field.
//   - Deduplicates by matching "Notion Page ID" — updates if found, creates if not.
//   - Prints full summary at the end.

import 'dotenv/config';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    db:   { type: 'string'  },
  },
  strict: false,
});

const DRY_RUN = !args.live;
const ONLY_DB = args.db?.toUpperCase();

if (DRY_RUN) {
  console.log('\n🔍 DRY RUN mode — no Airtable records will be created or updated.');
  console.log('   Pass --live to run the actual migration.\n');
} else {
  console.log('\n🚀 LIVE migration mode — writing to Airtable.\n');
}

const notionToken   = process.env.NOTION_TOKEN;
const airtableToken = process.env.AIRTABLE_TOKEN;
const airtableBase  = process.env.AIRTABLE_BASE_ID;

if (!notionToken)   { console.error('ERROR: NOTION_TOKEN not set'); process.exit(1); }
if (!airtableToken) { console.error('ERROR: AIRTABLE_TOKEN not set'); process.exit(1); }
if (!airtableBase)  { console.error('ERROR: AIRTABLE_BASE_ID not set'); process.exit(1); }

// ── Notion helpers ────────────────────────────────────────────────────────────
function getProp(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case 'title':        return p.title?.map(r => r.plain_text).join('') || '';
    case 'rich_text':    return p.rich_text?.map(r => r.plain_text).join('') || '';
    case 'select':       return p.select?.name || null;
    case 'status':       return p.status?.name || null;
    case 'multi_select': return p.multi_select?.map(s => s.name) || [];
    case 'number':       return p.number ?? null;
    case 'date':         return p.date?.start || null;
    case 'checkbox':     return p.checkbox ?? false;
    case 'email':        return p.email || null;
    case 'phone_number': return p.phone_number || null;
    case 'url':          return p.url || null;
    case 'relation':     return p.relation?.map(r => r.id) || [];
    default:             return null;
  }
}

async function notionQuery(dbId) {
  const records = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    records.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return records;
}

// ── Airtable helpers ──────────────────────────────────────────────────────────
async function atFindByNotionId(tableName, notionPageId) {
  const safe    = notionPageId.replace(/'/g, "\\'");
  const formula = `{Notion Page ID} = '${safe}'`;
  const url = `https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.records?.[0] || null;
}

async function atCreate(tableName, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(tableName)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

async function atUpdate(tableName, recordId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/${encodeURIComponent(tableName)}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

// ── Field transformers ────────────────────────────────────────────────────────
function transformCRM(page) {
  return {
    'Name':             getProp(page, 'Name') || getProp(page, 'Full Name') || '(unnamed)',
    'Email':            getProp(page, 'Email') || '',
    'Phone':            getProp(page, 'Phone') || '',
    'Role':             getProp(page, 'Role') || getProp(page, 'Title') || '',
    'Status':           getProp(page, 'Status') || 'Active',
    'Type':             getProp(page, 'Select') || getProp(page, 'Type') || 'External',
    'Relates To':       (getProp(page, 'Relates To') || []).join(', '),
    'Notion Page ID':   page.id,
    'Source Database':  'CRM',
  };
}

function transformTasks(page) {
  const dealCat = getProp(page, 'Deal Category') || [];
  return {
    'Task Name':           getProp(page, 'Task') || getProp(page, 'Name') || '(untitled)',
    'Status':              getProp(page, 'Status') || 'Not started',
    'Priority':            getProp(page, 'Priority') || '',
    'Owner':               getProp(page, 'Owner') || '',
    'Due Date':            getProp(page, 'Due Date') || '',
    'Company / Entity':    Array.isArray(dealCat) ? dealCat.join(', ') : dealCat,
    'Task Type':           getProp(page, 'Task Type') || '',
    'Notion Page ID':      page.id,
    'Source Database':     'TASKS',
    'Original Notion URL': page.url,
  };
}

function transformOpportunities(page) {
  const notes = (getProp(page, 'Notes') || '').replace(/^\[(?:drive|kanban)\]:.*\n?/gm, '').trim();
  const driveMatch = (getProp(page, 'Notes') || '').match(/^\[drive\]:\s*(.+)/m);
  const workType = getProp(page, 'Work Type');
  return {
    'Opportunity Name':   getProp(page, 'Opportunity') || getProp(page, 'Name') || '(untitled)',
    'Stage':              getProp(page, 'Stage') || 'Intake',
    'Client Status':      getProp(page, 'Status') || '',
    'Priority':           getProp(page, 'Priority') || '',
    'Deal Value':         getProp(page, 'Deal Value') || '',
    'Notes':              notes,
    'Drive Link':         driveMatch ? driveMatch[1].trim() : '',
    'Next Action':        getProp(page, 'Next Action') || '',
    'Follow-Up Date':     getProp(page, 'Next Action Date') || '',
    'Main POC':           getProp(page, 'Main POC') || '',
    'Main Email':         getProp(page, 'Main Email') || '',
    'Main Phone':         getProp(page, 'Main Phone') || '',
    'Work Type':          workType || '',
    'Deal Category':      (getProp(page, 'Deal Category') || []).join(', '),
    'Notion Page ID':     page.id,
    'Source Database':    'OPPORTUNITIES',
    'Original Notion URL': page.url,
  };
}

function transformGoals(page) {
  return {
    'Goal':               getProp(page, 'Goal') || getProp(page, 'Name') || getProp(page, 'Title') || '(untitled)',
    'Owner':              getProp(page, 'Owner') || '',
    'Status':             getProp(page, 'Status') || '',
    'Priority':           getProp(page, 'Priority') || '',
    'Quarter':            getProp(page, 'Quarter') || '',
    'Progress':           getProp(page, 'Progress') ?? 0,
    'Notes':              getProp(page, 'Notes') || '',
    'Category':           (getProp(page, 'Category') || getProp(page, 'Deal Category') || []).join(', '),
    'Notion Page ID':     page.id,
    'Source Database':    'GOALS',
  };
}

function transformFinancial(page) {
  return {
    'Goal':               getProp(page, 'Goal') || getProp(page, 'Name') || getProp(page, 'Title') || '(untitled)',
    'Type':               getProp(page, 'Type') || 'Other',
    'Target':             getProp(page, 'Target') ?? getProp(page, 'Goal Amount') ?? 0,
    'Current Amount':     getProp(page, 'Current Amount') ?? getProp(page, 'Current') ?? 0,
    'Notion Page ID':     page.id,
    'Source Database':    'FINANCIAL',
  };
}

function transformNotes(page) {
  return {
    'Title':              getProp(page, 'Title') || getProp(page, 'Name') || 'Note',
    'Notes':              getProp(page, 'Raw Notes / Transcript') || getProp(page, 'Body') || '',
    'AI Summary':         getProp(page, 'AI Summary') || '',
    'Type':               getProp(page, 'Type') || 'Note',
    'Notion Page ID':     page.id,
    'Source Database':    'NOTES',
    // Note: contact relation (CRM relation) cannot be migrated as a linked record
    // automatically — that would require a two-pass migration. Stored as text below.
    'Linked Contact ID':  (getProp(page, 'CRM') || getProp(page, 'Contact') || []).join(', '),
  };
}

function transformOutreach(page) {
  return {
    'Lead / Business Name':     getProp(page, 'Lead / Business Name') || '(unnamed)',
    'Status':                   getProp(page, 'Status') || 'No Status',
    'Contact Name':             getProp(page, 'Contact Name') || '',
    'Business Type':            getProp(page, 'Business Type') || '',
    'City / State':             getProp(page, 'City / State') || '',
    'Contact Email':            getProp(page, 'Contact Email') || '',
    'Phone':                    getProp(page, 'Phone') || '',
    'Website':                  getProp(page, 'Website') || '',
    'Instagram':                getProp(page, 'Instagram') || '',
    'LinkedIn':                 getProp(page, 'LinkedIn') || '',
    'Assigned Partner / Owner': getProp(page, 'Assigned Partner / Owner') || '',
    'Email Sent':               getProp(page, 'Email Sent') ?? false,
    'Instagram DM Sent':        getProp(page, 'Instagram DM Sent') ?? false,
    'Lead Quality':             getProp(page, 'Lead Quality') || '',
    'Priority':                 getProp(page, 'Priority') || '',
    'Source':                   getProp(page, 'Source') || '',
    'Notes':                    getProp(page, 'Notes') || '',
    'Next Action':              getProp(page, 'Next Action') || '',
    'Next Follow-Up Date':      getProp(page, 'Next Follow-Up Date') || '',
    'Recommended Offer':        getProp(page, 'Recommended Offer') || '',
    'Notion Page ID':           page.id,
    'Source Database':          'OUTREACH',
    'Original Notion URL':      page.url,
  };
}

// ── Migration plan ────────────────────────────────────────────────────────────
const MIGRATIONS = [
  {
    key:         'CRM',
    label:       'CRM Contacts',
    notionDbId:  '311ec2c4642881c2af03f92bb583f4ba',
    airtableEnv: 'AIRTABLE_TABLE_CONTACTS',
    airtableDef: 'CRM Contacts',
    transform:   transformCRM,
  },
  {
    key:         'TASKS',
    label:       'Tasks → Master Action Board',
    notionDbId:  '311ec2c46428817a9cb8c18ea82101b0',
    airtableEnv: 'AIRTABLE_TABLE_TASKS',
    airtableDef: 'Master Action Board',
    transform:   transformTasks,
  },
  {
    key:         'OPPORTUNITIES',
    label:       'Opportunities',
    notionDbId:  '311ec2c4642881418073e7a92dbcf265',
    airtableEnv: 'AIRTABLE_TABLE_OPPORTUNITIES',
    airtableDef: 'Opportunities',
    transform:   transformOpportunities,
  },
  {
    key:         'GOALS',
    label:       'Goals',
    notionDbId:  '5baaa13aba09464aa686122518fd63e8',
    airtableEnv: 'AIRTABLE_TABLE_GOALS',
    airtableDef: 'Goals',
    transform:   transformGoals,
  },
  {
    key:         'FINANCIAL',
    label:       'Financial',
    notionDbId:  '20eec2c4642881608f64f87fd778f27e',
    airtableEnv: 'AIRTABLE_TABLE_FINANCIAL',
    airtableDef: 'Financial',
    transform:   transformFinancial,
  },
  {
    key:         'NOTES',
    label:       'Notes (Calls/Notes)',
    notionDbId:  '314ec2c4642880e28bd2000b1bc2224d',
    airtableEnv: 'AIRTABLE_TABLE_NOTES',
    airtableDef: 'Notes',
    transform:   transformNotes,
  },
  {
    key:         'OUTREACH',
    label:       'Outreach / Sales Pipeline',
    notionDbId:  process.env.NOTION_OUTREACH_DB_ID || '',
    airtableEnv: 'AIRTABLE_TABLE_OUTREACH',
    airtableDef: 'Outreach',
    transform:   transformOutreach,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
const globalSummary = [];

for (const migration of MIGRATIONS) {
  if (ONLY_DB && migration.key !== ONLY_DB) continue;

  const tableName = process.env[migration.airtableEnv] || migration.airtableDef;
  const summary   = { db: migration.label, table: tableName, read: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 ${migration.label} → ${tableName}`);

  if (!migration.notionDbId) {
    const msg = `Skipping — Notion DB ID not set (check NOTION_OUTREACH_DB_ID)`;
    console.log(`   ⚠️  ${msg}`);
    summary.errors.push(msg);
    globalSummary.push(summary);
    continue;
  }

  // Pull all Notion records
  let notionPages = [];
  try {
    process.stdout.write(`   Fetching Notion records… `);
    notionPages = await notionQuery(migration.notionDbId);
    summary.read = notionPages.length;
    console.log(`${notionPages.length} records`);
  } catch (e) {
    console.log(`\n   ❌ Notion fetch failed: ${e.message}`);
    summary.errors.push(`Notion fetch: ${e.message}`);
    globalSummary.push(summary);
    continue;
  }

  // Process each record
  for (const page of notionPages) {
    let fields;
    try {
      fields = migration.transform(page);
    } catch (e) {
      summary.errors.push(`Transform error for ${page.id}: ${e.message}`);
      summary.skipped++;
      continue;
    }

    if (DRY_RUN) {
      // In dry run just show the first record as a sample
      if (summary.created + summary.updated === 0) {
        console.log(`\n   Sample record (first):`);
        console.log(JSON.stringify(fields, null, 4).split('\n').map(l => '   ' + l).join('\n'));
      }
      summary.created++; // count as "would create" for reporting
      continue;
    }

    // Live: check if record already exists by Notion Page ID
    try {
      const existing = await atFindByNotionId(tableName, page.id);
      if (existing) {
        await atUpdate(tableName, existing.id, fields);
        summary.updated++;
      } else {
        await atCreate(tableName, fields);
        summary.created++;
      }
    } catch (e) {
      summary.errors.push(`Record ${page.id}: ${e.message}`);
      summary.skipped++;
    }

    // Brief rate-limit courtesy pause (Airtable: 5 req/s per base)
    await new Promise(r => setTimeout(r, 220));
  }

  if (DRY_RUN) {
    console.log(`\n   [DRY RUN] Would process ${summary.created} records.`);
    summary.created = 0; // reset — nothing was actually written
  } else {
    console.log(`   ✅ Created: ${summary.created}  Updated: ${summary.updated}  Skipped: ${summary.skipped}`);
  }

  globalSummary.push(summary);
}

// ── Final summary ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(DRY_RUN ? '🔍 DRY RUN COMPLETE — nothing was written\n' : '✅ MIGRATION COMPLETE\n');
console.log('Summary:');
console.log(`${'─'.repeat(60)}`);
for (const s of globalSummary) {
  const errNote = s.errors.length ? ` | ⚠️ ${s.errors.length} error(s)` : '';
  if (DRY_RUN) {
    console.log(`  ${s.db}: ${s.read} records found → would migrate to "${s.table}"${errNote}`);
  } else {
    console.log(`  ${s.db}: read=${s.read} created=${s.created} updated=${s.updated} skipped=${s.skipped}${errNote}`);
  }
  if (s.errors.length) {
    s.errors.forEach(e => console.log(`    ⚠️  ${e}`));
  }
}
console.log(`${'─'.repeat(60)}\n`);
