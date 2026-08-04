import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { C, SERIF, SANS, MONO, RELATES, stBg, stFg, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, VoiceMic, Spinner, Avatar, SkeletonRows } from '../components/UI.jsx';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { getContacts, createContact, updateContact, mergeContacts, parseVoice, getAirtableSchema, getAppState, setAppState } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { companyNameMatchesSlug } from '../constants/roles.js';
import ContactProfile from './ContactProfile.jsx';
import CompanySnapshot from './CompanySnapshot.jsx';

const addTa = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: `1px solid ${C.cr3}`, background: C.bg2, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', outline: 'none',
};

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

export default function Contacts({ user, showToast, openOv, closeOv, setView, companyFilter = null, initialParams = null }) {
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
  const [activeCompany,    setActiveCompany]    = useState(null);   // { id, name } → opens CompanySnapshot
  const [pins,             setPins]             = useState([]);     // pinned contact ids (persisted via app-state)
  const [selIds,           setSelIds]           = useState([]);     // bulk-selected contact ids
  const [bulkStatus,       setBulkStatus]       = useState('');
  const [bulkOwner,        setBulkOwner]        = useState('');
  const [bulkRel,          setBulkRel]          = useState('');
  const [bulkBusy,         setBulkBusy]         = useState(false);
  const [paletteOpen,      setPaletteOpen]      = useState(false);  // ⌘K quick-jump
  const [dupOpen,          setDupOpen]          = useState(false);  // duplicate review modal
  const searchWrapRef = useRef(null);

  // Keyboard shortcuts: ⌘K/Ctrl+K quick-jump, "/" focuses search.
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key === '/') { e.preventDefault(); searchWrapRef.current?.querySelector('input')?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const [prioritizing,     setPrioritizing]     = useState(false);
  const [priorityResult,   setPriorityResult]   = useState(null);   // { ranked: [...] } | 'error'

  // 2026-07 UI pass: cached contacts render instantly; fresh data follows.
  const loadContacts = useCallback(() => {
    const cached = cacheGet('contacts');
    if (cached) { setContacts(cached); setLoading(false); }
    return getContacts()
      .then(data => { cacheSet('contacts', data); setContacts(data); })
      .catch(e => showToast('Could not load contacts: ' + e.message))
      .finally(() => setLoading(false));
  }, [showToast]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Cross-view navigation params: another view (a kanban quick view, a task
  // card, ⌘K search) can land here with { openContactId } / { openCompanyId }
  // to pop the right profile or company snapshot, and/or { search } to
  // pre-filter the table. Each params object is consumed exactly once so
  // closing the overlay doesn't re-open it on the next data refresh.
  const consumedParams = useRef(null);
  useEffect(() => {
    if (!initialParams || consumedParams.current === initialParams) return;
    if (initialParams.search != null) setSearch(initialParams.search);
    if (initialParams.openCompanyId) {
      consumedParams.current = initialParams;
      setActiveCompany({ id: initialParams.openCompanyId, name: initialParams.openCompanyName || '' });
      return;
    }
    if (initialParams.openContactId) {
      const c = contacts.find(x => x.id === initialParams.openContactId);
      if (!c) return; // wait until contacts have loaded, then this re-runs
      consumedParams.current = initialParams;
      setActiveContact(c);
      return;
    }
    consumedParams.current = initialParams;
  }, [initialParams, contacts]);

  // Pinned contacts — persisted in the shared app-state store (syncs across devices).
  useEffect(() => {
    getAppState('crm.pins').then(d => setPins(Array.isArray(d?.ids) ? d.ids : [])).catch(() => {});
  }, []);
  const togglePin = (id) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setAppState('crm.pins', { ids: next }).catch(() => {});
      return next;
    });
  };

  // Merge duplicate contacts: fold dropIds into keepId (server reassigns links + deletes dups).
  const mergeDuplicates = async (keepId, dropIds) => {
    try {
      for (const d of dropIds) await mergeContacts(keepId, d);
      showToast(`Merged ${dropIds.length} duplicate${dropIds.length > 1 ? 's' : ''} ✓`);
      setDupOpen(false); loadContacts();
    } catch (e) { showToast('Merge failed: ' + e.message); }
  };

  // Bulk edit selected contacts (status / owner / add related-to entity).
  const bulkApply = async () => {
    if (!selIds.length || (!bulkStatus && !bulkOwner.trim() && !bulkRel)) { showToast('Pick a status, owner, or entity to apply'); return; }
    setBulkBusy(true);
    try {
      for (const id of selIds) {
        const c = contacts.find(x => x.id === id);
        if (!c) continue;
        const patch = {};
        if (bulkStatus) patch.status = bulkStatus;
        if (bulkOwner.trim()) patch.owner = bulkOwner.trim();
        if (bulkRel) { const rt = Array.isArray(c.relatesTo) ? c.relatesTo : []; patch.relatesTo = rt.includes(bulkRel) ? rt : [...rt, bulkRel]; }
        if (Object.keys(patch).length) await updateContact(id, patch);
      }
      showToast(`Updated ${selIds.length} contact${selIds.length > 1 ? 's' : ''} ✓`);
      setSelIds([]); setBulkStatus(''); setBulkOwner(''); setBulkRel('');
      loadContacts();
    } catch (e) { showToast('Bulk update failed: ' + e.message); }
    setBulkBusy(false);
  };

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

  // Duplicate detection: group by shared email, or exact normalized name.
  const dupGroups = useMemo(() => {
    const byKey = {};
    companyScoped.forEach(c => {
      const email = (c.email || '').trim().toLowerCase();
      const key = email ? 'e:' + email : 'n:' + (c.name || '').trim().toLowerCase();
      if (key === 'n:') return;
      (byKey[key] = byKey[key] || []).push(c);
    });
    return Object.values(byKey).filter(a => a.length > 1);
  }, [companyScoped]);

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
    // Everything you would have in front of you when someone hands you a card
    // or you get off a call. The old form captured six fields and sent you back
    // into the record afterwards to add the rest, which is when it stops
    // happening at all.
    const [f, setF] = useState({
      name: '', email: '', phone: '', company: '', role: '', linkedin: '',
      type: 'External', status: 'Active', relatesTo: [],
      owner: '', source: '', segment: '', introducedBy: '',
      currentSummary: '', bio: '', notes: '',
      nextAction: '', nextActionDate: '',
      ...prefill,
    });
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="LinkedIn / website"><Inp value={f.linkedin} onChange={fld('linkedin')} placeholder="https://…" /></FR>
          <FR label="Owner at OVMG"><Inp value={f.owner} onChange={fld('owner')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Source"><Inp value={f.source} onChange={fld('source')} placeholder="Referral, inbound, event…" /></FR>
          <FR label="Segment"><Inp value={f.segment} onChange={fld('segment')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Next action"><Inp value={f.nextAction} onChange={fld('nextAction')} /></FR>
          <FR label="Next action date"><Inp type="date" value={f.nextActionDate} onChange={fld('nextActionDate')} /></FR>
        </div>
        <FR label="Introduced by (free text)"><Inp value={f.introducedBy} onChange={fld('introducedBy')} /></FR>
        <FR label="Current summary">
          <textarea value={f.currentSummary} onChange={fld('currentSummary')} rows={2} style={addTa}
            placeholder="Where this relationship stands, in a sentence or two." />
        </FR>
        <FR label="Bio">
          <textarea value={f.bio} onChange={fld('bio')} rows={2} style={addTa} />
        </FR>
        <FR label="Notes">
          <textarea value={f.notes} onChange={fld('notes')} rows={3} style={addTa} />
        </FR>
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
    try {
      const res = await createContact(data);
      // Say when a company was created off the back of a typed name, so nobody
      // is left wondering whether a new record appeared behind their back.
      const made = (res?.companyCreated || []).map(x => x.name).join(', ');
      const dupes = (res?.possibleDuplicates || []).length;
      showToast(
        `Added ${data.name} to CRM ✓` +
        (made ? ` · created company ${made}` : '') +
        (dupes ? ` · ${dupes} possible duplicate compan${dupes === 1 ? 'y' : 'ies'} to review` : ''),
      );
      closeOv();
      loadContacts();
    } catch (e) { showToast('Failed to add contact: ' + e.message); }
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
          <span ref={searchWrapRef} style={{ display: 'inline-block' }}><Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…  ( / )" sx={{ width: 180 }} /></span>
          <Btn v="gho" onClick={() => setPaletteOpen(true)} title="Quick jump (⌘K)">⌘K</Btn>
          <Btn v="gho" onClick={() => openOv({ kind: 'modal', title: 'Voice add contact', body: <VoiceAddForm onSave={addContact} /> })}>◉ Voice</Btn>
          <Btn onClick={() => openOv({ kind: 'modal', title: 'New contact', body: <CAddForm onSave={addContact} prefill={companyFilter ? { relatesTo: [SLUG_TO_COMPANY_NAME[companyFilter] || companyFilter] } : {}} /> })}>+ New</Btn>
        </div>
      </div>

      {/* Pinned quick-access strip */}
      {(() => {
        const pinned = companyScoped.filter(c => pins.includes(c.id));
        if (!pinned.length) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginRight: 4 }}>★ Pinned</span>
            {pinned.map(c => (
              <span key={c.id} onClick={() => openContact(c)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 999, padding: '5px 11px', cursor: 'pointer', fontSize: 12, color: C.ink7 }}>
                {c.name}
                <span onClick={e => { e.stopPropagation(); togglePin(c.id); }} title="Unpin" style={{ color: C.yel, cursor: 'pointer' }}>★</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Duplicate detection banner */}
      {!loading && dupGroups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px', marginBottom: 14, background: C.redS, border: '1px solid #e0b4b4', borderRadius: 12 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: C.red }}>
            {dupGroups.length} possible duplicate {dupGroups.length > 1 ? 'sets' : 'set'} — e.g. <b>{(dupGroups[0].map(c => c.name).join(' / '))}</b>
          </div>
          <Btn v="gho" onClick={() => setDupOpen(true)}>Review</Btn>
        </div>
      )}

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

      {/* Bulk action bar */}
      {selIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, background: C.ink9, borderRadius: 11 }}>
          <b style={{ fontSize: 13, color: C.bg }}>{selIds.length} selected</b>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Sel value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} sx={{ width: 'auto' }}><option value="">Set status…</option><option>Active</option><option>Benched</option><option>Unknown</option></Sel>
            <Inp value={bulkOwner} onChange={e => setBulkOwner(e.target.value)} placeholder="Set owner…" sx={{ width: 130 }} />
            <Sel value={bulkRel} onChange={e => setBulkRel(e.target.value)} sx={{ width: 'auto' }}><option value="">+ Related to…</option>{RELATES.map(r => <option key={r}>{r}</option>)}</Sel>
            <Btn onClick={bulkApply} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Apply'}</Btn>
            <Btn v="gho" onClick={() => setSelIds([])}>Clear</Btn>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <SkeletonRows rows={8} />
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
                <th style={{ width: 34, padding: '9px 14px', borderBottom: `1px solid ${C.cr2}` }}>
                  <input type="checkbox" checked={filtered.length > 0 && filtered.every(c => selIds.includes(c.id))}
                    onChange={e => setSelIds(e.target.checked ? filtered.map(c => c.id) : [])} />
                </th>
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
                    <td onClick={e => e.stopPropagation()} style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>
                      <input type="checkbox" checked={selIds.includes(c.id)}
                        onChange={() => setSelIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} />
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span onClick={e => { e.stopPropagation(); togglePin(c.id); }} title={pins.includes(c.id) ? 'Unpin' : 'Pin'}
                          style={{ color: pins.includes(c.id) ? C.yel : C.cr3, cursor: 'pointer', fontSize: 13 }}>★</span>
                        <Avatar name={c.name} size={26} />
                        <span>{flag && <span title="Needs follow-up" style={{ color: C.red, marginRight: 5 }}>⚑</span>}{c.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>
                      {(c.companies || []).filter(co => co.id).length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{c.companies.filter(co => co.id).map(co => (
                            <button key={co.id} onClick={e => { e.stopPropagation(); setActiveCompany({ id: co.id, name: co.name || 'Company' }); }} title="Open company snapshot"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: C.accS, color: C.accD, border: `1px solid ${C.acc}30` }}>
                              {co.name || 'Company'} <span style={{ fontSize: 9, opacity: .7 }}>↗</span>
                            </button>
                          ))}</div>
                        : (c.company || '—')}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>{c.role || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{(c.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>)}</div></td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>
                      {c.email
                        ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} title="Email" style={{ color: C.blu, textDecoration: 'none' }}>✉ {c.email}</a>
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>
                      {c.phone
                        ? <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} title="Call" style={{ color: C.blu, textDecoration: 'none' }}>☏ {c.phone}</a>
                        : '—'}
                    </td>
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
          allContacts={contacts}
          onOpenContactId={id => { const t = contacts.find(x => x.id === id); if (t) setActiveContact(t); }}
          user={user}
        />
      )}

      {/* Company snapshot (opened from a company chip in the table). The
          onOpen* handlers make its People / Deals / Tasks rows clickable —
          jumping to the contact profile, the kanban quick view, or the Tasks
          board instead of dead-ending. */}
      {activeCompany && (
        <CompanySnapshot
          companyId={activeCompany.id}
          companyName={activeCompany.name}
          onClose={() => setActiveCompany(null)}
          showToast={showToast}
          onOpenContact={(id) => {
            const c = contacts.find(x => x.id === id);
            if (c) { setActiveCompany(null); setActiveContact(c); }
            else showToast?.('Contact not found in CRM list');
          }}
          onOpenOpp={setView ? (o) => { setActiveCompany(null); setView('kanban', { openOppId: o.id }); } : null}
          onOpenTask={setView ? (t) => { setActiveCompany(null); setActiveContact(null); setView('tasks', { search: t.task }); } : null}
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

      {/* ⌘K quick-jump palette */}
      {paletteOpen && (
        <QuickJump
          contacts={contacts}
          onClose={() => setPaletteOpen(false)}
          onOpenContact={c => { setPaletteOpen(false); setActiveContact(c); }}
          onOpenCompany={co => { setPaletteOpen(false); setActiveCompany({ id: co.id, name: co.name }); }}
        />
      )}

      {/* Duplicate review */}
      {dupOpen && (
        <DupReview
          groups={dupGroups}
          onClose={() => setDupOpen(false)}
          onOpen={c => { setDupOpen(false); setActiveContact(c); }}
          onMerge={mergeDuplicates}
        />
      )}
    </div>
  );
}

// ── Duplicate review + merge modal ────────────────────────────────────────────
function DupReview({ groups, onClose, onOpen, onMerge }) {
  const isMobile = useIsMobile();
  const [primary, setPrimary] = useState({}); // groupIndex -> contactId (keep)
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const doMerge = async (gi, grp) => {
    const keepId = primary[gi] || grp[0].id;
    const keep = grp.find(c => c.id === keepId);
    const dropIds = grp.filter(c => c.id !== keepId).map(c => c.id);
    if (!dropIds.length) return;
    if (!window.confirm(`Merge ${dropIds.length} record${dropIds.length > 1 ? 's' : ''} into “${keep.name}”?\n\nTheir notes, files, deals, tasks and referral links move to the kept contact, and the duplicate record${dropIds.length > 1 ? 's are' : ' is'} deleted. This can't be undone.`)) return;
    setBusy(true);
    await onMerge(keepId, dropIds);
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 175, background: 'rgba(14,16,20,.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: C.bg, borderRadius: isMobile ? 0 : 16, width: '100%', maxWidth: isMobile ? '100%' : 580, height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '85vh', overflowY: 'auto', padding: isMobile ? '20px 16px' : 24, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer' }}>×</button>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Duplicates</div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: '0 0 6px', color: C.ink9 }}>Review & merge</h2>
        <p style={{ fontSize: 12, color: C.ink5, margin: '0 0 16px' }}>Grouped by shared email or identical name. Pick which record to keep (●), then merge — the others' notes, files, deals, tasks and referral links move onto it and the duplicates are deleted.</p>
        {groups.map((grp, i) => {
          const keepId = primary[i] || grp[0].id;
          return (
            <div key={i} style={{ border: `1px solid ${C.cr2}`, borderRadius: 10, padding: 10, marginBottom: 12, background: C.bg2 }}>
              {grp.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8 }}>
                  <input type="radio" name={`prim-${i}`} checked={keepId === c.id} onChange={() => setPrimary(p => ({ ...p, [i]: c.id }))} title="Keep this one" />
                  <span onClick={() => onOpen(c)} style={{ flex: 1, fontFamily: SERIF, fontSize: 14, color: C.ink9, cursor: 'pointer' }}>{c.name} {keepId === c.id && <span style={{ fontSize: 10, color: C.grn }}>keep</span>}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{c.email || 'no email'}</span>
                  <span onClick={() => onOpen(c)} style={{ color: C.ink3, fontSize: 13, cursor: 'pointer' }}>›</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <Btn onClick={() => doMerge(i, grp)} disabled={busy}>{busy ? 'Merging…' : 'Merge into keep'}</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ⌘K quick-jump palette ─────────────────────────────────────────────────────
function QuickJump({ contacts, onClose, onOpenContact, onOpenCompany }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const fz = (h, s) => { h = (h || '').toLowerCase(); s = s.toLowerCase(); let i = 0; for (const ch of s) { i = h.indexOf(ch, i); if (i < 0) return false; i++; } return true; };
  const comps = useMemo(() => {
    const m = new Map();
    contacts.forEach(c => (c.companies || []).forEach(co => { if (co.id && !m.has(co.id)) m.set(co.id, co.name || 'Company'); }));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [contacts]);

  const results = [];
  contacts.forEach(c => { if (!q || fz([c.name, c.company, c.email, c.role].filter(Boolean).join(' '), q)) results.push({ key: 'c' + c.id, type: 'Contact', label: c.name, sub: [c.role, c.company].filter(Boolean).join(' · '), go: () => onOpenContact(c) }); });
  comps.forEach(co => { if (q && fz(co.name, q)) results.push({ key: 'co' + co.id, type: 'Company', label: co.name, sub: 'Company', go: () => onOpenCompany(co) }); });
  const rows = results.slice(0, 25);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(14,16,20,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 14, width: '100%', maxWidth: isMobile ? '92%' : 560, boxShadow: '0 30px 80px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && rows[0]) rows[0].go(); }}
          placeholder="Jump to a contact or company…"
          style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: `1px solid ${C.cr2}`, padding: '14px 16px', fontFamily: SANS, fontSize: 15, color: C.ink9, background: C.bg, outline: 'none' }} />
        <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: 6 }}>
          {rows.length ? rows.map(r => (
            <div key={r.key} onClick={r.go} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = C.cr1}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <Tag bg={r.type === 'Company' ? C.accS : C.bluS} fg={r.type === 'Company' ? C.accD : C.blu}>{r.type}</Tag>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 14, color: C.ink9 }}>{r.label}</div>
                {r.sub && <div style={{ fontSize: 11, color: C.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>}
              </div>
            </div>
          )) : <div style={{ padding: 20, textAlign: 'center', color: C.ink3, fontSize: 13, fontStyle: 'italic' }}>No matches.</div>}
        </div>
      </div>
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
