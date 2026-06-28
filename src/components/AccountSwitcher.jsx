import { useState, useEffect, useRef } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import {
  listGoogleAccounts, setActiveGoogleAccount,
  startGoogleOAuth, removeGoogleAccount,
} from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// AccountSwitcher — Phase 8.
//
// Compact dropdown that sits in the dashboard sidebar bottom (or header).
// Shows the active Google account, lets the user switch between connected
// accounts, add new ones via OAuth, or disconnect ones they don't need.
//
// Props:
//   - user      : the Clerk user object (for display)
//   - showToast : toast function from dashboard context
//
// Lifecycle:
//   - On mount, fetch the user's connected accounts.
//   - Listens for window 'message' events with type 'ovmg.google.account.connected'
//     (posted by the OAuth callback popup) and refreshes the list when one arrives.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccountSwitcher({ user, showToast }) {
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [busy, setBusy]           = useState(false);
  const containerRef = useRef(null);

  const active = accounts.find(a => a.isActive) || null;

  const load = async () => {
    setLoading(true);
    try {
      const data = await listGoogleAccounts();
      setAccounts(data.accounts || []);
    } catch (e) {
      console.warn('[AccountSwitcher] list failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Refresh after the OAuth popup posts back
  useEffect(() => {
    const onMsg = (e) => {
      // ACC-2: only accept messages from our own origin (CSRF / postMessage hardening)
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'ovmg.google.account.connected') {
        showToast?.(`Connected ${e.data.email}`);
        load();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleSwitch = async (accountId) => {
    setBusy(true);
    try {
      await setActiveGoogleAccount(accountId);
      await load();
      showToast?.('Switched account ✓');
      setOpen(false);
    } catch (e) {
      showToast?.('Switch failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      const { url } = await startGoogleOAuth();
      // Open in a popup so we can capture the post-back message
      const popup = window.open(url, 'ovmg-google-oauth', 'width=520,height=620');
      if (!popup) {
        // Popup blocked — fall back to full redirect
        window.location.href = url;
      }
    } catch (e) {
      showToast?.('Could not start OAuth: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (accountId, email) => {
    if (!confirm(`Disconnect ${email}? You'll need to re-authorize to use this account again.`)) return;
    setBusy(true);
    try {
      await removeGoogleAccount(accountId);
      await load();
      showToast?.(`Disconnected ${email}`);
    } catch (e) {
      showToast?.('Remove failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  // Compact button shown when collapsed
  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={active ? `Active: ${active.email}` : 'Connect a Google account'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 10px',
          background: open ? C.ink7 : 'transparent',
          border: `1px solid ${C.ink7}`,
          borderRadius: 6,
          cursor: 'pointer', color: C.bg,
          fontFamily: SANS, fontSize: 12, textAlign: 'left',
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: active?.avatarUrl ? `url(${active.avatarUrl}) center/cover` : C.acc,
          color: C.ink9, fontWeight: 600,
          display: 'grid', placeItems: 'center', fontSize: 11, flexShrink: 0,
        }}>
          {!active?.avatarUrl && (active?.email?.[0]?.toUpperCase() || 'G')}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, color: C.bg,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {loading
              ? 'Loading…'
              : active
                ? (active.displayName || active.email)
                : 'Google: not connected'}
          </div>
          {active && (
            <div style={{
              fontFamily: MONO, fontSize: 9, color: C.ink3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {active.email}
            </div>
          )}
        </div>
        <span style={{ color: C.ink3, fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
          background: C.ink8, border: `1px solid ${C.ink7}`, borderRadius: 8,
          padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,.45)', zIndex: 230,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
            textTransform: 'uppercase', color: C.ink3, padding: '4px 8px',
          }}>
            Google accounts
          </div>

          {accounts.length === 0 && !loading && (
            <div style={{ padding: '6px 8px', fontSize: 12, color: C.ink3 }}>
              None connected yet.
            </div>
          )}

          {accounts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 5,
              background: a.isActive ? C.ink7 : 'transparent',
            }}>
              <button
                disabled={busy || a.isActive}
                onClick={() => handleSwitch(a.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: 'none', cursor: a.isActive ? 'default' : 'pointer',
                  color: C.bg, fontFamily: SANS, fontSize: 12, textAlign: 'left',
                  padding: 0,
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: a.avatarUrl ? `url(${a.avatarUrl}) center/cover` : C.acc,
                  color: C.ink9, fontWeight: 600,
                  display: 'grid', placeItems: 'center', fontSize: 10, flexShrink: 0,
                }}>
                  {!a.avatarUrl && (a.email[0]?.toUpperCase() || 'G')}
                </span>
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.email}
                </span>
                {a.isActive && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8, color: C.acc, letterSpacing: '.1em',
                  }}>
                    ACTIVE
                  </span>
                )}
              </button>
              <button
                disabled={busy}
                onClick={() => handleRemove(a.id, a.email)}
                title="Disconnect"
                style={{
                  background: 'none', border: 'none', color: C.ink3,
                  cursor: 'pointer', fontSize: 13, padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            disabled={busy}
            onClick={handleAdd}
            style={{
              marginTop: 4, padding: '8px 10px', borderRadius: 5,
              background: C.acc, color: C.ink9, border: 'none',
              fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {busy ? '…' : '+ Add Google account'}
          </button>
        </div>
      )}
    </div>
  );
}
