// Delete a Companies record. Same two-call shape as contacts-delete: `GET` is a
// read-only preview of what points at it, `DELETE` removes it.
//
// A company is usually load-bearing for more records than a contact is — it is
// the routing key for every Activity and every Document — so the preview matters
// more here, not less.
import { airtableDelete, airtableGet } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { companyLinkSpecs, previewLinks, clearLinks } from './_links.js';
import { COMPANIES_TBL } from './_companies.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const body   = event.body ? JSON.parse(event.body) : {};
    const id     = body.id || params.id;
    if (!id) return err(400, 'id is required');

    const specs = companyLinkSpecs();

    if (event.httpMethod === 'GET') {
      const rec = await airtableGet(COMPANIES_TBL(), id).catch(() => null);
      if (!rec) return err(404, 'Company not found');
      const { counts, total } = await previewLinks(specs, id);
      return ok({ id, name: rec.fields?.['Name'] || '', links: counts, total });
    }

    if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
      return err(405, 'Method not allowed');
    }

    const cleared = await clearLinks(specs, id);
    await airtableDelete(COMPANIES_TBL(), id);

    return ok({ deleted: true, id, unlinked: cleared });
  } catch (e) {
    return err(500, e.message);
  }
};
