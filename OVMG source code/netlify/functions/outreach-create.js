import { airtableCreate, toAirtableFields, OUTREACH_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_OUTREACH || 'Outreach';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, contactName, businessType, cityState, email, phone, website, instagram, linkedin, source, leadQuality, priority, status, assignedTo, recOffer, nextAction, notes } = body;
    if (!name || !String(name).trim()) return err(400, 'name is required');

    const obj = { name };
    if (status       !== undefined) obj.status       = status || 'No Status';
    if (contactName  !== undefined) obj.contactName  = contactName;
    if (businessType !== undefined) obj.businessType = businessType;
    if (cityState    !== undefined) obj.cityState    = cityState;
    if (email        !== undefined) obj.email        = email;
    if (phone        !== undefined) obj.phone        = phone;
    if (website      !== undefined) obj.website      = website;
    if (instagram    !== undefined) obj.instagram    = instagram;
    if (linkedin     !== undefined) obj.linkedin     = linkedin;
    if (source       !== undefined) obj.source       = source;
    if (leadQuality  !== undefined) obj.leadQuality  = leadQuality;
    if (priority     !== undefined) obj.priority     = priority;
    if (assignedTo   !== undefined) obj.assignedTo   = assignedTo;
    if (recOffer     !== undefined) obj.recOffer     = recOffer;
    if (nextAction   !== undefined) obj.nextAction   = nextAction;
    if (notes        !== undefined) obj.notes        = notes;

    const fields = toAirtableFields(obj, OUTREACH_MAP);
    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, name, created: true });
  } catch (e) {
    console.error('outreach-create error:', e);
    return err(500, e.message || 'Failed to create lead');
  }
};
