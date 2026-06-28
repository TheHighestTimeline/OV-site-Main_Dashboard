// netlify/functions/_airtable.js
// Shared Airtable client for all Netlify functions.
// Uses the Airtable REST API via fetch — no SDK dependency needed.
// NEVER imported on the frontend. All calls are server-side only.
// AIRTABLE_TOKEN is never exposed to the browser.

const BASE_URL = 'https://api.airtable.com/v0';

function getToken() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('AIRTABLE_TOKEN env var is not set');
  return token;
}

function getBaseId() {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error('AIRTABLE_BASE_ID env var is not set');
  return id;
}

// Resolve a table name or ID for use in URL paths.
// Table IDs start with "tbl"; names are passed as-is (Airtable accepts both).
function resolveTable(tableNameOrId) {
  return encodeURIComponent(tableNameOrId);
}

async function airtableRequest(method, path, body) {
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

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `HTTP ${res.status}`;
    throw new Error(`Airtable error (${res.status}): ${msg}`);
  }
  return data;
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
  status:   'Status',       // Active / Benched / Unknown — 422-stripped if not in table
  notes:    'Notes',
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

export const NOTES_MAP = {
  title:   'Title',
  body:    'Notes',
  summary: 'AI Summary',
  type:    'Type',
};
