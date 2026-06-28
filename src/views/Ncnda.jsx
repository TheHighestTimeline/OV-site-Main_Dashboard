import { useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, Spinner } from '../components/UI.jsx';
import { sendNcnda } from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// NCNDA Sender — Phase 5.
//
// Calls the new server-side `ncnda-send` Netlify function instead of the
// old Zapier webhook. The function handles BOTH operations the Zap was doing:
//   1. Send the envelope via SignWell.
//   2. Append a row to the canonical "NCNDA Send Log" Google Sheet
//      (1CRdgqZp22_zI_ot1A6lvmLWTZzzs3viq0jBfYIsp3F4).
//
// Zapier is no longer in the loop. The sheet ID is hardcoded server-side so
// it can't drift.
// ─────────────────────────────────────────────────────────────────────────────

export default function Ncnda({ user }) {
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | sending | success | error
  const [errMsg, setErrMsg] = useState('');
  const [envelopeId, setEnvelopeId] = useState('');
  const [warning, setWarning] = useState(''); // shown on success if part of the flow degraded

  const canSubmit = name.trim() && email.trim() && phase !== 'sending';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase('sending');
    setErrMsg('');
    setWarning('');

    try {
      const result = await sendNcnda({
        counterparty_name:  name.trim(),
        counterparty_email: email.trim().toLowerCase(),
        notes:              notes.trim(),
      });

      setEnvelopeId(result.envelopeId || '');

      // Surface partial-success states (e.g. SignWell skipped because not configured yet)
      if (result.signWellSkipped) {
        setWarning('Logged to sheet ✓ — but SignWell is not configured yet so no envelope was sent. Add SIGNWELL_API_KEY + SIGNWELL_TEMPLATE_ID env vars in Netlify to enable sending.');
      } else if (result.signWellError) {
        setWarning(`Logged to sheet ✓ — but SignWell send failed: ${result.signWellError}`);
      } else if (!result.loggedToSheet) {
        setWarning(`Envelope sent ✓ — but sheet logging failed: ${result.sheetError}`);
      }

      setPhase('success');
    } catch (err) {
      setErrMsg((err && err.message) || 'Failed to send. Check connection.');
      setPhase('error');
    }
  };

  const handleReset = () => {
    setName('');
    setEmail('');
    setNotes('');
    setEnvelopeId('');
    setErrMsg('');
    setWarning('');
    setPhase('idle');
  };

  return (
    <div>
      <Eyebrow>Legal</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>
        NCNDA Sender
      </h1>
      <p style={{ fontSize: 13, color: C.ink5, marginBottom: 28 }}>
        Send a Mutual NCNDA to a counterparty via SignWell. Carsten signs first, counterparty signs second. Every send is logged to the canonical Send Log sheet.
      </p>

      <div style={{ maxWidth: 480 }}>

        {/* ── SUCCESS STATE ── */}
        {phase === 'success' && (
          <div style={{ background: C.grnS, border: `1px solid ${C.grn}30`, borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontFamily: SERIF, fontSize: 42, color: C.grn, marginBottom: 10 }}>✓</div>
            <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, color: C.ink9, marginBottom: 6 }}>NCNDA Sent</div>
            <div style={{ fontSize: 13, color: C.ink5, marginBottom: 4 }}>
              Envelope sent to <span style={{ color: C.ink9, fontWeight: 500 }}>{name}</span>
            </div>
            {envelopeId && (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, marginBottom: 4 }}>ID: {envelopeId}</div>
            )}
            <div style={{ fontSize: 12, color: C.ink3, marginBottom: 20 }}>
              Logged to NCNDA Send Log · Carsten will receive his copy first
            </div>
            {warning && (
              <div style={{ background: C.yelS, border: `1px solid ${C.yel}30`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.yel, marginBottom: 16, textAlign: 'left' }}>
                {warning}
              </div>
            )}
            <Btn onClick={handleReset} v="gho">Send Another</Btn>
          </div>
        )}

        {/* ── FORM STATE ── */}
        {phase !== 'success' && (
          <div style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 14, padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Sender — pre-filled, read-only */}
            <FR label="Sending as">
              <Inp value={user.email} readOnly />
            </FR>

            <div style={{ height: 1, background: C.cr3 }} />

            {/* Counterparty Name */}
            <FR label="Counterparty Name">
              <Inp
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith or Acme Corp"
              />
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 3 }}>
                Document title: <span style={{ color: C.ink5 }}>{name.trim() || '[Name]'} X OVMG</span>
              </div>
            </FR>

            {/* Counterparty Email */}
            <FR label="Counterparty Email">
              <Inp
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </FR>

            {/* Notes */}
            <FR label="Notes (optional)">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Context for the log (e.g. lead source, deal type)"
                rows={2}
                style={{
                  background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8,
                  padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8,
                  width: '100%', outline: 'none', resize: 'none', lineHeight: 1.5,
                }}
              />
            </FR>

            {/* Error */}
            {phase === 'error' && (
              <div style={{ background: C.redS, border: `1px solid ${C.red}30`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.red }}>
                {errMsg}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 14px', borderRadius: 8, border: 'none',
                background: canSubmit ? C.ink9 : C.cr3,
                color: canSubmit ? C.bg : C.ink3,
                fontFamily: SANS, fontWeight: 600, fontSize: 13,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'all .15s',
              }}
            >
              {phase === 'sending'
                ? <><Spinner size={14} color={C.bg} /> Sending…</>
                : <>✎ &nbsp;Send NCNDA</>
              }
            </button>

            <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
              Logged · Audited · Sent via SignWell
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
