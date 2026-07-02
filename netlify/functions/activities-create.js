import { airtableCreate, toAirtableFields } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const ACTIVITIES_MAP = {
  title:     'Title',
  type:      'Type',
  source:    'Source',
  date:      'Date',
  body:      'Body',
  driveLink: 'Drive Link',
  aiSummary: 'AI Summary',
};

// This is the write side of the confirm-first voice/transcript pipeline
// (CRM build plan, Section 6: voice note or pasted transcript -> Whisper ->
// Claude extraction -> confirm screen -> this endpoint). The confirm screen
// is expected to have already happened client-side; this function just
// persists what the user approved. It does not do any AI classification.
//
// An Activity always routes to exactly ONE company (the subject of the
// interaction), even though the linked Contact may belong to several
// companies — that's the whole point of this table per the CRM decision log.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      title, type, source, date, bodyText, driveLink, aiSummary,
      contactIds, companyIds,
    } = body;

    if (!title) return err(400, 'title is required');
    if (!Array.isArray(contactIds) || !contactIds.length) {
      return err(400, 'contactIds (array of CRM Contacts record IDs) is required');
    }
    if (!Array.isArray(companyIds) || companyIds.length !== 1) {
      return err(400, 'companyIds must be an array with exactly one Company record ID — an Activity routes to the single company the interaction was about');
    }

    const fields = toAirtableFields({
      title,
      type:      type   || 'Note',
      source:    source || 'Manual',
      date:      date   || new Date().toISOString().slice(0, 10),
      body:      bodyText  || '',
      driveLink: driveLink || '',
      aiSummary: aiSummary || '',
    }, ACTIVITIES_MAP);

    fields['Contact'] = contactIds;
    fields['Company'] = companyIds;

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, title });
  } catch (e) {
    return err(500, e.message);
  }
};
