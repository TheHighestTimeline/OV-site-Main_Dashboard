import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO, RELATES, stBg, stFg, fmtR } from '../constants.js';
import { Tag, Btn, Inp, Sel, FR, VoiceMic, Spinner } from '../components/UI.jsx';
import {
  getNotes, createNote, updateNote, deleteNote, updateContact, parseVoice,
  getDocumentsForContact, createDocument, updateDocument, getTasks, createTask, updateTask,
  getFoldersForContact, getFoldersForCompany, createFolder, getActivitiesForContact,
  getOpportunities, updateOpportunity, createOpportunity,
  sendNcnda, airtableRecordUrl,
} from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import CompanySnapshot from './CompanySnapshot.jsx';

const COMPANIES = ['OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify Artists', 'CarbonSponge', 'OVD', 'OVV'];

// ── Staleness helpers (mirror Contacts.jsx) ───────────────────────────────────
function daysSince(c) {
  if (c.daysSinceContact != null) return c.daysSinceContact;
  if (!c.last_contacted_at) return null;
  return Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000);
}
function StaleBadge({ c }) {
  const days = daysSince(c);
  if (days == null) return <span style={{ color: C.red, fontWeight: 600, fontSize: 12 }}>Never contacted ⚑</span>;
  const stale = days >= 30 ? 'red' : days >= 14 ? 'amber' : 'ok';
  const color = stale === 'red' ? C.red : stale === 'amber' ? C.yel : C.ink5;
  const label = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return (
    <span style={{ color, fontWeight: stale === 'ok' ? 400 : 600, fontSize: 12 }}>
      {fmtR(c.last_contacted_at)} · {label}{stale === 'red' && ' ⚑'}
    </span>
  );
}

const PRIORITY_COLORS = { High: C.red, Medium: C.yel, Low: C.ink5 };
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < new Date().setHours(0, 0, 0, 0);
}
function isDone(status) {
  // 'Archive' is how this board marks work finished, so it counts as done here
  // too. Without it a contact's task list shows every task ever closed for them.
  return ['done', 'complete', 'canceled', 'archive', 'archived']
    .includes(String(status || '').trim().toLowerCase());
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ padding: 16, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}
function SectionLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>{children}</div>
      {right}
    </div>
  );
}

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 14, lineHeight: 1.55, resize: 'vertical', outline: 'none',
};

export default function ContactProfile({ contact, contactTableId, onClose, showToast, reloadContacts, allContacts = [], onOpenContactId, user }) {
  const isAdmin = !!user?.isAdmin;
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('overview');
  const [c, setC] = useState(contact);
  const [activeCompany, setActiveCompany] = useState(null); // { id, name } → opens CompanySnapshot
  const [showBrief, setShowBrief] = useState(false);        // meeting-prep one-pager

  // Linked companies (record IDs + resolved names) that can open the snapshot modal.
  // Prefer the index-aligned `companies` pairs from the API; fall back to zipping
  // ids/names for older payloads.
  const linkedCompanies = (c.companies && c.companies.length
    ? c.companies
    : (c.companyIds || []).map((id, i) => ({ id, name: (c.companyNames || [])[i] || '' }))
  ).map(x => ({ id: x.id, name: x.name || 'Company' }));

  // shared data
  const [notes, setNotes] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [docCount, setDocCount] = useState(null);

  useEffect(() => {
    getDocumentsForContact(c.id).then(d => setDocCount(d.length)).catch(() => setDocCount(0));
  }, [c.id]);

  const loadNotes = useCallback(() => {
    getNotes(c.id).then(setNotes).catch(() => setNotes([]));
  }, [c.id]);
  const loadTasks = useCallback(() => {
    getTasks()
      .then(all => setTasks(all.filter(t => (t.contactIds || []).includes(c.id))))
      .catch(() => setTasks([]));
  }, [c.id]);

  useEffect(() => { loadNotes(); loadTasks(); }, [loadNotes, loadTasks]);

  // Esc closes
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const openTaskCount = useMemo(() => (tasks || []).filter(t => !isDone(t.status)).length, [tasks]);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'files',    label: `Files${docCount != null ? ` (${docCount})` : ''}` },
    { id: 'deals',    label: 'Deals' },
    { id: 'notes',    label: `Notes${notes ? ` (${notes.length})` : ''}` },
    { id: 'tasks',    label: `Tasks${tasks ? ` (${openTaskCount})` : ''}` },
    { id: 'ai',       label: '✦ AI' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 160, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', background: C.bg,
        borderRadius: isMobile ? 0 : 18,
        width: '100%', maxWidth: isMobile ? '100%' : 1080,
        height: isMobile ? '100vh' : '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,.45)',
      }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '16px 16px 0' : '22px 26px 0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 'none', fontSize: 26, color: C.ink3, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.acc, color: '#fff', fontWeight: 600, display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
              {(c.name || 'U')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 22 : 30, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1.05 }}>{c.name}</h2>
              <div style={{ fontSize: 13, color: C.ink5, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {c.role && <span>{c.role}</span>}
                {c.role && (linkedCompanies.length || c.company) && <span style={{ color: C.ink3 }}>·</span>}
                {linkedCompanies.length ? linkedCompanies.map(co => (
                  <button key={co.id} onClick={() => setActiveCompany(co)} title="Open company snapshot"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontFamily: SANS, cursor: 'pointer', background: C.accS, color: C.accD, border: `1px solid #ecd1bc` }}>
                    {co.name} <span style={{ fontSize: 10, opacity: .7 }}>↗</span>
                  </button>
                )) : (c.company ? <span>{c.company}</span> : (!c.role && <span>—</span>))}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Btn v="gho" onClick={() => setShowBrief(true)}>📋 Prep</Btn>
              {c.status && <Tag bg={stBg(c.status)} fg={stFg(c.status)}>{c.status}</Tag>}
              <StaleBadge c={c} />
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: `1px solid ${C.cr2}`, overflowX: 'auto' }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 14px', fontFamily: SANS, fontSize: 13, whiteSpace: 'nowrap',
                    color: active ? C.ink9 : C.ink3, fontWeight: active ? 600 : 400,
                    borderBottom: active ? `2px solid ${C.acc}` : '2px solid transparent', marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 26px 40px' }}>
          {tab === 'overview' && <OverviewTab c={c} setC={setC} contactTableId={contactTableId} showToast={showToast} reloadContacts={reloadContacts} onLogged={loadNotes} allContacts={allContacts} onOpenContactId={onOpenContactId} isAdmin={isAdmin} />}
          {tab === 'timeline' && <TimelineTab c={c} notes={notes} />}
          {tab === 'files'    && <FilesTab c={c} showToast={showToast} onCount={setDocCount} />}
          {tab === 'deals'    && <DealsTab c={c} showToast={showToast} isAdmin={isAdmin} />}
          {tab === 'notes'    && <NotesTab c={c} notes={notes} reload={loadNotes} reloadTasks={loadTasks} setC={setC} showToast={showToast} reloadContacts={reloadContacts} />}
          {tab === 'tasks'    && <TasksTab c={c} tasks={tasks} reload={loadTasks} showToast={showToast} />}
          {tab === 'ai'       && <AiTab c={c} notes={notes} setC={setC} showToast={showToast} reloadContacts={reloadContacts} reloadTasks={loadTasks} />}
        </div>
      </div>

      {activeCompany && (
        <CompanySnapshot
          companyId={activeCompany.id}
          companyName={activeCompany.name}
          onClose={() => setActiveCompany(null)}
          showToast={showToast}
          onOpenContact={onOpenContactId ? (id) => { setActiveCompany(null); onOpenContactId(id); } : null}
        />
      )}

      {showBrief && <MeetingBrief c={c} tasks={tasks} notes={notes} onClose={() => setShowBrief(false)} />}
    </div>
  );
}

// ── Deals tab (linked Opportunities) ──────────────────────────────────────────
const OPP_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Verbal commit', 'Structuring', 'Due diligence', 'Underwriting', 'Committed', 'Closed Won', 'Closed Lost', 'Active', 'Forming', 'Exploring', 'Prospect', 'Delivered', 'In build', 'Deposit pending'];
function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v); if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function DealsTab({ c, showToast, isAdmin }) {
  const [opps, setOpps] = useState(null);
  const [pool, setPool] = useState([]);
  const [showLink, setShowLink] = useState(false);
  const [linkQ, setLinkQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getOpportunities().then(all => {
      const mine = all.filter(o => (o.contactIds || []).includes(c.id));
      setOpps(mine);
      setPool(all.filter(o => !(o.contactIds || []).includes(c.id)));
    }).catch(() => setOpps([]));
  }, [c.id]);
  useEffect(() => { load(); }, [load]);

  const changeStage = async (o, stage) => { try { await updateOpportunity(o.id, { stage }); showToast('Stage → ' + stage); load(); } catch (e) { showToast('Failed: ' + e.message); } };
  const editDataRoom = async (o) => { const url = window.prompt('Data-room URL for this deal:', o.dataRoom || ''); if (url === null) return; try { await updateOpportunity(o.id, { dataRoom: url }); showToast('Data room saved ✓'); load(); } catch (e) { showToast('Failed: ' + e.message); } };
  const linkOpp = async (o) => { setBusy(true); try { await updateOpportunity(o.id, { contactIds: [...(o.contactIds || []), c.id] }); showToast('Deal linked ✓'); setShowLink(false); setLinkQ(''); load(); } catch (e) { showToast('Failed: ' + e.message); } setBusy(false); };
  const unlink = async (o) => { if (!window.confirm('Unlink this deal from the contact?')) return; try { await updateOpportunity(o.id, { contactIds: (o.contactIds || []).filter(id => id !== c.id) }); showToast('Unlinked'); load(); } catch (e) { showToast('Failed: ' + e.message); } };
  const newDeal = async () => { const name = window.prompt('New deal name:'); if (!name) return; setBusy(true); try { await createOpportunity({ name: name.trim(), contactIds: [c.id], entity: (c.relatesTo || [])[0] || undefined }); showToast('Deal created ✓'); load(); } catch (e) { showToast('Failed: ' + e.message); } setBusy(false); };

  const selStyle = { border: `1px solid ${C.cr3}`, background: C.bg2, borderRadius: 7, padding: '4px 8px', fontFamily: SANS, fontSize: 12, color: C.ink8, outline: 'none', cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn v="gho" onClick={() => setShowLink(v => !v)}>🔗 {showLink ? 'Cancel' : 'Link existing'}</Btn>
        <Btn onClick={newDeal} disabled={busy}>+ New deal</Btn>
      </div>

      {showLink && (
        <Card style={{ background: C.bg2 }}>
          <SectionLabel>Link an existing deal to {c.name}</SectionLabel>
          <Inp value={linkQ} onChange={e => setLinkQ(e.target.value)} placeholder="Search deals…" />
          <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
            {pool.filter(o => !linkQ || (o.name || '').toLowerCase().includes(linkQ.toLowerCase())).slice(0, 30).map(o => (
              <div key={o.id} onClick={() => linkOpp(o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: C.bg }}>
                <span style={{ flex: 1, fontFamily: SERIF, fontSize: 13, color: C.ink9 }}>{o.name}</span>
                {o.stage && <Tag bg="transparent" fg={C.ink5}>{o.stage}</Tag>}
                {money(o.dealValue) && <Tag bg="transparent" fg={C.ink5}>{money(o.dealValue)}</Tag>}
                <span style={{ color: C.ink3, fontSize: 11 }}>＋ link</span>
              </div>
            )) || null}
            {pool.length === 0 && <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No unlinked deals.</div>}
          </div>
        </Card>
      )}

      {opps == null ? <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading deals…</div>
        : opps.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: C.ink3, fontSize: 13, fontStyle: 'italic', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12 }}>No deals linked to this contact yet.</div>
        : opps.map(o => (
          <div key={o.id} style={{ padding: '12px 14px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: SERIF, fontSize: 15, color: C.ink9, flex: 1, minWidth: 140 }}>{o.name}</span>
              {o.entity && <Tag bg={C.accS} fg={C.accD}>{o.entity}</Tag>}
              {money(o.dealValue) && <Tag bg={C.cr2} fg={C.ink5}>{money(o.dealValue)}</Tag>}
              <select value={o.stage || ''} onChange={e => changeStage(o, e.target.value)} style={selStyle}>
                {!OPP_STAGES.includes(o.stage) && o.stage && <option value={o.stage}>{o.stage}</option>}
                {OPP_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {o.nextStep && <span style={{ fontSize: 12, color: C.ink5 }}>Next: {o.nextStep}</span>}
              {o.closeDate && <span style={{ fontSize: 12, color: C.ink5 }}>Close {fmtR(o.closeDate)}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                {o.dataRoom
                  ? (isAdmin
                      ? <a href={o.dataRoom} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: C.acc, textDecoration: 'none' }}>Data room ↗</a>
                      : <span title="Admin only" style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>🔒 Data room</span>)
                  : (isAdmin && <button style={tinyBtnDeal} onClick={() => editDataRoom(o)}>+ Data room</button>)}
                {o.dataRoom && isAdmin && <button style={tinyBtnDeal} onClick={() => editDataRoom(o)}>edit</button>}
                <button style={tinyBtnDeal} onClick={() => unlink(o)}>Unlink</button>
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}
const tinyBtnDeal = { background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' };

// ── Timeline tab ──────────────────────────────────────────────────────────────
function TimelineTab({ c, notes }) {
  const [acts, setActs] = useState(null);
  useEffect(() => { getActivitiesForContact(c.id).then(setActs).catch(() => setActs([])); }, [c.id]);

  const events = useMemo(() => {
    // notes-list and activities-list BOTH read the same Airtable table
    // (Activities) filtered on the same Contact link — notes were repointed
    // there in 2026-07 when the separate Notes table turned out never to have
    // existed. So every record arrives twice, once shaped as a note and once as
    // an activity. Prefixing the React keys 'n'/'a' made the two copies unique
    // enough to both render, which is why the timeline read as the same entry
    // pasted over and over.
    //
    // Dedupe on the underlying Airtable record id, which is identical for the
    // two shapes of the same row. The activity shape wins because it carries
    // Type, Source and the real Date field; the note shape only has createdTime.
    const byId = new Map();

    (notes || []).forEach(n => {
      if (!n?.id || byId.has(n.id)) return;
      byId.set(n.id, {
        id:    n.id,
        kind:  n.type || 'Note',
        title: n.title,
        body:  n.summary || n.body,
        date:  n.createdTime,
      });
    });

    (acts || []).forEach(a => {
      if (!a?.id) return;
      const prior = byId.get(a.id);
      byId.set(a.id, {
        id:    a.id,
        kind:  a.type || 'Activity',
        title: a.title || a.type || 'Activity',
        body:  a.aiSummary || a.body,
        // Activities.Date is date-only and can be blank on rows created by an
        // importer. Fall back to the note shape's createdTime so a record with
        // no Date still appears rather than being silently filtered out below.
        date:  a.date || prior?.date || null,
      });
    });

    return [...byId.values()]
      .filter(e => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [notes, acts]);

  if (notes == null || acts == null) return <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading timeline…</div>;
  if (!events.length) return <div style={{ padding: 32, textAlign: 'center', color: C.ink3, fontSize: 13, fontStyle: 'italic', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12 }}>No notes or activities logged yet.</div>;

  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, background: C.cr3 }} />
      {events.map(e => (
        <div key={e.id} style={{ position: 'relative', marginBottom: 14 }}>
          <div style={{ position: 'absolute', left: -22, top: 2, width: 14, height: 14, borderRadius: '50%', background: C.bg, border: `2px solid ${C.acc}` }} />
          <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>{e.title}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, whiteSpace: 'nowrap' }}>{e.kind} · {fmtR(e.date)}</span>
            </div>
            {e.body && <div style={{ fontSize: 13, color: C.ink7, marginTop: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NCNDA compliance panel ────────────────────────────────────────────────────
function CompliancePanel({ c, showToast }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => { getDocumentsForContact(c.id).then(setDocs).catch(() => setDocs([])); }, [c.id]);

  const entities = c.relatesTo || [];
  if (!entities.length) return null; // no entity relationships → nothing to track

  const ncndaFor = e => (docs || []).find(d => d.type === 'NCNDA' && d.entity === e);
  const sendSignwell = async (e, resend) => {
    if (!c.email) { showToast('This contact has no email on file — add one first'); return; }
    if (!window.confirm(`${resend ? 'Resend' : 'Send'} the ${e} NCNDA to ${c.name} <${c.email}> via SignWell?`)) return;
    try {
      await sendNcnda({ counterpartyName: c.name, counterpartyEmail: c.email, notes: `NCNDA — ${e} (sent from CRM compliance panel)` });
      showToast('SignWell request sent ✓');
    } catch (err) { showToast('SignWell failed: ' + err.message); }
  };

  return (
    <Card style={{ background: C.accS, border: '1px solid #ecd1bc' }}>
      <SectionLabel>Compliance · NCNDA</SectionLabel>
      {docs == null ? <div style={{ fontSize: 12, color: C.ink3 }}>Checking…</div> : entities.map(e => {
        const doc = ncndaFor(e);
        const es = doc ? docExpState(doc.expires) : null;
        const warn = es && es.state !== 'ok';
        return (
          <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: C.bg, border: `1px solid ${warn ? C.red : C.cr2}`, borderRadius: 10, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0, background: doc ? C.grn : C.bg2, border: `2px solid ${doc ? C.grn : C.cr3}`, color: '#fff', fontSize: 13 }}>{doc ? '✓' : ''}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: C.ink9 }}>{e} — NCNDA {warn && <span style={{ color: C.red }}>⚑</span>}</div>
              <div style={{ fontSize: 11, color: warn ? C.red : C.ink3 }}>{doc
                ? `${doc.signedDate ? 'Signed ' + fmtR(doc.signedDate) : 'On file'}${doc.expires ? ' · Expires ' + fmtR(doc.expires) + (es?.state === 'soon' ? ` (${es.days}d)` : es?.state === 'expired' ? ' — EXPIRED' : '') : ''}`
                : 'Not on file'}</div>
            </div>
            {doc && !warn
              ? <a href={doc.driveLink} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ink3, textDecoration: 'none' }}>View ↗</a>
              : <Btn v={warn ? 'acc' : 'gho'} onClick={() => sendSignwell(e, warn)}>⚡ {warn ? 'Resend' : 'Send'}</Btn>}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>Auto-derived from “Related to” + linked NCNDA documents. Attach an NCNDA in the Files tab and tag it with the entity to check it here.</div>
    </Card>
  );
}

// ── Meeting-prep brief ────────────────────────────────────────────────────────
function MeetingBrief({ c, tasks, notes, onClose }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const open = (tasks || []).filter(t => !isDone(t.status));
  const recentNote = (notes || [])[0];
  const who = [c.role, c.company, c.type].filter(Boolean).join(' · ') || '—';
  const points = [
    c.nextAction ? `Advance: ${c.nextAction}${c.nextActionDate ? ' (' + fmtR(c.nextActionDate) + ')' : ''}.` : 'Confirm the next concrete step and a date.',
    open.length ? `Close out: ${open[0].task}.` : 'Ask what would move this relationship forward.',
    recentNote ? `Follow up on: ${(recentNote.summary || recentNote.body || '').slice(0, 140)}` : 'Recap where you last left off.',
    'Ask who else should be in the room (intros / decision-makers).',
  ];
  const Card2 = ({ label, children }) => (
    <div style={{ padding: 14, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 195, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 22 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: C.bg, borderRadius: isMobile ? 0 : 18, width: '100%', maxWidth: isMobile ? '100%' : 600, height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 18, background: 'none', border: 'none', fontSize: 26, color: C.ink3, cursor: 'pointer', lineHeight: 1, zIndex: 2 }}>×</button>
        <div style={{ padding: isMobile ? '18px 16px' : '22px 26px 28px', overflowY: 'auto' }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>✦ Meeting prep</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 22 : 26, letterSpacing: '-.02em', margin: '2px 0 14px', color: C.ink9 }}>{c.name}</h2>
          <Card2 label="Who they are"><div style={{ fontSize: 14, color: C.ink8 }}>{who}{c.bio ? ` — ${c.bio}` : ''}</div></Card2>
          {c.involvement && <Card2 label="Involvement"><div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.involvement}</div></Card2>}
          <Card2 label="Status"><div style={{ fontSize: 14, color: C.ink8 }}><StaleBadge c={c} />{c.status ? ` · ${c.status}` : ''}</div></Card2>
          <Card2 label="Open items">
            {(open.length || c.nextAction) ? (
              <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: C.ink7, lineHeight: 1.7, fontSize: 14 }}>
                {c.nextAction && <li><b>Next action:</b> {c.nextAction}{c.nextActionDate ? ` · ${fmtR(c.nextActionDate)}` : ''}</li>}
                {open.map(t => <li key={t.id}>Task — {t.task}{t.dueDate ? ` (${fmtR(t.dueDate)})` : ''}</li>)}
              </ul>
            ) : <div style={{ fontSize: 13, color: C.ink3, fontStyle: 'italic' }}>Nothing open.</div>}
          </Card2>
          <Card2 label="✦ Suggested talking points">
            <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: C.ink7, lineHeight: 1.7, fontSize: 14 }}>
              {points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Card2>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn v="gho" onClick={() => { navigator.clipboard?.writeText(`Meeting prep — ${c.name}\n\nWho: ${who}\nStatus: ${c.status || ''}\nNext action: ${c.nextAction || '—'}\n\nTalking points:\n${points.map(p => '• ' + p).join('\n')}`); }}>Copy</Btn>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ c, setC, contactTableId, showToast, reloadContacts, onLogged, allContacts = [], onOpenContactId, isAdmin }) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [logSaving, setLogSaving] = useState(false);
  const [editKey, setEditKey] = useState(null);   // inline-edit field key

  const inlineInput = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${C.acc}`, borderRadius: 6, background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 14, outline: 'none' };
  const EDITABLE = { email: 1, phone: 1, owner: 1, source: 1, segment: 1, introducedBy: 1 };
  const saveInline = async (key, val) => {
    setEditKey(null);
    if ((c[key] || '') === val) return;
    try { await updateContact(c.id, { [key]: val }); setC(prev => ({ ...prev, [key]: val })); showToast('Saved ✓'); reloadContacts && reloadContacts(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };
  const saveReferrer = async (rid) => {
    try {
      await updateContact(c.id, { referrerId: rid || '' });
      const nm = (allContacts.find(x => x.id === rid) || {}).name || '';
      setC(prev => ({ ...prev, referrerId: rid || null, referrerName: nm }));
      showToast('Referrer set ✓'); reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
  };
  const referrer = c.referrerId ? (allContacts.find(x => x.id === c.referrerId) || { id: c.referrerId, name: c.referrerName || 'Contact' }) : null;
  const referralChildren = allContacts.filter(x => x.referrerId === c.id);

  const handleLog = async () => {
    setLogSaving(true);
    const now = new Date().toISOString();
    try {
      await updateContact(c.id, { last_contacted_at: now });
      setC(prev => ({ ...prev, last_contacted_at: now, daysSinceContact: 0 }));
      if (logText.trim()) {
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        await createNote({ contactId: c.id, title: `Contact log · ${today}`, body: logText.trim(), type: 'Contact Log' });
        onLogged && onLogged();
      }
      showToast('Contact logged ✓');
      setLogText(''); setLogOpen(false);
      reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
    setLogSaving(false);
  };

  if (editing) return <EditForm c={c} onDone={updated => { if (updated) setC(prev => ({ ...prev, ...updated })); setEditing(false); reloadContacts && reloadContacts(); }} showToast={showToast} />;

  const fields = [
    ['Email', 'email'], ['Phone', 'phone'], ['Website', 'website'],
    ['Type', 'type'], ['Owner', 'owner'], ['Source', 'source'],
    ['Segment', 'segment'], ['Introduced by', 'introducedBy'],
  ];

  return (
    <div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <a href={airtableRecordUrl(contactTableId, c.id)} target="_blank" rel="noopener noreferrer"
          style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, textDecoration: 'none' }}>⊞ Airtable ↗</a>
        <Btn v="acc" onClick={() => setLogOpen(v => !v)}>✓ Log contact</Btn>
        <Btn v="gho" onClick={() => setEditing(true)}>Edit</Btn>
      </div>

      {logOpen && (
        <Card style={{ background: C.accS, border: '1px solid #ecd1bc' }}>
          <SectionLabel>Log a contact interaction</SectionLabel>
          <textarea value={logText} onChange={e => setLogText(e.target.value)} rows={3} placeholder="Optional — what was discussed, next steps…" style={textareaStyle} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Btn v="gho" onClick={() => { setLogOpen(false); setLogText(''); }}>Cancel</Btn>
            <Btn onClick={handleLog} disabled={logSaving}>{logSaving ? 'Logging…' : 'Log contact'}</Btn>
          </div>
        </Card>
      )}

      {/* Current summary (rolling) */}
      {editKey === 'currentSummary' ? (
        <Card style={{ background: C.accS, border: '1px solid #ecd1bc' }}>
          <SectionLabel>✦ Current summary</SectionLabel>
          <textarea autoFocus defaultValue={c.currentSummary || ''} rows={3} style={textareaStyle}
            onBlur={e => saveInline('currentSummary', e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditKey(null); }} />
        </Card>
      ) : (
        <Card style={{ background: C.accS, border: '1px solid #ecd1bc', cursor: 'text' }} onClick={() => setEditKey('currentSummary')}>
          <SectionLabel>✦ Current summary <span style={{ textTransform: 'none', letterSpacing: 0, color: C.ink3 }}>— rolling; click to edit</span></SectionLabel>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.currentSummary || '—'}</div>
        </Card>
      )}

      {/* Details grid */}
      <Card>
        <SectionLabel>Details</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          {fields.map(([l, key]) => {
            const v = c[key];
            const editable = EDITABLE[key];
            return (
              <div key={key}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>{l}</div>
                {editKey === key ? (
                  <input autoFocus defaultValue={v || ''} onBlur={e => saveInline(key, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditKey(null); }} style={inlineInput} />
                ) : (
                  <div onClick={editable ? () => setEditKey(key) : undefined} title={editable ? 'Click to edit' : undefined}
                    style={{ fontSize: 14, color: C.ink8, wordBreak: 'break-word', cursor: editable ? 'text' : 'default', borderRadius: 5, padding: '1px 4px', margin: '-1px -4px', display: 'inline-block' }}
                    onMouseEnter={editable ? e => (e.currentTarget.style.background = C.cr1) : undefined}
                    onMouseLeave={editable ? e => (e.currentTarget.style.background = '') : undefined}>{v || '—'}</div>
                )}
              </div>
            );
          })}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Last contacted</div>
            <div style={{ fontSize: 14 }}><StaleBadge c={c} /></div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Next action</div>
            <div style={{ fontSize: 14, color: isOverdue(c.nextActionDate) ? C.red : C.ink8 }}>
              {c.nextAction ? `${c.nextAction}${c.nextActionDate ? ' · ' + fmtR(c.nextActionDate) : ''}${isOverdue(c.nextActionDate) ? ' ⚑' : ''}` : '—'}
            </div>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 5 }}>Related to</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(c.relatesTo || []).length ? (c.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>) : <span style={{ fontSize: 13, color: C.ink3 }}>—</span>}
            </div>
          </div>
          {c.linkedin && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>LinkedIn</div>
              <a href={c.linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.acc, textDecoration: 'none', wordBreak: 'break-all' }}>{c.linkedin} ↗</a>
            </div>
          )}
          {c.bio && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Bio</div>
              <div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.bio}</div>
            </div>
          )}
          {c.involvement && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Involvement</div>
              <div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.involvement}</div>
            </div>
          )}
        </div>
      </Card>

      {/* NCNDA compliance */}
      <CompliancePanel c={c} showToast={showToast} />

      {/* Referral graph */}
      <Card>
        <SectionLabel>Referral</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>Referred by (who introduced them)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {referrer
                ? <button onClick={() => onOpenContactId && onOpenContactId(referrer.id)} title="Open referrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontFamily: SANS, cursor: 'pointer', background: C.accS, color: C.accD, border: '1px solid #ecd1bc' }}>{referrer.name} <span style={{ fontSize: 10, opacity: .7 }}>↗</span></button>
                : <span style={{ fontSize: 13, color: C.ink3 }}>—</span>}
              <Sel value={c.referrerId || ''} onChange={e => saveReferrer(e.target.value)} sx={{ width: 'auto', maxWidth: 180 }}>
                <option value="">Set referrer…</option>
                {allContacts.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Sel>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>Referred into the CRM (their intros)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {referralChildren.length ? referralChildren.map(x => (
                <button key={x.id} onClick={() => onOpenContactId && onOpenContactId(x.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontFamily: SANS, cursor: 'pointer', background: C.bg2, color: C.ink7, border: `1px solid ${C.cr3}` }}>{x.name} <span style={{ fontSize: 10, opacity: .6 }}>↗</span></button>
              )) : <span style={{ fontSize: 13, color: C.ink3 }}>none yet</span>}
            </div>
          </div>
        </div>
      </Card>

      {isAdmin && (editKey === 'referralEconomics' ? (
        <Card style={{ background: C.redS, border: `1px solid ${C.cr3}` }}>
          <SectionLabel>🔒 Admin — Referral economics</SectionLabel>
          <textarea autoFocus defaultValue={c.referralEconomics || ''} rows={3} style={textareaStyle}
            onBlur={e => saveInline('referralEconomics', e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setEditKey(null); }} />
        </Card>
      ) : (
        <Card style={{ background: C.redS, border: `1px solid ${C.cr3}`, cursor: 'text' }} onClick={() => setEditKey('referralEconomics')}>
          <SectionLabel>🔒 Admin — Referral economics <span style={{ textTransform: 'none', letterSpacing: 0, color: C.ink3 }}>— only admins see this</span></SectionLabel>
          <div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.referralEconomics || '—'}</div>
        </Card>
      ))}

      <div style={{ fontSize: 12, color: C.ink3, textAlign: 'center', padding: '4px 0' }}>
        Documents now live in the <b style={{ color: C.ink5 }}>Files</b> tab, organized into folders.
      </div>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function EditForm({ c, onDone, showToast }) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({
    email: c.email || '', phone: c.phone || '', website: c.website || '',
    role: c.role || '', status: c.status || 'Active', type: c.type || 'External',
    relatesTo: Array.isArray(c.relatesTo) ? c.relatesTo : [],
    owner: c.owner || '', nextAction: c.nextAction || '', nextActionDate: c.nextActionDate || '', source: c.source || '',
  });
  const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const toggleRel = v => setF(p => ({ ...p, relatesTo: p.relatesTo.includes(v) ? p.relatesTo.filter(x => x !== v) : [...p.relatesTo, v] }));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await updateContact(c.id, f); showToast('Contact updated ✓'); onDone(f); }
    catch (e) { showToast('Failed: ' + e.message); setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Email"><Inp value={f.email} onChange={fld('email')} /></FR>
        <FR label="Phone"><Inp value={f.phone} onChange={fld('phone')} /></FR>
      </div>
      <FR label="Role / Title"><Inp value={f.role} onChange={fld('role')} /></FR>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Status"><Sel value={f.status} onChange={fld('status')}><option>Active</option><option>Benched</option><option>Unknown</option></Sel></FR>
        <FR label="Type"><Sel value={f.type} onChange={fld('type')}><option>External</option><option>Internal</option></Sel></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} /></FR>
        <FR label="Source"><Inp value={f.source} onChange={fld('source')} /></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Next action"><Inp value={f.nextAction} onChange={fld('nextAction')} /></FR>
        <FR label="Next action date"><Inp type="date" value={f.nextActionDate} onChange={fld('nextActionDate')} /></FR>
      </div>
      <FR label="Companies (deal category)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COMPANIES.map(x => {
            const on = f.relatesTo.includes(x);
            return <button key={x} type="button" onClick={() => toggleRel(x)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5, border: `1px solid ${on ? C.ink9 : C.cr3}` }}>{x}</button>;
          })}
        </div>
      </FR>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <Btn v="gho" onClick={() => onDone(null)}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
      </div>
    </div>
  );
}

// ── Files tab ─────────────────────────────────────────────────────────────────
const DOC_TYPES = ['NCNDA', 'LOI', 'Term Sheet', 'LOC', 'Contract', 'Deck', 'Other'];

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
// Expiry state for NCNDA/contract dates: null | { state:'ok'|'soon'|'expired', days }
function docExpState(expires) {
  if (!expires) return null;
  const t = new Date(expires); if (isNaN(t.getTime())) return null;
  const days = Math.round((t.getTime() - Date.now()) / 86400000);
  if (days < 0) return { state: 'expired', days };
  if (days <= 30) return { state: 'soon', days };
  return { state: 'ok', days };
}

function FilesTab({ c, showToast, onCount }) {
  const isMobile = useIsMobile();
  const [docs, setDocs]       = useState(null);
  const [folders, setFolders] = useState([]);   // [{ id, name, scope }]
  const [loading, setLoading] = useState(true);

  // add-file form
  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName]     = useState('');
  const [fUrl, setFUrl]       = useState('');
  const [fType, setFType]     = useState('Other');
  const [fFolder, setFFolder] = useState('');   // '' = unfiled
  const [fSigned, setFSigned] = useState('');
  const [fExpires, setFExpires] = useState('');
  const [fEntity, setFEntity] = useState('');   // which entity an NCNDA/contract covers
  const [saving, setSaving]   = useState(false);

  // create-folder form
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName]   = useState('');
  const [folderScope, setFolderScope] = useState('contact'); // 'contact' | companyId
  const [folderSaving, setFolderSaving] = useState(false);

  // per-doc inline actions
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [movingId, setMovingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const companyIds = c.companyIds || [];
      const [d, contactFolders, ...companyFolderLists] = await Promise.all([
        getDocumentsForContact(c.id),
        getFoldersForContact(c.id).catch(() => []),
        ...companyIds.map(id => getFoldersForCompany(id).catch(() => [])),
      ]);
      const combined = [];
      contactFolders.forEach(f => combined.push({ id: f.id, name: f.name, scope: 'This contact' }));
      companyFolderLists.forEach((list, i) => {
        const cname = (c.companyNames || [])[i] || 'Company';
        list.forEach(f => { if (!combined.some(x => x.id === f.id)) combined.push({ id: f.id, name: f.name, scope: cname }); });
      });
      setDocs(d); setFolders(combined);
      onCount && onCount(d.length);
    } catch (e) {
      showToast('Could not load files: ' + e.message); setDocs([]);
    }
    setLoading(false);
  }, [c.id, c.companyIds, c.companyNames, onCount, showToast]);
  useEffect(() => { load(); }, [load]);

  const folderMap = useMemo(() => Object.fromEntries(folders.map(f => [f.id, f])), [folders]);

  // Group the contact's docs by the folder they're filed into (first known folder wins).
  const { groups, unfiled } = useMemo(() => {
    const g = {}; const u = [];
    (docs || []).forEach(d => {
      const fid = (d.folderIds || []).find(id => folderMap[id]);
      if (fid) (g[fid] = g[fid] || []).push(d);
      else u.push(d);
    });
    return { groups: g, unfiled: u };
  }, [docs, folderMap]);

  const saveFile = async () => {
    if (!fName.trim() || !fUrl.trim()) { showToast('Name and link are both required'); return; }
    setSaving(true);
    try {
      await createDocument({
        name: fName.trim(), driveLink: fUrl.trim(), type: fType,
        contactIds: [c.id], folderIds: fFolder ? [fFolder] : undefined,
        signedDate: fSigned || undefined, expires: fExpires || undefined, entity: fEntity || undefined,
      });
      showToast(fEntity && fType === 'NCNDA' ? `NCNDA linked → ${fEntity} compliance checked ✓` : 'File linked ✓');
      setFName(''); setFUrl(''); setFType('Other'); setFFolder(''); setFSigned(''); setFExpires(''); setFEntity(''); setShowAdd(false);
      await load();
    } catch (e) { showToast('Failed: ' + e.message); }
    setSaving(false);
  };

  const saveFolder = async () => {
    if (!folderName.trim()) { showToast('Folder name required'); return; }
    setFolderSaving(true);
    try {
      const payload = { name: folderName.trim() };
      if (folderScope === 'contact') payload.contactIds = [c.id];
      else payload.companyIds = [folderScope];
      await createFolder(payload);
      showToast('Folder created ✓');
      setFolderName(''); setFolderScope('contact'); setShowFolderForm(false);
      await load();
    } catch (e) { showToast('Failed: ' + e.message); }
    setFolderSaving(false);
  };

  const moveDoc = async (doc, folderId) => {
    try {
      await updateDocument(doc.id, { folderIds: folderId ? [folderId] : [] });
      showToast('Moved ✓'); setMovingId(null); await load();
    } catch (e) { showToast('Failed: ' + e.message); }
  };

  const saveRename = async () => {
    if (!renaming.name.trim()) { showToast('Name required'); return; }
    try {
      await updateDocument(renaming.id, { name: renaming.name.trim() });
      showToast('Renamed ✓'); setRenaming(null); await load();
    } catch (e) { showToast('Failed: ' + e.message); }
  };

  const unlink = async (doc) => {
    if (!window.confirm('Remove this file from the contact? The file and its Drive link are not deleted.')) return;
    try {
      const rest = (doc.contactIds || []).filter(id => id !== c.id);
      await updateDocument(doc.id, { contactIds: rest });
      showToast('Removed from contact ✓'); await load();
    } catch (e) { showToast('Failed: ' + e.message); }
  };

  const tinyBtn = {
    background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px',
    fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase',
  };

  function DocRow({ d }) {
    if (renaming?.id === d.id) {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6 }}>
          <Inp value={renaming.name} onChange={e => setRenaming(p => ({ ...p, name: e.target.value }))} sx={{ flex: 1 }} />
          <Btn onClick={saveRename}>Save</Btn>
          <Btn v="gho" onClick={() => setRenaming(null)}>Cancel</Btn>
        </div>
      );
    }
    if (movingId === d.id) {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.ink5, fontFamily: SANS }}>Move to:</span>
          <Sel value={(d.folderIds || []).find(id => folderMap[id]) || ''} onChange={e => moveDoc(d, e.target.value)} sx={{ flex: 1, minWidth: 160 }}>
            <option value="">Unfiled</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name} · {f.scope}</option>)}
          </Sel>
          <Btn v="gho" onClick={() => setMovingId(null)}>Done</Btn>
        </div>
      );
    }
    const es = docExpState(d.expires);
    const warn = es && es.state !== 'ok';
    const meta = (d.signedDate || d.expires)
      ? `${d.signedDate ? 'Signed ' + fmtR(d.signedDate) : ''}${d.signedDate && d.expires ? ' · ' : ''}${d.expires ? 'Expires ' + fmtR(d.expires) + (es?.state === 'soon' ? ` (${es.days}d)` : es?.state === 'expired' ? ' — EXPIRED' : '') : ''}`
      : hostLabel(d.driveLink);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: C.bg, border: `1px solid ${warn ? C.red : C.cr2}`, borderRadius: 8, marginBottom: 6 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: C.accS, color: C.accD, display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>⎘</span>
        <a href={d.driveLink} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, flex: 1, textDecoration: 'none' }}>
          <div style={{ fontFamily: SERIF, fontSize: 14, color: C.ink9, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{warn && <span style={{ color: C.red }}>⚑ </span>}{d.name} <span style={{ color: C.ink3, fontSize: 11 }}>↗</span></div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: warn ? C.red : C.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
        </a>
        {d.type && <Tag bg={C.cr2} fg={C.ink5}>{d.type}</Tag>}
        {d.entity && <Tag bg={C.accS} fg={C.accD}>{d.entity}</Tag>}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button style={tinyBtn} onClick={() => setMovingId(d.id)}>Move</button>
          <button style={tinyBtn} onClick={() => setRenaming({ id: d.id, name: d.name })}>Rename</button>
          <button style={tinyBtn} onClick={() => unlink(d)}>Remove</button>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading files…</div>;

  return (
    <div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <Btn v="gho" onClick={() => { setShowFolderForm(v => !v); setShowAdd(false); }}>{showFolderForm ? 'Cancel' : '⊕ New folder'}</Btn>
        <Btn onClick={() => { setShowAdd(v => !v); setShowFolderForm(false); }}>{showAdd ? 'Cancel' : '+ Add file'}</Btn>
      </div>

      {/* Create-folder form */}
      {showFolderForm && (
        <Card style={{ background: C.bg2 }}>
          <SectionLabel>New folder</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <FR label="Folder name"><Inp value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="e.g. Contracts, Decks…" /></FR>
            <FR label="Belongs to">
              <Sel value={folderScope} onChange={e => setFolderScope(e.target.value)}>
                <option value="contact">This contact ({c.name})</option>
                {(c.companyIds || []).map((id, i) => (
                  <option key={id} value={id}>{(c.companyNames || [])[i] || 'Company'} (shared)</option>
                ))}
              </Sel>
            </FR>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Btn onClick={saveFolder} disabled={folderSaving}>{folderSaving ? 'Creating…' : 'Create folder'}</Btn>
          </div>
        </Card>
      )}

      {/* Add-file form */}
      {showAdd && (
        <Card style={{ background: C.bg2 }}>
          <SectionLabel>Link a file</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FR label="Name"><Inp value={fName} onChange={e => setFName(e.target.value)} placeholder="Name this file…" /></FR>
            <FR label="Link (Drive / Docs / Sheets / PDF)"><Inp value={fUrl} onChange={e => setFUrl(e.target.value)} placeholder="https://drive.google.com/…" /></FR>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <FR label="Type"><Sel value={fType} onChange={e => setFType(e.target.value)}>{DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Sel></FR>
              <FR label="Folder">
                <Sel value={fFolder} onChange={e => setFFolder(e.target.value)}>
                  <option value="">Unfiled</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name} · {f.scope}</option>)}
                </Sel>
              </FR>
            </div>
            {(fType === 'NCNDA' || fType === 'Contract' || fType === 'LOI' || fType === 'Term Sheet') && (
              <>
                <FR label="Entity this covers (checks the compliance box)">
                  <Sel value={fEntity} onChange={e => setFEntity(e.target.value)}>
                    <option value="">— none —</option>
                    {(c.relatesTo || []).map(e => <option key={e} value={e}>{e}</option>)}
                  </Sel>
                </FR>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <FR label="Signed date"><Inp type="date" value={fSigned} onChange={e => setFSigned(e.target.value)} /></FR>
                  <FR label="Expiry date (flags red near expiry)"><Inp type="date" value={fExpires} onChange={e => setFExpires(e.target.value)} /></FR>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn onClick={saveFile} disabled={saving}>{saving ? 'Saving…' : 'Save file'}</Btn></div>
          </div>
        </Card>
      )}

      {/* Grouped file list */}
      {(docs || []).length === 0 && folders.length === 0 && !showAdd && !showFolderForm ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3, fontSize: 13, fontStyle: 'italic', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12 }}>
          No files linked yet. Add a link, or create a folder to organize them.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {folders.map(f => {
            const inFolder = groups[f.id] || [];
            return (
              <div key={f.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>📁</span>
                  <span style={{ fontFamily: SERIF, fontSize: 15, color: C.ink9 }}>{f.name}</span>
                  <Tag bg="transparent" fg={C.ink3}>{f.scope}</Tag>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{inFolder.length} file{inFolder.length === 1 ? '' : 's'}</span>
                </div>
                {inFolder.length === 0
                  ? <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic', padding: '4px 0 4px 24px' }}>Empty — add a file into this folder.</div>
                  : <div style={{ paddingLeft: isMobile ? 0 : 8 }}>{inFolder.map(d => <DocRow key={d.id} d={d} />)}</div>}
              </div>
            );
          })}

          {/* Unfiled */}
          {unfiled.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, opacity: .6 }}>🗂</span>
                <span style={{ fontFamily: SERIF, fontSize: 15, color: C.ink9 }}>Unfiled</span>
                <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{unfiled.length} file{unfiled.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ paddingLeft: isMobile ? 0 : 8 }}>{unfiled.map(d => <DocRow key={d.id} d={d} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────
function NotesTab({ c, notes, reload, reloadTasks, setC, showToast, reloadContacts }) {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceRaw, setVoiceRaw] = useState('');
  const [voiceParsed, setVoiceParsed] = useState(null);   // { summary,title,tasks[],nextAction,nextActionDate }
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [acceptTasks, setAcceptTasks] = useState({});     // idx -> bool
  const [applyNext, setApplyNext] = useState(true);
  const [editingNote, setEditingNote] = useState(null);

  const saveTyped = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      await createNote({ contactId: c.id, title: `Note · ${today}`, body: noteText.trim(), type: 'Note' });
      showToast('Note saved ✓'); setNoteText(''); reload();
    } catch (e) { showToast('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleTranscript = async text => {
    setVoiceRaw(text); setVoiceBusy(true);
    try {
      const res = await parseVoice(text, { section: 'contact-note', contactId: c.id, contactName: c.name });
      setVoiceParsed(res);
      const acc = {}; (res.tasks || []).forEach((_, i) => { acc[i] = true; });
      setAcceptTasks(acc);
      setApplyNext(!!res.nextAction);
    } catch {
      setVoiceParsed({ summary: '', title: 'Voice note', tasks: [], nextAction: null });
    }
    setVoiceBusy(false);
  };

  const commitVoice = async () => {
    setVoiceBusy(true);
    try {
      await createNote({ contactId: c.id, title: voiceParsed.title || 'Voice note', body: voiceRaw, summary: voiceParsed.summary || '', type: 'Voice Note' });
      const chosen = (voiceParsed.tasks || []).filter((_, i) => acceptTasks[i]);
      for (const t of chosen) {
        await createTask({ task: t.task, dueDate: t.dueDate || undefined, priority: t.priority || 'Medium', taskType: t.taskType || 'Task', status: 'Not Started', contactIds: [c.id] });
      }
      if (applyNext && voiceParsed.nextAction) {
        await updateContact(c.id, { nextAction: voiceParsed.nextAction, nextActionDate: voiceParsed.nextActionDate || '' });
        setC(prev => ({ ...prev, nextAction: voiceParsed.nextAction, nextActionDate: voiceParsed.nextActionDate || '' }));
      }
      showToast(`Voice note saved${chosen.length ? ` · ${chosen.length} task${chosen.length > 1 ? 's' : ''} created` : ''} ✓`);
      setVoiceMode(false); setVoiceParsed(null); setVoiceRaw('');
      reload(); reloadTasks(); reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
    setVoiceBusy(false);
  };

  const removeNote = async n => {
    if (!window.confirm('Delete this note?')) return;
    try { await deleteNote(n.id); showToast('Deleted'); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };
  const saveEdit = async () => {
    try { await updateNote(editingNote.id, { title: editingNote.title, body: editingNote.body }); showToast('Saved ✓'); setEditingNote(null); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };

  return (
    <div>
      {/* Composer */}
      <Card>
        <SectionLabel right={<Btn v="gho" onClick={() => { setVoiceMode(v => !v); setVoiceParsed(null); setVoiceRaw(''); }}>◉ {voiceMode ? 'Close voice' : 'Voice note'}</Btn>}>Add a note</SectionLabel>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="Type a note… (⌘/Ctrl+Enter to save)"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveTyped(); } }} style={textareaStyle} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn onClick={saveTyped} disabled={saving || !noteText.trim()}>{saving ? 'Saving…' : 'Save note'}</Btn>
        </div>

        {voiceMode && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.cr2}` }}>
            {!voiceParsed && <VoiceMic label="Tap to record — I'll pull out tasks" size={64} onTranscript={handleTranscript} />}
            {voiceBusy && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 12, justifyContent: 'center', padding: 8 }}><Spinner size={16} /> Understanding…</div>}
            {voiceParsed && !voiceBusy && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' }}>Transcript</div>
                <p style={{ fontSize: 13, color: C.ink7, margin: '0 0 12px', lineHeight: 1.5 }}>{voiceRaw}</p>

                {(voiceParsed.tasks || []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 6, textTransform: 'uppercase' }}>Follow-ups detected — uncheck to skip</div>
                    {voiceParsed.tasks.map((t, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!acceptTasks[i]} onChange={e => setAcceptTasks(p => ({ ...p, [i]: e.target.checked }))} style={{ marginTop: 3 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, color: C.ink9 }}>{t.task}</span>
                          <span style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <Tag bg="transparent" fg={t.taskType === 'Reminder' ? C.yel : C.ink5}>{t.taskType || 'Task'}</Tag>
                            {t.dueDate && <Tag bg="transparent" fg={C.ink5}>{fmtR(t.dueDate)}</Tag>}
                            {t.priority && <Tag bg="transparent" fg={PRIORITY_COLORS[t.priority] || C.ink5}>{t.priority}</Tag>}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {voiceParsed.nextAction && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: C.ink7 }}>
                    <input type="checkbox" checked={applyNext} onChange={e => setApplyNext(e.target.checked)} />
                    Set next action: <b style={{ color: C.ink9 }}>{voiceParsed.nextAction}</b>{voiceParsed.nextActionDate ? ` (${fmtR(voiceParsed.nextActionDate)})` : ''}
                  </label>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn v="gho" onClick={() => { setVoiceParsed(null); setVoiceRaw(''); }}>Re-record</Btn>
                  <Btn onClick={commitVoice} disabled={voiceBusy}>Save note{(voiceParsed.tasks || []).some((_, i) => acceptTasks[i]) ? ' + tasks' : ''}</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Notes list */}
      {notes == null ? <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading notes…</div>
        : notes.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>No notes yet.</div>
        : notes.map(n => (
          <div key={n.id} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`, borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
            {editingNote?.id === n.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Inp value={editingNote.title} onChange={e => setEditingNote(p => ({ ...p, title: e.target.value }))} />
                <textarea value={editingNote.body} onChange={e => setEditingNote(p => ({ ...p, body: e.target.value }))} rows={4} style={textareaStyle} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn v="gho" onClick={() => setEditingNote(null)}>Cancel</Btn>
                  <Btn onClick={saveEdit}>Save</Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15 }}>{n.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, whiteSpace: 'nowrap' }}>{n.type} · <b style={{ color: C.ink5 }}>{fmtR(n.createdTime)}</b></span>
                </div>
                {n.summary && <div style={{ fontStyle: 'italic', color: C.ink5, fontSize: 12, marginBottom: 5 }}>{n.summary}</div>}
                <div style={{ fontSize: 14, color: C.ink7, lineHeight: 1.55, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingNote({ id: n.id, title: n.title, body: n.body })} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>Edit</button>
                  <button onClick={() => removeNote(n)} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────
function TasksTab({ c, tasks, reload, showToast }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ task: '', dueDate: '', priority: 'Medium', taskType: 'Task' });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!f.task.trim()) { showToast('Task description required'); return; }
    setSaving(true);
    try {
      await createTask({ task: f.task.trim(), dueDate: f.dueDate || undefined, priority: f.priority, taskType: f.taskType, status: 'Not Started', contactIds: [c.id] });
      showToast('Task created ✓');
      setF({ task: '', dueDate: '', priority: 'Medium', taskType: 'Task' }); setShowForm(false); reload();
    } catch (e) { showToast('Failed: ' + e.message); }
    setSaving(false);
  };
  const complete = async t => {
    try { await updateTask(t.id, { status: 'Done' }); showToast('Marked done ✓'); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };
  const reopen = async t => {
    try { await updateTask(t.id, { status: 'Not Started' }); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };

  const open = (tasks || []).filter(t => !isDone(t.status));
  const done = (tasks || []).filter(t => isDone(t.status));

  const Row = ({ t }) => {
    const overdue = isOverdue(t.dueDate) && !isDone(t.status);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', background: C.bg2, border: `1px solid ${overdue ? C.red : C.cr2}`, borderRadius: 9, marginBottom: 8 }}>
        <button onClick={() => isDone(t.status) ? reopen(t) : complete(t)} title={isDone(t.status) ? 'Reopen' : 'Mark done'}
          style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isDone(t.status) ? C.acc : C.cr3}`, background: isDone(t.status) ? C.acc : 'transparent', color: '#fff', cursor: 'pointer', flexShrink: 0, marginTop: 1, fontSize: 11, lineHeight: 1 }}>{isDone(t.status) ? '✓' : ''}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.ink9, textDecoration: isDone(t.status) ? 'line-through' : 'none', opacity: isDone(t.status) ? 0.6 : 1 }}>{t.task}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <Tag bg="transparent" fg={t.taskType === 'Reminder' ? C.yel : C.ink5}>{t.taskType || 'Task'}</Tag>
            {t.dueDate && <Tag bg="transparent" fg={overdue ? C.red : C.ink5}>{fmtR(t.dueDate)}{overdue ? ' ⚑' : ''}</Tag>}
            {t.priority && <Tag bg="transparent" fg={PRIORITY_COLORS[t.priority] || C.ink5}>{t.priority}</Tag>}
            {t.status && !isDone(t.status) && t.status !== 'Not Started' && <Tag bg="transparent" fg={C.ink5}>{t.status}</Tag>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New task'}</Btn>
      </div>
      {showForm && (
        <Card>
          <FR label="Task"><Inp value={f.task} onChange={e => setF(p => ({ ...p, task: e.target.value }))} placeholder="What needs to happen…" /></FR>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <FR label="Due date"><Inp type="date" value={f.dueDate} onChange={e => setF(p => ({ ...p, dueDate: e.target.value }))} /></FR>
            <FR label="Priority"><Sel value={f.priority} onChange={e => setF(p => ({ ...p, priority: e.target.value }))}><option>High</option><option>Medium</option><option>Low</option></Sel></FR>
            <FR label="Type"><Sel value={f.taskType} onChange={e => setF(p => ({ ...p, taskType: e.target.value }))}><option>Task</option><option>Reminder</option></Sel></FR>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Btn onClick={add} disabled={saving}>{saving ? 'Creating…' : 'Create task'}</Btn></div>
        </Card>
      )}

      {tasks == null ? <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading tasks…</div>
        : (tasks.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>No tasks for this contact yet.</div>
          : <>
              {open.length > 0 && <><div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, margin: '4px 0 8px' }}>Open ({open.length})</div>{open.map(t => <Row key={t.id} t={t} />)}</>}
              {done.length > 0 && <><div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, margin: '16px 0 8px' }}>Done ({done.length})</div>{done.map(t => <Row key={t.id} t={t} />)}</>}
            </>)}
    </div>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────
function AiTab({ c, notes, setC, showToast, reloadContacts, reloadTasks }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [channel, setChannel] = useState('email');
  const [draft, setDraft] = useState(null);
  const [drafting, setDrafting] = useState(false);

  const payload = () => JSON.stringify({
    contact: { name: c.name, role: c.role, company: c.company, status: c.status, type: c.type,
      lastContacted: c.last_contacted_at, daysSinceContact: daysSince(c), nextAction: c.nextAction, nextActionDate: c.nextActionDate, relatesTo: c.relatesTo },
    notes: (notes || []).slice(0, 12).map(n => ({ title: n.title, body: n.body, summary: n.summary, type: n.type, date: n.createdTime })),
  });

  const analyze = async () => {
    setAnalyzing(true);
    try { const res = await parseVoice(payload(), { section: 'contact-suggest', contactName: c.name }); setAnalysis(res); }
    catch (e) { showToast('AI failed: ' + e.message); }
    setAnalyzing(false);
  };
  const applyNext = async () => {
    if (!analysis?.nextAction) return;
    try {
      await updateContact(c.id, { nextAction: analysis.nextAction, nextActionDate: analysis.nextActionDate || '' });
      setC(prev => ({ ...prev, nextAction: analysis.nextAction, nextActionDate: analysis.nextActionDate || '' }));
      showToast('Next action set ✓'); reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
  };
  const makeDraft = async () => {
    setDrafting(true); setDraft(null);
    try { const res = await parseVoice(payload(), { section: 'contact-draft', contactName: c.name, channel }); setDraft(res); }
    catch (e) { showToast('AI failed: ' + e.message); }
    setDrafting(false);
  };
  const copyDraft = () => {
    const text = (draft.subject && channel === 'email' ? `Subject: ${draft.subject}\n\n` : '') + (draft.message || '');
    navigator.clipboard?.writeText(text).then(() => showToast('Copied ✓')).catch(() => {});
  };

  return (
    <div>
      {/* Relationship analysis */}
      <Card>
        <SectionLabel right={<Btn onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing…' : (analysis ? 'Re-analyze' : '✦ Analyze')}</Btn>}>Relationship summary & next step</SectionLabel>
        {!analysis && !analyzing && <p style={{ fontSize: 13, color: C.ink5, margin: 0, lineHeight: 1.5 }}>Get an AI read on where this relationship stands and the best next move, based on notes and last contact.</p>}
        {analyzing && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 13 }}><Spinner size={16} /> Reading the history…</div>}
        {analysis && !analyzing && (
          <div>
            <p style={{ fontSize: 14, color: C.ink8, lineHeight: 1.6, margin: '0 0 14px' }}>{analysis.summary}</p>
            <div style={{ padding: '12px 14px', background: C.accS, border: '1px solid #ecd1bc', borderRadius: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.accD, marginBottom: 4 }}>Recommended next action</div>
              <div style={{ fontSize: 15, color: C.ink9, fontFamily: SERIF }}>{analysis.nextAction}{analysis.nextActionDate ? ` · ${fmtR(analysis.nextActionDate)}` : ''}</div>
              {analysis.reasoning && <div style={{ fontSize: 12, color: C.ink5, marginTop: 6, fontStyle: 'italic' }}>{analysis.reasoning}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Btn v="acc" onClick={applyNext}>Set as next action</Btn></div>
            </div>
          </div>
        )}
      </Card>

      {/* Draft message */}
      <Card>
        <SectionLabel right={
          <div style={{ display: 'flex', gap: 6 }}>
            {['email', 'text'].map(ch => (
              <button key={ch} onClick={() => setChannel(ch)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: channel === ch ? C.ink9 : C.bg, color: channel === ch ? C.bg : C.ink5, border: `1px solid ${channel === ch ? C.ink9 : C.cr3}` }}>{ch === 'email' ? 'Email' : 'Text/DM'}</button>
            ))}
          </div>
        }>Draft a follow-up</SectionLabel>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: draft || drafting ? 12 : 0 }}>
          <Btn onClick={makeDraft} disabled={drafting}>{drafting ? 'Writing…' : (draft ? 'Regenerate' : '✦ Draft message')}</Btn>
        </div>
        {drafting && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 13 }}><Spinner size={16} /> Writing…</div>}
        {draft && !drafting && (
          <div style={{ padding: 14, background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
            {channel === 'email' && draft.subject && <div style={{ fontSize: 14, fontWeight: 600, color: C.ink9, marginBottom: 8 }}>Subject: {draft.subject}</div>}
            <div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{draft.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Btn v="gho" onClick={copyDraft}>Copy</Btn></div>
          </div>
        )}
      </Card>
    </div>
  );
}
