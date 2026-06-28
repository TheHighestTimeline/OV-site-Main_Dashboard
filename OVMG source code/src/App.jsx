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

  return <Dashboard user={user} onLogout={logout} />;
}
