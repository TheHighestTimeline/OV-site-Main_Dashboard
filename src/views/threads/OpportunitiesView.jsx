// View 1: Opportunities. The default.
//
// Left rail is programs as collapsible nodes with their workstreams nested.
// Selecting a workstream shows its digest, then its participation cards, then
// the detail for whichever card is picked.
//
// This view groups by PARTICIPATION, not by person, because each row here needs
// a separate action. The People view groups by person. The two groupings are
// deliberately different and must not be unified: "everything Greg said" and
// "what needs doing on the bridge loan" are different questions.

import { useState, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import { Modal } from '../../components/UI.jsx';
import {
  StageBadge, EntityChip, WorkstreamChip, WaitingPill, UrgencyDot, urgencyOf,
  Panel, Empty, fmtRel,
} from './shared.jsx';
import DetailPane from './DetailPane.jsx';
import AddParticipant from './AddParticipant.jsx';

const addBtn = {
  padding: '7px 14px', borderRadius: 999, border: 'none', background: C.acc,
  color: '#fff', fontFamily: MONO, fontSize: 10, letterSpacing: '.05em',
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function OpportunitiesView({
  data, selected, onSelect, onChanged, showToast, isMobile,
}) {
  const { programs = [], workstreams = [], participations = [], contacts = [] } = data || {};
  const [openPrograms, setOpenPrograms] = useState(() => new Set(programs.slice(0, 2).map(p => p.id)));
  const [activeWorkstream, setActiveWorkstream] = useState(null);
  const [adding, setAdding] = useState(false);

  // Workstreams whose parent program is missing or unset still need a home, or
  // they silently vanish from the only view that lists them.
  const orphanWorkstreams = useMemo(
    () => workstreams.filter(w => !w.parentId || !programs.some(p => p.id === w.parentId)),
    [workstreams, programs],
  );

  const ws = activeWorkstream ? workstreams.find(w => w.id === activeWorkstream) : null;
  const members = useMemo(
    () => participations
      .filter(p => p.workstreamId === activeWorkstream)
      .sort(byUrgencyThenStage),
    [participations, activeWorkstream],
  );

  const selectedP = selected ? participations.find(p => p.id === selected) : null;

  function toggleProgram(id) {
    setOpenPrograms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const addModal = adding && ws && (
    <Modal title={`Add someone to ${ws.name}`} onClose={() => setAdding(false)}>
      <AddParticipant
        workstream={ws}
        contacts={contacts}
        takenContactIds={members.map(m => m.contactId).filter(Boolean)}
        onClose={() => setAdding(false)}
        onDone={onChanged}
        showToast={showToast}
      />
    </Modal>
  );

  // ── Mobile: a three-level drill-down stack ─────────────────────────────────
  if (isMobile) {
    if (selectedP) {
      return (
        <DetailPane
          participation={selectedP} contacts={contacts} onChanged={onChanged}
          showToast={showToast} onClose={() => onSelect(null)} isMobile
        />
      );
    }
    if (ws) {
      return (
        <div>
          <BackButton label={ws.name} onClick={() => setActiveWorkstream(null)} />
          <WorkstreamDigest workstream={ws} onAdd={() => setAdding(true)} />
          <CardList members={members} onSelect={onSelect} onAdd={() => setAdding(true)} />
          {addModal}
        </div>
      );
    }
    return (
      <Rail
        programs={programs} workstreams={workstreams} orphans={orphanWorkstreams}
        participations={participations}
        openPrograms={openPrograms} toggleProgram={toggleProgram}
        active={activeWorkstream} onPick={setActiveWorkstream}
      />
    );
  }

  // ── Desktop: rail, list, detail ────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(300px, 1fr) minmax(340px, 1.15fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ position: 'sticky', top: 0 }}>
        <Rail
          programs={programs} workstreams={workstreams} orphans={orphanWorkstreams}
          participations={participations}
          openPrograms={openPrograms} toggleProgram={toggleProgram}
          active={activeWorkstream} onPick={id => { setActiveWorkstream(id); onSelect(null); }}
        />
      </div>

      <div>
        {!ws && (
          <Empty
            icon="▤"
            title="Pick a workstream"
            body="Programs are the umbrella. Workstreams are where counterparties and stages live."
          />
        )}
        {ws && (
          <>
            <WorkstreamDigest workstream={ws} onAdd={() => setAdding(true)} />
            <CardList members={members} selected={selected} onSelect={onSelect} onAdd={() => setAdding(true)} />
          </>
        )}
      </div>

      <div style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 160px)', overflow: 'hidden' }}>
        <Panel sx={{ height: 'calc(100vh - 170px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DetailPane
            participation={selectedP} contacts={contacts}
            onChanged={onChanged} showToast={showToast}
          />
        </Panel>
      </div>

      {addModal}
    </div>
  );
}

// ── Left rail ────────────────────────────────────────────────────────────────

function Rail({ programs, workstreams, orphans, participations, openPrograms, toggleProgram, active, onPick }) {
  const countsFor = (wsId) => {
    const members = participations.filter(p => p.workstreamId === wsId);
    return {
      total: members.length,
      blocked: members.filter(p => p.waitingOn === 'Us' || p.blockingItem).length,
    };
  };

  if (!programs.length && !orphans.length) {
    return (
      <Panel>
        <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
          No opportunities yet. A program is an Opportunity with no Parent Opportunity;
          a workstream sets one.
        </div>
      </Panel>
    );
  }

  return (
    <Panel sx={{ padding: '10px 8px' }}>
      {programs.map(prog => {
        const kids = workstreams.filter(w => w.parentId === prog.id);
        const open = openPrograms.has(prog.id);
        return (
          <div key={prog.id} style={{ marginBottom: 4 }}>
            <button onClick={() => toggleProgram(prog.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%',
              padding: '6px 8px', border: 'none', background: 'transparent',
              color: C.ink9, fontFamily: SANS, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', borderRadius: 6,
            }}>
              <span style={{ color: C.ink3, fontSize: 10, width: 10 }}>{open ? '▾' : '▸'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {prog.name}
              </span>
              {prog.blockedCount > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.red }}>{prog.blockedCount}</span>
              )}
            </button>

            {open && kids.map(w => {
              const c = countsFor(w.id);
              return <RailItem key={w.id} ws={w} counts={c} active={active === w.id} onPick={onPick} indent />;
            })}
            {open && !kids.length && (
              <div style={{ fontSize: 11, color: C.ink2, padding: '4px 8px 4px 25px' }}>No workstreams yet</div>
            )}
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div style={{ marginTop: programs.length ? 8 : 0, paddingTop: programs.length ? 8 : 0, borderTop: programs.length ? `1px solid ${C.cr2}` : 'none' }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
            color: C.ink3, padding: '0 8px 5px',
          }}>
            {/* With no programs at all the base is flat, and calling every row
                "Unparented" reads as a fault rather than the normal shape. */}
            {programs.length ? 'Standalone' : 'Workstreams'}
          </div>
          {orphans.map(w => (
            <RailItem key={w.id} ws={w} counts={countsFor(w.id)} active={active === w.id} onPick={onPick} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function RailItem({ ws, counts, active, onPick, indent }) {
  return (
    <button onClick={() => onPick(ws.id)} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
      padding: indent ? '5px 8px 5px 25px' : '5px 8px',
      border: 'none', borderRadius: 6,
      background: active ? C.accS : 'transparent',
      color: active ? C.ink9 : C.ink5,
      fontFamily: SANS, fontSize: 12, cursor: 'pointer', textAlign: 'left',
    }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ws.name}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>
        {counts.total}
        {counts.blocked > 0 && <span style={{ color: C.red }}> · {counts.blocked}</span>}
      </span>
    </button>
  );
}

// ── Workstream digest ────────────────────────────────────────────────────────

function WorkstreamDigest({ workstream: w, onAdd }) {
  const stageEntries = Object.entries(w.stageCounts || {});
  return (
    <Panel sx={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, color: C.ink9, margin: 0 }}>
            {w.name}
          </h3>
          {w.goal && <p style={{ fontSize: 12.5, color: C.ink3, margin: '4px 0 0', lineHeight: 1.5 }}>{w.goal}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EntityChip entity={w.entity} />
          {onAdd && <button onClick={onAdd} style={addBtn}>＋ Add participant</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <Stat label="Participants" value={w.participantCount || 0} />
        <Stat label="Blocked"  value={w.blockedCount || 0} alert={w.blockedCount > 0} />
        <Stat label="Stalled"  value={w.stalledCount || 0} alert={w.stalledCount > 0} />
        <Stat label="Last activity" value={fmtRel(w.lastActivityAt)} />
      </div>

      {stageEntries.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {stageEntries.map(([label, n]) => (
            <span key={label} style={{
              fontFamily: MONO, fontSize: 9.5, padding: '2px 8px', borderRadius: 999,
              background: C.grS, color: C.ink5,
            }}>{label} · {n}</span>
          ))}
        </div>
      )}

      {!w.goal && (
        // The sprawl rule made visible: a workstream without a goal is a task
        // wearing a costume, and the create path refuses new participations on it.
        <div style={{
          marginTop: 10, padding: '7px 10px', borderRadius: 6,
          background: C.yelS, color: C.yel, fontSize: 11.5, lineHeight: 1.5,
        }}>
          No Goal set. A workstream needs its own goal and its own counterparties,
          otherwise it belongs on the board as a task. Add participant will ask for
          the goal and save it with the first person.
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

// ── Participation cards ──────────────────────────────────────────────────────

function CardList({ members, selected, onSelect, onAdd }) {
  if (!members.length) {
    return (
      <Empty
        icon="◉"
        title="No participants yet"
        body="A participation is one contact inside this workstream. It carries their stage, which is why the same person can sit at different stages in two workstreams at once."
        action={onAdd && <button onClick={onAdd} style={addBtn}>＋ Add the first participant</button>}
      />
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map(p => (
        <ParticipationCard key={p.id} p={p} active={selected === p.id} onClick={() => onSelect(p.id)} />
      ))}
    </div>
  );
}

export function ParticipationCard({ p, active, onClick }) {
  const urgency = urgencyOf(p);
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: active ? C.accS : C.bg2,
      border: `1px solid ${active ? C.acc : C.cr2}`,
      borderRadius: 9, padding: '11px 13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink9, lineHeight: 1.2 }}>
            {p.contactName || p.name}
          </div>
          {p.contactCompany && (
            <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 1 }}>{p.contactCompany}</div>
          )}
        </div>
        <UrgencyDot urgency={urgency} />
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
        <WorkstreamChip name={p.workstreamName} />
        <EntityChip entity={p.entity} />
        <WaitingPill waitingOn={p.waitingOn} />
      </div>

      <div style={{ marginTop: 7 }}>
        <StageBadge stageLabel={p.stageLabel} daysInStage={p.daysInStage} slaStatus={p.slaStatus} compact />
      </div>

      {p.overdueTaskCount > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.red, marginTop: 5 }}>
          {p.overdueTaskCount} overdue task{p.overdueTaskCount > 1 ? 's' : ''}
        </div>
      )}
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

// Most urgent first, then furthest behind SLA, then terminal rows last.
function byUrgencyThenStage(a, b) {
  const rank = { overdue: 3, today: 2, inbound: 1 };
  if (a.terminal !== b.terminal) return a.terminal ? 1 : -1;
  const ua = rank[urgencyOf(a)] || 0;
  const ub = rank[urgencyOf(b)] || 0;
  if (ua !== ub) return ub - ua;
  return (b.daysInStage || 0) - (a.daysInStage || 0);
}
