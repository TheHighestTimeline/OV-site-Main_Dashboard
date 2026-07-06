import { useState } from 'react';
import { C, SANS, MONO } from '../constants.js';
import { Modal, Btn, Inp, FR, Sel, Spinner } from './UI.jsx';
import { sendBugReport } from '../api.js';

// ── Bug report (2026-07 audit §2.4) ──────────────────────────────────────────
// Sidebar button + modal form. Auto-attaches context (current view, device,
// recent console errors captured in main.jsx) and emails it to the owner via
// the bug-report function. No third-party error service required.

export default function BugReport({ user, showToast, compact = false }) {
  const [open, setOpen]   = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc]   = useState('');
  const [sev, setSev]     = useState('normal');
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await sendBugReport({
        title: title.trim(),
        description: desc.trim(),
        severity: sev,
        view: (typeof window !== 'undefined' && window.location.hash) || '',
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}×${window.innerHeight}`,
        recentErrors: window.__ovmgErrors || [],
      });
      showToast?.('Bug report sent ✓ — thank you!');
      setOpen(false); setTitle(''); setDesc(''); setSev('normal');
    } catch (e) {
      showToast?.('Could not send report: ' + e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report a bug or problem"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: compact ? '6px 10px' : '8px 10px',
          border: 'none', borderRadius: 8, background: 'transparent', color: C.chromeMut,
          fontFamily: SANS, fontSize: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
        }}
      >
        <span style={{ fontSize: 13, width: 13, textAlign: 'center' }}>⚑</span>
        Report a bug
      </button>

      {open && (
        <Modal title="Report a bug" onClose={() => !busy && setOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12, color: C.ink5, margin: 0, lineHeight: 1.5 }}>
              Describe what went wrong — your current page, device info, and recent errors are attached automatically and sent straight to Tanner.
            </p>
            <FR label="What happened? *">
              <Inp value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kanban card won't save" />
            </FR>
            <FR label="Details / steps to reproduce">
              <textarea
                value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                placeholder="What did you click? What did you expect? What happened instead?"
                style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, width: '100%', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
              />
            </FR>
            <FR label="How bad is it?">
              <Sel value={sev} onChange={e => setSev(e.target.value)}>
                <option value="blocking">Blocking — I can't work</option>
                <option value="normal">Annoying — but I can work around it</option>
                <option value="minor">Minor — cosmetic / suggestion</option>
              </Sel>
            </FR>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn v="gho" onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
              <Btn onClick={submit} disabled={busy || !title.trim()}>
                {busy ? <><Spinner size={12} color={C.bg} /> Sending…</> : 'Send report'}
              </Btn>
            </div>
            <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
              Sent from {user?.email}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
