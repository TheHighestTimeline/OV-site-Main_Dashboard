// "This is probably connected — link it?"
//
// Suggestions are proposals, never writes. Each row shows WHY it was suggested
// and how sure the server is, because a link you cannot check is a link you have
// to re-verify every time you see it. Dismissing is per-record and remembered,
// so a suggestion you have already rejected does not keep asking.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { C, SANS, MONO } from '../constants.js';

const CONF_COLOR = { certain: '#2e7d32', high: '#2e7d32', medium: '#b7791f', low: '#b45309' };
const DISMISS_KEY = 'ovmg.suggestions.dismissed';

const miniBtn = {
  padding: '3px 9px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9,
  letterSpacing: '.05em', cursor: 'pointer', whiteSpace: 'nowrap',
};

function loadDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}

function saveDismissed(scopeKey, ids) {
  const all = loadDismissed();
  all[scopeKey] = ids;
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

/**
 * Remember a rejection made somewhere other than this panel.
 *
 * Unlinking a person from a deal IS a rejection — the suggester would otherwise
 * propose them again on the next render, which reads as the app arguing with
 * you. Callers that remove a link should say so here.
 */
export function rememberRejected(scopeKey, id) {
  if (!scopeKey || !id) return;
  const all = loadDismissed();
  const cur = all[scopeKey] || [];
  if (cur.includes(id)) return;
  saveDismissed(scopeKey, [...cur, id]);
}

/** Undo a remembered rejection, so re-linking by hand makes it suggestible again. */
export function forgetRejected(scopeKey, id) {
  if (!scopeKey || !id) return;
  const all = loadDismissed();
  const cur = all[scopeKey] || [];
  if (!cur.includes(id)) return;
  saveDismissed(scopeKey, cur.filter(x => x !== id));
}

export default function Suggestions({
  title = 'Might be connected',
  fetcher,          // () => Promise<{ items: [] }>
  scopeKey,         // stable id so decisions are remembered per record
  onLink,           // (item) => Promise — the caller does the actual write
  emptyLabel = null,
  collapsed = false, // render as a count button that opens a review screen
}) {
  const [items,  setItems]  = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dismissed, setDismissed] = useState(() => loadDismissed()[scopeKey] || []);

  const load = useCallback(() => {
    fetcher()
      .then(rows => setItems(rows || []))
      .catch(() => setItems([]));
  }, [fetcher]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => (items || []).filter(i => !dismissed.includes(i.id)),
    [items, dismissed],
  );

  function dismiss(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    saveDismissed(scopeKey, next);
  }

  async function link(item) {
    setBusyId(item.id);
    try {
      await onLink(item);
      // Drop it locally rather than refetching: the caller reloads its own data,
      // and a suggestion that vanishes the instant you accept it reads correctly.
      setItems(prev => (prev || []).filter(i => i.id !== item.id));
    } finally {
      setBusyId(null);
    }
  }

  const [reviewing, setReviewing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const togglePick = (id) => setPicked(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function linkPicked() {
    const chosen = visible.filter(i => picked.has(i.id));
    for (const i of chosen) {
      // Sequential: a partial failure should leave the successful ones linked.
      await onLink(i).catch(() => {});
    }
    setItems(prev => (prev || []).filter(i => !picked.has(i.id)));
    setPicked(new Set());
  }

  function dismissRest() {
    // "Never show me these again" for everything still on screen. The whole
    // point of remembering a rejection is that it stops being asked.
    const rest = visible.filter(i => !picked.has(i.id)).map(i => i.id);
    const next = [...dismissed, ...rest];
    setDismissed(next);
    saveDismissed(scopeKey, next);
    setArmed(false);
  }

  if (items === null) return null;
  if (!visible.length) {
    return emptyLabel
      ? <div style={{ fontSize: 11.5, color: C.ink3 }}>{emptyLabel}</div>
      : null;
  }

  // Collapsed: a count you can ignore. Suggestions are a chore you do when you
  // choose to, not a list that sits in the way of the record you opened.
  if (collapsed && !reviewing) {
    return (
      <button onClick={() => setReviewing(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 12,
        padding: '6px 13px', borderRadius: 999, cursor: 'pointer',
        border: `1px dashed ${C.acc}88`, background: `${C.acc}0d`, color: C.acc,
        fontFamily: MONO, fontSize: 10, letterSpacing: '.05em', fontWeight: 600,
      }}>⌁ {visible.length} suggested {visible.length === 1 ? 'link' : 'links'} — review</button>
    );
  }

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9, marginBottom: 12,
      background: `${C.acc}0d`, border: `1px dashed ${C.acc}66`,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
        color: C.ink3, marginBottom: 8,
      }}>{title} · {visible.length}</div>

      {(collapsed || picked.size > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => setPicked(new Set(visible.map(i => i.id)))} style={miniBtn}>select all</button>
          <button onClick={() => setPicked(new Set())} style={miniBtn}>none</button>
          <span style={{ flex: 1 }} />
          {picked.size > 0 && (
            <button onClick={linkPicked} style={{ ...miniBtn, borderColor: C.acc, color: C.acc }}>
              Link {picked.size}
            </button>
          )}
          {/* Gated: this discards every remaining suggestion permanently, and
              an accidental click would be silent. Ask once. */}
          <button
            onClick={() => (armed ? dismissRest() : setArmed(true))}
            onBlur={() => setArmed(false)}
            title="Never suggest these again"
            style={{ ...miniBtn, borderColor: `${C.red}${armed ? 'ff' : '55'}`, color: C.red, fontWeight: armed ? 700 : 400 }}
          >
            {armed
              ? `Skip ${visible.filter(i => !picked.has(i.id)).length}? click again`
              : 'Skip the rest'}
          </button>
          {collapsed && (
            <button onClick={() => setReviewing(false)} style={miniBtn}>close</button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(i => {
          const col = CONF_COLOR[i.confidence] || C.ink3;
          return (
            <div key={i.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '7px 9px', borderRadius: 7,
              background: C.bg, border: `1px solid ${C.cr2}`,
            }}>
              {(collapsed || picked.size > 0) && (
                <span
                  onClick={() => togglePick(i.id)}
                  style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                    border: `1px solid ${picked.has(i.id) ? C.acc : C.cr3}`,
                    background: picked.has(i.id) ? C.acc : 'transparent', color: '#fff',
                    fontSize: 9, lineHeight: '13px', textAlign: 'center',
                  }}
                >{picked.has(i.id) ? '✓' : ''}</span>
              )}
              <span style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase',
                padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                background: `${col}1f`, color: col, border: `1px solid ${col}55`,
              }}>{i.confidence}</span>

              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink9 }}>
                  {i.name}
                  {/* Some suggestions name both ends — "this task → that deal" —
                      and the destination is the half you are actually judging. */}
                  {i.targetName && (
                    <span style={{ color: C.ink3 }}> → <span style={{ color: C.acc }}>{i.targetName}</span></span>
                  )}
                </div>
                {/* The reason is the whole point: a suggestion you cannot check
                    is one you have to re-verify every time it appears. */}
                <div style={{ fontSize: 11, color: C.ink3, lineHeight: 1.4 }}>{i.reason}</div>
              </div>

              <button
                onClick={() => link(i)}
                disabled={busyId === i.id}
                style={{
                  padding: '4px 11px', borderRadius: 6, border: `1px solid ${C.acc}`,
                  background: 'transparent', color: C.acc, fontFamily: MONO,
                  fontSize: 9.5, letterSpacing: '.05em', fontWeight: 600,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >{busyId === i.id ? '…' : 'Link'}</button>

              <button
                onClick={() => dismiss(i.id)}
                title="Not this one"
                style={{
                  border: 'none', background: 'none', color: C.ink3,
                  cursor: 'pointer', fontSize: 12, flexShrink: 0,
                }}
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
