// audio-logs-create — POST: create a new audio_log record.
// Body: { kind, transcript, status, audio_url }
// Auth required.
import { ok, err, CORS } from './_notion.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  const user = await getUser(event);
  if (!user) return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

  const { kind, transcript, status = 'pending_review', audio_url = null, file_name = null } = body;
  if (!kind || !['senior_partner', 'employee'].includes(kind)) {
    return err(400, 'kind must be senior_partner or employee');
  }

  // The live audio_logs table has a NOT-NULL file_name column. We don't store
  // raw audio files (audio_url is null; founders just drop transcripts), so we
  // always supply a synthetic, descriptive name to satisfy the constraint.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFileName = file_name || `${kind === 'senior_partner' ? 'transcript' : 'recording'}-${stamp}.txt`;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('audio_logs')
      .insert({
        kind,
        transcript:  transcript || null,
        status,
        audio_url:   audio_url || null,
        file_name:   safeFileName,
        user_id:     user.id,
        user_name:   user.fullName,
        created_at:  new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return ok({ log: data });
  } catch (e) {
    console.error('[audio-logs-create]', e.message);
    return err(500, e.message);
  }
};
