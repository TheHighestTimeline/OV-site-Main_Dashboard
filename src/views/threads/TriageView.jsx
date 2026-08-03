// View 3: Triage. The buckets, grouped by participation.
//
// This is the morning SOP surface. The ordering below matches the order the SOP
// says to work them: waiting on me, evidence missing, stage overdue, waiting on
// them. Anything under two minutes gets done here; everything else gets tagged
// Doing Now or assigned with the brief attached.
//
// "Evidence missing" is the bucket that catches the contradiction nobody goes
// looking for: a participation asserting NCNDA Signed or later when no executed
// document exists.

import { useState, useEffect, useCallback } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { StageBadge, EntityChip, WorkstreamChip, Panel, Empty, Loading, fmtRel } from './shared.jsx';
import { getTriage, setFocus } from '../../api.js';

const rowStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
  padding: '9px 11px', borderRadius: 7, border: `1px solid ${C.cr2}`,
  background: C.bg, cursor: 'pointer',
};

const btnStyle = {
  padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', cursor: 'pointer', whiteSpace: 'nowrap',
};

// Order matters: this is the order the morning routine works them in.
const BUCKET_ORDER = [
  { key: 'waitingOnMe',     tone: 'red',   hint: 'Their message is the last one in the thread.' },
  { key: 'evidenceMissing', tone: 'red',   hint: 'The stage claims paperwork that is not on file. Resolve the contradiction.' },
  { key: 'stageOverdue',    tone: 'amber', hint: 'Past the SLA for the stage they are sitting in.' },
  { key: 'committedToday',  tone: 'amber', hint: 'Due today or already past due, any owner.' },
  { key: 'waitingOnThem',   tone: 'blue',  hint: 'Sent and no reply past the follow-up window.' },
  { key: 'goneQuiet',       tone: 'blue',  hint: 'Nothing recorded in ten days or more.' },
  { key: 'delegated',       tone: 'grey',  hint: 'Assigned out and not moved in three days.' },
];

export default function TriageView({ onOpenParticipation, showToast, isMobile }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [open,    setOpen]    = useState(() => new Set(['waitingOnMe', 'evidenceMissing']));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getTriage());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(key) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function focusTask(taskId) {
    try {
      await setFocus(taskId, 'Doing Now');
      showToast?.('Added to Today.');
    } catch (e) {
      if (e.code === 'FOCUS_FULL') {
        // The cap is the mechanism. Never quietly allow a sixth.
        showToast?.('Today is already full at five. Drop one from the Overview card first.');
      } else {
        showToast?.(e.message);
      }
    }
  }

  if (loading && !data) return <Loading label="Working out what needs you…" />;

  if (error) {
    return (
      <Empty icon="◈" title="Triage could not load" body={error}
        action={<button onClick={load} style={btnStyle}>Try again</button>} />
    );
  }

  const buckets = data?.buckets || {};
  const counts  = data?.counts  || {};
  const total   = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <Empty
        icon="✓"
        title="Nothing is waiting"
        body="No overdue stages, no unanswered inbound, no unconfirmed delegations. Enjoy it."
        action={<button onClick={load} style={btnStyle}>Refresh</button>}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink3, letterSpacing: '.08em' }}>
          {total} item{total === 1 ? '' : 's'} across {BUCKET_ORDER.filter(b => counts[b.key] > 0).length} buckets
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={load} disabled={loading} style={btnStyle}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {BUCKET_ORDER.map(({ key, tone, hint }) => {
          const bucket = buckets[key];
          if (!bucket) return null;
          const items = bucket.items || [];
          const isOpen = open.has(key);

          return (
            <Panel key={key} sx={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => toggle(key)} style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '11px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: items.length ? toneColor(tone) : C.cr3,
                }} />
                <span style={{
                  fontFamily: SANS, fontSize: 13.5, fontWeight: 600,
                  color: items.length ? C.ink9 : C.ink3,
                }}>{bucket.label}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 10, padding: '1px 8px', borderRadius: 999,
                  background: items.length ? `${toneColor(tone)}1f` : C.grS,
                  color: items.length ? toneColor(tone) : C.ink3,
                }}>{items.length}</span>
                <div style={{ flex: 1 }} />
                <span style={{ color: C.ink3, fontSize: 11 }}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 14px 12px' }}>
                  <div style={{ fontSize: 11.5, color: C.ink3, marginBottom: 9, lineHeight: 1.5 }}>{hint}</div>

                  {!items.length && (
                    <div style={{ fontSize: 12, color: C.ink2, padding: '6px 0' }}>Nothing here.</div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(item => (
                      item.taskId
                        ? <TaskRow key={item.taskId} item={item} onFocus={() => focusTask(item.taskId)}
                            onOpen={() => item.participationId && onOpenParticipation(item.participationId)} isMobile={isMobile} />
                        : <ParticipationRow key={item.id} item={item}
                            onOpen={() => onOpenParticipation(item.id)} tone={tone} isMobile={isMobile} />
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function ParticipationRow({ item, onOpen, tone, isMobile }) {
  return (
    <button onClick={onOpen} style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink9 }}>
            {item.contactName || item.id}
          </span>
          <WorkstreamChip name={item.workstreamName} />
          {!isMobile && <EntityChip entity={item.entity} />}
        </div>

        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <StageBadge stageLabel={item.stageLabel} daysInStage={item.daysInStage} slaStatus={item.slaStatus} compact />
        </div>

        {item.reason && (
          <div style={{
            fontSize: 11.5, marginTop: 4, lineHeight: 1.45,
            color: item.severity === 'contradiction' ? C.red : C.ink3,
            fontWeight: item.severity === 'contradiction' ? 600 : 400,
          }}>{item.reason}</div>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
        {(item.daysWaiting != null || item.daysQuiet != null || item.daysOver != null) && (
          <div style={{
            fontFamily: MONO, fontSize: 15, fontWeight: 700,
            color: toneColor(tone),
          }}>
            {item.daysOver ?? item.daysWaiting ?? item.daysQuiet}d
          </div>
        )}
        {item.since && (
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{fmtRel(item.since)}</div>
        )}
      </div>
    </button>
  );
}

function TaskRow({ item, onFocus, onOpen, isMobile }) {
  return (
    <div style={{ ...rowStyle, cursor: 'default' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink9, lineHeight: 1.3 }}>
          {item.name}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
          {item.entity && !isMobile && <EntityChip entity={item.entity} />}
          {item.contactName && <WorkstreamChip name={`${item.contactName}${item.workstreamName ? ` · ${item.workstreamName}` : ''}`} />}
          {item.assignees?.length > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
              → {item.assignees.join(', ')}
            </span>
          )}
        </div>
        {item.dueDate && (
          <div style={{
            fontFamily: MONO, fontSize: 9.5, marginTop: 4,
            color: item.overdue ? C.red : C.ink3, fontWeight: item.overdue ? 700 : 400,
          }}>
            {item.overdue ? `${item.daysOver}d overdue` : `due ${String(item.dueDate).slice(5)}`}
          </div>
        )}
        {item.daysSinceMove != null && (
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink3, marginTop: 2 }}>
            no movement in {item.daysSinceMove}d
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
        {item.focus !== 'Doing Now' && (
          <button onClick={onFocus} style={btnStyle} title="Add to today's five">Today</button>
        )}
        {item.participationId && (
          <button onClick={onOpen} style={btnStyle}>Open</button>
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────


function toneColor(tone) {
  return tone === 'red' ? C.red
       : tone === 'amber' ? C.yel
       : tone === 'blue' ? C.blu
       : C.ink3;
}
