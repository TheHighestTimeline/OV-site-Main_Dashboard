import { notion, title, richText, select, ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const DOCS_DB = '95c93721af8e468e81f0a2c5cc4c7350';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, url, category, description, addedBy } = body;

    if (!name) return err(400, 'name is required');
    if (!url)  return err(400, 'url is required');

    const page = await notion.pages.create({
      parent: { database_id: DOCS_DB },
      properties: {
        Name:        title(name),
        URL:         { url: url },
        Category:    select(category || 'General'),
        Description: richText(description || ''),
        'Added By':  richText(addedBy || ''),
        Pinned:      { checkbox: false },
      },
    });

    return ok({ id: page.id, name, url });
  } catch (e) {
    return err(500, e.message);
  }
};
