import { airtableCreate, toAirtableFields, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, role, email, phone, status, type, relatesTo } = body;
    if (!name) return err(400, 'name is required');

    const fields = toAirtableFields({
      name,
      role:      role      || '',
      email:     email     || '',
      phone:     phone     || '',
      status:    status    || 'Active',
      type:      type      || 'External',
      relatesTo: Array.isArray(relatesTo) ? relatesTo : [],
    }, CONTACTS_MAP);

    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name });
  } catch (e) {
    return err(500, e.message);
  }
};
