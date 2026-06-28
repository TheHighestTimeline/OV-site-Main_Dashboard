import { airtableCreate, toAirtableFields, NOTES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_NOTES || 'Notes';

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
    }, NOTES_MAP);

    // Store the contact's Airtable record ID as a plain-text link
    if (contactId) fields['Linked Contact ID'] = contactId;

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, created: true });
  } catch (e) {
    return err(500, e.message);
  }
};
