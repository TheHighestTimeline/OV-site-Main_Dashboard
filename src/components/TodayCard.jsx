// The Today card (WP9). Lives on Overview, not inside Threads, because it is
// the first thing seen each morning and should not need a role check to render.
//
// THE CAP OF FIVE IS THE ENTIRE MECHANISM. A sixth tag triggers a swap prompt:
// pick one to drop. Without the cap this becomes the paper list again inside a
// week, which is exactly what it is replacing.
//
// Per row: name, entity chip, days open, one tap to complete. Nothing else.
// This card gets glanced at forty times a day and every extra control taxes all
// forty glances.

import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { getFocus, setFocus, updateTask } from '../api.js';
import { EntityChip } from '../views/threads/shared.jsx';

const rowStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 9, padding: '4px 0',
};

const linkBtn = {
  background: 'none', border: 'none', color: C.ink3, cursor: 'pointer',
  fontFamily: MONO, fontSize: 9.5, letterSpacing: '.05em', padding: '2px 4px',
};

export default function TodayCard({ showToast, setView }) {
  const [state,   setState]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(null);
  const [swap,    setSwap]    = useState(null);   // { taskId } awaiting a victim
  const [showNext, setShowNext] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getFocus());
    } catch (e) {
      // A missing Focus field on Master Action Board is the likely cause and it
      // is not fatal: the rest of Overview must still render.
      console.warn('[TodayCard]', e.message);
      setState({ doingNow: [], nextUp: [], max: 5, unavailable: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function complete(taskId) {
    setBusy(taskId);
    try {
      await updateTask(taskId, { status: 'Done' });
      await load();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function promote(taskId, swapOutTaskId) {
    setBusy(taskId);
    try {
      await setFocus(taskId, 'Doing Now', swapOutTaskId);
      setSwap(null);
      await load();
    } catch (e) {
      if (e.code === 'FOCUS_FULL') {
        setSwap({ taskId, options: e.body?.doingNow || state?.doingNow || [] });
      } else {
        showToast?.(e.message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function drop(taskId) {
    setBusy(taskId);
    try {
      await setFocus(taskId, null);
      await load();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;

  const doingNow = state?.doingNow || [];
  const nextUp   = state?.nextUp   || [];
  const max      = state?.max ?? 5;

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10,
      padding: '14px 16px', marginBottom: 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3,
        }}>Today</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: doingNow.length >= max ? C.acc : C.ink3 }}>
          {doingNow.length} / {max}
        </span>
        <div style={{ flex: 1 }} />
        {setView && (
          <button onClick={() => setView('tasks')} style={linkBtn}>All tasks</button>
        )}
      </div>

      {state?.unavailable && (
        <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.55 }}>
          Today is not available yet. Add the <strong>Focus</strong>, <strong>Focus Order</strong> and{' '}
          <strong>Focus Set At</strong> fields to Master Action Board in Airtable.
        </div>
      )}

      {!state?.unavailable && !doingNow.length && (
        <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
          Nothing tagged for today. Pick up to {max} from Tasks or Triage, and stop there.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {doingNow.map(t => (
          <div key={t.id} style={rowStyle}>
            <button
              onClick={() => complete(t.id)}
              disabled={busy === t.id}
              title="Mark done"
              style={{
                width: 19, height: 19, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `1.5px solid ${C.cr3}`, background: 'transparent',
                cursor: 'pointer', color: C.ink3, fontSize: 11, lineHeight: 1, padding: 0,
              }}
            >{busy === t.id ? '·' : ''}</button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink9, lineHeight: 1.35 }}>
                {t.name}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                {t.entity && <EntityChip entity={t.entity} />}
                <span style={{
                  fontFamily: MONO, fontSize: 9,
                  // Carryover is visible, never silent. Three days on the same
                  // item means it is mis-sized or being avoided, and hiding that
                  // defeats the entire purpose of the card.
                  color: t.stale ? C.red : C.ink3,
                  fontWeight: t.stale ? 700 : 400,
                }}>
                  {t.daysOpen == null ? '' : t.daysOpen === 0 ? 'today' : `${t.daysOpen}d on the list`}
                  {t.stale ? ' · carried' : ''}
                </span>
              </div>
            </div>

            <button onClick={() => drop(t.id)} disabled={busy === t.id} title="Remove from today"
              style={{ ...linkBtn, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>

      {/* Swap prompt. The refusal is the feature. */}
      {swap && (
        <div style={{
          marginTop: 10, padding: '11px 13px', borderRadius: 8,
          background: C.accS, border: `1px solid ${C.acc}55`,
        }}>
          <div style={{ fontSize: 12.5, color: C.ink9, marginBottom: 8, lineHeight: 1.5 }}>
            Today is full at {max}. Pick one to drop to Next Up.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {swap.options.map(o => (
              <button key={o.id} onClick={() => promote(swap.taskId, o.id)} style={{
                textAlign: 'left', padding: '6px 9px', borderRadius: 6,
                border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink8,
                fontFamily: SANS, fontSize: 12, cursor: 'pointer',
              }}>{o.name}</button>
            ))}
          </div>
          <button onClick={() => setSwap(null)} style={{ ...linkBtn, marginTop: 8 }}>Cancel</button>
        </div>
      )}

      {/* Next Up: unlimited on-deck lane, collapsed by default. Swap victims
          land here rather than vanishing. */}
      {nextUp.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.cr2}` }}>
          <button onClick={() => setShowNext(v => !v)} style={{
            ...linkBtn, display: 'flex', alignItems: 'center', gap: 6, padding: 0,
          }}>
            {showNext ? '▾' : '▸'} Next up ({nextUp.length})
          </button>
          {showNext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 7 }}>
              {nextUp.map(t => (
                <div key={t.id} style={{ ...rowStyle, padding: '5px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink5, lineHeight: 1.35 }}>
                      {t.name}
                    </div>
                  </div>
                  <button onClick={() => promote(t.id)} disabled={busy === t.id} style={linkBtn}>
                    → Today
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


