// Shared Notion client used by all functions.
// Phase 7+ audit fix H-1: CORS restricted to known origins (was '*').
import { Client } from '@notionhq/client';

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

export const DB = {
  CRM:           '311ec2c4642881c2af03f92bb583f4ba',
  TASKS:         '311ec2c46428817a9cb8c18ea82101b0',
  OPPORTUNITIES: '311ec2c4642881418073e7a92dbcf265',
  GOALS:         '5baaa13aba09464aa686122518fd63e8',
  FINANCIAL:     '20eec2c4642881608f64f87fd778f27e',
  COMPANIES:     '312ec2c4642880aea5facc7396fb9327',
  NOTES:         '314ec2c4642880e28bd2000b1bc2224d',
  OUTREACH:      process.env.NOTION_OUTREACH_DB_ID || '',
};

// ── Property readers ─────────────────────────────────────────────────────────
export function getProp(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case 'title':        return p.title?.map(r => r.plain_text).join('') || '';
    case 'rich_text':    return p.rich_text?.map(r => r.plain_text).join('') || '';
    case 'select':       return p.select?.name || null;
    case 'status':       return p.status?.name || null;
    case 'multi_select': return p.multi_select?.map(s => s.name) || [];
    case 'number':       return p.number ?? null;
    case 'date':         return p.date?.start || null;
    case 'checkbox':     return p.checkbox ?? false;
    case 'email':        return p.email || null;
    case 'phone_number': return p.phone_number || null;
    case 'url':          return p.url || null;
    case 'relation':     return p.relation?.map(r => r.id) || [];
    case 'people':       return p.people?.map(u => u.name || u.id) || [];
    case 'created_time': return p.created_time || null;
    default:             return null;
  }
}

// ── Property builders ─────────────────────────────────────────────────────────
export function title(text) {
  return { title: [{ text: { content: String(text || '') } }] };
}
export function richText(text) {
  return { rich_text: [{ text: { content: String(text || '') } }] };
}
export function select(name) {
  return name ? { select: { name } } : { select: null };
}
export function multiSelect(names = []) {
  return { multi_select: names.map(n => ({ name: n })) };
}
export function date(iso) {
  return iso ? { date: { start: iso } } : { date: null };
}
export function number(n) {
  return { number: typeof n === 'number' ? n : null };
}
export function relation(ids = []) {
  return { relation: ids.map(id => ({ id })) };
}

// ── CORS — Phase 7 audit fix H-1 ─────────────────────────────────────────────
// Was: 'Access-Control-Allow-Origin': '*' (anywhere)
// Now: restricted to the deployed Netlify URL + localhost for local dev.
//
// Netlify automatically sets process.env.URL to the deployed site URL (for
// production deploys), or the preview URL (for deploy previews), or
// http://localhost:8888 (when running `netlify dev`). So this single source
// of truth covers production + preview + local dev correctly with no manual
// configuration.
//
// If you ever serve the dashboard from a custom domain, add it to
// EXTRA_ALLOWED_ORIGINS env var (comma-separated) on Netlify.
const PRIMARY_ORIGIN = process.env.URL || 'https://ovmgdashboard.netlify.app';
const EXTRA = (process.env.EXTRA_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'http://localhost:8888',  // netlify dev default
  'http://localhost:5173',  // vite dev default (when running netlify dev with target-port)
  ...EXTRA,
]);

function originHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN;
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Vary':                          'Origin',
  };
}

// Backwards-compat: existing handlers that import { CORS } get the primary
// origin by default. New handlers should call corsFor(event) for per-request
// origin matching.
export const CORS = originHeaders(null);

export function corsFor(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return originHeaders(origin);
}

export function ok(body, event) {
  return {
    statusCode: 200,
    headers: { ...(event ? corsFor(event) : CORS), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
export function err(code, msg, event) {
  return {
    statusCode: code,
    headers: { ...(event ? corsFor(event) : CORS), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}
