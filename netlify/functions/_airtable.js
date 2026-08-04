// netlify/functions/_airtable.js
// Shared Airtable client for all Netlify functions.
// Uses the Airtable REST API via fetch — no SDK dependency needed.
// NEVER imported on the frontend. All calls are server-side only.
// The token is never exposed to the browser.
//
// RATE LIMIT (WP1, 2026-08): Airtable allows 5 requests per second per base and
// returns 429 with a 30 second lockout when exceeded. That ceiling is lower than
// this dashboard's burst behavior (tasks-list alone fans out to three tables).
// EVERY call now goes through the limiter below. Do not call the Airtable REST
// API directly from anywhere else.

const BASE_URL = 'https://api.airtable.com/v0';

function getToken() {
  // AIRTABLE_TOKEN is the name this codebase has always used. AIRTABLE_API_KEY
  // is accepted as an alias so the COO/Threads env naming also works.
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
  if (!token) throw new Error('AIRTABLE_TOKEN env var is not set');
  return token;
}

function getBaseId() {
  const id = process.env.AIRTABLE_BASE_ID || 'appgZ4EvfGEI4owb7';
  if (!id) throw new Error('AIRTABLE_BASE_ID env var is not set');
  return id;
}

// Resolve a table name or ID for use in URL paths.
// Table IDs start with "tbl"; names are passed as-is (Airtable accepts both).
function resolveTable(tableNameOrId) {
  return encodeURIComponent(tableNameOrId);
}

// ── Table IDs ────────────────────────────────────────────────────────────────
// Verified against the live base 2026-08-03 via the Airtable schema API.
// Field/table NAMES can be renamed by anyone in the Airtable UI; IDs cannot.
// Prefer these for writes that must not break.
export const TB = {
  CONTACTS:         'tbl6MKKs3xXrYBPL4',   // CRM Contacts
  OPPORTUNITIES:    'tblrYR26yf0xKlpiB',   // Opportunities
  TASKS:            'tblh8XdwnIxjYkPd9',   // Master Action Board
  ACTIVITIES:       'tbldGvr7qmeuUBMA8',   // Activities (the Notes equivalent)
  COMPANIES:        'tbluCVKcO1yWQC68n',
  DOCUMENTS:        'tbll1FlmXHBZTP5j5',
  OUTREACH:         'tblNOZrmSYspJ0sbl',
  GOALS:            'tblnQXPZ42nVMLulQ',
  FINANCIAL:        'tblSgbrab351R5uhE',
  PROJECTS:         'tblv8d2aKqTD1vsGX',
  PROJECT_TIMELINE: 'tbl0bmyqSNssENBMF',
  SIGNED_DEALS:     'tbl6obmYemQd8vomP',
  FOLDERS:          'tblwSGG8WGDXjgfRc',
  TAGS:             'tblFJaitv09T8uxSh',
  OVM_CLIENTS:      'tblb0aLDqSgAG8DPU',
  CLIENT_POSTS:     'tblHgZonLiX6dgp09',
  REFERENCE_LIB:    'tblZslj0B2ULnzfrB',
  ASSET_LIBRARY:    'tblq1zlE6Fo8rE0Yy',
  IMPORT_INBOX:     'tblyp4WW5SBAPNNmF',
  RAW_CSV_INDEX:    'tblxSD3snkw9fLtKz',
  AMPLIFY_PROJECTS: 'tblDZlLdnOJnsKXQ5',
  AMPLIFY_TASKS:    'tblaaHZd250JCCJLo',
  AMPLIFY_AMBASSADORS: 'tblzKxDbmoEkFmKsS',
  SOLAR_TASKS:      'tbliRLg6X7lkuRsOh',

  // Created for the Threads tab (WP2). Set AIRTABLE_TB_PARTICIPATIONS in
  // Netlify once the table exists; every caller degrades gracefully when empty.
  PARTICIPATIONS:   process.env.AIRTABLE_TB_PARTICIPATIONS || '',
};

// ── Field IDs the Threads/COO layer writes ───────────────────────────────────
export const FLD = {
  TASKS: {
    ACTION_NAME: 'fldnS30tFzXOg7mzP',
    ASSIGNED_TO: 'fldyy9XO0bUfO0jXd',
    DUE_DATE:    'fldVDtksgeG6aambc',
    PRIORITY:    'fld1hJpdI9U6kzAVJ',
    STATUS:      'fldSU0GMIAv8RX4si',
    DESCRIPTION: 'fldG8sAUE0bgxLK3g',
    ENTITY:      'fldFgEX30mf5s0VfY',
    OPPORTUNITY: 'fldxsf2nZd4wq7a6S',
    CONTACT:     'fldrt6yF3WfLFFQwR',
    TASK_TYPE:   'fldnFkx932b6AmiNl',
  },
  CONTACTS: {
    FULL_NAME:        'fldQT3RxnuIubyKja',
    EMAIL:            'fldcBtQwgt4jxXbbh',
    PHONE:            'fldMelEk7ABi818jC',
    OWNER:            'fld5Kq9uUeaasSnYO',
    NEXT_ACTION:      'fldpisUnoYhsWU49C',
    NEXT_ACTION_DATE: 'fldxvtLa4nLeQsesl',
    LAST_CONTACTED:   'fldfftokgexdCO3d8',
    STATUS:           'fldnctjpoqH4pNYN6',
    REFERRED_BY:      'fldpyVajtkLK9EYhe',
    RELATED_ENTITIES: 'fldTQO9sKac1ynoQ0',
    CURRENT_SUMMARY:  'fldA4174EvkPnnWpv',
    COMPANIES:        'fldU7R4kSRgog5F5a',
    DOCUMENTS:        'fldp5xrDetbqq86VS',
    ACTIVITIES:       'fldcl4J6uPU6XUXqz',
  },
  OPPORTUNITIES: {
    NAME:       'fld7TAIhFTRjbaHJl',
    STAGE:      'fldKPMlumZgzaW7fc',
    ENTITY:     'fldmAxaulJrwo5aPv',
    KIND:       'fldVjvHM75QQ7FPyJ',   // Deal | Workstream. Already exists.
    DATA_ROOM:  'fldzrc7seIPYzq0d3',   // Drive URL
    NEXT_STEP:  'fldAsZfsBxAufJNiJ',
    PRIORITY:   'fldcdtucuiD2ZmMJS',
    DEAL_VALUE: 'fld7FiEvAH5vXg88g',
    DOCUMENTS:  'fldONADYOBXJ005mG',
  },
  DOCUMENTS: {
    NAME:        'fldMrYCaARu3TyP3W',
    TYPE:        'fldMUk751J4TAnPvn',
    TAGS:        'fldaby2kwbOwHpH3Q',   // Signed | Draft | Template
    DRIVE_LINK:  'fld4JfR42hgJ5TBIb',
    ENTITY:      'fldk38uUDawXnkzHU',
    SIGNED_DATE: 'fldl1VD98Mc2FFCwz',
    EXPIRY_DATE: 'fldY1a0lrAf1AGOFY',
    CONTACT:     'fldoDZ0BfPOCqtdWt',
    COMPANY:     'fldxH0lEjJ4VLYKW1',
    OPPORTUNITY: 'flduGNGTkrFopGOnS',
  },
  ACTIVITIES: {
    TITLE:   'fldTznYKymhBMFuoY',
    TYPE:    'fldv1SvbUKkHxg1jI',
    DATE:    'fldRi82WNMKgoyLwx',
    CONTACT: 'fldAMUDWrqpcQBjxU',
    SOURCE:  'fldAbn27XrsB07sBX',
    BODY:    'fldl2npL61SzPKqvw',
    COMPANY: 'fldhT6Hxfvh7y2jdV',
  },
};

// ── Rate limiter: at most 5 requests per rolling second, serialized queue ─────
// Airtable's 429 carries a 30 second lockout, which is catastrophic for a live
// dashboard, so we stay under the ceiling rather than reacting to it. A single
// promise chain keeps ordering deterministic across concurrent callers.
const MAX_PER_SEC = 5;
const recentCalls = [];
let queueTail = Promise.resolve();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function throttle() {
  // Drop timestamps older than a second, then wait until there is room.
  for (;;) {
    const now = Date.now();
    while (recentCalls.length && now - recentCalls[0] >= 1000) recentCalls.shift();
    if (recentCalls.length < MAX_PER_SEC) {
      recentCalls.push(now);
      return;
    }
    await sleep(1000 - (now - recentCalls[0]) + 5);
  }
}

// Serialize every request behind the limiter. Returns the caller's promise.
function enqueue(fn) {
  const run = queueTail.then(throttle).then(fn);
  // Keep the chain alive even when a call rejects, otherwise one failure
  // poisons every subsequent Airtable request in the same invocation.
  queueTail = run.then(() => {}, () => {});
  return run;
}

async function airtableRequest(method, path, body) {
  return enqueue(async () => {
    const token = getToken();
    const url = `${BASE_URL}${path}`;

    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    // One retry on 429/5xx. The limiter should prevent 429 entirely, but a
    // second Netlify function running concurrently shares the same base quota.
    for (let attempt = 0; ; attempt++) {
      const res  = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));

      if (res.ok) return data;

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 2) {
        const waitMs = res.status === 429 ? 30500 : 1000 * (attempt + 1);
        console.warn(`[airtable] ${res.status} on ${method} ${path}, retrying in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }

      const msg =
        data?.error?.message ||
        data?.error?.type ||
        `HTTP ${res.status}`;
      throw new Error(`Airtable error (${res.status}): ${msg}`);
    }
  });
}

// ── List records (auto-paginates through all pages) ───────────────────────────
// options:
//   filterByFormula  — Airtable formula string
//   sort             — array of { field, direction } objects
//   fields           — array of field names to return
//   maxRecords       — cap total records returned
//   pageSize         — records per page (max 100)
//   view             — view name or ID
export async function airtableList(tableNameOrId, options = {}) {
  const baseId = getBaseId();
  const table = resolveTable(tableNameOrId);

  const records = [];
  let offset = undefined;

  do {
    const params = new URLSearchParams();
    if (options.filterByFormula) params.set('filterByFormula', options.filterByFormula);
    if (options.view)            params.set('view', options.view);
    if (options.pageSize)        params.set('pageSize', String(Math.min(options.pageSize || 100, 100)));
    if (offset)                  params.set('offset', offset);

    if (Array.isArray(options.sort)) {
      options.sort.forEach((s, i) => {
        params.set(`sort[${i}][field]`, s.field);
        if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
      });
    }
    if (Array.isArray(options.fields)) {
      options.fields.forEach(f => params.append('fields[]', f));
    }

    const qs = params.toString();
    const data = await airtableRequest('GET', `/${baseId}/${table}${qs ? '?' + qs : ''}`);
    records.push(...(data.records || []));
    offset = data.offset || null;

    // Respect maxRecords cap
    if (options.maxRecords && records.length >= options.maxRecords) break;
  } while (offset);

  return options.maxRecords ? records.slice(0, options.maxRecords) : records;
}

// ── Parse "Unknown field name: X" out of an Airtable 422 message ─────────────
function parseUnknownField(errorMsg) {
  // Airtable formats: Unknown field name: "X"  or  Unknown field name: 'X'
  const m = String(errorMsg).match(/Unknown field name[:\s]*["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// ── Create a single record ────────────────────────────────────────────────────
// typecast: true allows Airtable to coerce string values into select options.
// If the table is missing a field in `fields`, Airtable returns 422
// "Unknown field name: X".  We catch that, strip the offending field, and retry
// automatically so saves never hard-fail due to schema mismatches.
export async function airtableCreate(tableNameOrId, fields) {
  const baseId = getBaseId();
  const table  = resolveTable(tableNameOrId);
  let f = { ...fields };

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await airtableRequest('POST', `/${baseId}/${table}`, { fields: f, typecast: true });
    } catch (e) {
      const bad = parseUnknownField(e.message);
      if (bad && bad in f) {
        console.warn(`[airtable] create — stripping unknown field "${bad}" and retrying`);
        delete f[bad];
        continue;
      }
      throw e;
    }
  }
  throw new Error('airtableCreate: too many unknown fields stripped — aborting');
}

// ── Create multiple records in one call (up to 10 per Airtable limit) ─────────
export async function airtableCreateBatch(tableNameOrId, fieldsArray) {
  const baseId = getBaseId();
  const table = resolveTable(tableNameOrId);
  const results = [];

  // Airtable allows max 10 records per batch create call
  for (let i = 0; i < fieldsArray.length; i += 10) {
    const chunk = fieldsArray.slice(i, i + 10).map(fields => ({ fields }));
    const data = await airtableRequest('POST', `/${baseId}/${table}`, {
      records: chunk,
      typecast: true,
    });
    results.push(...(data.records || []));
  }
  return results;
}

// ── Update a record (PATCH — only updates provided fields) ────────────────────
// Same unknown-field retry strategy as airtableCreate.
export async function airtableUpdate(tableNameOrId, recordId, fields) {
  const baseId = getBaseId();
  const table  = resolveTable(tableNameOrId);
  let f = { ...fields };

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await airtableRequest('PATCH', `/${baseId}/${table}/${recordId}`, {
        fields: f,
        typecast: true,
      });
    } catch (e) {
      const bad = parseUnknownField(e.message);
      if (bad && bad in f) {
        console.warn(`[airtable] update — stripping unknown field "${bad}" and retrying`);
        delete f[bad];
        continue;
      }
      throw e;
    }
  }
  throw new Error('airtableUpdate: too many unknown fields stripped — aborting');
}

// ── Get a single record ───────────────────────────────────────────────────────
export async function airtableGet(tableNameOrId, recordId) {
  const baseId = getBaseId();
  const table = resolveTable(tableNameOrId);
  return airtableRequest('GET', `/${baseId}/${table}/${recordId}`);
}

// ── Delete a record ───────────────────────────────────────────────────────────
export async function airtableDelete(tableNameOrId, recordId) {
  const baseId = getBaseId();
  const table = resolveTable(tableNameOrId);
  return airtableRequest('DELETE', `/${baseId}/${table}/${recordId}`);
}

// ── Fetch base metadata (table names, IDs, field names) ──────────────────────
// Used by airtable-schema.js to return the full schema to the frontend so it
// can build "Open in Airtable" record links and verify field names.
export async function airtableMeta() {
  const token  = getToken();
  const baseId = getBaseId();
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Airtable meta error (${res.status}): ${JSON.stringify(data?.error || data)}`);
  return data.tables || [];
}

// ── Find records matching a field value ───────────────────────────────────────
// Escapes the value for safe use inside a formula string.
// Returns an array (may be empty).
export async function airtableFindByField(tableNameOrId, fieldName, value) {
  // Escape single quotes and backslashes for Airtable formula syntax
  const safe = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  const formula = `{${fieldName}} = '${safe}'`;
  return airtableList(tableNameOrId, { filterByFormula: formula });
}

// ── Transform: Airtable record → app object ───────────────────────────────────
// mapping: { appFieldName: 'Airtable Field Name', ... }
// Always includes id = record.id
export function fromAirtableRecord(record, mapping) {
  const out = { id: record.id };
  for (const [appKey, airtableField] of Object.entries(mapping)) {
    const val = record.fields?.[airtableField];
    out[appKey] = val !== undefined ? val : null;
  }
  // Expose Airtable's built-in modified time as updatedAt if available
  if (record.fields?.['Last Modified Time']) {
    out.updatedAt = record.fields['Last Modified Time'];
  }
  return out;
}

// ── Transform: app object → Airtable fields ────────────────────────────────────
// Only includes keys that exist in the mapping AND are present (not undefined)
// in the source object, so partial updates don't clobber untouched fields.
export function toAirtableFields(appObject, mapping) {
  const fields = {};
  for (const [appKey, airtableField] of Object.entries(mapping)) {
    if (appObject[appKey] !== undefined) {
      fields[airtableField] = appObject[appKey];
    }
  }
  return fields;
}

// ── Field mappings (shared between functions) ─────────────────────────────────
// These define the canonical Airtable column names expected in the base.
// If your Airtable columns differ, update these maps — the functions will follow.

export const CONTACTS_MAP = {
  name:     'Full Name',
  role:     'Title',
  email:    'Email',
  phone:    'Phone',
  linkedin: 'LinkedIn',
  type:     'Type',
  status:   'Status',       // Active / Benched / Unknown — added to Airtable 2026-07 (was previously silently no-op-ing)
  notes:    'Notes',
  lastContactedAt: 'Last Contacted',   // added 2026-07 — fixes the Log Contact button, which was never actually persisting
  owner:           'Owner',
  nextAction:      'Next Action',
  nextActionDate:  'Next Action Date',
  source:          'Source',
  bio:             'Bio',            // added 2026-07 — surfaced in the contact profile Overview
  involvement:     'Involvement',
  segment:         'Segment',
  introducedBy:    'Introduced By',
  companyAddress:  'Company Address',
  currentSummary:  'Current Summary', // added 2026-07 — rolling 1-2 sentence summary
  relatesTo:       'Related Entities', // added 2026-07 — deal-category / entity multi-select (previously a phantom field that never persisted)
  referralEconomics: 'Referral Economics', // added 2026-07 — admin-only referral fee/split note
  // updatedAt comes from Last Modified Time (auto-populated by fromAirtableRecord)
};

// Live base: "Master Action Board"
//   Action Name (primary) · Status · Priority · Due Date · Description
//   Assigned To     -> linked records to CRM Contacts (array of recordIds)
//   Related Project -> linked records to Projects      (array of recordIds)
// NOTE: 'Assigned To' and 'Related Project' are LINKED fields, so they return
// record IDs. tasks-list.js resolves these IDs to display names.
export const TASKS_MAP = {
  task:            'Action Name',
  status:          'Status',
  priority:        'Priority',
  dueDate:         'Due Date',
  notes:           'Description',
  entity:          'Entity',          // singleSelect -> drives company tabs
  type:            'Type',            // singleSelect Internal/External
  taskType:        'Task Type',       // singleSelect Task/Reminder - distinguishes a to-do from a reminder
  owner:           'Assigned To',     // linked -> Contacts (recordIds)
  relatedProjects: 'Related Project', // linked -> Projects  (recordIds)
};

// Live base: "Opportunities"
//   Opportunity Name (primary) · Stage · Deal Value · Close Date · Notes
//   Probability (%) · Associated Contact (link) · Projects (link) · Companies (link)
export const OPPORTUNITIES_MAP = {
  name:        'Opportunity Name',
  stage:       'Stage',
  dealValue:   'Deal Value',
  closeDate:   'Close Date',
  probability: 'Probability (%)',
  notes:       'Notes',
  entity:      'Entity',   // singleSelect -> drives company tabs
  type:        'Type',     // singleSelect Internal/External
  nextStep:    'Next Step',
  dataRoom:    'Data Room', // added 2026-07 — deal data-room URL, shown on contact Deals tab
  priority:    'Priority',  // singleSelect High/Medium/Low (added 2026-07-16)
  kind:        'Kind',      // singleSelect Deal/Workstream (added 2026-07-16)
  otherParty:  'Other Party',
  goal:        'Goal',      // load-bearing: no Goal = no participations (sprawl rule)
};

export const OUTREACH_MAP = {
  name:          'Lead / Business Name',
  status:        'Status',
  contactName:   'Contact Name',
  businessType:  'Business Type',
  cityState:     'City / State',
  email:         'Contact Email',
  phone:         'Phone',
  website:       'Website',
  instagram:     'Instagram',
  linkedin:      'LinkedIn',
  assignedTo:    'Assigned Partner / Owner',
  emailSent:     'Email Sent',
  dmSent:        'Instagram DM Sent',
  leadQuality:   'Lead Quality',
  priority:      'Priority',
  source:        'Source',
  notes:         'Notes',
  nextAction:    'Next Action',
  nextFollowUp:  'Next Follow-Up Date',
  recOffer:      'Recommended Offer',
};

export const GOALS_MAP = {
  goal:     'Goal',
  owner:    'Owner',
  status:   'Status',
  priority: 'Priority',
  quarter:  'Quarter',
  progress: 'Progress',
  notes:    'Notes',
  category: 'Category',
};

export const FINANCIAL_MAP = {
  goal:          'Goal',
  type:          'Type',
  target:        'Target',
  currentAmount: 'Current Amount',
};

// PARTICIPATIONS_MAP — one contact inside one workstream (WP2, 2026-08).
// This is the junction that carries the relationship STAGE. Stage cannot live
// on the contact: Greg Shore can be NCNDA Signed on a bridge loan and Initial
// Outreach on a future raise at the same time, and both are true.
export const PARTICIPATIONS_MAP = {
  name:            'Name',
  contactIds:      'Contact',
  workstreamIds:   'Workstream',
  stage:           'Stage',
  stageEntered:    'Stage Entered',
  owner:           'Owner',
  waitingOn:       'Waiting On',
  nextAction:      'Next Action',
  nextActionDate:  'Next Action Date',
  blockingItem:    'Blocking Item',
  entity:          'Entity',
  status:          'Status',
  threadKey:       'Thread Key',
  notes:           'Notes',
};

// NOTES_MAP - as of 2026-07, "notes" are stored as records in the shared
// Activities table (there is no separate "Notes" table in Airtable; the
// notes-*.js functions used to point at a nonexistent 'Notes' table, which
// is why "Add note" was failing with a 403 "model not found" error). Body
// maps to the Activities table's 'Body' field, not 'Notes' - Activities has
// no field literally named 'Notes'.
export const NOTES_MAP = {
  title:   'Title',
  body:    'Body',
  summary: 'AI Summary',
  type:    'Type',
};

// ═══════════════════════════════════════════════════════════════════════════
// WP1 additions: a lower-level surface used by the Threads / COO layer.
//
// The airtable* helpers above are name-and-map oriented, which suits the older
// CRM functions. The helpers below take raw Airtable field objects and record
// batches, which suits code that writes by FIELD ID (renaming a field in the
// Airtable UI then cannot break it). Both go through the same limiter.
// ═══════════════════════════════════════════════════════════════════════════

/** Escape a value for safe interpolation into a filterByFormula string. */
export function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Normalize an ISO-ish value for an Airtable date/dateTime field. Null-safe. */
export function dateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Date-only (YYYY-MM-DD) for Airtable `date` fields without a time component. */
export function dateOnly(iso) {
  const t = dateTime(iso);
  return t ? t.slice(0, 10) : null;
}

/**
 * listRecords(table, opts) → raw Airtable records [{ id, fields, createdTime }]
 * Thin alias over airtableList so COO code reads the same as the supplied
 * handoff assets. Auto-paginates.
 */
export async function listRecords(table, opts = {}) {
  return airtableList(table, opts);
}

/** Fetch one record by id. Returns null when it does not exist. */
export async function getRecord(table, recordId) {
  try {
    return await airtableGet(table, recordId);
  } catch (e) {
    if (/\(404\)/.test(e.message)) return null;
    throw e;
  }
}

/**
 * createRecords(table, [{ fields }, ...]) — batches at Airtable's 10-per-call
 * limit. Accepts either bare field objects or {fields} wrappers.
 */
export async function createRecords(table, records, { typecast = true } = {}) {
  const baseId = getBaseId();
  const tbl    = resolveTable(table);
  const rows   = (records || []).map(r => (r && r.fields ? { fields: r.fields } : { fields: r }));
  const out    = [];

  for (let i = 0; i < rows.length; i += 10) {
    const data = await airtableRequest('POST', `/${baseId}/${tbl}`, {
      records: rows.slice(i, i + 10),
      typecast,
    });
    out.push(...(data.records || []));
  }
  return out;
}

/**
 * updateRecords(table, [{ id, fields }, ...]) — always PATCH, never PUT.
 * PUT clears every field you omit, which would silently wipe columns the COO
 * layer does not know about.
 */
export async function updateRecords(table, records, { typecast = true } = {}) {
  const baseId = getBaseId();
  const tbl    = resolveTable(table);
  const rows   = (records || []).filter(r => r && r.id);
  const out    = [];

  for (let i = 0; i < rows.length; i += 10) {
    const data = await airtableRequest('PATCH', `/${baseId}/${tbl}`, {
      records: rows.slice(i, i + 10).map(r => ({ id: r.id, fields: r.fields || {} })),
      typecast,
    });
    out.push(...(data.records || []));
  }
  return out;
}

/** Records where `field` equals `value`. Alias of airtableFindByField's shape. */
export async function findBy(table, field, value, opts = {}) {
  return airtableList(table, {
    filterByFormula: `{${field}} = "${esc(value)}"`,
    ...opts,
  });
}

// ── singleSelect option guard ────────────────────────────────────────────────
// Writing a value that is not in a singleSelect's option list fails outright,
// and `typecast: true` "fixes" it by silently creating a new option — which is
// how option lists turn to mush. getSelectOptions lets callers check first.
//
// A real bug this guards against: the CRM Contacts `Status` field did not exist
// while the dashboard filtered on Active/Benched/Unknown, so every write
// silently no-opped for months.
let _schemaCache = null;
let _schemaCachedAt = 0;
const SCHEMA_TTL_MS = 5 * 60 * 1000;

export async function getBaseSchema({ force = false } = {}) {
  const fresh = Date.now() - _schemaCachedAt < SCHEMA_TTL_MS;
  if (_schemaCache && fresh && !force) return _schemaCache;
  _schemaCache   = await airtableMeta();
  _schemaCachedAt = Date.now();
  return _schemaCache;
}

/**
 * getSelectOptions(table, fieldNameOrId) → array of option name strings.
 * Returns [] when the table or field cannot be found, so callers can treat
 * "unknown" and "unconstrained" the same way and never hard-fail on a read.
 */
export async function getSelectOptions(table, fieldNameOrId) {
  try {
    const tables = await getBaseSchema();
    const t = tables.find(x => x.id === table || x.name === table);
    if (!t) return [];
    const f = (t.fields || []).find(x => x.id === fieldNameOrId || x.name === fieldNameOrId);
    return (f?.options?.choices || []).map(c => c.name);
  } catch (e) {
    console.warn('[airtable] getSelectOptions failed:', e.message);
    return [];
  }
}

/**
 * isValidSelectValue(table, field, value) — true when the value is already an
 * option (or when the option list could not be read, so we do not block a write
 * on a schema-API hiccup).
 */
export async function isValidSelectValue(table, field, value) {
  if (value == null || value === '') return true;
  const opts = await getSelectOptions(table, field);
  if (!opts.length) return true;
  return opts.includes(value);
}

/**
 * listRecords, but tolerant of fields that do not exist yet.
 *
 * Airtable rejects the WHOLE request with 422 "Unknown field name" if any name
 * in `fields` is missing. The Threads layer reads fields that Tanner adds by
 * hand (Focus, Participation, Context, Resolves On, Last Modified Time), so a
 * strict read would take out Triage entirely until every field exists — turning
 * a partial setup into a broken tab rather than a partly populated one.
 *
 * This drops the offending field and retries, so the endpoint degrades one
 * column at a time. The dropped names are returned on the array as
 * `.missingFields` for callers that want to say so in the UI.
 */
export async function listRecordsLenient(table, opts = {}) {
  let fields = Array.isArray(opts.fields) ? [...opts.fields] : null;
  const missing = [];

  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const out = await airtableList(table, fields ? { ...opts, fields } : opts);
      if (missing.length) {
        console.warn(`[airtable] ${table}: missing field(s) ${missing.join(', ')} — read without them`);
        Object.defineProperty(out, 'missingFields', { value: missing, enumerable: false });
      }
      return out;
    } catch (e) {
      const bad = parseUnknownField(e.message);
      if (bad && fields?.includes(bad)) {
        missing.push(bad);
        fields = fields.filter(f => f !== bad);
        continue;
      }
      throw e;
    }
  }
  throw new Error('listRecordsLenient: too many unknown fields stripped');
}
