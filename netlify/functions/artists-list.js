import { airtableList } from './_airtable.js';
import { ok, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CLIENTS || 'OVM Clients DB';

function toClient(r) {
  const f = r.fields || {};
  const name = f['Name'] || f['Client Name'] || f['Full Name'] || '';
  return {
    id:             r.id,
    name,
    genre:          f['Genre']           || '',
    bio:            f['Bio']             || '',
    brandVoice:     f['Brand Voice']     || '',
    targetAudience: f['Target Audience'] || '',
    dos:            Array.isArray(f["Do's"])   ? f["Do's"]   : [],
    donts:          Array.isArray(f["Don'ts"]) ? f["Don'ts"] : [],
    brandColors:    typeof f['Brand Colors'] === 'string'
                      ? f['Brand Colors'].split(',').map(s => s.trim()).filter(Boolean)
                      : [],
    handles: {
      instagram: f['IG Handle']       || '',
      tiktok:    f['TikTok Handle']   || '',
      facebook:  f['Facebook Handle'] || '',
      youtube:   f['YouTube Handle']  || '',
    },
    followers: {
      instagram: f['IG Followers']     || null,
      tiktok:    f['TikTok Followers'] || null,
      youtube:   f['YouTube Followers']|| null,
    },
    color:         f['Color']           || '#d96b3a',
    initials:      f['Initials']        || name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    driveFolderId: f['Drive Folder ID'] || '',
    lastSynced:    f['Last Synced']     || null,
    platforms: ['instagram','tiktok','facebook','youtube'].filter(pl => {
      const key = { instagram:'IG Handle', tiktok:'TikTok Handle', facebook:'Facebook Handle', youtube:'YouTube Handle' }[pl];
      return !!f[key];
    }),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Name', direction: 'asc' }],
    });
    return ok(records.map(toClient).filter(c => c.name));
  } catch (e) {
    console.error('[social:artists-list]', e.message);
    return ok([]); // soft-fail: UI shows sample data
  }
};
