import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_PROJECTS || 'Projects';

// Lightweight list for form dropdowns: id + name (+ status).
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE());
    const projects = records.map(r => ({
      id:     r.id,
      name:   r.fields?.['Project Name'] || '(untitled project)',
      status: r.fields?.['Status'] || null,
    }));
    return ok(projects);
  } catch (e) {
    // Don't hard-fail the form if Projects is missing/renamed.
    if (/403|404|not found/i.test(e.message)) return ok([]);
    return err(500, e.message);
  }
};
