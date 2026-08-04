// Delete a CRM contact.
//
// TWO CALLS, DELIBERATELY. `GET ?id=…` returns what points at the record and
// writes nothing; `DELETE` actually removes it. The UI runs the preview first so
// the confirm dialog can name the damage — "4 tasks, 2 deals, 11 activities" —
// instead of asking "are you sure?" about a record whose weight nobody can see.
//
// A contact who is linked to real work is almost always a contact you meant to
// merge or bench, not delete. The preview is what makes that obvious in the one
// second before it is irreversible.
import { airtableDelete, airtableGet } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { contactLinkSpecs, previewLinks, clearLinks } from './_links.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const body   = event.body ? JSON.parse(event.body) : {};
    const id     = body.id || params.id;
    if (!id) return err(400, 'id is required');

    const specs = contactLinkSpecs();

    // Preview — read only.
    if (event.httpMethod === 'GET') {
      const rec = await airtableGet(TABLE(), id).catch(() => null);
      if (!rec) return err(404, 'Contact not found');
      const { counts, total } = await previewLinks(specs, id);
      return ok({ id, name: rec.fields?.['Full Name'] || '', links: counts, total });
    }

    if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
      return err(405, 'Method not allowed');
    }

    // Unlink first, then delete. Airtable drops the links either way; doing it
    // in the open means the number reported back is the number that changed.
    const cleared = await clearLinks(specs, id);
    await airtableDelete(TABLE(), id);

    return ok({ deleted: true, id, unlinked: cleared });
  } catch (e) {
    return err(500, e.message);
  }
};
