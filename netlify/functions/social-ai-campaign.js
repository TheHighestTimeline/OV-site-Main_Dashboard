// social-ai-campaign — Phase 7 C-1 full migration.
//
// Server-side replacement for the old direct-from-browser Anthropic call in
// Social.jsx (the "USE LIVE ANTHROPIC API" toggle that the audit fix sweep
// defensively disabled). Runs the 3-stage research → captions → enrichment
// pipeline using the dashboard's own ANTHROPIC_API_KEY env var.
//
// The frontend kicks this off, shows fake staggered progress for the 5
// "agents", and waits for the single HTTP response containing the final
// enriched post array.
//
// POST /.netlify/functions/social-ai-campaign
//   body: {
//     client:       { name, genre, brandVoice, targetAudience, dos[], donts[] },
//     campaignType: { id, label, desc },
//     durLabel:     string ('1w' / '2w' / '4w' / etc.)
//     durPosts:     number  (e.g. 8)
//     durDays:      number  (e.g. 14)
//     platforms:    string[] ('instagram' | 'tiktok' | 'facebook' | 'youtube' | 'threads')
//     brief:        string  (free-text user description)
//   }
//
//   returns: { posts: [...] }
//
// Required env vars:
//   ANTHROPIC_API_KEY  — direct Anthropic key (bills to your account)
//
// Models used (matches the original frontend prompts):
//   Stage 1 (Research):    claude-haiku-4-5-20251001
//   Stage 2 (Captions):    claude-sonnet-4-6
//   Stage 3 (Enrichment):  claude-haiku-4-5-20251001

import Anthropic from '@anthropic-ai/sdk';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { logUsage, tokensFromAnthropic } from './_usage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// extractJSON — tolerates ```json fences, leading prose, trailing commentary.
// Same behavior as the frontend extractJSON helper in Social.jsx.
// ─────────────────────────────────────────────────────────────────────────────
function extractJSON(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Try direct parse first
  try { return JSON.parse(s); } catch {}
  // Strip ```json...``` fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  // Find the first { ... } or [ ... ] balanced block
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const startIdx = s.indexOf(open);
    if (startIdx < 0) continue;
    let depth = 0;
    for (let i = startIdx; i < s.length; i++) {
      if (s[i] === open)  depth++;
      if (s[i] === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(startIdx, i + 1)); }
          catch { break; }
        }
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
async function callClaude({ model, system, user, maxTokens = 2000 }) {
  const resp = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return { text: resp.content?.[0]?.text || '', resp, model };
}

// ─────────────────────────────────────────────────────────────────────────────
async function runResearch({ client, campaignType, brief, platforms, durPosts }) {
  const sys = 'You are a social media strategist. Return only JSON.';
  const usr = `Client: ${client.name}
Genre: ${client.genre || 'brand'}
Voice: ${client.brandVoice || 'professional and warm'}
Audience: ${client.targetAudience || 'general'}
Campaign: ${campaignType?.label || 'general'} — ${campaignType?.desc || ''}
Brief: ${brief || '(none)'}
Platforms: ${platforms.join(', ')}
Posts needed: ${durPosts}

Return JSON: { "themes": [3-5 content themes], "tone_notes": "1-2 sentences on voice/style", "platform_strategy": { "<platform>": "1 sentence per platform" } }`;
  const r = await callClaude({ model: 'claude-haiku-4-5-20251001', system: sys, user: usr, maxTokens: 800 });
  return { result: extractJSON(r.text) || {}, _meta: r };
}

async function runCaptions({ client, campaignType, brief, research, platforms, durPosts, durDays }) {
  const sys = 'You write social media captions in the exact voice of the client. Return only a JSON array.';
  const usr = `Client: ${client.name}
Voice: ${client.brandVoice || 'professional and warm'}
Do's: ${(client.dos || []).join('; ') || '(none specified)'}
Don'ts: ${(client.donts || []).join('; ') || '(none specified)'}
Research: ${JSON.stringify(research)}
Brief: ${brief || '(none)'}
Platforms to use: ${platforms.join(', ')}
Number of posts: ${durPosts}
Duration: ${durDays} days

Return a JSON array of ${durPosts} post objects. Each object: {
  "platform": "<one of: ${platforms.join(' | ')}>",
  "caption": "<the actual caption, written in the client's voice, platform-appropriate length>",
  "type": "<photo | video | carousel | reel | short>",
  "dayOffset": <integer, 0 to ${durDays - 1}, distributed evenly across the duration>
}.
Mix platforms to give each one roughly equal coverage. Make captions distinct — don't repeat hooks or phrasing. Match each caption's length to the platform (TikTok/IG short, Facebook longer OK).`;
  const r = await callClaude({ model: 'claude-sonnet-4-6', system: sys, user: usr, maxTokens: 3500 });
  return { result: extractJSON(r.text) || [], _meta: r };
}

async function runEnrichment({ captions }) {
  if (!Array.isArray(captions) || captions.length === 0) return [];
  const sys = 'You add hashtags and quality scores to social posts. Return only a JSON array.';
  const usr = `Posts:
${JSON.stringify(captions)}

For each post, add:
- "hashtags": array of 6-12 platform-appropriate tags (no leading # — just the words)
- "qualityScore": integer 1-10 reflecting caption quality, platform fit, and brand-voice match

Keep all original fields exactly as provided. Return the same number of posts in the same order.`;
  const r = await callClaude({ model: 'claude-haiku-4-5-20251001', system: sys, user: usr, maxTokens: 2500 });
  return { result: extractJSON(r.text) || captions, _meta: r };
}

// ─────────────────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return err(503, 'ANTHROPIC_API_KEY not configured on server');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const client       = body.client;
  const campaignType = body.campaignType || { label: 'general', desc: '' };
  const brief        = String(body.brief || '');
  const platforms    = Array.isArray(body.platforms) && body.platforms.length > 0
                     ? body.platforms
                     : ['instagram', 'tiktok'];
  const durPosts     = Math.max(1, Math.min(40, Number(body.durPosts) || 8));
  const durDays      = Math.max(1, Math.min(180, Number(body.durDays)  || 14));

  if (!client || !client.name) return err(400, 'client.name required');

  try {
    // Stage 1 — research
    const r1 = await runResearch({ client, campaignType, brief, platforms, durPosts });
    const research = r1.result;

    // Stage 2 — captions
    const r2 = await runCaptions({ client, campaignType, brief, research, platforms, durPosts, durDays });
    let captions = r2.result;
    // Defensive: ensure we have at least some captions
    if (!Array.isArray(captions) || captions.length === 0) {
      console.warn('[social-ai-campaign] caption stage returned empty; falling back');
      captions = [];
    }

    // Stage 3 — enrichment
    const r3 = await runEnrichment({ captions });
    const enriched = r3.result;

    // FN-1: log all 3 stages
    const u = await getUser(event);
    for (const [stage, r] of [['research', r1], ['captions', r2], ['enrichment', r3]]) {
      await logUsage({
        event, service: 'anthropic', surface: 'social-ai-campaign',
        operation: `stage:${stage}`, model: r._meta.model,
        ...tokensFromAnthropic(r._meta.resp),
        user: u, metadata: { stage, clientName: client?.name },
      });
    }

    // Normalize to the same shape the frontend already expects
    const posts = (Array.isArray(enriched) ? enriched : []).map((p, i) => ({
      client_id:   client.id,
      platform:    p.platform || platforms[i % platforms.length],
      caption:     p.caption || '',
      hashtags:    Array.isArray(p.hashtags) ? p.hashtags.join(' ') : (p.hashtags || ''),
      type:        p.type || 'photo',
      qualityScore: typeof p.qualityScore === 'number' ? p.qualityScore : null,
      status:      'pending_review',
      ai_generated: true,
      scheduled_at: new Date(Date.now() + (p.dayOffset || i) * 86400000 + 10 * 3600000).toISOString(),
    }));

    return ok({
      posts,
      research,  // returned for debugging — UI can ignore
      stagesCompleted: 3,
    });
  } catch (e) {
    console.error('[social-ai-campaign]', e.message);
    return err(500, e.message || 'Campaign generation failed');
  }
};
