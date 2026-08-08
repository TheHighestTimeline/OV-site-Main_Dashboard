// File a Drive document against a record.
//
// The accept half of drive-suggest. Creates a Documents row (Drive stays the
// source of truth for the file; Airtable only ever holds the link) and points
// it at whatever record you accepted it from.
//
// Tasks are the exception: a task's documents live in its own Task Links JSON,
// because that is the list the task page reads. Filing one there appends rather
// than replaces — losing a link somebody added by hand would be the worst
// possible outcome of a convenience feature.
//
// POST { kind, id, file: { id, name, url, mimeType } }

import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { TB, airtableCreate, airtableUpdate, getRecord } from './_airtable.js';

const DOCS_TBL  = () => process.env.AIRTABLE_TABLE_DOCUMENTS || 'Documents';
const TASKS_TBL = () => process.env.AIRTABLE_TABLE_TASKS     || TB.TASKS;

const LINK_FIELD = {
  opportunity: 'Deal/Opportunity',
  contact:     'Contact',
  company:     'Company',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { kind, id, file } = JSON.parse(event.body || '{}');
    if (!id)          return err(400, 'id is required');
    if (!file?.url)   return err(400, 'file.url is required');
    if (!file?.name)  return err(400, 'file.name is required');

    if (kind === 'task') {
      const rec = await getRecord(TASKS_TBL(), id);
      if (!rec) return err(404, 'Task not found');

      let links = [];
      try { links = JSON.parse(rec.fields?.['Task Links'] || '[]'); } catch { links = []; }
      if (!Array.isArray(links)) links = [];
      if (links.some(l => l?.url === file.url)) {
        return ok({ id, alreadyLinked: true });
      }
      links.push({ label: file.name, url: file.url });
      await airtableUpdate(TASKS_TBL(), id, { 'Task Links': JSON.stringify(links) });
      return ok({ id, linked: true, links: links.length });
    }

    const field = LINK_FIELD[kind];
    if (!field) return err(400, 'kind must be opportunity, contact, company or task');

    const record = await airtableCreate(DOCS_TBL(), {
      'Name':       file.name,
      'Drive Link': file.url,
      'Type':       guessType(file.name),
      [field]:      [id],
    });
    return ok({ id: record.id, linked: true });
  } catch (e) {
    console.error('[drive-link]', e?.message || String(e));
    return err(500, e?.message || 'Could not file that document');
  }
};

/**
 * A first guess at the document type from its name.
 *
 * Only the unambiguous cases — "Other" is a fine answer, and a wrong Type is
 * worse than none because Type is the field the NCNDA detector and the
 * compliance gate read. A plain NDA falls through to Other on purpose: it is
 * not an NCNDA, and there is no NDA choice to put it in.
 *
 * These strings must stay inside the Type single-select's existing choices —
 * Airtable reads an unknown option as "create this option" and rejects the
 * whole write.
 */
function guessType(name) {
  const s = String(name || '').toLowerCase();
  if (/\bncnda\b|non[- ]?circumvent/.test(s))       return 'NCNDA';
  if (/\bloi\b|letter of intent/.test(s))           return 'LOI';
  if (/term.?sheet/.test(s))                        return 'Term Sheet';
  if (/\bloc\b|letter of credit/.test(s))           return 'LOC';
  if (/\bcontract\b|\bagreement\b|\bmsa\b/.test(s)) return 'Contract';
  if (/\bdeck\b|pitch|presentation/.test(s))        return 'Deck';
  return 'Other';
}
