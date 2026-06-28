import { notion, ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id } = body;

    if (!id) return err(400, 'id is required');

    // Archive (soft-delete) the page in Notion
    await notion.pages.update({ page_id: id, archived: true });

    return ok({ id });
  } catch (e) {
    return err(500, e.message);
  }
};
