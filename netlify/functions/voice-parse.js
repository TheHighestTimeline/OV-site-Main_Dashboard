// Takes a transcript + context (section, existing tasks/contacts) and returns
// structured actions. The prompt + parsing core lives in _voiceParse.js so the
// Granola poller and call-ingest webhook use the exact same path (§4).
import { ok, err, CORS } from './_http.js';
import { requireAuth, getUser } from './_auth.js';
import { parseTranscript } from './_voiceParse.js';

export const handler = async (event, _context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const { transcript, context: ctx } = JSON.parse(event.body || '{}');
    if (!transcript) return err(400, 'transcript is required');

    const user   = await getUser(event).catch(() => null);
    const parsed = await parseTranscript({
      transcript,
      section: ctx?.section || 'general',
      ctx,
      event,
      user,
    });
    return ok(parsed);
  } catch (e) {
    console.error('voice-parse error:', e);
    // HARDENING (§1.3): never lose the memo — return the raw transcript
    // alongside the error so the client can still save it.
    let transcript = '';
    try { transcript = JSON.parse(event.body || '{}').transcript || ''; } catch {}
    return err(500, JSON.stringify({ message: e.message, transcript }));
  }
};
