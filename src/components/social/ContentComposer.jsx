import { useState } from 'react';
import { T, SERIF, SANS, MONO, ALL_PLAT, PLAT_LIST, STATUS_META, tag, inputStyle, btn, Lbl } from './_shared.jsx';

// ── Platform preview mock UIs ─────────────────────────────────────────────────
function IGPreview({ client, caption, hashtags, assetUrl }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: `1px solid #dbdbdb`, width: '100%', maxWidth: 360, color: '#262626', fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: client?.color || T.acc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{(client?.initials || 'IG')}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{client?.handles?.instagram || client?.name || 'handle'}</div>
          <div style={{ fontSize: 10, color: '#8e8e8e' }}>Sponsored</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 18, color: '#8e8e8e' }}>…</span>
      </div>
      {/* Image placeholder */}
      <div style={{ width: '100%', aspectRatio: '1', background: assetUrl ? 'transparent' : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {assetUrl
          ? <img src={assetUrl} alt="post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ color: '#c7c7c7', fontSize: 40 }}>◉</span>}
      </div>
      {/* Actions */}
      <div style={{ padding: '10px 12px 4px', display: 'flex', gap: 14, fontSize: 20 }}>
        <span>♡</span><span>💬</span><span>↗</span>
        <span style={{ marginLeft: 'auto' }}>⊡</span>
      </div>
      {/* Caption */}
      <div style={{ padding: '4px 12px 12px', fontSize: 12, lineHeight: 1.5 }}>
        <strong>{client?.handles?.instagram || client?.name}</strong>
        {caption && <span style={{ marginLeft: 5 }}>{caption.slice(0, 120)}{caption.length > 120 ? '… more' : ''}</span>}
        {hashtags && <div style={{ color: '#00376b', marginTop: 4, fontSize: 11 }}>{hashtags.slice(0, 80)}</div>}
      </div>
    </div>
  );
}

function TikTokPreview({ client, caption, hashtags, assetUrl }) {
  return (
    <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', width: '100%', maxWidth: 200, aspectRatio: '9/16', position: 'relative', color: '#fff', fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
      {assetUrl
        ? <img src={assetUrl} alt="video" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
        : <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.8) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 48, opacity: 0.3 }}>▶</span></div>}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>@{client?.handles?.tiktok || client?.name || 'handle'}</div>
        {caption && <div style={{ fontSize: 10, lineHeight: 1.4, marginBottom: 4 }}>{caption.slice(0, 80)}{caption.length > 80 ? '…' : ''}</div>}
        {hashtags && <div style={{ fontSize: 10, color: '#69c9d0' }}>{hashtags.split(' ').slice(0, 4).join(' ')}</div>}
      </div>
      <div style={{ position: 'absolute', right: 8, bottom: 80, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        {['♡','💬','↗','♫'].map(icon => (
          <div key={icon} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22 }}>{icon}</div>
            <div style={{ fontSize: 9 }}>0</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwitterPreview({ client, caption, hashtags }) {
  const full = [caption, hashtags].filter(Boolean).join('\n\n');
  const remaining = 280 - full.length;
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid #eff3f4`, padding: 14, width: '100%', maxWidth: 360, color: '#0f1419', fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: client?.color || T.acc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{client?.initials || 'X'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{client?.name || 'Account'}</span>
            <span style={{ fontSize: 12, color: '#536471' }}>@{client?.handles?.twitter || client?.name || 'handle'}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{full || <span style={{ color: '#ccc' }}>Post content appears here…</span>}</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10, color: '#536471', fontSize: 18 }}>
            <span>💬</span><span>↺</span><span>♡</span><span>↗</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, padding: '6px 10px', background: remaining < 20 ? '#fef2f2' : '#f7f9fa', borderRadius: 6, fontSize: 11, fontFamily: MONO, color: remaining < 0 ? '#f25c5c' : '#536471', textAlign: 'right' }}>
        {remaining} chars remaining
      </div>
    </div>
  );
}

function ThreadsPreview({ client, caption, hashtags }) {
  const full = [caption, hashtags].filter(Boolean).join('\n\n');
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid #dbdbdb`, padding: 14, width: '100%', maxWidth: 360, color: '#000', fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: client?.color || T.acc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{client?.initials || '◎'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{client?.handles?.threads || client?.name || 'handle'}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{full || <span style={{ color: '#ccc' }}>Post content…</span>}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, color: '#999', fontSize: 18 }}>
            <span>♡</span><span>💬</span><span>↺</span><span>↗</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({ client, caption, hashtags }) {
  const full = [caption, hashtags].filter(Boolean).join('\n\n');
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid #e0e0e0`, padding: 14, width: '100%', maxWidth: 360, color: '#000', fontFamily: 'Arial,sans-serif' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: client?.color || T.acc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{client?.initials || 'LI'}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{client?.name || 'Company'}</div>
          <div style={{ fontSize: 11, color: '#666' }}>Company Page</div>
          <div style={{ fontSize: 10, color: '#999' }}>Now · 🌐</div>
        </div>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{full || <span style={{ color: '#ccc' }}>Post content…</span>}</div>
      <div style={{ display: 'flex', gap: 20, marginTop: 12, padding: '10px 0', borderTop: '1px solid #e0e0e0', color: '#666', fontSize: 12 }}>
        <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
      </div>
    </div>
  );
}

const PREVIEW_COMPONENTS = {
  instagram: IGPreview,
  tiktok:    TikTokPreview,
  twitter:   TwitterPreview,
  threads:   ThreadsPreview,
  linkedin:  LinkedInPreview,
  youtube:   ({ caption, hashtags }) => (
    <div style={{ background: T.ink7, borderRadius: 10, padding: 16, color: T.fg, maxWidth: 360 }}>
      <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginBottom: 8, letterSpacing: '.08em' }}>YOUTUBE · DESCRIPTION PREVIEW</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{[caption, hashtags].filter(Boolean).join('\n\n') || <span style={{ color: T.ink3 }}>No description…</span>}</div>
    </div>
  ),
  facebook: IGPreview,
};

// ── ContentComposer ───────────────────────────────────────────────────────────
export default function ContentComposer({ client, clients, onSave, showToast }) {
  const [selectedPlatforms, setPlatforms] = useState(['instagram']);
  const [caption,   setCaption]   = useState('');
  const [hashtags,  setHashtags]  = useState('');
  const [assetUrl,  setAssetUrl]  = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [previewTab, setPreviewTab] = useState('instagram');
  const [saving, setSaving]       = useState(false);

  // Cross-posting suggestion
  const suggestThreads = selectedPlatforms.includes('instagram') && !selectedPlatforms.includes('threads');

  const togglePlatform = p => {
    setPlatforms(prev =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p]
    );
    if (!selectedPlatforms.includes(p)) setPreviewTab(p);
  };

  const charCount = (caption + '\n' + hashtags).trim().length;
  const currentLimit = ALL_PLAT[previewTab]?.charLimit || 2200;

  async function handleSave(status) {
    if (!caption.trim()) { showToast?.('Caption required'); return; }
    setSaving(true);
    try {
      // Create one post per platform
      for (const platform of selectedPlatforms) {
        await onSave({
          client_id: client.id,
          platform,
          caption,
          hashtags,
          asset_url: assetUrl || null,
          scheduled_at: schedDate ? new Date(schedDate).toISOString() : null,
          status,
          ai_generated: false,
        });
      }
      showToast?.(`Post ${status === 'draft' ? 'saved as draft' : 'sent for review'} ✓`);
      setCaption(''); setHashtags(''); setAssetUrl(''); setSchedDate('');
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  const PreviewComp = PREVIEW_COMPONENTS[previewTab] || PREVIEW_COMPONENTS.instagram;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1000 }}>

      {/* ── Left: Composer ──────────────────────────────────────────────── */}
      <div>
        {/* Platforms */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Platforms</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLAT_LIST.map(p => {
              const meta = ALL_PLAT[p];
              const active = selectedPlatforms.includes(p);
              return (
                <button key={p} onClick={() => togglePlatform(p)} style={{
                  padding: '5px 11px', borderRadius: 999,
                  background: active ? meta.color + '28' : 'transparent',
                  border: `1px solid ${active ? meta.color : T.ink5}`,
                  color: active ? meta.color : T.ink3,
                  cursor: 'pointer', fontSize: 11, fontFamily: MONO,
                }}>{meta.icon} {meta.label}</button>
              );
            })}
          </div>
        </div>

        {/* Cross-post suggestion */}
        {suggestThreads && (
          <div style={{ padding: '9px 13px', background: ALL_PLAT.threads.color + '15', border: `1px solid ${ALL_PLAT.threads.color}40`, borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: ALL_PLAT.threads.color, fontSize: 14 }}>◎</span>
            <span style={{ fontSize: 12, color: T.ink2 }}>Also post to Threads?</span>
            <button onClick={() => setPlatforms(p => [...p, 'threads'])} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 10, marginLeft: 'auto' }}>+ Add Threads</button>
          </div>
        )}

        {/* Caption */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <Lbl>Caption</Lbl>
            <span style={{ fontFamily: MONO, fontSize: 9, color: charCount > currentLimit ? T.red : T.ink3 }}>
              {charCount} / {currentLimit.toLocaleString()}
            </span>
          </div>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={6}
            placeholder="Write your caption here…"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }} />
        </div>

        {/* Hashtags */}
        <div style={{ marginBottom: 12 }}>
          <Lbl>Hashtags</Lbl>
          <textarea value={hashtags} onChange={e => setHashtags(e.target.value)} rows={2}
            placeholder="#newpost #brand…"
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* Asset URL */}
        <div style={{ marginBottom: 12 }}>
          <Lbl>Asset URL (image / video)</Lbl>
          <input value={assetUrl} onChange={e => setAssetUrl(e.target.value)} placeholder="https://… or Drive share link" style={inputStyle} />
        </div>

        {/* Schedule */}
        <div style={{ marginBottom: 16 }}>
          <Lbl>Schedule for (optional)</Lbl>
          <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleSave('draft')} disabled={saving} style={{ ...btn('ghost'), opacity: saving ? 0.5 : 1 }}>Save Draft</button>
          <button onClick={() => handleSave('pending_review')} disabled={saving} style={{ ...btn('primary'), opacity: saving ? 0.5 : 1 }}>
            {schedDate ? 'Schedule →' : 'Send for Review →'}
          </button>
        </div>
      </div>

      {/* ── Right: Preview ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>Live Preview</div>

        {/* Preview tab bar */}
        {selectedPlatforms.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            {selectedPlatforms.map(p => {
              const meta = ALL_PLAT[p];
              return (
                <button key={p} onClick={() => setPreviewTab(p)} style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: previewTab === p ? meta.color + '28' : 'transparent',
                  border: `1px solid ${previewTab === p ? meta.color : T.ink5}`,
                  color: previewTab === p ? meta.color : T.ink3,
                  cursor: 'pointer', fontSize: 10, fontFamily: MONO,
                }}>{meta.icon} {meta.label}</button>
              );
            })}
          </div>
        )}

        <PreviewComp
          client={client}
          caption={caption}
          hashtags={hashtags}
          assetUrl={assetUrl}
        />

        {selectedPlatforms.includes('instagram') && selectedPlatforms.includes('threads') && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: T.ink7, borderRadius: 8, fontSize: 11, color: T.ink3, fontFamily: MONO }}>
            ◎ Threads caption will be truncated to 500 chars if over limit.
          </div>
        )}
      </div>
    </div>
  );
}
