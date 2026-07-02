import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, Spinner } from '../components/UI.jsx';
import { getDocuments, createDocument, getCompanies } from '../api.js';

// Matches the Entity Code single-select choices on the Companies table
// (see CRM build plan, Section 4 / July 2026 schema pass).
const ENTITY_CODE_BY_SLUG = {
  ovmg: 'OVMG', ovm: 'OVM', ovtv: 'OVTV', ovf: 'OVF',
  amplify: 'Amplify', carbonsponge: 'Carbon Sponge', ovd: 'OVD', ovv: 'OVV',
};

const TYPES = ['NCNDA', 'LOI', 'Term Sheet', 'LOC', 'Contract', 'Deck', 'Other'];
const TAGS_OPTIONS = ['Signed', 'Draft', 'Template'];

const TAG_COLOR = {
  Signed:   { bg: C.grS ?? C.cr2, fg: '#2f7d5f' },
  Draft:    { bg: C.yelS, fg: C.yel },
  Template: { bg: C.accS, fg: C.accD },
};

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

// Best-effort favicon/host label so a raw Drive/Docs/Sheets/PDF link reads
// as something recognizable without fetching anything.
function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function Documents({ user, showToast, companyFilter = null }) {
  const [companies,  setCompanies]  = useState([]);
  const [documents,  setDocuments]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  // New-document form state
  const [fName,   setFName]   = useState('');
  const [fUrl,    setFUrl]    = useState('');
  const [fType,   setFType]   = useState('Other');
  const [fTags,   setFTags]   = useState([]);
  const [fSigned, setFSigned] = useState('');
  const [fVersion,setFVersion]= useState('');

  const company = useMemo(() => {
    const code = ENTITY_CODE_BY_SLUG[companyFilter];
    return companies.find(c => c.entityCode === code) || null;
  }, [companies, companyFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const comps = await getCompanies();
      setCompanies(comps);

      const code = ENTITY_CODE_BY_SLUG[companyFilter];
      const match = comps.find(c => c.entityCode === code);
      if (match) {
        const docs = await getDocuments(match.id);
        setDocuments(docs);
      } else {
        setDocuments([]);
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleTag = t => setFTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const resetForm = () => {
    setFName(''); setFUrl(''); setFType('Other'); setFTags([]); setFSigned(''); setFVersion('');
  };

  const submit = async () => {
    if (!fName.trim()) { showToast('Name is required'); return; }
    if (!fUrl.trim())  { showToast('A link is required — this only stores the link, not the file'); return; }
    if (!company)      { showToast('No matching Company record found in Airtable for this entity — check Entity Code on the Companies table'); return; }

    setSaving(true);
    try {
      await createDocument({
        name: fName.trim(),
        type: fType,
        driveLink: fUrl.trim(),
        signedDate: fSigned || undefined,
        version: fVersion.trim() || undefined,
        tags: fTags,
        companyIds: [company.id],
      });
      showToast('Document added ✓');
      resetForm();
      setShowForm(false);
      await load();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Eyebrow>Documents</Eyebrow>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={() => setShowForm(s => !s)}>{showForm ? 'Cancel' : '+ Add document'}</Btn>
        </div>
      </div>

      {loadError && (
        <div style={{ padding: 12, borderRadius: 8, background: C.redS, color: C.red, fontFamily: SANS, fontSize: 13 }}>
          Could not load: {loadError}
        </div>
      )}

      {!loadError && !company && (
        <div style={{ padding: 14, borderRadius: 10, background: C.yelS, color: C.yel, fontFamily: SANS, fontSize: 13 }}>
          No Companies record found for this entity yet — documents can't be linked until one exists with the matching Entity Code.
        </div>
      )}

      {showForm && (
        <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 12, padding: 16, background: C.bg2, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FR label="Name">
            <Inp value={fName} onChange={setFName} placeholder="e.g. Carbon Sponge NCNDA — Nov 2026" />
          </FR>
          <FR label="Link (Drive / Docs / Sheets / PDF — whatever it lives at)">
            <Inp value={fUrl} onChange={setFUrl} placeholder="https://drive.google.com/…" />
          </FR>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <FR label="Type">
                <Sel value={fType} onChange={setFType}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </FR>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <FR label="Signed date (optional)">
                <Inp type="date" value={fSigned} onChange={setFSigned} />
              </FR>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <FR label="Version (optional)">
                <Inp value={fVersion} onChange={setFVersion} placeholder="v1, v2, final…" />
              </FR>
            </div>
          </div>
          <FR label="Tags">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TAGS_OPTIONS.map(t => {
                const on = fTags.includes(t);
                const c = TAG_COLOR[t];
                return (
                  <button key={t} onClick={() => toggleTag(t)} type="button" style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontFamily: SANS, cursor: 'pointer',
                    border: `1px solid ${on ? c.fg : C.cr3}`,
                    background: on ? c.bg : 'transparent',
                    color: on ? c.fg : C.ink5, fontWeight: on ? 600 : 400,
                  }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </FR>
          <div>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save document'}</Btn>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div style={{
          border: `1px solid ${C.cr3}`, borderRadius: 14, padding: 40,
          textAlign: 'center', color: C.ink3, fontFamily: SANS, fontSize: 14,
        }}>
          No documents linked for this company yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {documents.map(d => (
            <a
              key={d.id}
              href={d.driveLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                textDecoration: 'none',
                border: `1px solid ${C.cr3}`, borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8, background: C.bg,
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.acc}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.cr3}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: 8, background: C.accS, color: C.accD,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
                }}>
                  ⎘
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: C.ink9, lineHeight: 1.3 }}>
                    {d.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hostLabel(d.driveLink)} ↗
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {d.type && <Tag bg={C.cr2} fg={C.ink5}>{d.type}</Tag>}
                {(d.tags || []).map(t => {
                  const c = TAG_COLOR[t] || { bg: C.cr2, fg: C.ink5 };
                  return <Tag key={t} bg={c.bg} fg={c.fg}>{t}</Tag>;
                })}
              </div>
              {(d.signedDate || d.version) && (
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, display: 'flex', gap: 10 }}>
                  {d.signedDate && <span>Signed {fmtDate(d.signedDate)}</span>}
                  {d.version && <span>{d.version}</span>}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
