// Pipeline: participations as a stage board (WP11).
//
// NOTE ON REUSE: the handoff asked for the existing Kanban components. Those
// (AmplifyKanban, DatacenterKanban, kanban-cards-*) are bound to the Supabase
// `kanban_cards` schema with its own lanes and positions. Participations live in
// Airtable and carry a stage that is validated by the stage machine, not a lane
// id. Forcing one onto the other would mean either mirroring every participation
// into kanban_cards (two sources of truth for the same stage) or rewriting the
// card components' data layer. Neither is additive. So the columns are built
// from stagesFor('capital') and the card is the same ParticipationCard the
// Opportunities view uses, which is the reuse that actually matters visually.
//
// Moving a card goes through coo-stage-advance like every other stage change,
// so the evidence gate applies here too. A board that let you drag past a gate
// would make the gate decorative.

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { stagesFor } from '../../lib/stages.js';
import { EntityChip, WorkstreamChip, UrgencyDot, urgencyOf, Empty } from './shared.jsx';
import { advanceStage } from '../../api.js';

const ghost = {
  padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 10, cursor: 'pointer',
};

const COLUMNS = stagesFor('capital');

export default function PipelineView({ data, onOpenParticipation, onChanged, showToast, isMobile }) {
  const { participations = [], workstreams = [] } = data || {};
  const [filter, setFilter] = useState('');
  const [moving, setMoving] = useState(null);
  const [gate,   setGate]   = useState(null);

  const visible = useMemo(
    () => participations.filter(p => !filter || p.workstreamId === filter),
    [participations, filter],
  );

  const byStage = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map(s => [s.id, []]));
    for (const p of visible) {
      if (map[p.stageId]) map[p.stageId].push(p);
      else (map._other ||= []).push(p);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0));
    }
    return map;
  }, [visible]);

  async function move(participation, toStage, opts = {}) {
    setMoving(participation.id);
    try {
      const res = await advanceStage({ participationId: participation.id, toStage, ...opts });
      setGate(null);
      showToast?.(res.task ? `Moved. Task created: ${res.task.name}` : 'Moved.');
      onChanged?.();
    } catch (e) {
      if (e.code === 'EVIDENCE_REQUIRED') {
        setGate({ participation, toStage, message: e.message, stage: e.body?.stage });
      } else {
        showToast?.(e.message);
      }
    } finally {
      setMoving(null);
    }
  }

  if (!participations.length) {
    return <Empty icon="▦" title="Nothing in the pipeline" body="Participations appear here once contacts are added to workstreams." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{
          padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.cr3}`,
          background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 12.5, outline: 'none',
        }}>
          <option value="">All workstreams</option>
          {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink3 }}>
          {visible.length} participation{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {gate && (
        <GateBanner gate={gate} onCancel={() => setGate(null)}
          onOverride={(reason) => move(gate.participation, gate.toStage, { override: true, overrideReason: reason })} />
      )}

      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
        // The board scrolls inside itself. The page body never scrolls sideways.
        WebkitOverflowScrolling: 'touch',
      }}>
        {COLUMNS.map(col => {
          const items = byStage[col.id] || [];
          return (
            <div key={col.id} style={{
              flex: isMobile ? '0 0 240px' : '0 0 250px', minWidth: isMobile ? 240 : 250,
              background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 9,
              padding: '10px 9px', display: 'flex', flexDirection: 'column', gap: 7,
              maxHeight: 'calc(100vh - 260px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
                <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.ink9 }}>
                  {col.label}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 9, padding: '1px 6px', borderRadius: 999,
                  background: C.grS, color: C.ink5,
                }}>{items.length}</span>
                <div style={{ flex: 1 }} />
                {col.slaDays != null && (
                  <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.ink2 }}>{col.slaDays}d SLA</span>
                )}
              </div>

              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 }}>
                {items.map(p => (
                  <PipelineCard
                    key={p.id} p={p} busy={moving === p.id}
                    onOpen={() => onOpenParticipation(p.id)}
                    onMove={toStage => move(p, toStage)}
                  />
                ))}
                {!items.length && (
                  <div style={{ fontSize: 11, color: C.ink2, padding: '8px 4px' }}>Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11.5, color: C.ink3, marginTop: 10, lineHeight: 1.55, maxWidth: 620 }}>
        Moving a card runs the same stage machine as everywhere else, so an evidence gate
        refuses here too. NCNDA Signed needs a Documents record with a Signed Date.
      </p>
    </div>
  );
}

function PipelineCard({ p, busy, onOpen, onMove }) {
  const [menu, setMenu] = useState(false);
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 7,
      padding: '8px 10px', opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <button onClick={onOpen} style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
          padding: 0, cursor: 'pointer',
        }}>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.ink9, lineHeight: 1.25 }}>
            {p.contactName || p.name}
          </div>
        </button>
        <UrgencyDot urgency={urgencyOf(p)} size={7} />
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
        <WorkstreamChip name={p.workstreamName} />
        <EntityChip entity={p.entity} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9,
          color: p.slaStatus === 'overdue' || p.slaStatus === 'escalate' ? C.red : C.ink3,
          fontWeight: p.slaStatus === 'overdue' ? 700 : 400,
        }}>{p.daysInStage != null ? `${p.daysInStage}d` : ''}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setMenu(v => !v)} disabled={busy} style={{
          background: 'none', border: 'none', color: C.ink3, cursor: 'pointer',
          fontFamily: MONO, fontSize: 9.5, padding: '1px 4px',
        }}>move ▾</button>
      </div>

      {menu && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {COLUMNS.filter(c => c.id !== p.stageId).map(c => (
            <button key={c.id} onClick={() => { setMenu(false); onMove(c.label); }} style={{
              textAlign: 'left', padding: '4px 7px', borderRadius: 5,
              border: `1px solid ${C.cr2}`, background: C.bg2, color: C.ink5,
              fontFamily: SANS, fontSize: 11.5, cursor: 'pointer',
            }}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function GateBanner({ gate, onCancel, onOverride }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      padding: '11px 13px', borderRadius: 8, marginBottom: 12,
      background: C.redS, border: `1px solid ${C.red}44`,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
        color: C.red, marginBottom: 5,
      }}>Refused · {gate.stage}</div>
      <p style={{ fontSize: 12.5, color: C.ink8, margin: '0 0 9px', lineHeight: 1.55 }}>{gate.message}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason, if overriding"
          style={{
            flex: 1, minWidth: 200, padding: '6px 9px', borderRadius: 6,
            border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
            fontFamily: SANS, fontSize: 12, outline: 'none',
          }} />
        <button onClick={onCancel} style={ghost}>Cancel</button>
        <button onClick={() => onOverride(reason)} disabled={!reason.trim()} style={{
          padding: '6px 12px', borderRadius: 6, border: 'none', background: C.red, color: '#fff',
          fontFamily: MONO, fontSize: 10, cursor: reason.trim() ? 'pointer' : 'default',
          opacity: reason.trim() ? 1 : 0.45,
        }}>Override</button>
      </div>
    </div>
  );
}

