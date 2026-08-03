// The Friday review: delegation by assignee, and the referral tree (WP11).
//
// DELEGATION grouped by assignee answers "who is sitting on what". The column
// that matters most is `missing context`: a delegated task with no Context is
// the failure this feature exists to prevent, because the assignee got a title
// and nothing else and will come back with questions.
//
// THE REFERRAL TREE runs off the existing `Referred By` self-link. No new field.
// Intermediaries go quiet when their introductions do, and that is invisible
// until the introductions are grouped under the person who made them.

import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import { Panel, SectionTitle, Empty, Loading, fmtRel } from './shared.jsx';
import { getAccountability } from '../../api.js';

const subLabel = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, margin: '10px 0 5px',
};

const btn = {
  padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', cursor: 'pointer',
};

export default function AccountabilityView({ showToast, isMobile }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [openRow, setOpenRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAccountability('both'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Loading label="Reading the week…" />;
  if (error) {
    return <Empty icon="◈" title="Could not load" body={error}
      action={<button onClick={load} style={btn}>Try again</button>} />;
  }

  const delegation = data?.delegation || [];
  const referrals  = data?.referrals  || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>

      <Panel>
        <SectionTitle count={delegation.length}
          action={<button onClick={load} style={btn}>Refresh</button>}>
          Delegated work by assignee
        </SectionTitle>

        {!delegation.length && (
          <div style={{ fontSize: 12, color: C.ink2 }}>Nothing is assigned out right now.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {delegation.map(a => (
            <div key={a.contactId} style={{
              border: `1px solid ${C.cr2}`, borderRadius: 7, background: C.bg, overflow: 'hidden',
            }}>
              <button onClick={() => setOpenRow(openRow === a.contactId ? null : a.contactId)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ flex: 1, fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink9, minWidth: 0 }}>
                  {a.name}
                </span>
                <Metric label="open"    value={a.openCount} />
                <Metric label="overdue" value={a.overdueCount} alert={a.overdueCount > 0} />
                <Metric label="done"    value={a.completedCount} />
                {a.missingContextCount > 0 && (
                  <Metric label="no context" value={a.missingContextCount} alert />
                )}
                <span style={{ color: C.ink3, fontSize: 11 }}>{openRow === a.contactId ? '▾' : '▸'}</span>
              </button>

              {openRow === a.contactId && (
                <div style={{ padding: '0 12px 11px' }}>
                  {a.missingContextCount > 0 && (
                    <div style={{
                      padding: '7px 10px', borderRadius: 6, background: C.yelS, color: C.yel,
                      fontSize: 11.5, lineHeight: 1.5, marginBottom: 8,
                    }}>
                      {a.missingContextCount} task{a.missingContextCount > 1 ? 's have' : ' has'} no context attached.
                      The assignee got a title and nothing else, which is exactly what delegating
                      from Threads is meant to avoid. Re-assign from a relationship to attach the brief.
                    </div>
                  )}
                  <TaskTable rows={a.open} emptyLabel="Nothing open." isMobile={isMobile} />
                  {a.completedThisWeek.length > 0 && (
                    <>
                      <div style={subLabel}>Completed this week (by last-modified date)</div>
                      <TaskTable rows={a.completedThisWeek} emptyLabel="" isMobile={isMobile} done />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle count={referrals.length}>Referral tree</SectionTitle>
        <p style={{ fontSize: 11.5, color: C.ink3, margin: '0 0 10px', lineHeight: 1.55 }}>
          Built from the existing Referred By link. An intermediary whose introductions have
          all gone quiet is the signal worth catching: the referrer stopped, not just the referrals.
        </p>

        {!referrals.length && (
          <div style={{ fontSize: 12, color: C.ink2 }}>No referral relationships recorded.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {referrals.map(r => (
            <div key={r.contactId} style={{
              border: `1px solid ${C.cr2}`, borderRadius: 7, background: C.bg, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink9 }}>
                  {r.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink3 }}>
                  {r.introducedCount} introduction{r.introducedCount === 1 ? '' : 's'} ·{' '}
                  {r.ncndaSignedCount} signed
                </span>
                {r.quietCount === r.introducedCount && r.introducedCount > 0 && (
                  <span style={{
                    fontFamily: MONO, fontSize: 9, padding: '1px 7px', borderRadius: 999,
                    background: C.redS, color: C.red,
                  }}>ALL QUIET</span>
                )}
              </div>

              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {r.introduced.map(k => (
                  <div key={k.contactId} style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                    paddingLeft: 12, borderLeft: `2px solid ${C.cr2}`,
                  }}>
                    <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink8, minWidth: 120 }}>
                      {k.name}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 9, padding: '1px 7px', borderRadius: 999,
                      background: k.ncndaSigned ? C.grnS : C.grS,
                      color: k.ncndaSigned ? C.grn : C.ink3,
                    }}>{k.ncndaSigned ? 'NCNDA signed' : 'no NCNDA'}</span>
                    {k.furthestStage && (
                      <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.ink5 }}>{k.furthestStage}</span>
                    )}
                    <span style={{
                      fontFamily: MONO, fontSize: 9,
                      color: (k.daysSinceContact ?? 999) > 21 ? C.red : C.ink3,
                    }}>
                      {k.lastContacted ? `touched ${fmtRel(k.lastContacted)}` : 'never contacted'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TaskTable({ rows, emptyLabel, isMobile, done }) {
  if (!rows.length) return emptyLabel ? <div style={{ fontSize: 11.5, color: C.ink2 }}>{emptyLabel}</div> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {rows.map(t => (
        <div key={t.taskId} style={{
          display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
          padding: '5px 0', opacity: done ? 0.65 : 1,
        }}>
          <span style={{
            flex: 1, minWidth: 140, fontFamily: SANS, fontSize: 12.5, color: C.ink8,
            textDecoration: done ? 'line-through' : 'none',
          }}>{t.name}</span>
          {!isMobile && t.entity && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{t.entity}</span>
          )}
          {t.dueDate && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>due {String(t.dueDate).slice(5)}</span>
          )}
          {!t.hasContext && !done && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.yel }}>no context</span>
          )}
          {t.daysSinceMove != null && !done && (
            <span style={{
              fontFamily: MONO, fontSize: 9,
              color: t.daysSinceMove >= 3 ? C.red : C.ink3,
            }}>{t.daysSinceMove}d still</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, alert }) {
  return (
    <span style={{ textAlign: 'right', minWidth: 46 }}>
      <span style={{
        display: 'block', fontFamily: SANS, fontSize: 14, fontWeight: 600,
        color: alert && value > 0 ? C.red : C.ink9, lineHeight: 1.1,
      }}>{value}</span>
      <span style={{
        display: 'block', fontFamily: MONO, fontSize: 8, letterSpacing: '.08em',
        textTransform: 'uppercase', color: C.ink3,
      }}>{label}</span>
    </span>
  );
}


