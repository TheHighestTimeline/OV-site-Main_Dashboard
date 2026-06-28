// netlify/functions/airtable-schema.js
// Returns the Airtable base schema: table names, table IDs, and field names.
// The frontend uses this to:
//   1. Build "Open in Airtable" deep-links for every record
//   2. Verify that field mappings in _airtable.js match actual column names
//
// Endpoint: GET /.netlify/functions/airtable-schema
// Returns: { tables: [{ id, name, fields: [{ id, name, type }] }] }

import { airtableMeta } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const rawTables = await airtableMeta();

    const tables = rawTables.map(t => ({
      id:     t.id,
      name:   t.name,
      fields: (t.fields || []).map(f => ({ id: f.id, name: f.name, type: f.type })),
    }));

    return ok({ tables });
  } catch (e) {
    return err(500, e.message);
  }
};
