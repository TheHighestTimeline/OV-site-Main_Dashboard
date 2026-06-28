import { useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Btn } from './UI.jsx';
import {
  ALL_TABS, TAB_LABELS, TAB_ACCESS,
  NEVER_OVERRIDABLE_TO_NON_OVMG,
} from '../constants/roles.js';
import { setToolOverride } from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// ToolOverridesPanel — per-tool access overrides UI (Phase 6).
//
// Render this inside the Admin user-edit drawer. It shows a matrix of every
// tab × current effective access, with grant / clear / deny buttons.
//
// Props:
//   - targetUser   : the Clerk user object being edited (must include
//                    `id`, `email`, `roles`, `toolOverrides`)
//   - onUpdated    : callback invoked after a successful override change
//                    (receives the fresh toolOverrides object)
//   - showToast    : function from the dashboard context
//
// "Effective access" is computed locally for display purposes only — the real
// authoritative check happens server-side via the user's stored metadata.
// ─────────────────────────────────────────────────────────────────────────────

function effectiveAccess(user, tab) {
  const email      = user.email || '';
  const isOvmg     = email.endsWith('@onevibemediagroup.com');
  const overrides  = user.toolOverrides || {};
  const override   = overrides[tab];

  if (!isOvmg && NEVER_OVERRIDABLE_TO_NON_OVMG.includes(tab)) return 'locked';
  if (override === 'deny')  return 'denied';
  if (override === 'grant') return 'granted';
  if (isOvmg || (user.roles || []).includes('admin')) return 'role';
  const allowedRoles = TAB_ACCESS[tab] || [];
  return (user.roles || []).some(r => allowedRoles.includes(r)) ? 'role' : 'none';
}

const STATE_COLORS = {
  role:    { bg: C.grnS, fg: C.grn,  label: 'Role default · allowed' },
  granted: { bg: C.accS, fg: C.acc,  label: 'Granted (override)' },
  denied:  { bg: C.redS, fg: C.red,  label: 'Denied (override)' },
  none:    { bg: C.grS,  fg: C.ink5, label: 'No access' },
  locked:  { bg: C.cr3,  fg: C.ink3, label: 'Locked (OVMG only)' },
};

export default function ToolOverridesPanel({ targetUser, onUpdated, showToast }) {
  const [busy, setBusy] = useState(null); // tab id currently being mutated
  const [localOverrides, setLocalOverrides] = useState(targetUser.toolOverrides || {});

  const userForCheck = { ...targetUser, toolOverrides: localOverrides };
  const isOvmg = (targetUser.email || '').endsWith('@onevibemediagroup.com');

  const mutate = async (tab, action) => {
    setBusy(tab);
    try {
      const { toolOverrides } = await setToolOverride(targetUser.id, tab, action);
      setLocalOverrides(toolOverrides || {});
      onUpdated?.(toolOverrides || {});
      showToast?.(`${TAB_LABELS[tab] || tab}: ${action === 'clear' ? 'reset to role default' : action + 'ed'}`);
    } catch (e) {
      showToast?.(`Failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
        textTransform: 'uppercase', color: C.ink3, marginBottom: 12,
      }}>
        Per-tool access overrides
      </div>
      <p style={{ fontSize: 12, color: C.ink5, marginBottom: 16, lineHeight: 1.5 }}>
        Default access comes from the user's role(s). Override per tab to grant or deny specific tools.
        Override "clear" reverts to role default. Locks (OVMG-only tools) cannot be granted to outside accounts.
      </p>

      <div style={{
        background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10,
        padding: 4, overflow: 'hidden',
      }}>
        {ALL_TABS.map(tab => {
          const state = effectiveAccess(userForCheck, tab);
          const col   = STATE_COLORS[state];
          const isBusy   = busy === tab;
          const isLocked = state === 'locked';
          const currentOverride = localOverrides[tab];

          return (
            <div key={tab} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center', gap: 12,
              padding: '8px 12px',
              borderBottom: `1px solid ${C.cr3}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: SANS, fontSize: 13, color: C.ink9, fontWeight: 500,
                }}>
                  {TAB_LABELS[tab] || tab}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '.06em',
                  padding: '2px 7px', borderRadius: 99,
                  background: col.bg, color: col.fg, textTransform: 'uppercase', fontWeight: 600,
                }}>
                  {col.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!isLocked && (
                  <>
                    <button
                      disabled={isBusy || currentOverride === 'grant'}
                      onClick={() => mutate(tab, 'grant')}
                      title="Grant access (override role default)"
                      style={miniBtnStyle(currentOverride === 'grant' ? 'active-grant' : 'gho', isBusy)}
                    >
                      Grant
                    </button>
                    <button
                      disabled={isBusy || !currentOverride}
                      onClick={() => mutate(tab, 'clear')}
                      title="Clear override (revert to role default)"
                      style={miniBtnStyle('gho', isBusy)}
                    >
                      Reset
                    </button>
                    <button
                      disabled={isBusy || currentOverride === 'deny'}
                      onClick={() => mutate(tab, 'deny')}
                      title="Deny access (override role default)"
                      style={miniBtnStyle(currentOverride === 'deny' ? 'active-deny' : 'gho', isBusy)}
                    >
                      Deny
                    </button>
                  </>
                )}
                {isLocked && !isOvmg && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>
                    Hardcoded lock
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function miniBtnStyle(variant, busy) {
  const base = {
    padding: '4px 10px', border: '1px solid ' + C.cr3, borderRadius: 5,
    background: 'transparent', color: C.ink5,
    fontFamily: SANS, fontSize: 11, fontWeight: 500,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
    transition: 'all .12s',
  };
  if (variant === 'active-grant') return { ...base, background: C.acc, color: '#fff', borderColor: C.acc };
  if (variant === 'active-deny')  return { ...base, background: C.red, color: '#fff', borderColor: C.red };
  return base;
}
