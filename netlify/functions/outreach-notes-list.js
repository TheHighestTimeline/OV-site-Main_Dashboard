// outreach-notes-list — reads inline notes from the outreach record's Notes field.
// Notes are stored as timestamped lines: "[Month D, H:MMam] body text"
// (appended by outreach-update when updateNote is provided).
import { airtableGet } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OUTREACH || 'Outreach';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const id = event.queryStringParameters?.id;
  if (!id) return err(400, 'id is required');

  try {
    const record = await airtableGet(TABLE(), id);
    const raw = record.fields?.['Notes'] || '';

    const notes = raw
      .split('\n')
      .filter(line => line.trim())
      .map((line, i) => {
        const match = line.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
        return {
          id:        `note-${i}`,
          text:      line,
          timestamp: match ? match[1] : null,
          body:      match ? match[2] : line,
          emoji:     '🗣️',
          createdAt: null,
        };
      })
      .reverse(); // newest first

    return ok(notes);
  } catch (e) {
    console.error('outreach-notes-list error:', e);
    return err(500, e.message);
  }
};
