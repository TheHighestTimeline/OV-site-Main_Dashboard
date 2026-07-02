import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO, RELATES, stBg, stFg, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, VoiceMic, Spinner } from '../components/UI.jsx';
import { getContacts, createContact, parseVoice, getAirtableSchema } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { companyNameMatchesSlug } from '../constants/roles.js';
import ContactProfile from './ContactProfile.jsx';

const COMPANIES = ['All', 'OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify Artists', 'CarbonSponge', 'OVD', 'OVV'];
const COMPANY_CHIP_SLUG = {
  OVMG: 'ovmg', OVM: 'ovm', OVTV: 'ovtv', OVF: 'ovf',
  'Amplify Artists': 'amplify', CarbonSponge: 'carbonsponge', OVD: 'ovd', OVV: 'ovv',
};
const SLUG_TO_COMPANY_NAME = {
  ovmg: 'OVMG', ovm: 'OVM', ovtv: 'OVTV', ovf: 'OVF',
  amplify: 'Amplify Artists', carbonsponge: 'Carbon Sponge', ovd: 'OVD', ovv: 'OVV',
};

// ── Staleness helpers ─────────────────────────────────────────────────────────
function daysSince(c) {
  if (c.daysSinceContact != null) return c.daysSinceContact;
  if (!c.last_contacted_at) return null;
  return Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000);
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < new Date().setHours(0, 0, 0, 0);
}
// A contact "needs follow-up" if it's Active and either never contacted,
// stale (14+ days), or has an overdue next-action date.
function needsFollowup(c) {
  if ((c.status || 'Active') !== 'Active') return false;
  const d = daysSince(c);
  return d == null || d >= 14 || isOverdue(c.nextActionDate);
}
function ContactBadge({ c, compact = false }) {
  const days = daysSince(c);
  if (days == null) return <span style={{ color: C.red, fontWeight: 600, fontSize: compact ? 11 : 13 }}>Never ⚑</span>;
  const stale = days >= 30 ? 'red' : days >= 14 ? 'amber' : 'ok';
  const color = stale === 'red' ? C.red : stale === 'amber' ? C.yel : C.ink5;
  const label = days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return (
    <span style={{ color, fontWeight: stale === 'ok' ? 400 : 600, fontSize: compact ? 11 : 13, whiteSpace: 'nowrap' }}>
      {fmtR(c.last_contacted_at)} {stale !== 'ok' && `· ${label}`}{stale === 'red' && ' ⚑'}
    </span>
  );
}

export default function Contacts({ user, showToast, openOv, closeOv, companyFilter = null }) {
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [cfSt,     setCfSt]     = useState('All');
  const [cfTy,     setCfTy]     = useState('All');
  const [cfRe,     setCfRe]     = useState('All');
  const [cfCo,     setCfCo]     = useState('All');
  const [sortCol,  setSortCol]  = useState('name');
  const [sortDir,  setSortDir]  = useState('asc');

  // New UI state
  const [filtersOpen,      setFiltersOpen]      = useState(false);
  const [followupOnly,     setFollowupOnly]     = useState(false);
  const [activeContact,    setActiveContact]    = useState(null);   // opens full-screen profile
  const [prioritizing,     setPrioritizing]     = useState(false);
  const [priorityResult,   setPriorityResult]   = useState(null);   // { ranked: [...] } | 'error'

  const loadContacts = useCallback(() =>
    getContacts()
      .then(setContacts)
      .catch(e => showToast('Could not load contacts: ' + e.message))
      .finally(() => setLoading(false)),
  [showToast]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  const [contactTableId, setContactTableId] = useState(null);
  useEffect(() => {
    getAirtableSchema().then(({ tables }) => {
      const t = tables.find(t => t.name === 'CRM Contacts' || t.name === 'Contacts');
      if (t) setContactTableId(t.id);
    }).catch(() => {});
  }, []);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  // Company-scoped base list (per-company Contacts tab)
  const companyScoped = useMemo(() => contacts.filter(c =>
    !companyFilter || companyNameMatchesSlug(c.company, companyFilter)
      || (c.relatesTo || []).some(r => companyNameMatchesSlug(r, companyFilter))
  ), [contacts, companyFilter]);

  const followupCount = useMemo(() => companyScoped.filter(needsFollowup).length, [companyScoped]);

  const filtered = companyScoped.filter(c => {
    if (followupOnly && !needsFollowup(c)) return false;
    if (cfSt !== 'All' && c.status !== cfSt) return false;
    if (cfTy !== 'All' && c.type   !== cfTy) return false;
    if (cfRe !== 'All' && !(c.relatesTo || []).includes(cfRe)) return false;
    if (cfCo !== 'All') {
      const slug = COMPANY_CHIP_SLUG[cfCo];
      const coMatch = slug
        ? companyNameMatchesSlug(c.company, slug) || (c.relatesTo || []).some(r => companyNameMatchesSlug(r, slug))
        : (c.company || '').toLowerCase() === cfCo.toLowerCase();
      if (!coMatch) return false;
    }
    if (search) {
      const hay = [c.name, c.company, c.email, c.role, c.phone, ...(c.relatesTo || [])].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'last_contacted') {
      cmp = (a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0) - (b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0);
    } else if (sortCol === 'name')    cmp = (a.name || '').localeCompare(b.name || '');
    else if (sortCol === 'company')   cmp = (a.company || '').localeCompare(b.company || '');
    else if (sortCol === 'role')      cmp = (a.role || '').localeCompare(b.role || '');
    else if (sortCol === 'email')     cmp = (a.email || '').localeCompare(b.email || '');
    else if (sortCol === 'status')    cmp = (a.status || '').localeCompare(b.status || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const activeFilterCount =
    (cfSt !== 'All' ? 1 : 0) + (cfTy !== 'All' ? 1 : 0) + (cfRe !== 'All' ? 1 : 0) +
    (cfCo !== 'All' ? 1 : 0) + (search ? 1 : 0) + (followupOnly ? 1 : 0);
  const clearFilters = () => { setCfSt('All'); setCfTy('All'); setCfRe('All'); setCfCo('All'); setSearch(''); setFollowupOnly(false); };

  // ── AI: who should I contact today? ─────────────────────────────────────────
  const runPrioritize = async () => {
    setPrioritizing(true); setPriorityResult(null);
    const candidates = companyScoped.filter(needsFollowup).slice(0, 40).map(c => ({
      contactId: c.id, name: c.name, company: c.company, status: c.status,
      daysSinceContact: daysSince(c), nextAction: c.nextAction || null, nextActionDate: c.nextActionDate || null,
    }));
    if (candidates.length === 0) { setPrioritizing(false); showToast('Nothing needs follow-up right now ✓'); return; }
    try {
      const res = await parseVoice(JSON.stringify(candidates), { section: 'contact-prioritize' });
      setPriorityResult(res && Array.isArray(res.ranked) ? res : { ranked: [] });
    } catch (e) { setPriorityResult('error'); showToast('AI failed: ' + e.message); }
    setPrioritizing(false);
  };

  // ── Add-contact forms (still use the modal overlay) ─────────────────────────
  function VoiceAddForm({ onSave }) {
    const [step, setStep] = useState('record');
    const [prefill, setPrefill] = useState(null);
    const handleTranscript = async text => {
      try { const res = await parseVoice(text, { section: 'new-contact' }); setPrefill(res.contact || { name: '', email: '', type: 'External', status: 'Active' }); }
      catch { setPrefill({ name: '', email: '', type: 'External', status: 'Active' }); }
      setStep('review');
    };
    if (step === 'record') return (
      <div>
        <p style={{ color: C.ink5, fontSize: 13, margin: '0 0 4px', lineHeight: 1.5 }}>Say who you're adding — name, company, role, email, how you met.</p>
        <VoiceMic label="Tap to start" size={72} onTranscript={handleTranscript} />
      </div>
    );
    return <CAddForm prefill={prefill} onSave={onSave} />;
  }

  function CAddForm({ prefill = {}, onSave }) {
    const [f, setF] = useState({ name: '', email: '', phone: '', company: '', role: '', website: '', type: 'External', status: 'Active', relatesTo: [], ...prefill });
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const toggleRel = v => setF(p => ({ ...p, relatesTo: p.relatesTo.includes(v) ? p.relatesTo.filter(x => x !== v) : [...p.relatesTo, v] }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Name *"><Inp value={f.name} onChange={fld('name')} placeholder="Full name" /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Email"><Inp value={f.email} onChange={fld('email')} /></FR>
          <FR label="Phone"><Inp value={f.phone} onChange={fld('phone')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Company"><Inp value={f.company} onChange={fld('company')} /></FR>
          <FR label="Role"><Inp value={f.role} onChange={fld('role')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Type"><Sel value={f.type} onChange={fld('type')}><option>External</option><option>Internal</option></Sel></FR>
          <FR label="Status"><Sel value={f.status} onChange={fld('status')}><option>Active</option><option>Benched</option><option>Unknown</option></Sel></FR>
        </div>
        <FR label="Companies (deal category)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COMPANIES.filter(x => x !== 'All').map(x => {
              const on = f.relatesTo.includes(x);
              return <button key={x} type="button" onClick={() => toggleRel(x)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5, border: `1px solid ${on ? C.ink9 : C.cr3}` }}>{x}</button>;
            })}
          </div>
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={() => { if (!f.name.trim()) { showToast('Name is required'); return; } onSave(f); }}>Add contact</Btn>
        </div>
      </div>
    );
  }

  const addContact = async data => {
    try { await createContact(data); showToast(`Added ${data.name} to CRM ✓`); closeOv(); loadContacts(); }
    catch (e) { showToast('Failed to add contact: ' + e.message); }
  };

  const chip = (opts, cur, set) => (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {opts.map(o => (
        <button key={o} onClick={() => set(o)} style={{ background: o === cur ? C.ink9 : C.bg2, color: o === cur ? C.bg : C.ink5, border: `1px solid ${o === cur ? C.ink9 : C.cr3}`, borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: SANS }}>{o}</button>
      ))}
    </div>
  );

  const openContact = c => setActiveContact(c);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>CRM</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Contacts</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" sx={{ width: 180 }} />
          <Btn v="gho" onClick={() => openOv({ kind: 'modal', title: 'Voice add contact', body: <VoiceAddForm onSave={addContact} /> })}>◉ Voice</Btn>
          <Btn onClick={() => openOv({ kind: 'modal', title: 'New contact', body: <CAddForm onSave={addContact} prefill={companyFilter ? { relatesTo: [SLUG_TO_COMPANY_NAME[companyFilter] || companyFilter] } : {}} /> })}>+ New</Btn>
        </div>
      </div>

      {/* Follow-up reminder banner */}
      {!loading && followupCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 14, background: C.accS, border: '1px solid #ecd1bc', borderRadius: 12 }}>
          <span style={{ fontSize: 18 }}>⚑</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, color: C.ink9, fontWeight: 600 }}>{followupCount} contact{followupCount > 1 ? 's need' : ' needs'} follow-up</div>
            <div style={{ fontSize: 12, color: C.ink5 }}>Active relationships gone quiet 14+ days or with an overdue next action.</div>
          </div>
          <Btn v={followupOnly ? 'acc' : 'gho'} onClick={() => setFollowupOnly(v => !v)}>{followupOnly ? '✓ Showing these' : 'Show them'}</Btn>
          <Btn onClick={runPrioritize} disabled={prioritizing}>{prioritizing ? 'Thinking…' : '✦ Who should I contact today?'}</Btn>
        </div>
      )}

      {/* Collapsible filters */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltersOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: SANS, fontSize: 13, color: C.ink7 }}>
            <span style={{ fontFamily: SERIF, fontSize: 11, display: 'inline-block', transition: 'transform .15s', transform: filtersOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            Filters
            {activeFilterCount > 0 && <span style={{ background: C.acc, color: '#fff', borderRadius: 999, fontSize: 10, fontFamily: MONO, padding: '1px 7px' }}>{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3 }}>Clear all</button>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: C.ink3 }}>{filtered.length} of {companyScoped.length}</span>
        </div>

        {filtersOpen && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {[
              { l: 'Status',     o: ['All', 'Active', 'Benched', 'Unknown'], c: cfSt, s: setCfSt },
              { l: 'Type',       o: ['All', 'Internal', 'External'],         c: cfTy, s: setCfTy },
              { l: 'Relates to', o: ['All', ...RELATES],                     c: cfRe, s: setCfRe },
              { l: 'Company',    o: COMPANIES,                                c: cfCo, s: setCfCo },
            ].map(f => (
              <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 9 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>{f.l}</span>
                {chip(f.o, f.c, f.s)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading contacts…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.ink3, background: C.bg2, borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: .3 }}>◉</div>
          <p style={{ margin: 0, fontSize: 13 }}>{search || activeFilterCount ? 'No contacts match your filters.' : 'No contacts yet. Add your first contact above.'}</p>
        </div>
      ) : (
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr>
                {[
                  { label: 'Name', col: 'name' }, { label: 'Company', col: 'company' }, { label: 'Role', col: 'role' },
                  { label: 'Related to', col: null }, { label: 'Email', col: 'email' }, { label: 'Phone', col: null },
                  { label: 'Last contacted', col: 'last_contacted' }, { label: 'Status', col: 'status' }, { label: 'Type', col: null },
                ].map(({ label, col }) => {
                  const active = col && sortCol === col;
                  const arrow  = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : (col ? ' ▲▼' : '');
                  return (
                    <th key={label} onClick={col ? () => toggleSort(col) : undefined}
                      style={{ textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: active ? C.ink8 : C.ink3, padding: '9px 14px', borderBottom: `1px solid ${C.cr2}`, whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                      {label}<span style={{ opacity: active ? 1 : 0.4 }}>{arrow}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const flag = needsFollowup(c);
                return (
                  <tr key={c.id} onClick={() => openContact(c)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.cr1}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>
                      {flag && <span title="Needs follow-up" style={{ color: C.red, marginRight: 6 }}>⚑</span>}{c.name}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>
                      {(c.companyNames || []).length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{c.companyNames.map(n => <Tag key={n} bg={C.accS} fg={C.accD}>{n}</Tag>)}</div>
                        : (c.company || '—')}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>{c.role || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{(c.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>)}</div></td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{c.email || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{c.phone || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, whiteSpace: 'nowrap' }}><ContactBadge c={c} compact /></td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>{c.status && <Tag bg={stBg(c.status)} fg={stFg(c.status)}>{c.status}</Tag>}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>{c.type && <Tag bg="transparent" fg={C.ink5}>{c.type}</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full-screen contact profile */}
      {activeContact && (
        <ContactProfile
          contact={activeContact}
          contactTableId={contactTableId}
          onClose={() => setActiveContact(null)}
          showToast={showToast}
          reloadContacts={loadContacts}
        />
      )}

      {/* AI prioritize overlay */}
      {(prioritizing || priorityResult) && (
        <PriorityOverlay
          result={priorityResult}
          busy={prioritizing}
          onClose={() => { setPriorityResult(null); }}
          onPick={id => { const c = contacts.find(x => x.id === id); if (c) { setPriorityResult(null); setActiveContact(c); } }}
        />
      )}
    </div>
  );
}

// ── AI priority overlay ───────────────────────────────────────────────────────
function PriorityOverlay({ result, busy, onClose, onPick }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 170, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: C.bg, borderRadius: isMobile ? 0 : 16, width: '100%', maxWidth: isMobile ? '100%' : 560, height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '85vh', overflowY: 'auto', padding: isMobile ? '20px 16px' : 24, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer' }}>×</button>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>✦ AI priorities</div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 24, margin: '0 0 16px', color: C.ink9 }}>Who to contact today</h2>
        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.ink5, fontSize: 13, padding: '20px 0' }}><Spinner size={18} /> Ranking your relationships…</div>
        ) : result === 'error' ? (
          <p style={{ fontSize: 13, color: C.red }}>Couldn't generate priorities. Try again.</p>
        ) : (result?.ranked || []).length === 0 ? (
          <p style={{ fontSize: 13, color: C.ink5 }}>No priorities surfaced.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.ranked.map((r, i) => (
              <button key={r.contactId || i} onClick={() => r.contactId && onPick(r.contactId)}
                style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, cursor: r.contactId ? 'pointer' : 'default' }}>
                <span style={{ fontFamily: SERIF, fontSize: 18, color: C.acc, width: 22, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink9 }}>{r.name}</div>
                  {r.reason && <div style={{ fontSize: 12, color: C.ink5, marginTop: 3, lineHeight: 1.45 }}>{r.reason}</div>}
                  {r.suggestedAction && <div style={{ fontSize: 12, color: C.accD, marginTop: 4 }}>→ {r.suggestedAction}</div>}
                </span>
                {r.contactId && <span style={{ color: C.ink3, fontSize: 16, flexShrink: 0 }}>›</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
