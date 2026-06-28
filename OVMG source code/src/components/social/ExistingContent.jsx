import { useState } from 'react';
import { T, SERIF, SANS, MONO, ALL_PLAT, PLAT_LIST, STATUS_META, tag, inputStyle, btn, Lbl } from './_shared.jsx';
import { C } from '../../constants.js';
import { Modal } from '../UI.jsx';
import { importPostsCSV } from '../../api.js';

export default function ExistingContent({ client, posts, onUpdateStatus, showToast, onReload }) {
  const [platFilter, setPlatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showImport, setShowImport] = useState(false);

  const filtered = posts.filter(p => {
    if (platFilter !== 'all'   && p.platform !== platFilter)   return false;
    if (statusFilter !== 'all' && p.status   !== statusFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Platform filter */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setPlatFilter('all')} style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 10, fontFamily: MONO, cursor: 'pointer',
            background: platFilter === 'all' ? T.acc : 'transparent',
            color: platFilter === 'all' ? T.ink9 : T.ink3,
            border: `1px solid ${platFilter === 'all' ? T.acc : T.ink5}`,
          }}>All</button>
          {PLAT_LIST.map(p => {
            const meta = ALL_PLAT[p];
            const hasPosts = posts.some(post => post.platform === p);
            if (!hasPosts) return null;
            return (
              <button key={p} onClick={() => setPlatFilter(p)} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontFamily: MONO, cursor: 'pointer',
                background: platFilter === p ? meta.color + '28' : 'transparent',
                color: platFilter === p ? meta.color : T.ink3,
                border: `1px solid ${platFilter === p ? meta.color : T.ink5}`,
              }}>{meta.icon} {meta.label}</button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: T.ink6, alignSelf: 'center' }} />

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setStatusFilter('all')} style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 10, fontFamily: MONO, cursor: 'pointer',
            background: statusFilter === 'all' ? T.ink6 : 'transparent',
            color: statusFilter === 'all' ? T.fg : T.ink3,
            border: `1px solid ${statusFilter === 'all' ? T.ink5 : T.ink6}`,
          }}>All statuses</button>
          {Object.entries(STATUS_META).map(([id, m]) => (
            <button key={id} onClick={() => setStatusFilter(id)} style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 10, fontFamily: MONO, cursor: 'pointer',
              background: statusFilter === id ? m.color + '20' : 'transparent',
              color: statusFilter === id ? m.color : T.ink3,
              border: `1px solid ${statusFilter === id ? m.color : T.ink6}`,
            }}>{m.label}</button>
          ))}
        </div>

        {/* §7 CSV bulk import */}
        <button onClick={() => setShowImport(true)} style={{
          marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, fontSize: 11,
          fontFamily: MONO, cursor: 'pointer', background: T.acc, color: T.ink9,
          border: `1px solid ${T.acc}`, display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>⇪ Import CSV</button>
      </div>

      {showImport && (
        <CsvImportModal
          clientId={client.id}
          onClose={() => setShowImport(false)}
          onDone={onReload}
          showToast={showToast}
        />
      )}

      {/* Count */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: T.ink3, letterSpacing: '.06em', marginBottom: 10 }}>
        {filtered.length} POST{filtered.length !== 1 ? 'S' : ''}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: T.ink8, border: `1px dashed ${T.ink7}`, borderRadius: 10, padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
          No posts match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(post => {
            const platMeta   = ALL_PLAT[post.platform] || { label: post.platform, color: T.ink3, icon: '◇' };
            const statusMeta = STATUS_META[post.status] || { label: post.status, color: T.ink3 };
            return (
              <div key={post.id} style={{ background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Platform icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: platMeta.color + '20', display: 'grid', placeItems: 'center', fontSize: 18, color: platMeta.color, flexShrink: 0 }}>
                    {platMeta.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Meta row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={tag(platMeta.color)}>{platMeta.icon} {platMeta.label}</span>
                      <span style={tag(statusMeta.color)}>{statusMeta.label}</span>
                      {post.ai_generated && <span style={tag(T.pur)}>AI</span>}
                      {post.scheduled_at && (
                        <span style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginLeft: 'auto' }}>{fmtDate(post.scheduled_at)}</span>
                      )}
                    </div>

                    {/* Caption */}
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                      {post.caption}
                    </p>

                    {/* Hashtags */}
                    {post.hashtags && (
                      <div style={{ fontSize: 11, color: platMeta.color, fontFamily: MONO, marginBottom: 8 }}>
                        {post.hashtags}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Status flow buttons */}
                      {post.status === 'approved' && (
                        <button onClick={() => onUpdateStatus(post.id, 'scheduled')} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 10 }}>Mark Scheduled</button>
                      )}
                      {post.status === 'scheduled' && (
                        <button onClick={() => onUpdateStatus(post.id, 'posted')} style={{ ...btn('success'), padding: '4px 10px', fontSize: 10 }}>Mark as Posted</button>
                      )}
                      {(post.status === 'scheduled' || post.status === 'approved') && (
                        <button onClick={() => onUpdateStatus(post.id, 'failed')} style={{ ...btn('danger'), padding: '4px 10px', fontSize: 10 }}>Mark Failed</button>
                      )}

                      {/* Open in platform link */}
                      {post.post_url && (
                        <a href={post.post_url} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 10, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', color: platMeta.color, borderColor: platMeta.color + '60' }}>
                          ↗ Open in {platMeta.label}
                        </a>
                      )}

                      {/* Quality score */}
                      {post.qualityScore && (
                        <span style={{ ...tag(T.grn), marginLeft: 'auto' }}>★ {post.qualityScore}/10</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── §7 CSV bulk-import modal ──────────────────────────────────────────────────
// Bulk-adds draft posts for a client from a CSV. Backend: posts-csv-import.
// Columns (platform + caption required): platform, caption, hashtags,
// scheduled_for, type, asset_tags, image_url.
const CSV_TEMPLATE =
  'platform,caption,hashtags,scheduled_for,type,asset_tags,image_url,post_url\n' +
  'instagram,"New drop is live — tap to shop!",#newdrop #ovm,2026-06-01T09:00,photo,launch,https://example.com/a.jpg,https://instagram.com/p/abc123\n' +
  'tiktok,"Behind the scenes of the shoot",#bts,2026-06-02,video,bts,,https://tiktok.com/@client/video/123\n' +
  'facebook,"Big news coming this week.",,2026-06-03,photo,teaser,,';

// Status options for imported rows. Maps the user's "already reviewed / still
// needs review" intent onto the post workflow statuses.
const IMPORT_STATUS_OPTIONS = [
  { id: 'draft',          label: 'Draft' },
  { id: 'pending_review', label: 'Needs review' },
  { id: 'approved',       label: 'Already reviewed' },
];

const CSV_VALID_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'threads'];

export function CsvImportModal({ clientId, onClose, onDone, showToast, defaultStatus = 'draft' }) {
  const [text, setText]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(defaultStatus);

  // Heuristic client-side preview; the server runs the authoritative parse and
  // returns row-level errors after import.
  const preview = (() => {
    const t = text.trim();
    if (!t) return null;
    const lines = t.split(/\r?\n/);
    if (lines.length < 2) return { total: 0, valid: 0, errors: [{ row: 1, error: 'Need a header row + at least one data row.' }] };
    const headers = lines[0].split(',').map(h => h.toLowerCase().trim());
    const pi = headers.indexOf('platform'), ci = headers.indexOf('caption');
    if (pi < 0 || ci < 0) return { total: lines.length - 1, valid: 0, errors: [{ row: 1, error: 'Header must include "platform" and "caption".' }] };
    const errors = []; let valid = 0;
    lines.slice(1).forEach((ln, i) => {
      const cells = ln.split(',');
      const platform = (cells[pi] || '').trim().toLowerCase();
      const caption  = (cells[ci] || '').trim();
      if (!CSV_VALID_PLATFORMS.includes(platform)) errors.push({ row: i + 2, error: `invalid platform "${platform || '(blank)'}"` });
      else if (!caption) errors.push({ row: i + 2, error: 'caption is required' });
      else valid++;
    });
    return { total: lines.length - 1, valid, errors };
  })();

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ovm-posts-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ''));
    r.readAsText(f);
  };

  const doImport = async () => {
    if (!text.trim()) { showToast?.('Paste or upload a CSV first.'); return; }
    setBusy(true);
    try {
      const res = await importPostsCSV(clientId, text, status);
      setResult(res);
      showToast?.(`Imported ${res.imported} post${res.imported === 1 ? '' : 's'}${res.failed ? ` · ${res.failed} skipped` : ''} ✓`);
      if (res.imported > 0) onDone?.();
    } catch (e) {
      showToast?.('Import failed: ' + e.message);
    }
    setBusy(false);
  };

  const mono9   = { fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 };
  const ghost   = { padding: '8px 14px', borderRadius: 8, fontFamily: SANS, fontWeight: 500, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.ink5, border: `1px solid ${C.cr3}` };
  const canImport = !busy && preview && preview.valid > 0;

  return (
    <Modal title="Bulk import posts from CSV" onClose={onClose}>
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, color: C.ink8 }}>
            Imported <strong>{result.imported}</strong> draft post{result.imported === 1 ? '' : 's'}
            {result.failed ? <> · <strong>{result.failed}</strong> skipped</> : null}.
          </div>
          {result.errors?.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px' }}>
              {result.errors.map((er, i) => (
                <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Row {er.row}: {er.error}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, fontFamily: SANS, fontWeight: 600, fontSize: 12, cursor: 'pointer', background: C.ink9, color: C.bg, border: 'none' }}>Done</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: C.ink7, lineHeight: 1.55, margin: 0 }}>
            <strong>platform</strong> and <strong>caption</strong> are required; platform must be one of instagram, tiktok, facebook, youtube, threads. Optional columns: hashtags, scheduled_for, type, asset_tags, image_url, and <strong>post_url</strong> (the live post link — makes the card clickable). Use this for both new content and a client's existing post history.
          </p>

          {/* Review status for the imported rows */}
          <div>
            <div style={{ ...mono9, marginBottom: 6 }}>Import as</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {IMPORT_STATUS_OPTIONS.map(o => (
                <button key={o.id} onClick={() => setStatus(o.id)} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontFamily: SANS, cursor: 'pointer',
                  background: status === o.id ? C.acc : 'transparent',
                  color: status === o.id ? '#fff' : C.ink5,
                  border: `1px solid ${status === o.id ? C.acc : C.cr3}`,
                }}>{o.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={downloadTemplate} style={ghost}>↓ Download template</button>
            <label style={ghost}>
              ↥ Upload .csv
              <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
            </label>
          </div>
          <div>
            <div style={{ ...mono9, marginBottom: 5 }}>CSV content</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
              placeholder="platform,caption,hashtags,scheduled_for,type,asset_tags,image_url"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg, color: C.ink9, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
          </div>
          {preview && (
            <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '10px 12px', background: C.bg2 }}>
              <div style={{ fontSize: 12, color: C.ink7, marginBottom: preview.errors.length ? 8 : 0 }}>
                {preview.total} row{preview.total === 1 ? '' : 's'} · <span style={{ color: C.grn }}>{preview.valid} valid</span>
                {preview.errors.length ? <> · <span style={{ color: C.red }}>{preview.errors.length} with issues</span></> : null}
              </div>
              {preview.errors.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                  {preview.errors.slice(0, 50).map((er, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.red }}>Row {er.row}: {er.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} disabled={busy} style={{ ...ghost, cursor: busy ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button onClick={doImport} disabled={!canImport}
              style={{ padding: '8px 14px', borderRadius: 8, fontFamily: SANS, fontWeight: 600, fontSize: 12, cursor: canImport ? 'pointer' : 'not-allowed', background: C.acc, color: '#fff', border: 'none', opacity: canImport ? 1 : 0.6 }}>
              {busy ? 'Importing…' : `Import ${preview?.valid || 0} post${preview?.valid === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
