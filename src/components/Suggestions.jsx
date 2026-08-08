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

function loadDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}

export default function Suggestions({
  title = 'Might be connected',
  fetcher,          // () => Promise<{ items: [] }>
  scopeKey,         // stable id so dismissals are remembered per record
  onLink,           // (item) => Promise — the caller does the actual write
  emptyLabel = null,
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
    const all = loadDismissed();
    all[scopeKey] = next;
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(all)); } catch { /* private mode */ }
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

  if (items === null) return null;
  if (!visible.length) {
    return emptyLabel
      ? <div style={{ fontSize: 11.5, color: C.ink3 }}>{emptyLabel}</div>
      : null;
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(i => {
          const col = CONF_COLOR[i.confidence] || C.ink3;
          return (
            <div key={i.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '7px 9px', borderRadius: 7,
              background: C.bg, border: `1px solid ${C.cr2}`,
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase',
                padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                background: `${col}1f`, color: col, border: `1px solid ${col}55`,
              }}>{i.confidence}</span>

              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink9 }}>{i.name}</div>
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
