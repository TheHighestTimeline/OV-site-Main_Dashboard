import { useState } from 'react';
import { T, SERIF, SANS, MONO, ALL_PLAT, PLAT_LIST, tag, inputStyle, btn, Lbl } from './_shared.jsx';

// ── Per-platform row ──────────────────────────────────────────────────────────
function PlatformRow({ platId, data, onChange }) {
  const meta = ALL_PLAT[platId];
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: T.ink7, border: `1px solid ${T.ink6}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        <span style={{ color: meta.color, fontSize: 16, width: 20, textAlign: 'center' }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: T.fg, fontWeight: 500 }}>{meta.label}</div>
          {data?.handle && <div style={{ fontSize: 11, color: T.ink3, fontFamily: MONO, marginTop: 2 }}>{data.handle}</div>}
        </div>
        {data?.handle
          ? <span style={{ ...tag(meta.color), fontSize: 9 }}>Connected</span>
          : <span style={{ ...tag(T.ink3), fontSize: 9 }}>Not set</span>
        }
        <span style={{ color: T.ink3, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${T.ink6}` }}>
          <div style={{ marginTop: 10 }}>
            <Lbl>Handle</Lbl>
            <input value={data?.handle || ''} onChange={e => onChange({ ...data, handle: e.target.value })} placeholder={`@${platId}handle`} style={inputStyle} />
          </div>
          <div>
            <Lbl>Profile URL</Lbl>
            <input value={data?.profileUrl || ''} onChange={e => onChange({ ...data, profileUrl: e.target.value })} placeholder={`https://${platId}.com/...`} style={inputStyle} />
          </div>
          <div>
            <Lbl>Bio (editable)</Lbl>
            <textarea value={data?.bio || ''} onChange={e => onChange({ ...data, bio: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder={`${meta.label} bio…`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Lbl>Avatar URL</Lbl>
              <input value={data?.avatarUrl || ''} onChange={e => onChange({ ...data, avatarUrl: e.target.value })} placeholder="https://…" style={inputStyle} />
            </div>
            <div>
              <Lbl>Banner URL</Lbl>
              <input value={data?.bannerUrl || ''} onChange={e => onChange({ ...data, bannerUrl: e.target.value })} placeholder="https://…" style={inputStyle} />
            </div>
          </div>
          <div>
            <Lbl>1Password deeplink (credentials)</Lbl>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={data?.opLink || ''} onChange={e => onChange({ ...data, opLink: e.target.value })} placeholder="onepassword://…" style={{ ...inputStyle, flex: 1 }} />
              {data?.opLink && (
                <a href={data.opLink} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Open in 1P
                </a>
              )}
            </div>
          </div>
          {/* Avatar / banner preview */}
          {(data?.avatarUrl || data?.bannerUrl) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
              {data?.avatarUrl && <img src={data.avatarUrl} alt="avatar" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${T.ink5}` }} onError={e => e.target.style.display = 'none'} />}
              {data?.bannerUrl && <img src={data.bannerUrl} alt="banner" style={{ height: 48, borderRadius: 6, objectFit: 'cover', flex: 1, maxWidth: 200 }} onError={e => e.target.style.display = 'none'} />}
            </div>
          )}
          {/* External link */}
          {data?.profileUrl && (
            <div>
              <a href={data.profileUrl} target="_blank" rel="noreferrer" style={{ color: meta.color, fontSize: 11, fontFamily: MONO }}>
                ↗ View on {meta.label}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── BrandPortfolio component ──────────────────────────────────────────────────
export default function BrandPortfolio({ client, platforms, onChange, onSave, showToast }) {
  // platforms = { instagram: { handle, bio, avatarUrl, bannerUrl, profileUrl, opLink }, ... }
  const [localPlats, setLocalPlats] = useState(platforms || {});
  const [saving, setSaving] = useState(false);

  function updatePlat(platId, data) {
    setLocalPlats(p => ({ ...p, [platId]: data }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(localPlats);
      showToast?.('Brand portfolio saved ✓');
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  const folderLink = localPlats._vaultFolder || '';

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: T.ink2 }}>
          Manage {client.name}'s presence on each platform. Credentials open in 1Password.
        </div>
        <button onClick={save} disabled={saving} style={{ ...btn('primary'), opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save portfolio'}
        </button>
      </div>

      {/* Client-level 1Password folder — the whole client's vault folder, separate
          from each platform's individual credential deeplink. */}
      <div style={{ background: T.ink7, border: `1px solid ${T.ink6}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
        <Lbl>1Password folder (all this client's logins)</Lbl>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={folderLink} onChange={e => setLocalPlats(p => ({ ...p, _vaultFolder: e.target.value }))}
            placeholder="https://my.1password.com/… or onepassword://…" style={{ ...inputStyle, flex: 1 }} />
          {folderLink && (
            <a href={folderLink} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Open folder
            </a>
          )}
        </div>
      </div>

      {PLAT_LIST.map(platId => (
        <PlatformRow
          key={platId}
          platId={platId}
          data={localPlats[platId] || {}}
          onChange={data => updatePlat(platId, data)}
        />
      ))}
    </div>
  );
}
