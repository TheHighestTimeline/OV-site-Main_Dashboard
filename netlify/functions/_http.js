// Shared HTTP helpers (CORS + JSON responses) for all Netlify functions.
// Extracted from the legacy _notion.js (2026-07 audit §2.1) — the Notion
// migration is complete, so the Notion client is gone and these helpers now
// live in a dependency-free module.
//
// CORS (Phase 7 audit fix H-1): restricted to known origins (was '*').
// Netlify sets process.env.URL to the deployed site URL (production), the
// preview URL (deploy previews), or http://localhost:8888 (netlify dev), so
// this covers all environments with no manual configuration. Add custom
// domains via EXTRA_ALLOWED_ORIGINS (comma-separated).

const PRIMARY_ORIGIN = process.env.URL || 'https://ovmgdashboard.netlify.app';
const EXTRA = (process.env.EXTRA_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  PRIMARY_ORIGIN,
  'http://localhost:8888',  // netlify dev default
  'http://localhost:5173',  // vite dev default
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

// Backwards-compat: handlers that import { CORS } get the primary origin by
// default. New handlers should call corsFor(event) for per-request matching.
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
