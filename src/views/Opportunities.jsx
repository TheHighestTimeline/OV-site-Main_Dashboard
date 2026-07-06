import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { C, SERIF, SANS, MONO, stBg, stFg, prBg, prFg, fmtC, fmtD } from '../constants.js';
import { Eyebrow, Tag, Spinner, Btn, Inp, Sel, FR, useConfirm, Modal, FilterDropdown, SkeletonKanban, EmptyState } from '../components/UI.jsx';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity,
         getTasks, createTask, updateTask, deleteTask,
         getAirtableSchema, airtableRecordUrl, getAppState, setAppState } from '../api.js';
import { dealCategoryMatchesSlug, SLUG_TO_DEAL_CATEGORY, COMPANIES, COMPANY_META } from '../constants/roles.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Opportunities — live Notion-backed view used in two modes:
//   viewMode="list"   (default): expandable list with tasks rolled up
//   viewMode="kanban" : draggable board grouped by Stage — used as the company
//                       Kanban tab, replacing all local app_state boards.
// Notion is the single source of truth; creates/edits/deletes write there.
// ─────────────────────────────────────────────────────────────────────────────

// Matches the Airtable "Opportunities" Stage single-select options exactly.
const OPP_STAGES = [
  'Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost',
];

const STAGE_STYLE = {
  'Lead':        { hBg: C.ink5,  hFg: '#fff', border: C.ink5  },
  'Qualified':   { hBg: C.blu,   hFg: '#fff', border: C.blu   },
  'Proposal':    { hBg: C.yel,   hFg: '#fff', border: C.yel   },
  'Negotiation': { hBg: C.acc,   hFg: '#fff', border: C.acc   },
  'Closed Won':  { hBg: C.grn,   hFg: '#fff', border: C.grn   },
  'Closed Lost': { hBg: C.ink3,  hFg: '#fff', border: C.ink3  },
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
  const stage = OPP_STAGES.includes(opp.stage) ? opp.stage : 'Lead';
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
    mapsTo: 'Lead',
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
function LinkedTasks({ oppId, companyCat, showToast }) {
  const [tasks, setTasks]   = useState(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft,  setDraft]  = useState('');
  const [confirmNode, confirm] = useConfirm();

  const saveEdit = async (t) => {
    const v = draft.trim();
    if (!v || v === t.task) { setEditId(null); return; }
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, task: v } : x));
    setEditId(null);
    try { await updateTask(t.id, { task: v }); showToast?.('Task updated ✓'); }
    catch (e) { showToast?.('Failed: ' + e.message); reload(); }
  };

  const reload = useCallback(() => {
    getTasks()
      .then(all => setTasks((all || []).filter(t => (t.opportunityIds || []).includes(oppId))))
      .catch(() => setTasks([]));
  }, [oppId]);
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

  const advance = async (t) => {
    const i = TASK_CYCLE.indexOf(t.status);
    const next = TASK_CYCLE[(i + 1) % TASK_CYCLE.length] || 'Not Started';
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x));
    try { await updateTask(t.id, { status: next }); } catch (e) { showToast?.('Failed: ' + e.message); reload(); }
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
              <button onClick={() => advance(t)} title="Advance status"
                style={{ background: stBg(t.status), color: stFg(t.status), border: 'none', borderRadius: 999, padding: '2px 9px', fontFamily: MONO, fontSize: 9, letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
                {t.status || 'Not Started'}
              </button>
              {editId === t.id ? (
                <>
                  <Inp value={draft} onChange={e => setDraft(e.target.value)} sx={{ flex: 1, fontSize: 12, padding: '4px 8px' }} />
                  <button onClick={() => saveEdit(t)} style={{ background: 'none', border: 'none', color: C.grn, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>save</button>
                  <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', color: C.ink3, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>cancel</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 12, color: C.ink8, lineHeight: 1.35 }}>{t.task}</span>
                  <button onClick={() => { setEditId(t.id); setDraft(t.task); }} style={{ background: 'none', border: 'none', color: C.ink3, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>edit</button>
                  <button onClick={() => del(t)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
    // §7: linked CRM contact (Airtable 'Associated Contact')
    contactId: (initial?.contactIds || [])[0] || '',
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
            {OPP_STAGES.map(s => <option key={s}>{s}</option>)}
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
      <FR label="Linked contact (CRM)">
        <select value={f.contactId} onChange={fld('contactId')} style={inp} disabled={contactOpts === null}>
          <option value="">{contactOpts === null ? 'Loading contacts…' : '— None'}</option>
          {(contactOpts || []).map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
          ))}
        </select>
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
          <Btn onClick={() => { if (!f.name.trim()) { showToast?.('Name required'); return; } const { contactId, ...rest } = f; onSave({ ...rest, contactIds: contactId ? [contactId] : [], dealValue: f.dealValue ? parseFloat(f.dealValue) : null, dealCategory: f.dealCategory ? [f.dealCategory] : [] }); }} disabled={saving || !f.name.trim()}>
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
          {opp.kanbanType === 'external' && <Tag bg={C.accS} fg={C.acc}>External</Tag>}
          {opp.kanbanType === 'internal' && <Tag bg={C.bluS} fg={C.blu}>Internal</Tag>}
          {opp.priority && <Tag bg={C.yelS} fg={C.yel}>{opp.priority.replace(' Priority', '')}</Tag>}
          {(opp.dealCategory || []).map(dc => (
            <span key={dc} style={{ fontFamily: MONO, fontSize: 9, color: C.acc, background: C.accS, border: `1px solid ${C.acc}30`, borderRadius: 999, padding: '1px 6px' }}>{dc}</span>
          ))}
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
export default function Opportunities({ showToast, openOv, closeOv, companyFilter = null, viewMode = 'list', allowViewToggle = false }) {
  const isMobile = useIsMobile();
  const [opps,    setOpps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [openId,  setOpenId]  = useState(null);   // list mode
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

  // Scope to this company's opportunities, then filter by stage/type/company selector
  const scoped = useMemo(() => {
    let list = opps;
    // companyFilter = prop from company tab; companySelect = main kanban dropdown
    if (companyFilter) list = list.filter(o => dealCategoryMatchesSlug(o.dealCategory, companyFilter));
    else if (companySelect !== 'All') list = list.filter(o => dealCategoryMatchesSlug(o.dealCategory, companySelect));
    if (stageFilter !== 'All') list = list.filter(o => o.stage === stageFilter);
    if (typeFilter  !== 'All') list = list.filter(o => (o.kanbanType || '') === typeFilter);
    return list;
  }, [opps, companyFilter, companySelect, stageFilter, typeFilter]);

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
  const byLane = useMemo(() => {
    const m = Object.fromEntries(lanes.map(l => [l.id, []]));
    scoped.forEach(o => {
      const laneId = laneForCard(o, lanes, assignments);
      (m[laneId] || m[lanes[0]?.id] || []).push(o);
    });
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
  // Moving a card records the lane assignment (per-company boards) AND updates
  // the canonical Stage the lane maps to. Every move gets an Undo toast
  // (2026-07 UI pass).
  const applyMove = async (opp, targetLane) => {
    const prevLane  = laneForCard(opp, lanes, assignments);
    const prevStage = opp.stage;
    if (prevLane === targetLane.id) return;

    if (pipelineSlug) saveAssignment(opp.id, targetLane.id);

    const targetStage  = targetLane.mapsTo || targetLane.label;
    const changedStage = opp.stage !== targetStage && OPP_STAGES.includes(targetStage);
    if (changedStage) {
      setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, stage: targetStage } : o));
      try {
        await updateOpportunity(opp.id, { stage: targetStage });
      } catch (e) {
        showToast?.('Stage update failed: ' + e.message);
        load();
        return;
      }
    }

    showToast?.({
      text: `${opp.name} → ${targetLane.label}`,
      actionLabel: 'Undo',
      onAction: () => {
        if (pipelineSlug) saveAssignment(opp.id, prevLane);
        if (changedStage) {
          setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, stage: prevStage } : o));
          updateOpportunity(opp.id, { stage: prevStage }).catch(() => load());
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
                      <KanbanCard key={o.id} opp={o} onClick={() => openForm(o)} onDragStart={() => {}} onAdvance={advanceCard} />
                    ))}
                  </div>
                </div>
              );
            })}
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
                    onCardClick={opp => openForm(opp)}
                    onDragStart={handleDragStart}
                    onDragOver={e => { e.preventDefault(); setDragOver(lane.id); }}
                    onDrop={e => handleDrop(e, lane)}
                    onDragLeave={() => setDragOver(null)}
                    onAdd={l => openForm({ dealCategory: companyCats[0] || '', stage: l.mapsTo || 'Lead' })}
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
