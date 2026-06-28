import { airtableUpdate } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CLIENTS || 'OVM Clients DB';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  if (!body.id) return err(400, 'id required');

  const fields = {};
  if (body.bio             !== undefined) fields['Bio']             = body.bio;
  if (body.brandVoice      !== undefined) fields['Brand Voice']     = body.brandVoice;
  if (body.targetAudience  !== undefined) fields['Target Audience'] = body.targetAudience;
  if (body.dos             !== undefined) fields["Do's"]            = body.dos;
  if (body.donts           !== undefined) fields["Don'ts"]          = body.donts;
  if (body.brandColors     !== undefined) fields['Brand Colors']    = (body.brandColors || []).join(', ');
  if (body.genre           !== undefined) fields['Genre']           = body.genre;
  if (body.driveFolderId   !== undefined) fields['Drive Folder ID'] = body.driveFolderId;
  if (body.color           !== undefined) fields['Color']           = body.color;
  if (body.initials        !== undefined) fields['Initials']        = body.initials;

  try {
    await airtableUpdate(TABLE(), body.id, fields);
    return ok({ id: body.id });
  } catch (e) {
    console.error('[social:artists-update]', e.message);
    return err(500, e.message);
  }
};
