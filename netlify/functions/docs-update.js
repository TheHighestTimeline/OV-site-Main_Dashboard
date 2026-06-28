// Updates a document in the DOCS database.
// Supports: pinned, name, url, category, description
import { notion, title as mkTitle, richText, select, ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const DOCS_DB = '95c93721af8e468e81f0a2c5cc4c7350';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, pinned, name, url, category, description } = body;

    if (!id) return err(400, 'id is required');

    const properties = {};
    if (pinned      !== undefined) properties['Pinned']      = { checkbox: Boolean(pinned) };
    if (name        !== undefined) properties['Name']        = mkTitle(name);
    if (url         !== undefined) properties['URL']         = { url: url || null };
    if (category    !== undefined) properties['Category']    = select(category || 'General');
    if (description !== undefined) properties['Description'] = richText(description || '');

    if (Object.keys(properties).length === 0) {
      return err(400, 'no updatable fields provided');
    }

    await notion.pages.update({ page_id: id, properties });
    return ok({ id });
  } catch (e) {
    return err(500, e.message);
  }
};
