import { useState } from 'react';
import { T, SERIF, SANS, MONO, tag, inputStyle, btn, Lbl } from './_shared.jsx';

// ── Mock folder structure ─────────────────────────────────────────────────────
const MOCK_FOLDERS = [
  { id: 'f1', name: 'Brand Assets', type: 'folder', items: 12 },
  { id: 'f2', name: 'Photography', type: 'folder', items: 47 },
  { id: 'f3', name: 'Videos', type: 'folder', items: 8 },
  { id: 'f4', name: 'Logos', type: 'folder', items: 6 },
];
const MOCK_FILES = [
  { id: 'fi1', name: 'hero_photo_summer.jpg', type: 'image', size: '2.4 MB', modified: '2026-05-10' },
  { id: 'fi2', name: 'reel_draft_v2.mp4',    type: 'video', size: '18.7 MB', modified: '2026-05-18' },
  { id: 'fi3', name: 'logo_white.png',        type: 'image', size: '320 KB', modified: '2026-03-02' },
  { id: 'fi4', name: 'brand_kit_2026.pdf',    type: 'doc',   size: '1.1 MB', modified: '2026-01-15' },
];

const FILE_ICONS = { image: '🖼️', video: '🎬', doc: '📄', folder: '📁' };

function FolderRow({ item, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px',
      background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 8, cursor: 'pointer',
      textAlign: 'left',
    }}>
      <span style={{ fontSize: 18 }}>{FILE_ICONS[item.type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: T.fg }}>{item.name}</div>
        {item.items && <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginTop: 1 }}>{item.items} items</div>}
        {item.size  && <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginTop: 1 }}>{item.size} · {item.modified}</div>}
      </div>
      <span style={{ color: T.ink3, fontSize: 11, fontFamily: MONO }}>›</span>
    </button>
  );
}

export default function DriveAssets({ client, showToast }) {
  const [path, setPath] = useState([{ id: 'root', name: client.name }]);
  const [driveFolderId, setDriveFolderId] = useState(client.driveFolderId || '');
  const currentFolder = path[path.length - 1];
  const isRoot = path.length === 1;

  const connected = !!driveFolderId;

  return (
    <div>
      {!connected ? (
        /* ── Not connected state ── */
        <div style={{ background: T.ink8, border: `1px dashed ${T.ink7}`, borderRadius: 12, padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <div style={{ fontFamily: SANS, fontSize: 14, color: T.ink2, marginBottom: 6 }}>
            Connect a Google Drive folder for {client.name}
          </div>
          <div style={{ fontSize: 12, color: T.ink3, marginBottom: 20 }}>
            Once connected, you can browse files, copy share links, and upload assets directly.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: 400, margin: '0 auto' }}>
            <div style={{ flex: 1 }}>
              <Lbl>Drive Folder ID (from URL)</Lbl>
              <input value={driveFolderId} onChange={e => setDriveFolderId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs…" style={inputStyle} />
            </div>
            <button onClick={() => {
              if (driveFolderId.trim()) showToast?.('Drive folder connected (placeholder) ✓');
              else showToast?.('Enter a folder ID');
            }} style={btn('primary')}>Connect</button>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => showToast?.('OAuth flow coming in v2')} style={btn('ghost')}>Authorize with Google →</button>
          </div>
        </div>
      ) : (
        /* ── Connected browser ── */
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {path.map((seg, i) => (
              <span key={seg.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: T.ink3, fontSize: 11 }}>›</span>}
                <button onClick={() => setPath(path.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: i === path.length - 1 ? T.fg : T.ink3, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '.04em' }}>
                  {seg.name}
                </button>
              </span>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => showToast?.('Upload coming in v2')} style={{ ...btn('ghost'), fontSize: 10 }}>Upload</button>
              <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none', fontSize: 10 }}>Open in Drive ↗</a>
            </div>
          </div>

          {/* Folder list */}
          {isRoot && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.ink3, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Folders</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MOCK_FOLDERS.map(f => (
                  <FolderRow key={f.id} item={f} onClick={() => setPath([...path, { id: f.id, name: f.name }])} />
                ))}
              </div>
            </div>
          )}

          {/* File list */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: T.ink3, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Files</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOCK_FILES.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 18 }}>{FILE_ICONS[f.type]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: T.fg }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginTop: 1 }}>{f.size} · {f.modified}</div>
                  </div>
                  <button onClick={() => {
                    navigator.clipboard?.writeText(`https://drive.google.com/file/d/${f.id}/view`).catch(() => {});
                    showToast?.('Share link copied ✓');
                  }} style={{ ...btn('ghost'), fontSize: 10, padding: '4px 9px' }}>Copy link</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '10px 14px', background: T.ink7, borderRadius: 8, fontSize: 11, color: T.ink3, fontFamily: MONO }}>
            Showing placeholder data — live file listing requires Drive API scope.
          </div>
        </div>
      )}
    </div>
  );
}
