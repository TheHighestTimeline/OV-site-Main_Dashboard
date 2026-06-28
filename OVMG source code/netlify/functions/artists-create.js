import { airtableCreate } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CLIENTS || 'OVM Clients DB';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  if (!body.name) return err(400, 'name required');

  const fields = {
    'Name':             body.name,
    'Genre':            body.genre            || '',
    'Bio':              body.bio              || '',
    'Brand Voice':      body.brandVoice       || '',
    'Target Audience':  body.targetAudience   || '',
    'Brand Colors':     (body.brandColors     || []).join(', '),
    'IG Handle':        body.handles?.instagram || body.ig   || '',
    'TikTok Handle':    body.handles?.tiktok    || body.tiktok || '',
    'Facebook Handle':  body.handles?.facebook  || '',
    'YouTube Handle':   body.handles?.youtube   || '',
    'Color':            body.color            || '#d96b3a',
    'Initials':         body.initials         || '',
    'Drive Folder ID':  body.driveFolderId    || '',
  };
  if (Array.isArray(body.dos))   fields["Do's"]   = body.dos;
  if (Array.isArray(body.donts)) fields["Don'ts"] = body.donts;

  try {
    const record = await airtableCreate(TABLE(), fields);
    return ok({ id: record.id, ...body });
  } catch (e) {
    console.error('[social:artists-create]', e.message);
    return err(500, e.message);
  }
};
