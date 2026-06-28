import { airtableUpdate, toAirtableFields, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, name, role, email, phone, status, type, relatesTo } = body;
    if (!id) return err(400, 'id is required');

    const update = {};
    if (name      !== undefined) update.name      = name;
    if (role      !== undefined) update.role      = role;
    if (email     !== undefined) update.email     = email;
    if (phone     !== undefined) update.phone     = phone;
    if (status    !== undefined) update.status    = status;
    if (type      !== undefined) update.type      = type;
    if (relatesTo !== undefined) update.relatesTo = Array.isArray(relatesTo) ? relatesTo : [];

    const fields = toAirtableFields(update, CONTACTS_MAP);
    if (Object.keys(fields).length === 0) return ok({ id, updated: false });

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
