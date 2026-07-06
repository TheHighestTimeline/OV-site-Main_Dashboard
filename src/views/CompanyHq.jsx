import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, Spinner } from '../components/UI.jsx';
import { getAppState, setAppState } from '../api.js';
import { COMPANY_META } from '../constants/roles.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ── Company HQ (2026-07 audit §6.2) ──────────────────────────────────────────
// Embeds the company's "HQ" Google Doc (the tabbed rundown of branding,
// mission, SOPs, automations, backend sites) as the company's source-of-truth
// home page. The doc stays editable in Google Docs — one source of truth —
// and the embed always shows the latest version. Admins set/change the doc
// URL inline; it's stored in app_state under `company-hq:{slug}`.

// Seed defaults — found in the OVMG Drive (2026-07). Used when no URL has
// been saved in app_state yet; saving a URL in-app overrides these. Link the
// remaining companies' HQ docs from their HQ tab as they're created.
const DEFAULT_HQ_DOCS = {
  amplify: 'https://docs.google.com/document/d/1Gi8uxEZWnqqwkvQisj8bVn511wmHVEhsRVd-mKneLcI/edit',
  ovmg:    'https://drive.google.com/file/d/1ABnhw51P6eaEjBPLksCriU7VHFyv7DKr/view', // "OneVibe HQ FINAL.docx" — consider converting to a Google Doc for live tabs
};

// Google Docs only allows itself to be iframed on /preview (edit view sends
// X-Frame-Options). Normalize whatever URL was pasted.
function toEmbedUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname === 'docs.google.com') {
      // /document/d/<id>/edit... → /document/d/<id>/preview
      const m = u.pathname.match(/^(\/document\/d\/[^/]+)/);
      if (m) return `https://docs.google.com${m[1]}/preview`;
    }
    if (u.hostname === 'drive.google.com') {
      const m = u.pathname.match(/^\/file\/d\/([^/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
    return url;
  } catch { return url; }
}

export default function CompanyHq({ slug, user, showToast }) {
  const meta = COMPANY_META[slug] || {};
  const isMobile = useIsMobile();
  const [url, setUrl]         = useState(null); // null = loading
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    getAppState(`company-hq:${slug}`)
      .then(r => { if (alive) setUrl(r?.data?.url || DEFAULT_HQ_DOCS[slug] || ''); })
      .catch(() => { if (alive) setUrl(DEFAULT_HQ_DOCS[slug] || ''); });
    return () => { alive = false; };
  }, [slug]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setAppState(`company-hq:${slug}`, { url: draft.trim() });
      setUrl(draft.trim());
      setEditing(false);
      showToast?.('HQ doc linked ✓');
    } catch (e) { showToast?.('Save failed: ' + e.message); }
    setBusy(false);
  };

  if (url === null) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>;
  }

  const embedUrl = toEmbedUrl(url);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: isMobile ? 500 : 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12, flexShrink: 0 }}>
        <div>
          <Eyebrow>Source of truth</Eyebrow>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: 0, color: C.ink9 }}>
            {meta.label} HQ
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: MONO, fontSize: 11, color: C.blu, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Open in Google Docs ↗
            </a>
          )}
          {user?.isAdmin && (
            <Btn v="gho" onClick={() => { setDraft(url || ''); setEditing(e => !e); }} sx={{ fontSize: 11 }}>
              {editing ? 'Cancel' : url ? 'Change doc' : 'Link HQ doc'}
            </Btn>
          )}
        </div>
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <FR label="Google Doc URL (the company HQ document)">
              <Inp value={draft} onChange={e => setDraft(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
            </FR>
          </div>
          <Btn onClick={save} disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      )}

      {!url ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 14, padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontFamily: SERIF, fontSize: 34, color: meta.color_hex || C.acc, marginBottom: 10 }}>⌂</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.ink9, marginBottom: 6 }}>No HQ doc linked yet</div>
            <p style={{ fontSize: 13, color: C.ink5, lineHeight: 1.6, margin: 0 }}>
              Link the {meta.label} HQ Google Doc (branding, mission, SOPs, automations, backend sites) and it becomes this company's home page for every employee.
              {user?.isAdmin ? ' Use “Link HQ doc” above.' : ' Ask an admin to link it.'}
            </p>
          </div>
        </div>
      ) : (
        <iframe
          title={`${meta.label} HQ`}
          src={embedUrl}
          style={{ flex: 1, width: '100%', border: `1px solid ${C.cr2}`, borderRadius: 14, background: '#fff', minHeight: isMobile ? 480 : 560 }}
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
