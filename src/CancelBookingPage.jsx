import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from './constants.js';

async function publicReq(path) {
  const res = await fetch(`/.netlify/functions/${path}`);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtDateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function fmtSlot(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function CancelBookingPage({ slug, token }) {
  const [phase, setPhase] = useState('loading'); // loading | confirm | cancelling | done | already | error
  const [when, setWhen]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPhase('confirm');
  }, []);

  const doCancel = async () => {
    setPhase('cancelling');
    try {
      const d = await publicReq(`booking-cancel?token=${encodeURIComponent(token)}`);
      if (d.alreadyCancelled) {
        setPhase('already');
      } else {
        setWhen(d.when);
        setPhase('done');
      }
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, padding: '40px 20px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 }}>
          <span style={{ fontFamily: SERIF, fontSize: 28, color: C.acc, lineHeight: 1 }}>◐</span>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9 }}>OneVibe</span>
        </div>

        {phase === 'confirm' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: C.ink9, margin: '0 0 14px' }}>Cancel booking?</h1>
            <p style={{ color: C.ink5, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              This will remove the event from the calendar and notify all attendees.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={doCancel}
                style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: C.red, color: '#fff', fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Yes, cancel it
              </button>
              <a href={`/book/${slug}`}
                style={{ padding: '12px 24px', borderRadius: 8, border: `1px solid ${C.cr3}`, background: C.bg2, color: C.ink7, fontFamily: SANS, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
                Never mind
              </a>
            </div>
          </div>
        )}

        {phase === 'cancelling' && <div style={{ padding: 40, textAlign: 'center', color: C.ink5 }}>Cancelling…</div>}

        {phase === 'done' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, color: C.red, marginBottom: 16 }}>✕</div>
            <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.ink9, fontWeight: 500, margin: '0 0 10px' }}>Booking cancelled</h1>
            {when && <div style={{ color: C.ink5, marginBottom: 10 }}>{fmtDateLabel(when)} · {fmtSlot(when)}</div>}
            <div style={{ color: C.ink3, fontSize: 13 }}>The calendar event has been removed and attendees have been notified.</div>
          </div>
        )}

        {phase === 'already' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.ink5, fontWeight: 500, margin: '0 0 10px' }}>Already cancelled</h1>
            <div style={{ color: C.ink3, fontSize: 13 }}>This booking was already cancelled.</div>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ padding: 20, background: C.redS, color: C.red, borderRadius: 8 }}>
            {error}
            <button onClick={() => setPhase('confirm')}
              style={{ marginLeft: 10, background: 'none', border: 'none', color: C.red, textDecoration: 'underline', cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
