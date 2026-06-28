// cost-dashboard-data — Phase 14, admin only.
// Aggregates from internal usage_events table to power the Cost Transparency
// Dashboard. Does NOT pull from per-provider billing APIs in v1 — that's
// follow-up work. Numbers shown will be a best-effort estimate based on the
// dashboard's own logged calls.
//
// GET /.netlify/functions/cost-dashboard-data?period=session|today|week|month|last_month|all
//   returns: { total, byService:[...], byModel:[...], byDay:[...], topSurfaces:[...] }

import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';
import { getSupabase } from './_supabase.js';

const PERIODS = {
  session:    { hours: 24 },                 // last 24h as proxy
  today:      { hours: 24 },
  week:       { hours: 24 * 7 },
  month:      { hours: 24 * 30 },
  last_month: { hours: 24 * 30, offset_hours: 24 * 30 },
  all:        { hours: null },
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  const period = event.queryStringParameters?.period || 'month';
  const cfg = PERIODS[period] || PERIODS.month;

  try {
    const supabase = getSupabase();
    let q = supabase.from('usage_events').select('*');
    if (cfg.hours) {
      const fromMs = Date.now() - cfg.hours * 3_600_000;
      const fromIso = new Date(fromMs).toISOString();
      q = q.gte('occurred_at', fromIso);
      if (cfg.offset_hours) {
        const toIso = new Date(Date.now() - cfg.offset_hours * 3_600_000).toISOString();
        q = q.lte('occurred_at', toIso);
      }
    }
    q = q.order('occurred_at', { ascending: false }).limit(5000);
    const { data: events, error } = await q;
    if (error) throw error;

    const rows = events || [];

    // Aggregations
    const total = rows.reduce((s, e) => s + Number(e.estimated_cost_usd || 0), 0);

    const sumBy = (key) => {
      const m = new Map();
      for (const e of rows) {
        const k = e[key] || '(unknown)';
        const cur = m.get(k) || { key: k, cost: 0, count: 0, inputTokens: 0, outputTokens: 0 };
        cur.cost          += Number(e.estimated_cost_usd || 0);
        cur.count         += 1;
        cur.inputTokens   += Number(e.input_tokens  || 0);
        cur.outputTokens  += Number(e.output_tokens || 0);
        m.set(k, cur);
      }
      return Array.from(m.values()).sort((a, b) => b.cost - a.cost);
    };

    const byService    = sumBy('service');
    const trackedModels = sumBy('model').filter(r => r.key !== '(unknown)');

    // All models used across the dashboard (show even if $0 spend in this period)
    const KNOWN_MODELS = [
      'gpt-4o-mini-transcribe',
      'gpt-4o-mini',
      'gpt-4o',
      'whisper-1',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'text-embedding-ada-002',
    ];
    const trackedKeys = new Set(trackedModels.map(r => r.key));
    const zeroModels  = KNOWN_MODELS
      .filter(m => !trackedKeys.has(m))
      .map(m => ({ key: m, cost: 0, count: 0, inputTokens: 0, outputTokens: 0 }));
    const byModel = [...trackedModels, ...zeroModels];

    const topSurfaces  = sumBy('surface').filter(r => r.key !== '(unknown)').slice(0, 10);

    // By day chart data
    const byDayMap = new Map();
    for (const e of rows) {
      const day = String(e.occurred_at).slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) || 0) + Number(e.estimated_cost_usd || 0));
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([day, cost]) => ({ day, cost }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return ok({
      period,
      eventCount: rows.length,
      total,
      byService,
      byModel,
      topSurfaces,
      byDay,
      note: rows.length === 0
        ? 'No usage events logged yet. New AI/Calendar calls will populate this dashboard going forward.'
        : null,
    });
  } catch (e) {
    console.error('[cost-dashboard-data]', e.message);
    return err(500, e.message);
  }
};
