import { useState, useRef, useEffect } from 'react';
import { C, SANS, MONO } from '../constants.js';
import { COMPANIES, COMPANY_META } from '../constants/roles.js';
import { canAccess } from '../lib/access.js';

// ── Global company scope pill (2026-07 audit §3.1) ───────────────────────────
// A pill dropdown shown in the top bar on BOTH desktop and mobile. Selecting a
// company filters every scoped view (Contacts, Tasks, Kanban, References) to
// that company; "All Companies" restores the rollup. Scope is persisted in
// localStorage so it survives refresh.

export const SCOPE_STORAGE_KEY = 'ovmg.companyScope';

export function loadScope() {
  try {
    const v = localStorage.getItem(SCOPE_STORAGE_KEY);
    return v && COMPANY_META[v] ? v : null;
  } catch { return null; }
}

export function saveScope(slug) {
  try {
    if (slug) localStorage.setItem(SCOPE_STORAGE_KEY, slug);
    else localStorage.removeItem(SCOPE_STORAGE_KEY);
  } catch { /* ignore */ }
}

export default function CompanyScopePill({ user, scope, onChange, compact = false, onOpenCompany }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const accessible = COMPANIES.filter(s => COMPANY_META[s] && canAccess(user, `company:${s}`));
  const meta  = scope ? COMPANY_META[scope] : null;
  const label = meta ? meta.label : 'All Companies';
  const dot   = meta ? meta.color_hex : C.acc;

  const pick = (slug) => { onChange(slug); setOpen(false); };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Filter everything to one company"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: compact ? '5px 10px' : '6px 13px', borderRadius: 999,
          border: `1px solid ${scope ? dot : C.cr3}`,
          background: scope ? dot + '1c' : C.bg2,
          color: scope ? dot : C.ink5, fontFamily: SANS,
          fontSize: compact ? 11 : 12, fontWeight: scope ? 600 : 500,
          cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: compact ? 150 : 220,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ fontSize: 8, opacity: .7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 260,
          background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,.18)', padding: 6, minWidth: 200,
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, padding: '6px 10px 4px' }}>
            Company scope
          </div>
          {[{ slug: null, label: 'All Companies', color: C.acc }, ...accessible.map(s => ({ slug: s, label: COMPANY_META[s].label, color: COMPANY_META[s].color_hex }))]
            .map(({ slug, label, color }) => {
              const on = scope === slug || (!scope && slug === null);
              return (
                <div key={slug || 'all'} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    onClick={() => pick(slug)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0,
                      padding: '8px 10px', border: 'none', borderRadius: 8, textAlign: 'left',
                      background: on ? color + '16' : 'transparent',
                      color: on ? C.ink9 : C.ink5, fontFamily: SANS, fontSize: 13,
                      fontWeight: on ? 600 : 400, cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {on && <span style={{ color, fontSize: 12 }}>✓</span>}
                  </button>
                  {/* §3.1: companies left the sidebar — this ⌂ is how a company's
                      hub (HQ + tabs) is opened now. */}
                  {slug && onOpenCompany && (
                    <button
                      onClick={() => { onOpenCompany(slug); setOpen(false); }}
                      title={`Open ${label} hub`}
                      style={{
                        flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none',
                        background: 'transparent', color, fontSize: 14, cursor: 'pointer',
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      ⌂
                    </button>
                  )}
                </div>
              );
            })}
          {onOpenCompany && (
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, padding: '6px 10px 4px', borderTop: `1px solid ${C.cr2}`, marginTop: 4 }}>
              ⌂ opens the company hub
            </div>
          )}
        </div>
      )}
    </div>
  );
}
