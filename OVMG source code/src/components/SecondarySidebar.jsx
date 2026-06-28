import { useEffect, useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// SecondarySidebar — Phase 4 + audit fix M-4.
//
// M-4: localStorage keys are now namespaced under `ovmg.dashboard.v1.` so they
// don't collide with any other localStorage from the host page, and so we
// have a version prefix for future schema changes.
//
// Props are unchanged from Phase 4. Existing callers continue passing the
// short storageKey (e.g. 'sidebar.tools.collapsed') and the namespace is
// added transparently.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_NAMESPACE = 'ovmg.dashboard.v1.';

function fullKey(storageKey) {
  return storageKey ? STORAGE_NAMESPACE + storageKey : null;
}

export default function SecondarySidebar({
  title,
  items = [],
  activeId,
  onSelect,
  storageKey,
  children,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const key = fullKey(storageKey);
    if (!key) return false;
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    const key = fullKey(storageKey);
    if (!key) return;
    try { localStorage.setItem(key, collapsed ? '1' : '0'); }
    catch { /* ignore */ }
  }, [collapsed, storageKey]);

  const width = collapsed ? 52 : 200;

  return (
    <aside style={{
      width,
      background: C.bg2,
      borderRight: `1px solid ${C.cr3}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'width .18s ease',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: collapsed ? '12px 8px' : '12px 14px',
        borderBottom: `1px solid ${C.cr3}`,
        gap: 6,
      }}>
        {!collapsed && (
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
            textTransform: 'uppercase', color: C.ink3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.ink5, fontSize: 16, padding: '0 4px', lineHeight: 1,
          }}
        >
          {collapsed ? '⇥' : '⇤'}
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {items.map(item => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onSelect?.(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10, width: '100%', textAlign: 'left',
                padding: collapsed ? '10px 0' : '8px 10px',
                border: 'none', borderRadius: 6,
                background: active ? C.ink9 : 'transparent',
                color: active ? C.bg : C.ink8,
                fontFamily: SANS, fontSize: 13,
                cursor: 'pointer', marginBottom: 2,
                transition: 'background .12s ease',
                position: 'relative',
              }}
            >
              <span style={{
                fontFamily: SERIF, fontSize: 14,
                color: active ? C.acc : C.ink5,
                width: 16, textAlign: 'center', flexShrink: 0,
              }}>
                {item.icon}
              </span>
              {!collapsed && (
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label}
                </span>
              )}
              {!collapsed && item.badge != null && (
                <span style={{
                  fontFamily: MONO, fontSize: 9, fontWeight: 600,
                  padding: '1px 6px', borderRadius: 9,
                  background: active ? C.acc : C.cr3,
                  color: active ? C.ink9 : C.ink5,
                }}>
                  {item.badge}
                </span>
              )}
              {collapsed && item.badge != null && (
                <span style={{
                  position: 'absolute', top: 6, right: 8,
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.acc,
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {children && (
        <div style={{
          padding: collapsed ? 8 : 10,
          borderTop: `1px solid ${C.cr3}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {children}
        </div>
      )}
    </aside>
  );
}
