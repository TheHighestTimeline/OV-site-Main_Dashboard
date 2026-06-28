import { notion, getProp, ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const DOCS_DB = '95c93721af8e468e81f0a2c5cc4c7350';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const res = await notion.databases.query({
      database_id: DOCS_DB,
      page_size: 100,
      sorts: [
        { property: 'Pinned', direction: 'descending' },
        { timestamp: 'created_time', direction: 'descending' },
      ],
    });

    const docs = res.results.map(p => ({
      id:          p.id,
      name:        getProp(p, 'Name')        || '',
      url:         getProp(p, 'URL')         || '',
      category:    getProp(p, 'Category')    || 'General',
      description: getProp(p, 'Description') || '',
      addedBy:     getProp(p, 'Added By')    || '',
      addedAt:     p.created_time            || '',
      pinned:      getProp(p, 'Pinned')      || false,
    }));

    return ok(docs);
  } catch (e) {
    return err(500, e.message);
  }
};
