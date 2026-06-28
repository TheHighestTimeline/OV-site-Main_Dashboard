// PublicBookingPage — the page recipients see at /book/:slug.
// NO Clerk auth — recipients aren't logged in to OVMG.
// Rendered when the URL path starts with /book/ in main.jsx.

import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from './constants.js';

// We make raw fetch calls here (no api.js req() which adds Clerk token)
// PUB-1: stricter email validation than 'includes(@)'
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }

async function publicReq(path, opts = {}) {
  const res = await fetch(`/.netlify/functions/${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function fmtSlot(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function PublicBookingPage({ slug }) {
  const [page, setPage]       = useState(null);
  const [slots, setSlots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [phase, setPhase]     = useState('pick'); // pick | confirm | sending | done | failed
  const [recipientName, setName]   = useState('');
  const [recipientEmail, setEmail] = useState('');
  const [recipientNotes, setNotes] = useState('');
  const [result, setResult]   = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    setLoading(true);
    publicReq(`booking-public-page?slug=${encodeURIComponent(slug)}`)
      .then(d => { setPage(d.page); setSlots(d.slots || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Group slots by date
  const byDate = slots.reduce((m, s) => {
    const key = s.start.slice(0, 10);
    (m[key] = m[key] || []).push(s);
    return m;
  }, {});

  const refreshSlots = () => {
    setLoading(true);
    publicReq(`booking-public-page?slug=${encodeURIComponent(slug)}`)
      .then(d => { setPage(d.page); setSlots(d.slots || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  const submit = async () => {
    if (!recipientName.trim() || !recipientEmail.trim() || !selectedSlot) return;
    setPhase('sending'); setSubmitError(null);
    try {
      const res = await fetch('/.netlify/functions/booking-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          recipientName, recipientEmail, recipientNotes,
          start: selectedSlot.start, end: selectedSlot.end,
        }),
      });
      if (res.status === 409) {
        setSelectedSlot(null);
        setPhase('pick');
        setSubmitError('That slot was just taken — please pick another.');
        refreshSlots();
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setResult(d.booking); setPhase('done');
    } catch (e) {
      setSubmitError(e.message); setPhase('failed');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, padding: '40px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 }}>
          <span style={{ fontFamily: SERIF, fontSize: 28, color: C.acc, lineHeight: 1 }}>◐</span>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9 }}>OneVibe</span>
        </div>

        {loading && <div style={{ textAlign: 'center', color: C.ink3, padding: 40 }}>Loading…</div>}
        {error && <div style={{ padding: 20, background: C.redS, color: C.red, borderRadius: 8 }}>{error}</div>}

        {page && phase === 'pick' && (
          <>
            {submitError && (
              <div style={{ padding: '12px 16px', background: C.yelS, color: C.ink9, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                {submitError}
              </div>
            )}
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, color: C.ink9, margin: '0 0 6px' }}>{page.label}</h1>
            <p style={{ fontSize: 14, color: C.ink5, marginBottom: 20 }}>
              {page.durationMin} minutes
              {page.withMeet && ' · Google Meet included'}
            </p>
            {page.description && <p style={{ fontSize: 14, color: C.ink7, lineHeight: 1.5, marginBottom: 24 }}>{page.description}</p>}
            <h2 style={{ fontSize: 13, fontFamily: MONO, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink5, marginBottom: 14 }}>Pick a time</h2>
            {Object.keys(byDate).length === 0 && <div style={{ padding: 20, color: C.ink3, fontSize: 13 }}>No available slots in the next 14 days.</div>}
            {Object.entries(byDate).map(([date, daySlots]) => (
              <div key={date} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink8, marginBottom: 10 }}>{fmtDateLabel(daySlots[0].start)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {daySlots.map(s => (
                    <button key={s.start} onClick={() => { setSelectedSlot(s); setPhase('confirm'); }}
                      style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.cr3}`, background: C.bg2, fontFamily: SANS, fontSize: 13, color: C.ink9, cursor: 'pointer' }}>
                      {fmtSlot(s.start)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {page && phase === 'confirm' && selectedSlot && (
          <>
            <button onClick={() => { setSelectedSlot(null); setPhase('pick'); }}
              style={{ background: 'none', border: 'none', color: C.ink5, fontSize: 13, cursor: 'pointer', marginBottom: 20 }}>← back</button>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 28, color: C.ink9, margin: '0 0 6px' }}>{page.label}</h1>
            <div style={{ padding: '12px 14px', background: C.accS, borderRadius: 8, marginBottom: 24, color: C.acc, fontFamily: MONO, fontSize: 13 }}>
              {fmtDateLabel(selectedSlot.start)} · {fmtSlot(selectedSlot.start)} – {fmtSlot(selectedSlot.end)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Your name *"><input value={recipientName} onChange={e => setName(e.target.value)} style={inputS} /></Field>
              <Field label="Your email *"><input type="email" value={recipientEmail} onChange={e => setEmail(e.target.value)} style={{...inputS, borderColor: recipientEmail && !isValidEmail(recipientEmail) ? C.red : C.cr3}} /></Field>
              <Field label="Notes (optional)"><textarea value={recipientNotes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputS, resize: 'vertical' }} placeholder="What would you like to discuss?" /></Field>
              <button onClick={submit} disabled={!recipientName.trim() || !isValidEmail(recipientEmail)}
                style={{ padding: '12px 18px', borderRadius: 8, border: 'none', background: C.acc, color: '#fff', fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (!recipientName.trim() || !isValidEmail(recipientEmail)) ? 0.5 : 1 }}>
                Confirm booking
              </button>
            </div>
          </>
        )}

        {phase === 'sending' && <div style={{ padding: 40, textAlign: 'center', color: C.ink5 }}>Confirming…</div>}

        {phase === 'done' && result && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, color: C.grn, marginBottom: 16 }}>✓</div>
            <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.ink9, fontWeight: 500, margin: '0 0 10px' }}>You're booked</h1>
            <div style={{ color: C.ink5, marginBottom: 16 }}>
              {fmtDateLabel(result.start_at)} · {fmtSlot(result.start_at)}
            </div>
            <div style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>A confirmation has been sent to your email.</div>
            {result.meet_link && (
              <a href={result.meet_link} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '10px 18px', background: C.ink9, color: C.bg, borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>
                Open Google Meet
              </a>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <div style={{ padding: 20, background: C.redS, color: C.red, borderRadius: 8 }}>
            Booking failed: {submitError}
            <button onClick={() => setPhase('confirm')} style={{ marginLeft: 10, background: 'none', border: 'none', color: C.red, textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}

const inputS = {
  width: '100%', boxSizing: 'border-box', padding: '10px 14px',
  border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg2,
  fontFamily: SANS, fontSize: 14, color: C.ink9, outline: 'none',
};

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
