import Anthropic from '@anthropic-ai/sdk';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { logUsage, tokensFromAnthropic } from './_usage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;
  if (!process.env.ANTHROPIC_API_KEY) return err(503, 'ANTHROPIC_API_KEY not set');

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const client   = body.client || null;

  const system = client ? (
`You are the OneVibe Social AI for ${client.name} (${client.genre || 'brand'}). Stay in their voice at all times.

Brand Voice: ${client.brandVoice || 'professional and warm'}
Target Audience: ${client.targetAudience || 'general'}
${client.dos?.length ? `Do: ${client.dos.join('; ')}` : ''}
${client.donts?.length ? `Don't: ${client.donts.join('; ')}` : ''}

You write captions, hashtag clusters, schedules, and strategic plans. Keep responses tight and platform-aware. Output plain text unless asked for JSON.`
  ) : (
`You are the OneVibe Social AI for a boutique agency that manages a roster of music artists and consumer brands. Help the user manage clients, draft posts, and plan campaigns. Keep responses tight and useful.`
  );

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: messages.filter(m => m.role && m.content).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    });
    const reply = resp.content?.[0]?.text || '';

    // FN-1: log to usage_events so the Cost Dashboard sees this call
    const u = await getUser(event);
    await logUsage({
      event, service: 'anthropic', surface: 'social-ai',
      operation: 'messages.create', model: 'claude-sonnet-4-6',
      ...tokensFromAnthropic(resp),
      user: u, metadata: { hasClient: !!client },
    });

    return ok({ reply });
  } catch (e) {
    console.error('[social:social-ai]', e.message);
    return err(500, e.message);
  }
};
