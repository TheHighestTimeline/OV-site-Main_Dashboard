// The task board that lives inside an opportunity card.
//
// TASKS GET THEIR OWN LANES. The Master Action Board's Status field carries
// eleven options and they do not map onto the deal lanes — "Waiting On Response"
// is not "Waiting On" a counterparty signature, and a task has no Closing stage.
// Forcing one lane vocabulary on both would mean every drag wrote a status that
// was almost right, which is how a board stops being trusted.
//
// Each lane owns a canonical status: dropping a card writes that one. The other
// statuses that live in the lane are recognised on read, so a task set to
// "On Hold" in Airtable lands in Waiting On without being silently rewritten
// until you actually move it.
//
// On an EPIC this shows every task across all of its stories, because "what is
// outstanding on this deal" is a question about the deal, not about one thread.
// The story filter narrows it back down.

import { useState, useMemo, useRef } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { createTask, updateTask } from '../../api.js';
import TaskRowEditor from './TaskRowEditor.jsx';

export const TASK_LANES = [
  { id: 'Submitted',   canonical: 'Submitted',   also: ['open'],                                            color: () => C.ink3 },
  { id: 'Not Started', canonical: 'Not Started',  also: [],                                                  color: () => C.blu  },
  { id: 'In Progress', canonical: 'In Progress',  also: [],                                                  color: () => C.acc  },
  { id: 'Waiting On',  canonical: 'Waiting On Response', also: ['on hold', 'needs attention', 'waiting'],    color: () => C.yel  },
  { id: 'Done',        canonical: 'Done',         also: ['complete'],                                        color: () => C.grn  },
  { id: 'Archive',     canonical: 'Archive',      also: ['canceled', 'cancelled', 'archived'],               color: () => C.ink2 },
];

const LANE_OF = (() => {
  const m = {};
  for (const l of TASK_LANES) {
    m[l.canonical.toLowerCase()] = l.id;
    for (const a of l.also) m[a] = l.id;
    m[l.id.toLowerCase()] = l.id;
  }
  return m;
})();

/** Which lane a task belongs in. Anything unrecognised lands in Not Started. */
export function laneForTask(t) {
  return LANE_OF[String(t?.status || '').trim().toLowerCase()] || 'Not Started';
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
function prank(p) {
  const k = String(p || '').toLowerCase().replace(/\s*priority\s*/g, '').trim();
  return PRIORITY_RANK[k] ?? 3;
}

export default function TaskKanban({
  opp, stories = [], tasks = [], onChanged, showToast, compact,
}) {
  const [storyFilter, setStoryFilter] = useState('all');
  const [adding, setAdding]   = useState(null);   // lane id
  const [draft,  setDraft]    = useState('');
  const [busy,   setBusy]     = useState(false);
  const [openId, setOpenId]   = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const dragged = useRef(null);

  // Everything under this record: its own tasks plus every story's, so an epic
  // answers "what is outstanding on this deal" in one place.
  const scoped = useMemo(() => {
    if (storyFilter === 'mine')  return tasks.filter(t => t._ownerId === opp.id);
    if (storyFilter !== 'all')   return tasks.filter(t => t._ownerId === storyFilter);
    return tasks;
  }, [tasks, storyFilter, opp.id]);

  const byLane = useMemo(() => {
    const m = Object.fromEntries(TASK_LANES.map(l => [l.id, []]));
    for (const t of scoped) (m[laneForTask(t)] ||= []).push(t);
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) =>
        prank(a.priority) - prank(b.priority) ||
        String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    }
    return m;
  }, [scoped]);

  async function move(task, laneId) {
    const lane = TASK_LANES.find(l => l.id === laneId);
    if (!lane || laneForTask(task) === laneId) return;
    setBusy(true);
    try {
      await updateTask(task.id, { status: lane.canonical });
      onChanged?.();
    } catch (e) {
      showToast?.('Could not move that task: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function add(laneId) {
    const name = draft.trim();
    if (!name) return;
    const lane = TASK_LANES.find(l => l.id === laneId);
    setBusy(true);
    try {
      // A task added from a story belongs to that story; from an epic with a
      // story filter on, it belongs to the filtered story. Otherwise the epic.
      const owner = storyFilter !== 'all' && storyFilter !== 'mine' ? storyFilter : opp.id;
      // The Unlinked bucket is a display grouping, not a record. Sending its id
      // to Airtable would be a write against an opportunity that does not exist,
      // so a task added there is created genuinely unlinked.
      const real = owner && !String(owner).startsWith('__');
      await createTask({
        task: name,
        status: lane?.canonical || 'Not Started',
        entity: opp.entity || undefined,
        opportunityIds: real ? [owner] : [],
      });
      setDraft('');
      setAdding(null);
      onChanged?.();
    } catch (e) {
      showToast?.('Could not add that task: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const allOpps = useMemo(
    () => [opp, ...stories].filter(Boolean),
    [opp, stories],
  );

  return (
    <div>
      {stories.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
            Show
          </span>
          <FilterChip on={storyFilter === 'all'}  onClick={() => setStoryFilter('all')}  label={`Everything · ${tasks.length}`} />
          <FilterChip on={storyFilter === 'mine'} onClick={() => setStoryFilter('mine')} label="This deal only" />
          {stories.map(s => (
            <FilterChip
              key={s.id}
              on={storyFilter === s.id}
              onClick={() => setStoryFilter(s.id)}
              label={s.name}
            />
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${TASK_LANES.length}, minmax(180px, 1fr))`,
        gap: 8, overflowX: 'auto', paddingBottom: 4,
      }}>
        {TASK_LANES.map(lane => {
          const col  = lane.color();
          const rows = byLane[lane.id] || [];
          return (
            <div
              key={lane.id}
              onDragOver={e => { e.preventDefault(); setDragOver(lane.id); }}
              onDragLeave={() => setDragOver(d => (d === lane.id ? null : d))}
              onDrop={e => {
                e.preventDefault();
                setDragOver(null);
                if (dragged.current) move(dragged.current, lane.id);
                dragged.current = null;
              }}
              style={{
                background: dragOver === lane.id ? C.accS : C.bg2,
                border: `1px solid ${dragOver === lane.id ? C.acc : C.cr2}`,
                borderRadius: 9, padding: 8, minHeight: compact ? 120 : 200,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontFamily: MONO, fontSize: 9, letterSpacing: '.08em',
                  textTransform: 'uppercase', color: C.ink5,
                }}>{lane.id}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{rows.length}</span>
                <button
                  onClick={() => { setAdding(adding === lane.id ? null : lane.id); setDraft(''); }}
                  title={`Add a task to ${lane.id}`}
                  style={{ border: 'none', background: 'none', color: C.ink3, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
                >＋</button>
              </div>

              {adding === lane.id && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') add(lane.id);
                      if (e.key === 'Escape') { setAdding(null); setDraft(''); }
                    }}
                    placeholder="What needs doing?"
                    autoFocus
                    style={{
                      flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '5px 8px',
                      borderRadius: 6, border: `1px solid ${C.cr3}`, background: C.bg,
                      color: C.ink9, fontFamily: SANS, fontSize: 11.5, outline: 'none',
                    }}
                  />
                  <button onClick={() => add(lane.id)} disabled={busy || !draft.trim()} style={{
                    border: 'none', background: 'none', color: draft.trim() ? C.acc : C.ink3,
                    cursor: 'pointer', fontFamily: MONO, fontSize: 10, padding: '0 4px',
                  }}>add</button>
                </div>
              )}

              {!rows.length && adding !== lane.id && (
                <div style={{ fontSize: 11, color: C.ink2, padding: '6px 2px' }}>Empty</div>
              )}

              {rows.map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => { dragged.current = t; }}
                  onDragEnd={() => { dragged.current = null; setDragOver(null); }}
                >
                  {openId === t.id ? (
                    <div style={{ background: C.bg, borderRadius: 8 }}>
                      <TaskRowEditor
                        task={t}
                        opportunities={allOpps}
                        onChanged={onChanged}
                        showToast={showToast}
                      />
                      <button onClick={() => setOpenId(null)} style={{
                        border: 'none', background: 'none', color: C.ink3, cursor: 'pointer',
                        fontFamily: MONO, fontSize: 9, padding: '0 0 6px 10px',
                      }}>collapse</button>
                    </div>
                  ) : (
                    <TaskCard t={t} onOpen={() => setOpenId(t.id)} ownerName={t._ownerName} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ t, onOpen, ownerName }) {
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = t.dueDate && String(t.dueDate).slice(0, 10) < today;
  const p       = prank(t.priority);
  const pcol    = p === 0 ? C.red : p === 1 ? C.yel : p === 2 ? C.ink3 : C.cr3;

  return (
    <button onClick={onOpen} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'grab',
      background: C.bg, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${pcol}`,
      borderRadius: 7, padding: '7px 9px',
    }}>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.ink9, lineHeight: 1.3 }}>
        {t.name || t.task || '(untitled)'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {ownerName && (
          <span style={{
            flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 8.5, color: C.ink3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{ownerName}</span>
        )}
        <span style={{ flex: ownerName ? 0 : 1 }} />
        {t.dueDate && (
          <span style={{
            fontFamily: MONO, fontSize: 8.5, flexShrink: 0,
            color: overdue ? C.red : C.ink3, fontWeight: overdue ? 700 : 400,
          }}>{String(t.dueDate).slice(5, 10)}</span>
        )}
      </div>
    </button>
  );
}

function FilterChip({ on, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${on ? C.acc : C.cr3}`,
      background: on ? C.accS : 'transparent',
      color: on ? C.ink9 : C.ink5,
      fontFamily: SANS, fontSize: 11, maxWidth: 200,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}
