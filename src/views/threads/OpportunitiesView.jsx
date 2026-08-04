// View 1: Opportunities. The default. Three panes, three levels.
//
//   EPIC   the deal            "OVMG X Genesis — Bennettsville $20M Bridge Loan"
//   STORY  one thread inside it "OVMG X Adam Shore — Loan Solutions"
//   TASK   work on either
//
// Left rail is epics, grouped by entity. Centre is that epic's stories — one
// card per email thread, each with its own paperwork tag and task counts. Right
// is the detail for whichever story is open: who is on it, where the paperwork
// stands, the timeline, and its tasks.
//
// A STORY IS ONE THREAD, not one person. A two-person email thread is still one
// thread and must not be split into two cards, which is why a story links a LIST
// of contacts. The People view is the place that groups by person instead; both
// groupings are correct for their question and must not be unified.

import { useState, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import { Modal } from '../../components/UI.jsx';
import { EntityChip, Panel, Empty, fmtRel } from './shared.jsx';
import StoryDetail from './StoryDetail.jsx';
import StoryForm from './StoryForm.jsx';

const LANES = ['Future Plans', 'Submitted', 'In Work', 'Waiting On', 'Closing', 'Done', 'Archive'];
const LANE_RANK = Object.fromEntries(LANES.map((l, i) => [l, i]));
const DONE_LANES = new Set(['Done', 'Archive']);

const LANE_COLOR = {
  'Future Plans': () => C.ink3,
  'Submitted':    () => C.blu,
  'In Work':      () => C.acc,
  'Waiting On':   () => C.yel,
  'Closing':      () => C.pur || C.blu,
  'Done':         () => C.grn,
  'Archive':      () => C.ink2,
};

// Paperwork tags. Signed and Closed read green because "have they signed" is
// the single most asked question about any of these threads.
const PAPERWORK_COLOR = {
  'NCNDA Signed': () => C.grn,
  'Closed':       () => C.grn,
  'NCNDA Sent':   () => C.yel,
  'Stalled':      () => C.red,
};

const addBtn = {
  padding: '7px 14px', borderRadius: 999, border: 'none', background: C.acc,
  color: '#fff', fontFamily: MONO, fontSize: 10, letterSpacing: '.05em',
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function OpportunitiesView({
  data, selected, onSelect, onChanged, showToast, isMobile,
}) {
  const { epics = [], stories = [], contacts = [] } = data || {};
  const [activeEpic, setActiveEpic] = useState(null);
  const [addingStory, setAddingStory] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const epic = activeEpic ? epics.find(e => e.id === activeEpic) : null;

  const children = useMemo(() => {
    const kids = stories.filter(s => s.parentId === activeEpic);
    const visible = showDone ? kids : kids.filter(s => !DONE_LANES.has(s.lane));
    return visible.slice().sort(byLaneThenUrgency);
  }, [stories, activeEpic, showDone]);

  const hiddenDone = useMemo(
    () => stories.filter(s => s.parentId === activeEpic && DONE_LANES.has(s.lane)).length,
    [stories, activeEpic],
  );

  const story = selected ? stories.find(s => s.id === selected) : null;

  const storyModal = (addingStory || editingStory) && (
    <Modal
      title={editingStory ? editingStory.name : `New sub-opportunity under ${epic?.name || ''}`}
      onClose={() => { setAddingStory(false); setEditingStory(null); }}
    >
      <StoryForm
        story={editingStory}
        parent={epic}
        contacts={contacts}
        onClose={() => { setAddingStory(false); setEditingStory(null); }}
        onDone={onChanged}
        showToast={showToast}
      />
    </Modal>
  );

  // ── Mobile: drill down epic → story → detail ───────────────────────────────
  if (isMobile) {
    if (story) {
      return (
        <>
          <StoryDetail
            story={story} contacts={contacts} onChanged={onChanged} showToast={showToast}
            onClose={() => onSelect(null)} onEdit={() => setEditingStory(story)} isMobile
          />
          {storyModal}
        </>
      );
    }
    if (epic) {
      return (
        <div>
          <BackButton label={epic.name} onClick={() => setActiveEpic(null)} />
          <EpicDigest epic={epic} onAdd={() => setAddingStory(true)} />
          <StoryList
            stories={children} onSelect={onSelect} onAdd={() => setAddingStory(true)}
            hiddenDone={hiddenDone} showDone={showDone} onToggleDone={() => setShowDone(v => !v)}
          />
          {storyModal}
        </div>
      );
    }
    return <Rail epics={epics} active={activeEpic} onPick={setActiveEpic} />;
  }

  // ── Desktop: rail, stories, detail ─────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(300px, 1fr) minmax(340px, 1.15fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ position: 'sticky', top: 0 }}>
        <Rail epics={epics} active={activeEpic} onPick={id => { setActiveEpic(id); onSelect(null); }} />
      </div>

      <div>
        {!epic && (
          <Empty
            icon="▤"
            title="Pick an opportunity"
            body="An opportunity is the deal. Inside it, each sub-opportunity is one thread with one company — where the paperwork, the timeline and the tasks live."
          />
        )}
        {epic && (
          <>
            <EpicDigest epic={epic} onAdd={() => setAddingStory(true)} />
            <StoryList
              stories={children} selected={selected} onSelect={onSelect}
              onAdd={() => setAddingStory(true)}
              hiddenDone={hiddenDone} showDone={showDone} onToggleDone={() => setShowDone(v => !v)}
            />
          </>
        )}
      </div>

      <div style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 160px)', overflow: 'hidden' }}>
        <Panel sx={{ height: 'calc(100vh - 170px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <StoryDetail
            story={story} contacts={contacts} onChanged={onChanged}
            showToast={showToast} onEdit={() => story && setEditingStory(story)}
          />
        </Panel>
      </div>

      {storyModal}
    </div>
  );
}

// ── Left rail: epics grouped by entity ───────────────────────────────────────

function Rail({ epics, active, onPick }) {
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState(() => new Set());

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const byEntity = new Map();
    for (const e of epics) {
      if (q && !String(e.name || '').toLowerCase().includes(q)) continue;
      const key = e.entity || '';
      if (!byEntity.has(key)) byEntity.set(key, { entity: key, items: [] });
      byEntity.get(key).items.push(e);
    }
    return [...byEntity.values()]
      .map(g => ({ ...g, items: g.items.slice().sort(byKindThenName) }))
      // The no-entity bucket always sinks; it is the one that needs cleaning up.
      .sort((a, b) =>
        (a.entity ? 0 : 1) - (b.entity ? 0 : 1) ||
        b.items.length - a.items.length ||
        a.entity.localeCompare(b.entity));
  }, [epics, filter]);

  if (!epics.length) {
    return (
      <Panel>
        <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
          No opportunities yet. Create one on the Opportunities tab; anything with no
          Parent Opportunity shows up here as a top-level deal.
        </div>
      </Panel>
    );
  }

  return (
    <Panel sx={{ padding: '10px 8px' }}>
      {epics.length > 8 && (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '6px 9px', marginBottom: 8,
            borderRadius: 6, border: `1px solid ${C.cr2}`, background: C.bg,
            color: C.ink9, fontFamily: SANS, fontSize: 12, outline: 'none',
          }}
        />
      )}

      {!groups.length && (
        <div style={{ fontSize: 11.5, color: C.ink3, padding: '8px' }}>Nothing matches that.</div>
      )}

      {groups.map(g => {
        // Filtering is a search; forcing the user to re-open collapsed groups to
        // see their own hits would defeat it.
        const open = filter.trim() ? true : !closed.has(g.entity);
        return (
          <div key={g.entity || '_none'} style={{ marginBottom: 6 }}>
            <button
              onClick={() => setClosed(prev => {
                const next = new Set(prev);
                if (next.has(g.entity)) next.delete(g.entity); else next.add(g.entity);
                return next;
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '5px 8px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left', borderRadius: 6,
              }}
            >
              <span style={{ color: C.ink2, fontSize: 9, width: 9 }}>{open ? '▾' : '▸'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {g.entity
                  ? <EntityChip entity={g.entity} />
                  : <span style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
                      textTransform: 'uppercase', color: C.ink3,
                    }}>No entity</span>}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{g.items.length}</span>
            </button>

            {open && g.items.map(e => (
              <button key={e.id} onClick={() => onPick(e.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '5px 8px 5px 25px', border: 'none', borderRadius: 6,
                background: active === e.id ? C.accS : 'transparent',
                color: active === e.id ? C.ink9 : C.ink5,
                fontFamily: SANS, fontSize: 12, cursor: 'pointer', textAlign: 'left',
              }}>
                {/* Filled = a deal with an outside party, hollow = internal work.
                    Read off the existing Kind field. */}
                <span
                  title={String(e.kind || '').toLowerCase() === 'deal' ? 'Deal' : 'Internal workstream'}
                  style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: String(e.kind || '').toLowerCase() === 'deal' ? C.ink3 : 'transparent',
                    border: `1px solid ${C.ink3}`,
                  }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>
                  {e.storyCount || 0}
                  {e.overdueTaskCount > 0 && <span style={{ color: C.red }}> · {e.overdueTaskCount}</span>}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </Panel>
  );
}

// ── Epic digest ──────────────────────────────────────────────────────────────

function EpicDigest({ epic: e, onAdd }) {
  const laneEntries = Object.entries(e.laneCounts || {})
    .sort((a, b) => (LANE_RANK[a[0]] ?? 99) - (LANE_RANK[b[0]] ?? 99));

  return (
    <Panel sx={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, color: C.ink9, margin: 0 }}>
            {e.name}
          </h3>
          {e.goal && <p style={{ fontSize: 12.5, color: C.ink3, margin: '4px 0 0', lineHeight: 1.5 }}>{e.goal}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EntityChip entity={e.entity} />
          <button onClick={onAdd} style={addBtn}>＋ Sub-opportunity</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <Stat label="Threads"     value={e.storyCount || 0} />
        <Stat label="People"      value={e.contactCount || 0} />
        <Stat label="NCNDA signed" value={e.signedCount || 0} />
        <Stat label="Overdue"     value={e.overdueTaskCount || 0} alert={e.overdueTaskCount > 0} />
        <Stat label="Last activity" value={fmtRel(e.lastActivityAt)} />
      </div>

      {laneEntries.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {laneEntries.map(([lane, n]) => {
            const col = (LANE_COLOR[lane] || (() => C.ink3))();
            return (
              <span key={lane} style={{
                fontFamily: MONO, fontSize: 9.5, padding: '2px 8px', borderRadius: 999,
                background: `${col}1f`, color: col, border: `1px solid ${col}44`,
              }}>{lane} · {n}</span>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase',
        color: C.ink3, marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontFamily: SANS, fontSize: 16, fontWeight: 600,
        color: alert ? C.red : C.ink9,
      }}>{value}</div>
    </div>
  );
}

// ── Story cards ──────────────────────────────────────────────────────────────

function StoryList({ stories, selected, onSelect, onAdd, hiddenDone, showDone, onToggleDone }) {
  if (!stories.length) {
    return (
      <>
        <Empty
          icon="◉"
          title={hiddenDone && !showDone ? 'Nothing open here' : 'No sub-opportunities yet'}
          body="A sub-opportunity is one thread: one company, the people on that email, its own paperwork stage and its own tasks. This is the level you actually work."
          action={<button onClick={onAdd} style={addBtn}>＋ Add the first sub-opportunity</button>}
        />
        {hiddenDone > 0 && <DoneToggle n={hiddenDone} showDone={showDone} onToggle={onToggleDone} />}
      </>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stories.map(s => (
        <StoryCard key={s.id} s={s} active={selected === s.id} onClick={() => onSelect(s.id)} />
      ))}
      {hiddenDone > 0 && <DoneToggle n={hiddenDone} showDone={showDone} onToggle={onToggleDone} />}
    </div>
  );
}

function DoneToggle({ n, showDone, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      alignSelf: 'flex-start', marginTop: 4, padding: '5px 11px', borderRadius: 6,
      border: `1px solid ${C.cr3}`, background: 'transparent', color: C.ink3,
      fontFamily: MONO, fontSize: 9.5, letterSpacing: '.05em', cursor: 'pointer',
    }}>
      {showDone ? `hide ${n} done / archived` : `show ${n} done / archived`}
    </button>
  );
}

function StoryCard({ s, active, onClick }) {
  const laneCol = (LANE_COLOR[s.lane] || (() => C.ink3))();
  const pwCol   = (PAPERWORK_COLOR[s.paperworkStage] || (() => C.ink3))();
  const people  = s.contacts || [];

  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: active ? C.accS : C.bg2,
      border: `1px solid ${active ? C.acc : C.cr2}`,
      borderRadius: 9, padding: '11px 13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink9, lineHeight: 1.25 }}>
            {s.name}
          </div>
          {people.length > 0 && (
            <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>
              {people.map(p => p.name).filter(Boolean).join(', ')}
            </div>
          )}
        </div>
        {s.overdueTaskCount > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.red, flexShrink: 0 }}>
            {s.overdueTaskCount} overdue
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 999,
          background: `${laneCol}1f`, color: laneCol, border: `1px solid ${laneCol}55`,
        }}>{s.lane || 'No lane'}</span>

        {s.paperworkStage && (
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 999,
            background: `${pwCol}1f`, color: pwCol, border: `1px solid ${pwCol}55`,
          }}>{s.paperworkStage}</span>
        )}

        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
          {s.openTaskCount || 0} open · {fmtRel(s.lastActivityAt)}
        </span>
      </div>
    </button>
  );
}

function BackButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
      background: 'none', border: 'none', color: C.ink5, cursor: 'pointer',
      fontFamily: SANS, fontSize: 12.5, padding: 0,
    }}>
      <span style={{ fontSize: 14 }}>‹</span> {label}
    </button>
  );
}

// ── Sorting ──────────────────────────────────────────────────────────────────

// Counterparty deals above internal workstreams, then alphabetical.
function byKindThenName(a, b) {
  const rank = k => (String(k || '').toLowerCase() === 'deal' ? 0 : 1);
  return rank(a.kind) - rank(b.kind) || (a.name || '').localeCompare(b.name || '');
}

// Board order, then overdue work first inside a lane. Overdue outranks recency
// because the point of the centre pane is deciding what to do next.
function byLaneThenUrgency(a, b) {
  const la = LANE_RANK[a.lane] ?? 99;
  const lb = LANE_RANK[b.lane] ?? 99;
  if (la !== lb) return la - lb;
  if ((b.overdueTaskCount || 0) !== (a.overdueTaskCount || 0)) {
    return (b.overdueTaskCount || 0) - (a.overdueTaskCount || 0);
  }
  return (a.name || '').localeCompare(b.name || '');
}
