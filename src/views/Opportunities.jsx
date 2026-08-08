import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { C, SERIF, SANS, MONO, stBg, stFg, prBg, prFg, fmtC, fmtD } from '../constants.js';
import { Eyebrow, Tag, Spinner, Btn, Inp, Sel, FR, useConfirm, Modal, FilterDropdown, SkeletonKanban, EmptyState } from '../components/UI.jsx';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache.js';
import HierarchyEditor from './opportunities/HierarchyEditor.jsx';
import LinksEditor from './opportunities/LinksEditor.jsx';
import TaskRowEditor from './opportunities/TaskRowEditor.jsx';
import TaskKanban from './opportunities/TaskKanban.jsx';
import { getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity,
         getTasks, createTask, updateTask, deleteTask, getCompanies, getContacts,
         getAirtableSchema, airtableRecordUrl, getAppState, setAppState,
         createContact, createCompany } from '../api.js';
import { dealCategoryMatchesSlug, SLUG_TO_DEAL_CATEGORY, COMPANIES, COMPANY_META } from '../constants/roles.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Opportunities — live Notion-backed view used in two modes:
//   viewMode="list"   (default): expandable list with tasks rolled up
//   viewMode="kanban" : draggable board grouped by Stage — used as the company
//                       Kanban tab, replacing all local app_state boards.
// Notion is the single source of truth; creates/edits/deletes write there.
// ─────────────────────────────────────────────────────────────────────────────

// ── The seven kanban columns ─────────────────────────────────────────────────
//
// These read off the `Lane` field, NOT the legacy `Stage` select. Stage carries
// 19 historical options and the Airtable API cannot edit an existing select's
// choices, so aliasing nineteen values into seven columns was the old workaround
// and it always lied about where a card really sat. `Lane` is a purpose-built
// field with exactly these seven values and nothing else.
//
// Order is the workflow: parked, sent out, being worked, blocked, about to
// land, landed, filed away.
const OPP_STAGES = [
  'Future Plans', 'Submitted', 'In Work', 'Waiting On', 'Closing', 'Done', 'Archive',
];

// Legacy `Stage` values still appear on records and in the edit form. They are
// kept for history and reporting; they no longer decide the column.
const EXTRA_STAGES = [
  'Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost',
  'Prospect', 'Exploring', 'Forming', 'Due diligence', 'Underwriting',
  'Structuring', 'Verbal commit', 'Committed', 'Deposit pending',
  'Active', 'In build', 'Delivered',
];

// Fallback only, for a record whose Lane was never backfilled. Every existing
// record was backfilled on 2026-08-04, so this is a safety net for rows created
// directly in Airtable without a Lane rather than a routine path.
const STAGE_LANE_ALIASES = {
  'Lead': 'Future Plans', 'Prospect': 'Future Plans', 'Exploring': 'Future Plans',
  'Qualified': 'Future Plans', 'Forming': 'Future Plans',
  'Proposal': 'Submitted', 'Structuring': 'Submitted',
  'Due diligence': 'In Work', 'Underwriting': 'In Work', 'Negotiation': 'In Work',
  'Active': 'In Work', 'In build': 'In Work',
  'Verbal commit': 'Closing', 'Committed': 'Closing', 'Deposit pending': 'Closing',
  'Closed Won': 'Done', 'Delivered': 'Done',
  'Closed Lost': 'Archive',
};

/**
 * Which column a card belongs in. Lane wins outright; Stage is only consulted
 * when Lane is blank, which should not happen for anything the app created.
 */
const canonicalStage = (stage, lane) => {
  if (lane && OPP_STAGES.includes(lane)) return lane;
  return STAGE_LANE_ALIASES[stage] || 'Future Plans';
};

const STAGE_STYLE = {
  'Future Plans': { hBg: C.ink3,  hFg: '#fff', border: C.ink3  },
  'Submitted':    { hBg: C.blu,   hFg: '#fff', border: C.blu   },
  'In Work':      { hBg: C.acc,   hFg: '#fff', border: C.acc   },
  'Waiting On':   { hBg: C.yel,   hFg: '#fff', border: C.yel   },
  'Closing':      { hBg: C.pur || C.blu, hFg: '#fff', border: C.pur || C.blu },
  'Done':         { hBg: C.grn,   hFg: '#fff', border: C.grn   },
  'Archive':      { hBg: C.ink2,  hFg: '#fff', border: C.ink2  },
};

// The counterparty paperwork ladder, shown as the NCNDA tag on a card. Ladder
// order, not alphabetical — it is a sequence.
const PAPERWORK_STAGES = [
  'Initial Outreach', 'NCNDA Sent', 'NCNDA Signed', 'Discovery Call',
  'Contract Negotiation', 'Deal Finalization', 'Closed', 'Stalled', 'Archived',
];

// Stored Level wins; a blank one falls back to the link, which is how every
// record created before the field existed still reads correctly.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
function priorityRank(p) {
  const k = String(p || '').toLowerCase().replace(/\s*priority\s*/g, '').trim();
  return PRIORITY_RANK[k] ?? 3;
}
function byPriorityThenName(a, b) {
  const d = priorityRank(a.priority) - priorityRank(b.priority);
  if (d) return d;
  return (a.name || '').localeCompare(b.name || '');
}

const levelOf = (o) => o?.level || (o?.parentId ? 'Story' : 'Epic');

const UNLINKED_ID = '__unlinked__';

const CARD_SECTIONS_KEY = 'ovmg.card.sections';
const SECTIONS = [
  { id: 'hierarchy', label: 'Level & sub-opportunities' },
  { id: 'links',     label: 'Links' },
  { id: 'contacts',  label: 'Contacts' },
  { id: 'companies', label: 'Companies' },
  { id: 'money',     label: 'Value & cost' },
  { id: 'dates',     label: 'Dates & probability' },
  { id: 'notes',     label: 'Notes' },
];

const hdrBtn = {
  border: `1px solid ${C.cr3}`, borderRadius: 6, background: 'transparent',
  color: C.ink5, fontFamily: MONO, fontSize: 9, letterSpacing: '.05em',
  padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};

const OPP_PRIORITIES = ['', 'High Priority', 'Medium Priority', 'Low Priority'];

// ── Per-company pipeline lanes (2026-07 audit §3.2) ──────────────────────────
// Each company can define its OWN swimlanes (e.g. OVM: "Scope → Build →
// Review → Launch"; OVMG: the classic sales stages). Config lives in
// app_state under `pipeline:{slug}`; per-card lane assignments under
// `pipeline-cards:{slug}`. Every lane maps to a canonical Stage so the all-up
// Opportunities board still rolls everything into Lead→Closed.
const LANE_PALETTE = ['#d96b3a', '#2c5d8a', '#2f7d5f', '#b48a1e', '#7c3d8f', '#3a7d44', '#8a5c2c', '#5c2c8a', '#b03a3a', '#4a4f58'];

function defaultLanes() {
  return OPP_STAGES.map(s => ({
    id:     s.toLowerCase().replace(/\s+/g, '-'),
    label:  s,
    color:  (STAGE_STYLE[s] || {}).hBg || C.ink5,
    mapsTo: s,
  }));
}

// Resolve which lane a card sits in: explicit assignment first (if the lane
// still exists), then the first lane mapping to the card's canonical stage,
// then the first lane so nothing is ever silently lost.
function laneForCard(opp, lanes, assignments) {
  const assigned = assignments?.[opp.id];
  if (assigned && lanes.some(l => l.id === assigned)) return assigned;
  const stage = canonicalStage(opp.stage, opp.lane);
  const byStage = lanes.find(l => l.mapsTo === stage);
  return (byStage || lanes[0])?.id;
}

// ── Lane editor modal ─────────────────────────────────────────────────────────
function LaneEditor({ slug, lanes, onSave, onClose }) {
  const [draft, setDraft] = useState(() => lanes.map(l => ({ ...l })));
  const [busy, setBusy]   = useState(false);

  const upd  = (i, patch) => setDraft(d => d.map((l, j) => j === i ? { ...l, ...patch } : l));
  const move = (i, dir) => setDraft(d => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const next = [...d];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = i => setDraft(d => d.filter((_, j) => j !== i));
  const add = () => setDraft(d => [...d, {
    id: `lane-${Date.now()}`,
    label: 'New lane',
    color: LANE_PALETTE[d.length % LANE_PALETTE.length],
    mapsTo: 'Future Plans',
  }]);

  const save = async () => {
    const clean = draft.filter(l => l.label.trim());
    if (!clean.length) return;
    setBusy(true);
    try { await onSave(clean); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`${COMPANY_META[slug]?.label || slug} — Kanban lanes`} onClose={onClose}>
      <p style={{ fontSize: 12, color: C.ink5, margin: '0 0 14px', lineHeight: 1.5 }}>
        Rename, reorder, recolor, add or remove this company's swimlanes. Each lane maps to a canonical pipeline stage so the all-companies board stays consistent.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {draft.map((l, i) => (
          <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
            <button onClick={() => { const next = LANE_PALETTE[(LANE_PALETTE.indexOf(l.color) + 1) % LANE_PALETTE.length]; upd(i, { color: next }); }}
              title="Click to cycle color"
              style={{ width: 20, height: 20, borderRadius: 6, background: l.color, border: 'none', cursor: 'pointer', flexShrink: 0 }} />
            <input value={l.label} onChange={e => upd(i, { label: e.target.value })}
              style={{ flex: 1, minWidth: 110, background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '5px 9px', fontFamily: SANS, fontSize: 13, color: C.ink9, outline: 'none' }} />
            <select value={l.mapsTo} onChange={e => upd(i, { mapsTo: e.target.value })}
              title="Canonical stage this lane rolls up to"
              style={{ background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '5px 7px', fontFamily: MONO, fontSize: 10, color: C.ink5 }}>
              {OPP_STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', fontSize: 13, padding: 2 }}>↑</button>
              <button onClick={() => move(i, +1)} disabled={i === draft.length - 1} style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', fontSize: 13, padding: 2 }}>↓</button>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 13, padding: 2 }}>×</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
        <Btn v="gho" onClick={add}>+ Add lane</Btn>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={() => setDraft(defaultLanes())}>Reset to default</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save lanes'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Matches the Airtable "Entity" single-select options (drives company tabs).
const ENTITIES = ['OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify', 'Carbon Sponge', 'OVD', 'OVV'];

const TASK_CYCLE = ['Not Started', 'In Progress', 'Done'];

// ── Linked tasks (Kanban card → Notion Tasks) ────────────────────────────────
// Tasks tied to this opportunity via the Notion "Related Opportunities" relation.
// They also surface on the company's Tasks board. Add / advance status / delete,
// all synced straight to the Notion Tasks DB.
function LinkedTasks({ oppId, companyCat, showToast, extraTaskIds = null, allOpps = [] }) {
  const [tasks, setTasks]   = useState(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [confirmNode, confirm] = useConfirm();


  const reload = useCallback(() => {
    getTasks()
      .then(all => setTasks((all || []).filter(t =>
        (t.opportunityIds || []).includes(oppId) ||
        (extraTaskIds || []).includes(t.id)   // tasks reached via linked Projects
      )))
      .catch(() => setTasks([]));
  }, [oppId, extraTaskIds]);
  useEffect(() => { if (oppId) reload(); }, [oppId, reload]);

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTask({
        task: title.trim(), status: 'Not Started',
        opportunityIds: [oppId],
        entity: companyCat || undefined,
      });
      setTitle(''); setAdding(false); showToast?.('Task added ✓'); reload();
    } catch (e) { showToast?.('Failed: ' + e.message); }
    setBusy(false);
  };


  const del = (t) => confirm({
    itemName: t.task, confirmLabel: 'Delete task',
    onConfirm: async () => { await deleteTask(t.id); showToast?.('Task deleted'); reload(); },
  });

  return (
    <div style={{ borderTop: `1px solid ${C.cr2}`, paddingTop: 14, marginTop: 4 }}>
      {confirmNode}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
          Tasks for this effort{tasks ? ` (${tasks.length})` : ''}
        </span>
        <Btn v="gho" onClick={() => setAdding(a => !a)} sx={{ fontSize: 10, padding: '3px 9px' }}>
          {adding ? 'Cancel' : '+ Task'}
        </Btn>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <Inp value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" sx={{ flex: 1, fontSize: 12 }} />
          <Btn onClick={add} disabled={busy || !title.trim()} sx={{ fontSize: 11 }}>{busy ? '…' : 'Add'}</Btn>
        </div>
      )}

      {tasks === null ? (
        <div style={{ fontSize: 12, color: C.ink3 }}>Loading…</div>
      ) : tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No tasks linked yet.</div>
      ) : (
        <div>
          {/* One task section, fully editable. The old cramped row (status pill +
              rename + remove) was a second, weaker editor sitting next to this
              one; there is now a single place to change anything about a task. */}
          {tasks.map(t => (
            <TaskRowEditor
              key={t.id}
              task={t}
              opportunities={allOpps}
              onChanged={reload}
              onDelete={() => del(t)}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Opportunity quick view (kanban card click → live-edit + tasks popup) ─────
// The popup that opens when a kanban card is clicked. EVERY field is a live
// entry field — change it and it saves to Airtable immediately (optimistic,
// with a toast + revert on failure) via onPatch. Linked company/contact are
// both editable pickers AND clickable chips that jump into the CRM. The tasks
// underneath this opportunity sit at the bottom (add / advance / edit / remove,
// live against the Master Action Board).
function OppQuickView({ opp, onClose, onEdit, setView, showToast, tableId, onPatch, companiesList, contactsList, allOpps, onOpenOpp, onCreateChild, onDuplicate, onOpenThread, onTasksChanged, onCompaniesChanged }) {
  const isMobile = useIsMobile();
  const lane   = canonicalStage(opp.stage, opp.lane);
  const sStyle = STAGE_STYLE[lane] || {};
  const save   = (patch) => onPatch(opp.id, patch);

  // Text-ish fields buffer locally and save on blur (so we don't write to
  // Airtable per keystroke). Selects/date save on change.
  const [nextStep,  setNextStep]  = useState(opp.nextStep || opp.nextAction || '');
  const [notes,     setNotes]     = useState(opp.notes || '');
  const [value,     setValue]     = useState(opp.dealValue != null ? String(opp.dealValue) : '');
  const [cost,      setCost]      = useState(opp.dealCost != null ? String(opp.dealCost) : '');
  const [prob,      setProb]      = useState(opp.probability != null ? String(opp.probability) : '');
  const [otherParty,setOtherParty]= useState(opp.otherParty || '');
  const [dataRoom,  setDataRoom]  = useState(opp.dataRoom || '');
  useEffect(() => {
    setNextStep(opp.nextStep || opp.nextAction || ''); setNotes(opp.notes || '');
    setValue(opp.dealValue != null ? String(opp.dealValue) : '');
    setCost(opp.dealCost != null ? String(opp.dealCost) : '');
    setProb(opp.probability != null ? String(opp.probability) : '');
    setOtherParty(opp.otherParty || ''); setDataRoom(opp.dataRoom || '');
  }, [opp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const inp = { background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '6px 10px', fontFamily: SANS, fontSize: 12.5, color: C.ink9, width: '100%', boxSizing: 'border-box', outline: 'none' };
  const lbl = { fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, display: 'block', marginBottom: 3 };
  const chips = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: C.accS, color: C.accD, border: `1px solid ${C.acc}30` };

  const goCompany = (co) => { onClose(); setView?.('contacts', { openCompanyId: co.id, openCompanyName: co.name }); };
  const goContact = (ct) => { onClose(); setView?.('contacts', { openContactId: ct.id, search: ct.name }); };

  const addCompany = (id) => {
    if (!id) return;
    const co = (companiesList || []).find(c => c.id === id);
    const nextIds = [...(opp.companyIds || []), id];
    save({ companyIds: nextIds, companies: [...(opp.companies || []), { id, name: co?.name || '' }] });
  };
  const removeCompany = (id) => {
    save({
      companyIds: (opp.companyIds || []).filter(x => x !== id),
      companies:  (opp.companies  || []).filter(x => x.id !== id),
    });
  };

  // Create a company and link it without leaving the deal. Same reasoning as
  // Add contact: the counterparty's company turns up mid-deal, and sending you
  // to another tab to create it and back here to link it is exactly why deals
  // sit with no company on them and every Activity about them routes nowhere.
  //
  // The server matches an existing name before creating (`_companies.js`), so
  // typing a company that already exists links THAT record rather than making a
  // near-duplicate — and says which happened.
  const [addingCompany, setAddingCompany] = useState(false);
  const [ncoBusy, setNcoBusy] = useState(false);
  const [nco, setNco] = useState({ name: '', website: '', type: '' });

  const saveNewCompany = async () => {
    if (!nco.name.trim()) return;
    setNcoBusy(true);
    try {
      const created = await createCompany({
        name:    nco.name.trim(),
        website: nco.website.trim(),
        type:    nco.type || '',
      });
      cacheClear('companies');
      if ((opp.companyIds || []).includes(created.id)) {
        showToast?.(`${created.name} is already linked to this deal`);
      } else {
        save({
          companyIds: [...(opp.companyIds || []), created.id],
          companies:  [...(opp.companies  || []), { id: created.id, name: created.name }],
        });
        showToast?.(created.matchedExisting
          ? `${created.name} already existed — linked that one ✓`
          : `${created.name} created and linked ✓`);
      }
      onCompaniesChanged?.();
      setNco({ name: '', website: '', type: '' });
      setAddingCompany(false);
    } catch (e) {
      showToast?.('Could not add company: ' + e.message);
    } finally {
      setNcoBusy(false);
    }
  };
  // Multi-select, like companies. A deal routinely has several people on it and
  // forcing one meant the rest were tracked nowhere.
  const addContact = (id) => {
    if (!id || (opp.contactIds || []).includes(id)) return;
    const ct = (contactsList || []).find(c => c.id === id);
    save({
      contactIds: [...(opp.contactIds || []), id],
      contacts:   [...(opp.contacts   || []), { id, name: ct?.name || '' }],
    });
  };
  const [confirmNode, confirm] = useConfirm();
  const [tab, setTab] = useState('home');
  const [expanded, setExpanded] = useState(false);
  // Renaming used to close the card and dump you into the side form. Editing the
  // title in place is the whole fix: you stay where you are and keep working.
  const [titleDraft, setTitleDraft] = useState(opp.name || '');
  useEffect(() => { setTitleDraft(opp.name || ''); }, [opp.id, opp.name]);
  const [showSettings, setShowSettings] = useState(false);

  // Section visibility is a per-user preference, not per-card: you either care
  // about probability or you never do, and re-hiding it on every card would be
  // worse than leaving it on.
  const [visible, setVisible] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CARD_SECTIONS_KEY) || '{}'); }
    catch { return {}; }
  });
  const toggleSection = (id) => setVisible(prev => {
    const next = { ...prev, [id]: prev[id] === false };
    try { localStorage.setItem(CARD_SECTIONS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });

  // Every task under this record: its own, plus every story's. Each row is
  // tagged with which record it came from so the board can group and filter.
  const childStories = useMemo(
    () => (allOpps || []).filter(o => o.parentId === opp.id),
    [allOpps, opp.id],
  );
  const cardTasks = useMemo(() => {
    const owners = [opp, ...childStories];
    const seen = new Set();
    const out = [];
    for (const o of owners) {
      for (const t of (o.tasks || [])) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push({ ...t, _ownerId: o.id, _ownerName: o.id === opp.id ? '' : o.name });
      }
    }
    return out;
  }, [opp, childStories]);

  const [addingContact, setAddingContact] = useState(false);
  const [ncBusy, setNcBusy] = useState(false);
  const [nc, setNc] = useState({ name: '', email: '', company: '', role: '' });

  const saveNewContact = async () => {
    if (!nc.name.trim()) return;
    setNcBusy(true);
    try {
      // Inherits the opportunity's entity so the new person lands on the right
      // company tab instead of in an unfiltered pile.
      const created = await createContact({
        name: nc.name.trim(),
        email: nc.email.trim(),
        company: nc.company.trim(),
        role: nc.role.trim(),
        relatesTo: opp.entity ? [opp.entity] : [],
      });
      cacheClear('contacts');
      save({
        contactIds: [...(opp.contactIds || []), created.id],
        contacts:   [...(opp.contacts   || []), { id: created.id, name: nc.name.trim() }],
      });
      showToast?.(`${nc.name.trim()} added and linked ✓`);
      setNc({ name: '', email: '', company: '', role: '' });
      setAddingContact(false);
    } catch (e) {
      showToast?.('Could not add contact: ' + e.message);
    } finally {
      setNcBusy(false);
    }
  };

  const removeContact = (id) => {
    save({
      contactIds: (opp.contactIds || []).filter(x => x !== id),
      contacts:   (opp.contacts   || []).filter(x => x.id !== id),
    });
  };

  // Two panes on desktop: the record's own fields on the left, everything it is
  // CONNECTED to on the right (companies, people, hierarchy, links, tasks).
  // The split is by what you are doing, not by field type — you come here either
  // to change the deal or to work the relationships around it, and in a 500px
  // column the second half was always below the fold.
  const twoPane = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: isMobile ? 18 : 30, alignItems: 'start' };
  const fieldGrid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 };
  const paneTitle = { fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, borderBottom: `1px solid ${C.cr2}`, paddingBottom: 6, marginBottom: 12 };

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <a href={airtableRecordUrl(tableId, opp.id)} target="_blank" rel="noopener noreferrer"
        style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        ⊞ Airtable ↗
      </a>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>edits save instantly</span>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn v="gho" onClick={onEdit} title="Rename or delete">✎ Rename / delete</Btn>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </div>
  );

  return (
    <Modal
      title={opp.name}
      onClose={onClose}
      sub={`${lane}${opp.entity ? ` · ${opp.entity}` : ''} · ${levelOf(opp)}`}
      size={expanded ? 'full' : tab === 'tasks' ? 'wide' : 'default'}
      footer={footer}
      headerRight={
        <button
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Back to a panel' : 'Expand to the full page'}
          style={{ ...hdrBtn, flexShrink: 0 }}
        >{expanded ? '⤡ Shrink' : '⤢ Expand'}</button>
      }
    >
      {confirmNode}

      {/* Rename in place. */}
      <div style={{ marginBottom: 12 }}>
        <span style={lbl}>Name</span>
        <input
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={() => {
            const v = titleDraft.trim();
            if (v && v !== opp.name) save({ name: v });
            else if (!v) setTitleDraft(opp.name || '');
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ ...inp, fontSize: 14 }}
        />
      </div>

      {/* Lane badge + entity — everything below it is editable in place */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: sStyle.hBg || C.ink5, color: '#fff', borderRadius: 999, padding: '2px 9px' }}>
          {lane}{opp.stage && opp.stage !== lane ? ` · ${opp.stage}` : ''}
        </span>
        {opp.dealValue > 0 && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.grn }}>{fmtC(opp.dealValue)}</span>}
        {opp.dealCost > 0 && (
          <span title="What this costs us" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.red }}>
            −{fmtC(opp.dealCost)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {onDuplicate && (
          <button onClick={() => onDuplicate(opp)} title="Create an editable copy" style={hdrBtn}>⧉ Duplicate</button>
        )}
        {onOpenThread && (
          <button onClick={() => onOpenThread(opp)} title="Open this in Threads" style={hdrBtn}>◎ Thread</button>
        )}
        <button onClick={() => setShowSettings(v => !v)} title="Choose which sections show" style={hdrBtn}>⚙</button>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>edits save instantly</span>
      </div>

      {/* Home | Tasks. The card was one long scroll with the task list buried at
          the bottom; tasks are their own job and deserve their own surface. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${C.cr2}` }}>
        {['home', 'tasks'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', border: 'none', background: 'transparent',
            borderBottom: `2px solid ${tab === t ? C.acc : 'transparent'}`,
            color: tab === t ? C.ink9 : C.ink3,
            fontFamily: SANS, fontSize: 13, fontWeight: tab === t ? 600 : 400,
            cursor: 'pointer', marginBottom: -1, textTransform: 'capitalize',
          }}>
            {t}{t === 'tasks' && cardTasks.length ? ` · ${cardTasks.length}` : ''}
          </button>
        ))}
      </div>

      {showSettings && (
        <div style={{ marginBottom: 12, padding: '10px 12px', border: `1px solid ${C.acc}`, borderRadius: 9, background: C.bg2 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 7 }}>
            Sections on this card
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {SECTIONS.map(sec => {
              const on = visible[sec.id] !== false;
              return (
                <button key={sec.id} onClick={() => toggleSection(sec.id)} style={{
                  padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${on ? C.acc : C.cr3}`,
                  background: on ? C.accS : 'transparent',
                  color: on ? C.ink9 : C.ink3, fontFamily: SANS, fontSize: 11.5,
                }}>{on ? '✓ ' : ''}{sec.label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.ink3, marginTop: 7, lineHeight: 1.5 }}>
            Saved for you across every card, so the ones you never use stay out of the way.
          </div>
        </div>
      )}

      {tab === 'tasks' ? (
        <TaskKanban
          opp={opp}
          stories={childStories}
          tasks={cardTasks}
          contacts={contactsList || []}
          onChanged={onTasksChanged}
          showToast={showToast}
        />
      ) : (<>

      <div style={twoPane}>
      {/* ══ LEFT: the deal's own fields ══════════════════════════════════════ */}
      <div style={{ minWidth: 0 }}>
      <div style={paneTitle}>The deal</div>

      {/* ── Live entry fields ── */}
      <div style={fieldGrid}>
        <div>
          <span style={lbl}>Lane</span>
          {/* Board order, NOT alphabetical. These seven are a workflow and
              sorting them A–Z would put Archive first and Waiting On last. */}
          <select value={opp.lane || lane} onChange={e => save({ lane: e.target.value })} style={inp}>
            {OPP_STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <span style={lbl}>Paperwork · NCNDA</span>
          <select value={opp.paperworkStage || ''} onChange={e => save({ paperworkStage: e.target.value })} style={inp}>
            <option value="">Not tracked</option>
            {PAPERWORK_STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <span style={lbl}>Stage (legacy)</span>
          <select value={opp.stage || ''} onChange={e => save({ stage: e.target.value })} style={inp}>
            <option value="">—</option>
            {[...EXTRA_STAGES].sort((a, b) => a.localeCompare(b)).map(s => <option key={s}>{s}</option>)}
            {opp.stage && !EXTRA_STAGES.includes(opp.stage) && <option value={opp.stage}>{opp.stage}</option>}
          </select>
        </div>
        <div>
          <span style={lbl}>Entity / Company tab</span>
          <select value={opp.entity || ''} onChange={e => save({ entity: e.target.value || null, dealCategory: e.target.value ? [e.target.value] : [] })} style={inp}>
            <option value="">— None</option>
            {ENTITIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span style={lbl}>Priority</span>
          <select value={opp.priority || ''} onChange={e => save({ priority: e.target.value || null })} style={inp}>
            <option value="">— None</option>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div>
          <span style={lbl}>Kind</span>
          <select value={opp.kind || ''} onChange={e => save({ kind: e.target.value || null })} style={inp}>
            <option value="">— None</option>
            <option>Deal</option><option>Workstream</option>
          </select>
        </div>
        <div>
          <span style={lbl}>Deal value ($)</span>
          <input type="number" value={value} onChange={e => setValue(e.target.value)}
            onBlur={() => { const n = value === '' ? null : parseFloat(value); if (n !== (opp.dealValue ?? null)) save({ dealValue: n }); }}
            placeholder="0" style={inp} />
        </div>
        <div>
          <span style={lbl}>Deal cost ($)</span>
          <input type="number" value={cost} onChange={e => setCost(e.target.value)}
            onBlur={() => { const n = cost === '' ? null : parseFloat(cost); if (n !== (opp.dealCost ?? null)) save({ dealCost: n }); }}
            placeholder="what it costs us" style={inp} />
        </div>
        <div>
          <span style={lbl}>Close date</span>
          <input type="date" value={opp.closeDate || ''} onChange={e => save({ closeDate: e.target.value || null })} style={inp} />
        </div>
        <div>
          <span style={lbl}>Probability (%)</span>
          <input type="number" min="0" max="100" value={prob} onChange={e => setProb(e.target.value)}
            onBlur={() => { const n = prob === '' ? null : Math.max(0, Math.min(100, parseFloat(prob))); if (n !== (opp.probability ?? null)) save({ probability: n }); }}
            placeholder="—" style={inp} />
        </div>
        <div>
          <span style={lbl}>Type</span>
          <select value={opp.kanbanType || ''} onChange={e => save({ kanbanType: e.target.value || null, type: e.target.value ? (e.target.value === 'external' ? 'External' : 'Internal') : null })} style={inp}>
            <option value="">— Unset</option>
            <option value="internal">Internal</option>
            <option value="external">External (client)</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <span style={lbl}>Next step</span>
        <input value={nextStep} onChange={e => setNextStep(e.target.value)}
          onBlur={() => { if (nextStep !== (opp.nextStep || '')) save({ nextStep, nextAction: nextStep }); }}
          placeholder="What moves this forward?" style={inp} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <span style={lbl}>Other party</span>
          <input value={otherParty} onChange={e => setOtherParty(e.target.value)}
            onBlur={() => { if (otherParty !== (opp.otherParty || '')) save({ otherParty }); }}
            placeholder="Counterparty name" style={inp} />
        </div>
        <div>
          <span style={lbl}>Data room (URL)</span>
          <input value={dataRoom} onChange={e => setDataRoom(e.target.value)}
            onBlur={() => { if (dataRoom !== (opp.dataRoom || '')) save({ dataRoom }); }}
            placeholder="https://drive.google.com/…" style={inp} />
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <span style={lbl}>Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={isMobile ? 3 : 8}
          onBlur={() => { if (notes !== (opp.notes || '')) save({ notes }); }}
          placeholder="Key context…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
      </div>
      </div>

      {/* ══ RIGHT: everything this deal is connected to ═════════════════════ */}
      <div style={{ minWidth: 0 }}>
      <div style={paneTitle}>Who and what it touches</div>

      {/* ── Linked CRM company (multi) — chips jump to the snapshot, ×
             unlinks, dropdown adds, and ＋ creates one inline ── */}
      <div style={{ marginBottom: 10 }}>
        <span style={lbl}>Companies (CRM)</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(opp.companies || []).map(co => (
            <span key={co.id} style={{ ...chips, cursor: 'default' }}>
              <span onClick={() => goCompany(co)} title="Open company snapshot" style={{ cursor: 'pointer' }}>⌂ {co.name || 'Company'} ↗</span>
              <span onClick={() => removeCompany(co.id)} title="Unlink company" style={{ cursor: 'pointer', opacity: .6, marginLeft: 2 }}>×</span>
            </span>
          ))}
          <select value="" onChange={e => addCompany(e.target.value)}
            style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: 11 }} disabled={!companiesList?.length}>
            <option value="">{companiesList?.length ? '+ Link company…' : 'Loading companies…'}</option>
            {(companiesList || [])
              .filter(c => !(opp.companyIds || []).includes(c.id))
              .map(c => <option key={c.id} value={c.id}>{c.name}{c.entityCode ? ` (${c.entityCode})` : ''}</option>)}
          </select>
          <button onClick={() => setAddingCompany(v => !v)} style={hdrBtn}>
            {addingCompany ? 'Cancel' : '＋ Add company'}
          </button>
        </div>

        {addingCompany && (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${C.acc}`, borderRadius: 9, background: C.bg2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={lbl}>Name *</span>
                <input value={nco.name} onChange={e => setNco(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveNewCompany(); }} style={inp} autoFocus />
              </div>
              <div>
                <span style={lbl}>Website</span>
                <input value={nco.website} onChange={e => setNco(p => ({ ...p, website: e.target.value }))} placeholder="https://…" style={inp} />
              </div>
              <div>
                <span style={lbl}>Type</span>
                <select value={nco.type} onChange={e => setNco(p => ({ ...p, type: e.target.value }))} style={inp}>
                  <option value="">— None</option>
                  <option>External</option><option>Internal</option><option>Client</option>
                  <option>Partner</option><option>Vendor</option><option>Investor</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginRight: 'auto' }}>
                An existing name links that record instead of duplicating it.
              </span>
              <button onClick={saveNewCompany} disabled={ncoBusy || !nco.name.trim()} style={{
                ...hdrBtn, borderColor: nco.name.trim() ? C.acc : C.cr3, color: nco.name.trim() ? C.acc : C.ink3,
              }}>{ncoBusy ? 'Adding…' : 'Create and link'}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Linked CRM contacts — chips jump to the profile, dropdown adds ──
           Multi-select. The picker stays visible after the first one, which is
           the whole difference from before: a deal usually has several people. */}
      <div style={{ marginBottom: 12 }}>
        <span style={lbl}>Contacts (CRM)</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(opp.contacts || []).map(ct => (
            <span key={ct.id} style={{ ...chips, background: C.bluS, color: C.blu, border: `1px solid ${C.blu}30`, cursor: 'default' }}>
              <span onClick={() => goContact(ct)} title="Open contact profile" style={{ cursor: 'pointer' }}>◉ {ct.name || 'Contact'} ↗</span>
              <span onClick={() => removeContact(ct.id)} title="Unlink contact" style={{ cursor: 'pointer', opacity: .6, marginLeft: 2 }}>×</span>
            </span>
          ))}
          <select value="" onChange={e => addContact(e.target.value)}
            style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: 11 }} disabled={!contactsList?.length}>
            <option value="">{contactsList?.length ? '+ Link contact…' : 'Loading contacts…'}</option>
            {(contactsList || [])
              .filter(c => !(opp.contactIds || []).includes(c.id))
              .slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
          </select>
          <button onClick={() => setAddingContact(v => !v)} style={hdrBtn}>
            {addingContact ? 'Cancel' : '＋ Add contact'}
          </button>
        </div>

        {/* Someone new turns up mid-deal. Sending you to the CRM tab to add them
            and back here to link them is why they end up recorded nowhere. */}
        {addingContact && (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${C.acc}`, borderRadius: 9, background: C.bg2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <span style={lbl}>Name *</span>
                <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} style={inp} autoFocus />
              </div>
              <div>
                <span style={lbl}>Email</span>
                <input value={nc.email} onChange={e => setNc(p => ({ ...p, email: e.target.value }))} style={inp} />
              </div>
              <div>
                <span style={lbl}>Company</span>
                <input value={nc.company} onChange={e => setNc(p => ({ ...p, company: e.target.value }))} style={inp} />
              </div>
              <div>
                <span style={lbl}>Role</span>
                <input value={nc.role} onChange={e => setNc(p => ({ ...p, role: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={saveNewContact} disabled={ncBusy || !nc.name.trim()} style={{
                ...hdrBtn, borderColor: nc.name.trim() ? C.acc : C.cr3, color: nc.name.trim() ? C.acc : C.ink3,
              }}>{ncBusy ? 'Adding…' : 'Create and link'}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Hierarchy, links, tasks ── */}
      {visible.hierarchy !== false && (
        <HierarchyEditor
          opp={opp}
          allOpps={allOpps || []}
          onSave={(patch, targetId) => onPatch(targetId || opp.id, patch)}
          onOpen={onOpenOpp}
          onCreateChild={onCreateChild ? () => onCreateChild(opp) : null}
          onConfirm={confirm}
        />
      )}

      {visible.links !== false && <LinksEditor opp={opp} onSave={save} />}

      </div>
      </div>
      </>)}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
        <a href={airtableRecordUrl(tableId, opp.id)} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ⊞ Airtable ↗
        </a>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={onEdit} title="Rename or delete">✎ Rename / delete</Btn>
          <Btn onClick={onClose}>Done</Btn>
        </div>

      </div>
    </Modal>
  );
}

// ── Opportunity form (create / edit) ─────────────────────────────────────────
function OppForm({ initial, categories, onSave, onDelete, onClose, saving, showToast, tableId }) {
  const [f, setF] = useState({
    name: '',
    stage: 'Lead',
    notes: '',
    // (closeDate/entity/kanbanType defaults are set AFTER the spread below —
    // they were duplicated here too, which esbuild rightly flagged.)
    ...initial,
    dealValue: initial?.dealValue != null ? String(initial.dealValue) : '',
    closeDate: initial?.closeDate || '',
    // Entity is a scalar string; if it arrived as the dealCategory array, take first.
    entity: initial?.entity || (Array.isArray(initial?.dealCategory) ? initial.dealCategory[0] : initial?.dealCategory) || '',
    // Derive the Internal/External toggle from the saved opportunity if present.
    kanbanType: initial?.kanbanType || '',
    // Linked CRM contacts (Airtable 'Associated Contact'). A LIST, not one.
    // The field was always `multipleRecordLinks`; this form kept only the first
    // pick, so a deal created with three people on it arrived with one, and the
    // other two had to be added afterwards from the popup — which is the step
    // that never happens.
    contactIds: Array.isArray(initial?.contactIds) ? [...initial.contactIds] : [],
    priority:    initial?.priority || '',
    kind:        initial?.kind || '',
    probability: initial?.probability != null ? String(initial.probability) : '',
    nextStep:    initial?.nextStep || '',
    otherParty:  initial?.otherParty || '',
    dataRoom:    initial?.dataRoom || '',
  });
  const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const isEdit = !!initial?.id;

  // §7: contacts for the "Linked contact" picker — loaded once per open form.
  const [contactOpts, setContactOpts] = useState(null);
  useEffect(() => {
    let alive = true;
    import('../api.js').then(({ getContacts }) => getContacts())
      .then(cs => { if (alive) setContactOpts((cs || []).map(c => ({ id: c.id, name: c.name, company: c.company })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))); })
      .catch(() => { if (alive) setContactOpts([]); });
    return () => { alive = false; };
  }, []);

  const inp = { background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '7px 11px', fontFamily: SANS, fontSize: 13, color: C.ink9, width: '100%', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FR label="Name *"><Inp value={f.name} onChange={fld('name')} placeholder="OVMG x Acme Deal" /></FR>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FR label="Stage">
          <select value={f.stage} onChange={fld('stage')} style={inp}>
            <optgroup label="Pipeline">
              {OPP_STAGES.map(s => <option key={s}>{s}</option>)}
            </optgroup>
            <optgroup label="Other stages">
              {EXTRA_STAGES.map(s => <option key={s}>{s}</option>)}
            </optgroup>
            {/* Safety net: never hide (and never silently rewrite) a stage
                value that isn't in the known lists. */}
            {f.stage && !OPP_STAGES.includes(f.stage) && !EXTRA_STAGES.includes(f.stage) && (
              <option value={f.stage}>{f.stage}</option>
            )}
          </select>
        </FR>
        <FR label="Entity / Company">
          <select value={f.entity} onChange={fld('entity')} style={inp}>
            <option value="">— None</option>
            {ENTITIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FR label="Deal Value ($)">
          <Inp type="number" value={f.dealValue} onChange={fld('dealValue')} placeholder="0" />
        </FR>
        <FR label="Close Date"><Inp type="date" value={f.closeDate} onChange={fld('closeDate')} /></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <FR label="Priority">
          <select value={f.priority} onChange={fld('priority')} style={inp}>
            <option value="">— None</option>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </FR>
        <FR label="Kind">
          <select value={f.kind} onChange={fld('kind')} style={inp}>
            <option value="">— None</option>
            <option>Deal</option><option>Workstream</option>
          </select>
        </FR>
        <FR label="Probability (%)">
          <Inp type="number" value={f.probability} onChange={fld('probability')} placeholder="—" />
        </FR>
      </div>
      <FR label="Next Step">
        <Inp value={f.nextStep} onChange={fld('nextStep')} placeholder="What moves this forward?" />
      </FR>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FR label="Other Party">
          <Inp value={f.otherParty} onChange={fld('otherParty')} placeholder="Counterparty name" />
        </FR>
        <FR label="Data Room (URL)">
          <Inp value={f.dataRoom} onChange={fld('dataRoom')} placeholder="https://drive.google.com/…" />
        </FR>
      </div>
      <FR label="Type">
        <div style={{ display: 'flex', gap: 6 }}>
          {[['', 'Unset'], ['internal', 'Internal'], ['external', 'External (client)']].map(([val, lbl]) => {
            const on = (f.kanbanType || '') === val;
            return (
              <button key={val || 'unset'} type="button" onClick={() => setF(p => ({ ...p, kanbanType: val }))}
                style={{ flex: 1, padding: '7px 8px', borderRadius: 8, fontFamily: SANS, fontSize: 12, cursor: 'pointer',
                  background: on ? (val === 'external' ? C.acc : val === 'internal' ? C.blu : C.ink9) : C.bg,
                  color: on ? '#fff' : C.ink5, border: `1px solid ${on ? 'transparent' : C.cr3}` }}>
                {lbl}
              </button>
            );
          })}
        </div>
      </FR>
      <FR label="Linked contacts (CRM)">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {f.contactIds.map(id => {
            const c = (contactOpts || []).find(x => x.id === id);
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, background: C.bluS, color: C.blu, border: `1px solid ${C.blu}30` }}>
                ◉ {c?.name || 'Contact'}
                <span onClick={() => setF(p => ({ ...p, contactIds: p.contactIds.filter(x => x !== id) }))}
                  title="Remove" style={{ cursor: 'pointer', opacity: .6 }}>×</span>
              </span>
            );
          })}
          {/* Stays visible after the first pick — that is the whole difference. */}
          <select value="" disabled={contactOpts === null}
            onChange={e => { const id = e.target.value; if (id) setF(p => ({ ...p, contactIds: [...p.contactIds, id] })); }}
            style={{ ...inp, width: 'auto', flex: '1 1 180px' }}>
            <option value="">{contactOpts === null ? 'Loading contacts…' : f.contactIds.length ? '+ Add another…' : '+ Link a contact…'}</option>
            {(contactOpts || []).filter(c => !f.contactIds.includes(c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
            ))}
          </select>
        </div>
      </FR>
      <FR label="Notes">
        <textarea value={f.notes} onChange={fld('notes')} rows={3} placeholder="Key context…"
          style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
      </FR>

      {/* Linked tasks live on saved opportunities (need an id to attach to). */}
      {isEdit && <LinkedTasks oppId={initial.id} companyCat={f.entity} showToast={showToast} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isEdit && onDelete && <Btn v="dan" onClick={onDelete} disabled={saving}>Delete</Btn>}
          {isEdit && (
            <a href={airtableRecordUrl(tableId, initial.id)} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ⊞ Airtable ↗
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={() => { if (!f.name.trim()) { showToast?.('Name required'); return; } onSave({ ...f, contactIds: f.contactIds, dealValue: f.dealValue ? parseFloat(f.dealValue) : null, probability: f.probability !== '' ? parseFloat(f.probability) : null, dealCategory: f.entity ? [f.entity] : [] }); }} disabled={saving || !f.name.trim()}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────
// 2026-07 UI pass: drag tilt/fade, optional compact density, and a hover-free
// "advance →" quick action so a card can move to the next lane without
// dragging or opening the drawer.
function KanbanCard({ opp, onClick, onDragStart, onAdvance, compact = false }) {
  return (
    <div
      draggable
      onDragStart={e => { onDragStart(e); requestAnimationFrame(() => { e.target.style.opacity = '.45'; e.target.style.transform = 'rotate(1.5deg) scale(.98)'; }); }}
      onDragEnd={e => { e.target.style.opacity = ''; e.target.style.transform = ''; }}
      onClick={onClick}
      style={{
        background: C.cr1, border: `1px solid ${C.cr2}`, borderRadius: 8,
        padding: compact ? '6px 9px' : '10px 12px', cursor: 'pointer', userSelect: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'box-shadow .12s, transform .12s, opacity .12s',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; e.currentTarget.style.borderColor = C.acc; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; e.currentTarget.style.borderColor = C.cr2; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, fontSize: compact ? 12 : 13, fontWeight: 600, color: C.ink9, lineHeight: 1.3, marginBottom: compact ? 3 : 5 }}>{opp.name}</div>
        {onAdvance && (
          <button
            onClick={e => { e.stopPropagation(); onAdvance(opp); }}
            title="Advance to next lane"
            style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: 5, border: `1px solid ${C.cr3}`,
              background: C.bg, color: C.ink3, fontSize: 11, cursor: 'pointer', lineHeight: 1,
              display: 'grid', placeItems: 'center', padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.acc; e.currentTarget.style.borderColor = C.acc; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.ink3; e.currentTarget.style.borderColor = C.cr3; }}
          >
            →
          </button>
        )}
      </div>
      {opp.dealValue > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.grn, fontWeight: 600, marginBottom: compact ? 3 : 5 }}>{fmtC(opp.dealValue)}</div>
      )}
      {!compact && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {/* True Airtable stage, shown when it isn't one of the six lane names
              (e.g. "Structuring" sitting in the Proposal lane) — no data hidden. */}
          {opp.stage && !OPP_STAGES.includes(opp.stage) && <Tag bg={C.bg2} fg={C.ink5}>{opp.stage}</Tag>}
          {opp.kanbanType === 'external' && <Tag bg={C.accS} fg={C.acc}>External</Tag>}
          {opp.kanbanType === 'internal' && <Tag bg={C.bluS} fg={C.blu}>Internal</Tag>}
          {opp.kind && <Tag bg="transparent" fg={C.ink5}>{opp.kind}</Tag>}
          {opp.priority && <Tag bg={C.yelS} fg={C.yel}>{opp.priority.replace(' Priority', '')}</Tag>}
          {(opp.dealCategory || []).map(dc => (
            <span key={dc} style={{ fontFamily: MONO, fontSize: 9, color: C.acc, background: C.accS, border: `1px solid ${C.acc}30`, borderRadius: 999, padding: '1px 6px' }}>{dc}</span>
          ))}
          {(opp.tasks || []).length > 0 && (
            <span title={`${opp.tasks.length} linked task${opp.tasks.length !== 1 ? 's' : ''} — click card to view`}
              style={{ fontFamily: MONO, fontSize: 9, color: C.ink5, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 999, padding: '1px 6px' }}>
              ▤ {opp.tasks.length}
            </span>
          )}
        </div>
      )}
      {!compact && opp.nextAction && (
        <div style={{ fontSize: 11, color: C.ink5, marginTop: 5, lineHeight: 1.4 }}>→ {opp.nextAction}</div>
      )}
      {!compact && opp.driveLink && (
        <a href={opp.driveLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontFamily: MONO, fontSize: 9, color: C.blu, textDecoration: 'none' }}>
          ◫ Drive folder ↗
        </a>
      )}
    </div>
  );
}

// ── Kanban lane ───────────────────────────────────────────────────────────────
// Generic: takes a lane object ({id, label, color}) so per-company custom
// lanes (§3.2) and the canonical stage lanes render through one component.
function KanbanLane({ lane, cards, dragOverLane, onCardClick, onDragStart, onDragOver, onDrop, onDragLeave, onAdd, onAdvance, compact, collapsed, onToggleCollapse }) {
  const hBg = lane.color || C.ink5;
  const isOver = dragOverLane === lane.id;

  // 2026-07 UI pass: collapsed lanes shrink to a slim vertical strip (still a
  // valid drop target) so wide boards stay scannable.
  if (collapsed) {
    return (
      <div
        onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
        onClick={onToggleCollapse}
        title={`${lane.label} (${cards.length}) — click to expand`}
        style={{
          flex: '0 0 40px', minHeight: 220, borderRadius: 8, cursor: 'pointer',
          background: isOver ? `${hBg}44` : `${hBg}18`, border: `1px solid ${isOver ? hBg : hBg + '40'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 0',
          transition: 'background .15s',
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, background: hBg, color: '#fff', padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
        <span style={{ writingMode: 'vertical-rl', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: hBg }}>
          {lane.label}
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: `0 0 ${compact ? 190 : 220}px`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px', borderRadius: '8px 8px 0 0', background: hBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onToggleCollapse} title="Collapse lane" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff' }}>{lane.label}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,255,255,.18)', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
          <button onClick={() => onAdd(lane)} title="Add opportunity" style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0 }}>+</button>
          <button onClick={onToggleCollapse} title="Collapse lane" style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1, padding: 0 }}>«</button>
        </div>
      </div>
      <div
        onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
        style={{
          flex: 1, overflowY: 'auto', padding: '7px 6px',
          background: isOver ? `${hBg}22` : C.bg2,
          border: `1px solid ${isOver ? hBg : C.cr2}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 100, transition: 'background .15s, border-color .15s',
        }}
      >
        {cards.length === 0 && !isOver ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: MONO, opacity: .6 }}>Drop here</div>
        ) : cards.map(o => (
          <KanbanCard key={o.id} opp={o} compact={compact} onClick={() => onCardClick(o)} onDragStart={e => onDragStart(e, o)} onAdvance={onAdvance} />
        ))}
        {/* Drop placeholder — shows exactly where the card will land */}
        {isOver && (
          <div style={{ border: `2px dashed ${hBg}`, borderRadius: 8, minHeight: 44, background: `${hBg}10`, transition: 'all .1s' }} />
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// NOTE: the app-level router fn arrives as `setView` but is aliased to
// `navigate` here because this component already uses `setView` for its own
// local Kanban⇄List toggle state.
export default function Opportunities({ showToast, openOv, closeOv, setView: navigate, companyFilter = null, viewMode = 'list', allowViewToggle = false, initialParams = null }) {
  const isMobile = useIsMobile();
  const [opps,    setOpps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [openId,  setOpenId]  = useState(null);   // list mode
  const [quickId, setQuickId] = useState(null);   // kanban card → quick-view popup
  const [stageFilter, setStageFilter] = useState('All');
  // Kanban ⇄ List toggle (the merged Opportunities/Kanban surface) + the
  // internal vs external (client) filter that applies to both views.
  const [view, setView] = useState(viewMode);
  const [typeFilter, setTypeFilter] = useState('All'); // 'All' | 'internal' | 'external'
  // Company filter for the main (non-company-scoped) kanban/list
  const [companySelect, setCompanySelect] = useState('All');
  const [dragOverLane, setDragOver]  = useState(null);
  const dragCard = useRef(null);
  const [confirmNode, confirm] = useConfirm();

  // ── Per-company lanes (§3.2) ────────────────────────────────────────────────
  // The active pipeline slug: the company tab's prop, or the global scope /
  // pill selection on the main board. 'All' → canonical stage lanes.
  const pipelineSlug = companyFilter || (companySelect !== 'All' ? companySelect : null);
  const [customLanes,  setCustomLanes]  = useState(null); // null = not loaded / default
  const [assignments,  setAssignments]  = useState({});   // oppId → laneId
  const [laneEditorOpen, setLaneEditorOpen] = useState(false);

  useEffect(() => {
    setCustomLanes(null);
    setAssignments({});
    if (!pipelineSlug) return;
    let alive = true;
    Promise.all([
      getAppState(`pipeline:${pipelineSlug}`).catch(() => ({ data: null })),
      getAppState(`pipeline-cards:${pipelineSlug}`).catch(() => ({ data: null })),
    ]).then(([cfg, cards]) => {
      if (!alive) return;
      if (cfg?.data?.lanes?.length) setCustomLanes(cfg.data.lanes);
      if (cards?.data) setAssignments(cards.data);
    });
    return () => { alive = false; };
  }, [pipelineSlug]);

  const lanes = useMemo(
    () => (pipelineSlug && customLanes?.length) ? customLanes : defaultLanes(),
    [pipelineSlug, customLanes],
  );

  const saveLanes = async (newLanes) => {
    setCustomLanes(newLanes);
    try { await setAppState(`pipeline:${pipelineSlug}`, { lanes: newLanes }); showToast?.('Lanes saved ✓'); }
    catch (e) { showToast?.('Lane save failed: ' + e.message); }
  };

  const saveAssignment = async (oppId, laneId) => {
    const next = { ...assignments, [oppId]: laneId };
    setAssignments(next);
    if (!pipelineSlug) return;
    try { await setAppState(`pipeline-cards:${pipelineSlug}`, next); }
    catch { /* non-fatal — stage still updated in Airtable */ }
  };

  // ── 2026-07 UI pass: collapsible lanes + compact density ───────────────────
  const COLLAPSE_KEY = `ovmg.kanban.collapsed.${pipelineSlug || 'all'}`;
  const [collapsedLanes, setCollapsedLanes] = useState(() => new Set());
  useEffect(() => {
    try { setCollapsedLanes(new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'))); }
    catch { setCollapsedLanes(new Set()); }
  }, [COLLAPSE_KEY]);
  const toggleCollapse = (laneId) => setCollapsedLanes(prev => {
    const next = new Set(prev);
    if (next.has(laneId)) next.delete(laneId); else next.add(laneId);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('ovmg.kanban.compact') === '1'; } catch { return false; } });
  const flipCompact = () => setCompact(c => { try { localStorage.setItem('ovmg.kanban.compact', c ? '' : '1'); } catch { /* ignore */ } return !c; });

  // Horizontal scroll-edge shadows so off-screen lanes are obvious.
  const [scrollEdges, setScrollEdges] = useState({ l: false, r: false });
  const boardScrollRef = useCallback(node => {
    if (!node) return;
    const update = () => setScrollEdges({
      l: node.scrollLeft > 4,
      r: node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
    });
    update();
    node.addEventListener('scroll', update, { passive: true });
  }, []);

  // Canonical categories for the active company (pre-fill the form)
  const companyCats = companyFilter ? (SLUG_TO_DEAL_CATEGORY[companyFilter] || []) : [];
  const allCats = ['OVMG','ONEVIBEMEDIA','ONEVIBEDATA','ONEVIBEFEST','AMPLIFYARTISTS','AMPLIFYBRANDS',
    'CARBON SPONGE','DATA CENTERS','ONEVIBEGROUP','ONEVIBEPRODUCTIONS','SOLR ESS','LIFE','OTHER'];

  // Airtable table ID — fetched once so we can build "Open in Airtable" links.
  const [oppTableId, setOppTableId] = useState(null);
  useEffect(() => {
    getAirtableSchema().then(({ tables }) => {
      const t = tables.find(t => t.name === 'Opportunities');
      if (t) setOppTableId(t.id);
    }).catch(() => {});
  }, []);

  // 2026-07 UI pass: stale-while-revalidate — render the cached board
  // instantly, refresh in the background. Spinner only on true first load.
  const load = useCallback(() => {
    const cached = cacheGet('opportunities');
    if (cached) { setOpps(cached); setLoading(false); }
    else setLoading(true);
    getOpportunities()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        cacheSet('opportunities', list);
        setOpps(list);
      })
      .catch(e => showToast?.('Could not load opportunities: ' + e.message))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // CRM pickers for the quick view's live company/contact link fields.
  const [companiesList, setCompaniesList] = useState([]);
  // Epics only / Stories only / Both. Stories are threads inside a deal, so a
  // board showing both is a mixed-altitude list; the default is epics, which is
  // the level you scan.
  const [levelFilter, setLevelFilter] = useState(() => {
    try { return localStorage.getItem('ovmg.opps.level') || 'epics'; } catch { return 'epics'; }
  });
  const pickLevelFilter = (v) => {
    setLevelFilter(v);
    try { localStorage.setItem('ovmg.opps.level', v); } catch { /* private mode */ }
  };
  const [tasksList, setTasksList] = useState([]);
  const [contactsList,  setContactsList]  = useState([]);
  // The picker only needs names, so it skips the joined people/deal rollups.
  const loadCompanies = useCallback(() => (
    getCompanies({ rollups: false })
      .then(cs => setCompaniesList((cs || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''))))
      .catch(() => {})
  ), []);
  useEffect(() => {
    loadCompanies();
    const cached = cacheGet('contacts');
    if (cached) setContactsList(cached);
    getContacts().then(cs => { cacheSet('contacts', cs); setContactsList(cs || []); }).catch(() => {});
  }, [loadCompanies]);

  // Live-edit a single opportunity field: optimistic local update + immediate
  // Airtable write; on failure the toast reports it and a reload restores truth.
  // ── Duplicate ──────────────────────────────────────────────────────────────
  // "Copy of …" rather than a silent clone: an exact duplicate sitting next to
  // the original is impossible to tell apart in a list, and the copy is always
  // the one you meant to edit. It lands in Future Plans as a story so it has to
  // be deliberately filed before it shows up as live work.
  const duplicateOpp = useCallback(async (o) => {
    try {
      const created = await createOpportunity({
        name:      `Copy of ${o.name}`,
        lane:      'Future Plans',
        level:     'Story',
        parentId:  o.parentId || undefined,
        stage:     o.stage || undefined,
        entity:    o.entity || undefined,
        kind:      o.kind || undefined,
        type:      o.type || undefined,
        priority:  o.priority || undefined,
        goal:      o.goal || undefined,
        notes:     o.notes || undefined,
        nextStep:  o.nextStep || undefined,
        dataRoom:  o.dataRoom || undefined,
        contractsUrl: o.contractsUrl || undefined,
        dealValue: o.dealValue ?? undefined,
        dealCost:  o.dealCost ?? undefined,
        paperworkStage: o.paperworkStage || undefined,
        companyIds: o.companyIds || [],
        contactIds: o.contactIds || [],
      });
      showToast?.(`Copied to "Copy of ${o.name}"`);
      await load();
      setQuickId(created.id);
    } catch (e) {
      showToast?.('Duplicate failed: ' + e.message);
    }
  }, [showToast, load]);


  const patchOpp = useCallback(async (id, patch) => {
    setOpps(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
    try {
      await updateOpportunity(id, patch);
      showToast?.('Saved ✓');
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
      load();
    }
  }, [showToast, load]);

  // Deep link / cross-link support: another view (a task card, the ⌘K search,
  // a company snapshot) can land here with { openOppId } to pop the quick view
  // for that opportunity as soon as the board has data.
  const consumedParams = useRef(null);
  useEffect(() => {
    const id = initialParams?.openOppId;
    if (!id || consumedParams.current === initialParams) return;
    if (!opps.some(o => o.id === id)) return; // wait until loaded
    consumedParams.current = initialParams;
    setQuickId(id);
  }, [initialParams, opps]);

  // Scope to this company's opportunities, then filter by stage/type/company selector
  const scoped = useMemo(() => {
    let list = opps;
    // companyFilter = prop from company tab; companySelect = main kanban dropdown
    if (companyFilter) list = list.filter(o => dealCategoryMatchesSlug(o.dealCategory, companyFilter));
    else if (companySelect !== 'All') list = list.filter(o => dealCategoryMatchesSlug(o.dealCategory, companySelect));
    if (stageFilter !== 'All') list = list.filter(o => o.stage === stageFilter);
    if (typeFilter  !== 'All') list = list.filter(o => (o.kanbanType || '') === typeFilter);
    // Level. An epic is an opportunity with no parent; a story has one. "Epics"
    // also keeps stories whose parent is missing, so a broken link never hides
    // a record from the only board that lists it.
    // "Epics" means the top of the board: real epics, plus any story that has
    // not been attached to one yet, plus anything whose parent record is missing.
    // Nothing is ever hidden while it waits to be filed.
    const ids = new Set(opps.map(o => o.id));
    const attached = o => o.parentId && ids.has(o.parentId);
    if (levelFilter === 'epics')   list = list.filter(o => levelOf(o) === 'Epic' || !attached(o));
    if (levelFilter === 'stories') list = list.filter(o => levelOf(o) === 'Story' && attached(o));
    return list;
  }, [opps, companyFilter, companySelect, stageFilter, typeFilter, levelFilter]);

  // Reusable Internal/External + Kanban/List control row. Called as a function
  // ({renderControlRow()}) rather than rendered as <ControlRow/> so it doesn't
  // remount its DOM on every parent re-render (e.g. each kanban drag-over).
  // 2026-07 UI pass: filters are compact dropdowns (shared FilterDropdown).
  const renderControlRow = () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {!companyFilter && (
        <FilterDropdown
          label="Company"
          value={companySelect}
          onChange={setCompanySelect}
          options={[
            { v: 'All', l: 'All Companies' },
            ...COMPANIES.map(s => ({ v: s, l: COMPANY_META[s]?.label || s, color: COMPANY_META[s]?.color_hex })),
          ]}
        />
      )}
      <FilterDropdown
        label="Level"
        value={levelFilter}
        onChange={pickLevelFilter}
        options={[
          { v: 'epics',   l: 'Epics only' },
          { v: 'stories', l: 'Stories only' },
          { v: 'all',     l: 'Epics + stories' },
          { v: 'tasks',   l: 'Tasks only' },
        ]}
      />
      <FilterDropdown
        label="Type"
        value={typeFilter}
        onChange={setTypeFilter}
        options={[{ v: 'All', l: 'All' }, { v: 'internal', l: 'Internal' }, { v: 'external', l: 'External' }]}
      />
      {allowViewToggle && !isMobile && (
        <div style={{ display: 'flex', gap: 0, marginLeft: 4, border: `1px solid ${C.cr3}`, borderRadius: 8, overflow: 'hidden' }}>
          {[['kanban', 'Kanban'], ['list', 'List']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? C.ink9 : C.bg, color: view === v ? C.bg : C.ink5,
              border: 'none', padding: '5px 12px', fontSize: 11, fontFamily: MONO, letterSpacing: '.06em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );

  // Cards grouped by LANE (custom per-company lanes or the canonical stages).
  // Every task on the board, tagged with the opportunity it belongs to. Anything
  // unlinked is grouped under a synthetic epic so it can be found and assigned
  // rather than existing only in a place nobody opens.
  // Only fetched for the tasks-only view; the deal board already carries the
  // task rows it needs on each opportunity.
  useEffect(() => {
    if (levelFilter !== 'tasks') return;
    let live = true;
    getTasks().then(rows => { if (live) setTasksList(rows || []); }).catch(() => {});
    return () => { live = false; };
  }, [levelFilter, opps]);

  const allTasksForBoard = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const o of opps) {
      for (const t of (o.tasks || [])) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push({ ...t, _ownerId: o.id, _ownerName: o.name });
      }
    }
    for (const t of (tasksList || [])) {
      if (seen.has(t.id)) continue;
      if ((t.opportunityIds || []).length) continue;
      seen.add(t.id);
      out.push({ ...t, _ownerId: UNLINKED_ID, _ownerName: 'Unlinked' });
    }
    return out;
  }, [opps, tasksList]);

  const byLane = useMemo(() => {
    const m = Object.fromEntries(lanes.map(l => [l.id, []]));
    scoped.forEach(o => {
      const laneId = laneForCard(o, lanes, assignments);
      (m[laneId] || m[lanes[0]?.id] || []).push(o);
    });
    // High above Medium above Low inside every lane. A lane you have to read
    // top to bottom to find the urgent card is a list, not a board.
    // Unset priority sorts below Low: it has not been triaged, so it should not
    // outrank something explicitly marked unimportant.
    for (const k of Object.keys(m)) m[k].sort(byPriorityThenName);
    return m;
  }, [scoped, lanes, assignments]);

  const stages = useMemo(() => {
    const base = companyFilter ? opps.filter(o => dealCategoryMatchesSlug(o.dealCategory, companyFilter)) : opps;
    return Array.from(new Set(base.map(o => o.stage).filter(Boolean)));
  }, [opps, companyFilter]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const openForm = (initial = null) => {
    const isEdit = !!initial?.id;
    const defaultCat = companyCats[0] || '';
    const handleSave = async (data) => {
      setSaving(true);
      // Airtable has a dedicated 'Drive Link' field — no need to encode into Notes.
      const { driveLink, kanbanType, ...rest } = data;
      const payload = { ...rest, driveLink: driveLink || '', kanbanType: kanbanType || '' };
      // Creating a sub-opportunity from inside a parent's popup: the form has no
      // field for it, so the parent id rides along from the opener.
      if (!isEdit && initial?.parentId) payload.parentId = initial.parentId;
      try {
        if (isEdit) {
          await updateOpportunity(initial.id, payload);
          setOpps(prev => prev.map(o => o.id === initial.id ? { ...o, ...payload, name: payload.name, driveLink, kanbanType } : o));
          showToast?.('Saved ✓');
        } else {
          await createOpportunity(payload);
          showToast?.('Created ✓');
          load();
        }
        closeOv?.();
      } catch (e) {
        showToast?.('Error: ' + e.message);
      }
      setSaving(false);
    };
    const handleDelete = () => confirm({
      itemName: initial.name,
      confirmLabel: 'Delete opportunity',
      onConfirm: async () => {
        try {
          await deleteOpportunity(initial.id);
          setOpps(prev => prev.filter(o => o.id !== initial.id));
          showToast?.('Deleted');
          closeOv?.();
        } catch (e) { showToast?.('Delete failed: ' + e.message); }
      },
    });
    openOv?.({
      kind: 'drawer',
      title: isEdit ? initial.name : 'New Opportunity',
      sub: isEdit ? (initial.stage || '') : '',
      body: <OppForm
        initial={isEdit ? initial : { entity: defaultCat, stage: 'Lead' }}
        categories={allCats}
        onSave={handleSave}
        onDelete={isEdit ? handleDelete : null}
        onClose={() => closeOv?.()}
        saving={saving}
        showToast={showToast}
        tableId={oppTableId}
      />,
    });
  };

  // ── Drag-and-drop / quick advance (kanban mode) ────────────────────────────
  // Moving a card records the lane assignment (per-company boards) AND writes
  // the `Lane` field the column maps to. It deliberately does NOT touch the
  // legacy `Stage`: dragging a card to "In Work" should not silently rewrite a
  // record that says "Due diligence" into something less specific. Stage is
  // edited on the card; Lane is what the board moves.
  const applyMove = async (opp, targetLane) => {
    const prevLaneId = laneForCard(opp, lanes, assignments);
    const prevLane   = opp.lane;
    if (prevLaneId === targetLane.id) return;

    if (pipelineSlug) saveAssignment(opp.id, targetLane.id);

    const nextLane    = targetLane.mapsTo || targetLane.label;
    const changedLane = opp.lane !== nextLane && OPP_STAGES.includes(nextLane);
    if (changedLane) {
      setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, lane: nextLane } : o));
      try {
        await updateOpportunity(opp.id, { lane: nextLane });
      } catch (e) {
        showToast?.('Lane update failed: ' + e.message);
        load();
        return;
      }
    }

    showToast?.({
      text: `${opp.name} → ${targetLane.label}`,
      actionLabel: 'Undo',
      onAction: () => {
        if (pipelineSlug) saveAssignment(opp.id, prevLaneId);
        if (changedLane) {
          setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, lane: prevLane } : o));
          updateOpportunity(opp.id, { lane: prevLane }).catch(() => load());
        }
      },
    });
  };

  const handleDragStart = (e, opp) => { dragCard.current = opp; e.dataTransfer.effectAllowed = 'move'; };
  const handleDrop      = (e, targetLane) => {
    e.preventDefault(); setDragOver(null);
    const opp = dragCard.current;
    dragCard.current = null;
    if (opp) applyMove(opp, targetLane);
  };

  // "→" quick action on cards: hop to the next lane without dragging.
  const advanceCard = (opp) => {
    const cur  = laneForCard(opp, lanes, assignments);
    const idx  = lanes.findIndex(l => l.id === cur);
    const next = lanes[idx + 1];
    if (next) applyMove(opp, next);
    else showToast?.('Already in the last lane');
  };

  if (loading) {
    return view === 'kanban'
      ? <div style={{ paddingTop: 8 }}><SkeletonKanban lanes={isMobile ? 1 : 5} /></div>
      : <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={30} color={C.acc} /></div>;
  }

  // ══ KANBAN VIEW ══════════════════════════════════════════════════════════════
  if (view === 'kanban') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {confirmNode}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
          <div>
            {!companyFilter && <Eyebrow>Pipeline</Eyebrow>}
            {!companyFilter && (
              <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 34, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
                Opportunities
              </h1>
            )}
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, marginTop: 4 }}>
              {scoped.length} {scoped.length === 1 ? 'opportunity' : 'opportunities'}
              {companyFilter ? ' for this company' : ''}
              {scoped.reduce((s, o) => s + (o.dealValue || 0), 0) > 0 && (
                <> · <span style={{ color: C.grn, fontWeight: 600 }}>{fmtC(scoped.reduce((s, o) => s + (o.dealValue || 0), 0))}</span> pipeline</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {renderControlRow()}
            {pipelineSlug && !isMobile && (
              <Btn v="gho" onClick={() => setLaneEditorOpen(true)} sx={{ fontSize: 11 }}>⚙ Lanes</Btn>
            )}
            {!isMobile && (
              <Btn v="gho" onClick={flipCompact} sx={{ fontSize: 11 }} title="Toggle card density">
                {compact ? '☰ Cozy' : '≡ Compact'}
              </Btn>
            )}
            <Btn onClick={() => openForm()}>+ New</Btn>
          </div>
        </div>

        {laneEditorOpen && pipelineSlug && (
          <LaneEditor slug={pipelineSlug} lanes={lanes} onSave={saveLanes} onClose={() => setLaneEditorOpen(false)} />
        )}

        {/* Card click → quick-view popup: the tasks underneath this opportunity */}
        {quickId && (() => {
          const qo = opps.find(o => o.id === quickId);
          if (!qo) return null;
          return (
            <OppQuickView
              opp={qo}
              onClose={() => setQuickId(null)}
              onEdit={() => { setQuickId(null); openForm(qo); }}
              setView={navigate}
              showToast={showToast}
              tableId={oppTableId}
              onPatch={patchOpp}
              companiesList={companiesList}
              contactsList={contactsList}
              allOpps={opps}
              onOpenOpp={setQuickId}
              onCreateChild={parent => { setQuickId(null); openForm({ parentId: parent.id, entity: parent.entity, dealCategory: parent.entity ? [parent.entity] : [] }); }}
              onDuplicate={duplicateOpp}
              onOpenThread={o => { setQuickId(null); navigate?.('threads', { openOppId: o.id }); }}
              onTasksChanged={load}
              onCompaniesChanged={loadCompanies}
            />
          );
        })()}

        {/* (Company pills row removed — company selection lives in the
            Company dropdown inside the control row, 2026-07 UI pass.) */}

        {isMobile ? (
          /* §3.3: mobile keeps lane grouping — sticky lane headers over a
             scrolling card list, instead of the old flat ungrouped list. */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {scoped.length === 0 ? (
              <EmptyState icon="◆" title="No opportunities yet"
                body="Track a deal, build, or partnership here and it rolls up to the all-companies board automatically."
                actionLabel="+ New opportunity" onAction={() => openForm()} />
            ) : lanes.map(lane => {
              const cards = byLane[lane.id] || [];
              if (!cards.length) return null;
              return (
                <div key={lane.id}>
                  <div style={{
                    position: 'sticky', top: 0, zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px', borderRadius: 8, background: lane.color || C.ink5,
                    margin: '6px 0',
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff' }}>{lane.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,255,255,.2)', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cards.map(o => (
                      <KanbanCard key={o.id} opp={o} onClick={() => setQuickId(o.id)} onDragStart={() => {}} onAdvance={advanceCard} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : levelFilter === 'tasks' ? (
          /* Tasks-only. Different lanes on purpose: a task's statuses are not a
             deal's stages, and forcing one vocabulary on both would make every
             drag write something almost right. */
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 16 }}>
            <TaskKanban
              opp={{ id: UNLINKED_ID, name: 'All tasks', entity: '' }}
              stories={[
                ...opps.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')),
                { id: UNLINKED_ID, name: 'Unlinked' },
              ]}
              tasks={allTasksForBoard}
              onChanged={() => { load(); getTasks().then(r => setTasksList(r || [])).catch(() => {}); }}
              showToast={showToast}
              contacts={contactsList || []}
              onBulkLink
              linkTargets={opps}
            />
          </div>
        ) : (
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <div ref={boardScrollRef} style={{ overflowX: 'auto', height: '100%', paddingBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 'max-content', alignItems: 'stretch', height: '100%' }}>
                {lanes.map(lane => (
                  <KanbanLane
                    key={lane.id}
                    lane={lane}
                    cards={byLane[lane.id] || []}
                    dragOverLane={dragOverLane}
                    compact={compact}
                    collapsed={collapsedLanes.has(lane.id)}
                    onToggleCollapse={() => toggleCollapse(lane.id)}
                    onAdvance={advanceCard}
                    onCardClick={opp => setQuickId(opp.id)}
                    onDragStart={handleDragStart}
                    onDragOver={e => { e.preventDefault(); setDragOver(lane.id); }}
                    onDrop={e => handleDrop(e, lane)}
                    onDragLeave={() => setDragOver(null)}
                    onAdd={l => openForm({ dealCategory: companyCats[0] || '', lane: l.mapsTo || 'Future Plans' })}
                  />
                ))}
              </div>
            </div>
            {/* Scroll-edge shadows — make off-screen lanes obvious */}
            {scrollEdges.l && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 16, width: 28, background: `linear-gradient(90deg, ${C.bg}, transparent)`, pointerEvents: 'none' }} />}
            {scrollEdges.r && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 16, width: 28, background: `linear-gradient(270deg, ${C.bg}, transparent)`, pointerEvents: 'none' }} />}
          </div>
        )}
      </div>
    );
  }

  // ══ LIST VIEW ════════════════════════════════════════════════════════════════
  return (
    <div>
      {confirmNode}
      {quickId && (() => {
        const qo = opps.find(o => o.id === quickId);
        if (!qo) return null;
        return (
          <OppQuickView
            opp={qo}
            onClose={() => setQuickId(null)}
            onEdit={() => { setQuickId(null); openForm(qo); }}
            setView={navigate}
            showToast={showToast}
            tableId={oppTableId}
            onPatch={patchOpp}
            companiesList={companiesList}
            contactsList={contactsList}
            allOpps={opps}
            onOpenOpp={setQuickId}
            onCreateChild={parent => { setQuickId(null); openForm({ parentId: parent.id, entity: parent.entity, dealCategory: parent.entity ? [parent.entity] : [] }); }}
            onDuplicate={duplicateOpp}
            onOpenThread={o => { setQuickId(null); navigate?.('threads', { openOppId: o.id }); }}
            onTasksChanged={load}
            onCompaniesChanged={loadCompanies}
          />
        );
      })()}
      {!companyFilter && (
        <>
          <Eyebrow>Pipeline</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 28 : 36, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>
            Opportunities
          </h1>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3 }}>
          {scoped.length} {scoped.length === 1 ? 'opportunity' : 'opportunities'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {renderControlRow()}
          <Btn onClick={() => openForm()}>+ New</Btn>
        </div>
      </div>

      {/* Stage filter */}
      {stages.length > 0 && (
        <FilterDropdown
          label="Stage"
          value={stageFilter}
          onChange={setStageFilter}
          options={['All', ...stages]}
          sx={{ marginBottom: 16 }}
        />
      )}

      {scoped.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontSize: 13, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 12 }}>
          No opportunities{companyFilter ? ' for this company yet' : ''}. Click "+ New" to add one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scoped.map(o => {
            const open = openId === o.id;
            return (
              <div key={o.id} style={{ border: `1px solid ${C.cr2}`, borderRadius: 12, overflow: 'hidden', background: C.bg }}>
                <button
                  onClick={() => setOpenId(open ? null : o.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, transition: 'transform .15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink9, lineHeight: 1.3 }}>{o.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {o.stage  && <Tag bg={C.bluS} fg={C.blu}>{o.stage}</Tag>}
                      {o.status && <Tag bg={stBg(o.status)} fg={stFg(o.status)}>{o.status}</Tag>}
                      {(o.dealCategory || []).map(dc => (
                        <span key={dc} style={{ fontFamily: MONO, fontSize: 9, color: C.acc, background: C.accS, border: `1px solid ${C.acc}30`, borderRadius: 999, padding: '2px 7px' }}>{dc}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {o.dealValue ? <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.grn }}>{fmtC(o.dealValue)}</span> : null}
                    <button onClick={e => { e.stopPropagation(); openForm(o); }} style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>Edit</button>
                  </div>
                </button>
                {open && (
                  <div style={{ borderTop: `1px solid ${C.cr2}`, background: C.bg2, padding: '12px 16px' }}>
                    {o.nextAction && (
                      <div style={{ fontSize: 12, color: C.ink7, marginBottom: 10 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>Next action</span>
                        <div style={{ marginTop: 2 }}>{o.nextAction}{o.nextActionDate ? ` · ${fmtD(o.nextActionDate)}` : ''}</div>
                      </div>
                    )}
                    {o.notes && <div style={{ fontSize: 13, color: C.ink7, lineHeight: 1.6, marginBottom: (o.projectNames?.length || o.tasks?.length) ? 10 : 0 }}>{o.notes}</div>}
                    {(o.projectNames || []).length > 0 && (
                      <div style={{ marginBottom: o.tasks?.length ? 10 : 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>Projects</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {o.projectNames.map((pn, i) => (
                            <span key={i} style={{ fontFamily: MONO, fontSize: 10, color: C.ink7, background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 999, padding: '2px 8px' }}>{pn}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(o.tasks || []).length > 0 && (
                      <div>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
                          {o.tasks.length} task{o.tasks.length !== 1 ? 's' : ''} via project{(o.projectNames?.length || 0) !== 1 ? 's' : ''}
                        </span>
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {o.tasks.map(t => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.ink7 }}>
                              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{t.status || '—'}</span>
                              <span>{t.name || 'Untitled'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
