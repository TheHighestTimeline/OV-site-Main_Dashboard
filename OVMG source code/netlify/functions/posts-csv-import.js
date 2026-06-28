// posts-csv-import — Phase 12. Bulk import draft posts from CSV.
//
// POST body: { client_id, csv: "platform,caption,hashtags,scheduled_for,type,asset_tags\n..." }
// Returns: { batchId, imported, failed, errors }
//
// CSV format:
//   header row required
//   columns (any order, any subset; platform + caption are required):
//     platform        — instagram | tiktok | facebook | youtube | threads
//     caption         — post body
//     hashtags        — space-separated, with or without #
//     scheduled_for   — ISO-8601 date or YYYY-MM-DD
//     type            — photo | video | carousel | reel | short
//     asset_tags      — comma-separated free-form tags
//     image_url       — URL to an asset (becomes media_urls[0])

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import crypto from 'crypto';

const VALID_PLATFORMS = new Set(['instagram','tiktok','facebook','youtube','threads']);
const VALID_TYPES     = new Set(['photo','video','carousel','reel','short']);
// Status the imported rows land on. 'draft' (default), 'pending_review'
// (needs review) or 'approved' (already reviewed) — chosen in the import modal.
const VALID_IMPORT_STATUS = new Set(['draft','pending_review','approved']);

// Minimal CSV parser — handles quoted values with commas. Not RFC 4180 perfect.
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    out.push(cells.map(s => s.trim()));
  }
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const clientId = body.client_id;
  const csv      = body.csv;
  if (!clientId) return err(400, 'client_id required');
  if (!csv)      return err(400, 'csv required');

  // Status all imported rows land on (defaults to draft for back-compat).
  const importStatus = VALID_IMPORT_STATUS.has(body.status) ? body.status : 'draft';

  try {
    const user = await getUser(event);
    const supabase = getSupabase();

    const rows = parseCSV(csv);
    if (rows.length < 2) return err(400, 'CSV needs a header row + at least one data row');

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const dataRows = rows.slice(1);

    const MAX_ROWS = 500;
    if (dataRows.length > MAX_ROWS) {
      return err(413, `CSV has ${dataRows.length} rows; max ${MAX_ROWS}. Split into batches and re-import.`);
    }

    const batchId = crypto.randomBytes(8).toString('hex');
    const errors = [];
    const toInsert = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const r = Object.fromEntries(headers.map((h, j) => [h, row[j] || '']));
      const platform = (r.platform || 'instagram').toLowerCase();
      const caption  = r.caption || '';

      if (!VALID_PLATFORMS.has(platform)) {
        errors.push({ row: i + 2, error: `invalid platform "${platform}"` });
        continue;
      }
      if (!caption.trim()) {
        errors.push({ row: i + 2, error: 'caption is required' });
        continue;
      }

      let scheduled = null;
      if (r.scheduled_for) {
        const d = new Date(r.scheduled_for);
        if (!isNaN(d.getTime())) scheduled = d.toISOString();
      }

      const type = (r.type || 'photo').toLowerCase();

      // Accept the live post URL under several common header spellings so an
      // exported CSV (e.g. from Twitter/IG) maps without renaming columns.
      const postUrl = r.post_url || r.url || r.link || r.permalink || '';

      toInsert.push({
        client_id:        clientId,
        platform,
        caption,
        hashtags:         r.hashtags || '',
        type:             VALID_TYPES.has(type) ? type : 'photo',
        media_urls:       r.image_url ? [r.image_url] : [],
        post_url:         postUrl || null,
        scheduled_at:     scheduled,
        status:           importStatus,
        tags:             r.asset_tags ? r.asset_tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        source_csv_batch: batchId,
        created_by_user_id: user?.id || '',
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('posts').insert(toInsert);
      if (error) {
        return err(500, `DB insert failed: ${error.message}. None imported. Fix CSV and retry.`);
      }
    }

    // Audit
    await supabase.from('csv_imports').insert({
      batch_id:           batchId,
      client_id:          clientId,
      imported_by_user_id: user?.id || '',
      rows_imported:      toInsert.length,
      rows_failed:        errors.length,
      error_log:          errors,
    });

    return ok({
      batchId,
      imported: toInsert.length,
      failed:   errors.length,
      errors,
    });
  } catch (e) {
    console.error('[posts-csv-import]', e.message);
    return err(500, e.message);
  }
};
