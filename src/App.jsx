import { useAuth } from './hooks/useAuth.js';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import { C, SANS } from './constants.js';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: C.chromeBg, fontFamily: SANS,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, color: C.acc, marginBottom: 16 }}>◐</div>
          <p style={{ color: C.chromeMut, fontSize: 13 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  // Signed in but no roles / no allowed tabs (e.g. a non-OVMG signup that
  // hasn't been granted access yet) → hold at an approval screen instead of
  // rendering an empty dashboard. OVMG emails default to 'member' in useAuth.
  if (!user.isAdmin && user.allowedTabs.size === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.chromeBg, fontFamily: SANS, padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 48, color: C.acc, marginBottom: 16 }}>◐</div>
          <h2 style={{ color: C.chromeFg, fontWeight: 500, fontSize: 20, margin: '0 0 8px' }}>Account pending approval</h2>
          <p style={{ color: C.chromeMut, fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
            Your account ({user.email}) doesn't have access yet. An admin needs to assign you a role before you can use the dashboard.
          </p>
          <button onClick={logout} style={{ background: 'none', border: `1px solid ${C.chromeMut}`, color: C.chromeFg, borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard user={user} onLogout={logout} />;
}
