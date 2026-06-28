import { airtableCreate, toAirtableFields, GOALS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_GOALS || 'Goals';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { goal, owner, quarter, status, priority, progress, notes, category } = body;
    if (!goal) return err(400, 'goal is required');

    const obj = {
      goal,
      owner:    owner    || '',
      quarter:  quarter  || 'Q2 2026',
      status:   status   || 'Not Started',
      progress: progress || 0,
      notes:    notes    || '',
      category: Array.isArray(category) ? category : (category ? [category] : []),
    };
    if (priority) obj.priority = priority;

    const fields = toAirtableFields(obj, GOALS_MAP);
    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, goal });
  } catch (e) {
    return err(500, e.message);
  }
};
