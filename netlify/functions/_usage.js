// Shared usage-logging helper (Phase 15 fix FN-1).
//
// Wraps inserts to the usage_events table so the Cost Transparency Dashboard
// (Phase 14) actually has data. Every AI function should call logUsage() after
// a successful provider response.
//
// Failures are swallowed (console.error only) — logging must NEVER break the
// calling function.
//
// Pricing constants are best-effort estimates as of late 2025 / early 2026.
// They're used for the dashboard's $-estimate; provider-billing-API
// integration (truth source) is a follow-up.

import { getSupabase } from './_supabase.js';

// Cost per million tokens (USD).
// Keys are model-name prefixes — longest-prefix match wins.
const PRICING = {
  // Anthropic
  'claude-opus-4':         { in: 15.00, out: 75.00 },
  'claude-opus-3':         { in: 15.00, out: 75.00 },
  'claude-sonnet-4':       { in:  3.00, out: 15.00 },
  'claude-3-5-sonnet':     { in:  3.00, out: 15.00 },
  'claude-3-sonnet':       { in:  3.00, out: 15.00 },
  'claude-haiku-4':        { in:  0.80, out:  4.00 },
  'claude-3-5-haiku':      { in:  0.80, out:  4.00 },
  'claude-3-haiku':        { in:  0.25, out:  1.25 },
  // OpenAI
  'gpt-4o-mini-transcribe': { in: 0,    out: 0,     perMinute: 0.006 },
  'gpt-4o-mini':           { in:  0.15, out:  0.60 },
  'gpt-4o':                { in:  2.50, out: 10.00 },
  'gpt-4-turbo':           { in: 10.00, out: 30.00 },
  // Google
  'gemini-1.5-flash':      { in:  0.075, out: 0.30 },
  'gemini-1.5-pro':        { in:  1.25,  out: 5.00 },
  'gemini-2':              { in:  0.075, out: 0.30 },
};

function priceFor(model) {
  if (!model) return null;
  const key = String(model).toLowerCase();
  // Longest-prefix match
  let best = null;
  let bestLen = -1;
  for (const prefix of Object.keys(PRICING)) {
    if (key.startsWith(prefix) && prefix.length > bestLen) {
      best = PRICING[prefix];
      bestLen = prefix.length;
    }
  }
  return best;
}

// Compute an estimated dollar cost given a usage record.
export function estimateCost({ model, inputTokens = 0, outputTokens = 0, minutes = 0 }) {
  const p = priceFor(model);
  if (!p) return 0;
  let cost = 0;
  if (p.in)  cost += (inputTokens  / 1_000_000) * p.in;
  if (p.out) cost += (outputTokens / 1_000_000) * p.out;
  if (p.perMinute && minutes) cost += minutes * p.perMinute;
  return cost;
}

// Pull usage info from an Anthropic SDK response object.
export function tokensFromAnthropic(resp) {
  return {
    inputTokens:  resp?.usage?.input_tokens  || 0,
    outputTokens: resp?.usage?.output_tokens || 0,
  };
}

// Pull usage info from an OpenAI SDK response object.
export function tokensFromOpenAI(resp) {
  return {
    inputTokens:  resp?.usage?.prompt_tokens     || 0,
    outputTokens: resp?.usage?.completion_tokens || 0,
  };
}

// Main logger. All fields optional except service.
//   service:  'anthropic' | 'openai' | 'google' | 'netlify' | ...
//   surface:  the function/feature name, e.g. 'social-ai-campaign'
//   model:    e.g. 'claude-sonnet-4-6'
//   inputTokens, outputTokens, minutes (for transcription)
//   estimatedCost: pass if you have a more accurate figure; otherwise computed
//   user:     { id, email } from getUser(event) — optional
//   metadata: any extra context
export async function logUsage({
  event,
  service,
  surface = '',
  operation = '',
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  minutes = 0,
  estimatedCost = null,
  user = null,
  metadata = {},
}) {
  try {
    if (!service) return;
    const cost = estimatedCost != null
      ? estimatedCost
      : estimateCost({ model, inputTokens, outputTokens, minutes });

    const supabase = getSupabase();
    const { error } = await supabase.from('usage_events').insert({
      user_id:            user?.id || '',
      service,
      surface,
      operation:          operation || service,
      model,
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      estimated_cost_usd: cost,
      metadata:           { ...metadata, minutes: minutes || undefined },
    });
    if (error) console.error('[_usage] insert failed:', error.message);
  } catch (e) {
    console.error('[_usage]', e.message);
  }
}
