// notes-create — creates a contact "note" (typed, voice, or logged-contact
// note). As of 2026-07 these are stored as rows in the shared Activities
// table (Contact-linked, Company optional) rather than a separate "Notes"
// table, which never existed in Airtable and caused every save here to fail
// with a 403 "model not found" error. ACTIVITIES_MAP below is a local copy
// of activities-create.js's field map so this file has no import-order
// dependency on that one.
import { airtableCreate, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const ACTIVITIES_MAP = {
  title:   'Title',
  body:    'Body',
  summary: 'AI Summary',
  type:    'Type',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { contactId, title: noteTitle, body: noteBody, type, summary } = body;

    const fields = toAirtableFields({
      title:   noteTitle || 'Voice Note',
      body:    noteBody  || '',
      summary: summary   || '',
      type:    type      || 'Note',
    }, ACTIVITIES_MAP);

    fields['Date'] = new Date().toISOString().slice(0, 10);
    // Contact is a linked-record field on Activities — must be an array of
    // record IDs, not a plain-text ID like the old (nonexistent) field name
    // "Linked Contact ID" this used to write to.
    if (contactId) fields['Contact'] = [contactId];

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, created: true });
  } catch (e) {
    return err(500, e.message);
  }
};
