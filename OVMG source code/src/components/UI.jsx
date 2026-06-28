import { useEffect, useState, useRef, useCallback, Component } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { transcribeAudio } from '../api.js';
import useIsMobile, { useDevice } from '../hooks/useIsMobile.js';

// ── ErrorBoundary ───────────────────────────────────────────────────────────
// Catches render-time crashes in a subtree and shows a recoverable card instead
// of blanking the whole app to a white screen. Re-key it (e.g. key={view}) so it
// resets when the user navigates elsewhere.
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('View crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          border: `1px solid ${C.redS}`, background: C.bg, borderRadius: 14,
          padding: 40, textAlign: 'center', maxWidth: 460, margin: '24px auto',
        }}>
          <div style={{ fontSize: 30, color: C.red, marginBottom: 12 }}>⚠</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, color: C.ink9, margin: '0 0 6px' }}>
            {this.props.label || 'This section hit an error'}
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 13, color: C.ink5, margin: '0 0 16px', lineHeight: 1.55 }}>
            Something went wrong rendering this view — the rest of the dashboard is fine.
            Try reloading; if it keeps happening, let the team know.
          </p>
          <button onClick={() => { try { window.location.reload(); } catch { /* ignore */ } }}
            style={{ padding: '8px 16px', borderRadius: 8, fontFamily: SANS, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', background: C.ink9, color: C.bg, border: 'none' }}>
            Reload
          </button>
          {this.state.error?.message && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 14, wordBreak: 'break-word' }}>
              {String(this.state.error.message).slice(0, 200)}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Tag ───────────────────────────────────────────────────────────────────────
export function Tag({ children, bg = C.grS, fg = C.ink5 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontFamily: MONO, fontSize: 10, letterSpacing: '.06em',
      textTransform: 'uppercase', background: bg, color: fg,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, v = 'pri', disabled = false, sx = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, fontFamily: SANS,
    fontWeight: 500, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap', opacity: disabled ? 0.6 : 1,
    border: '1px solid transparent', transition: 'all .15s', ...sx,
  };
  const vs = {
    pri: { ...base, background: C.ink9, color: C.bg },
    gho: { ...base, background: 'transparent', color: C.ink5, borderColor: C.cr3 },
    dan: { ...base, background: 'transparent', color: C.red, borderColor: C.red },
    acc: { ...base, background: C.acc, color: '#fff' },
  };
  return <button style={vs[v] || vs.pri} onClick={onClick} disabled={disabled}>{children}</button>;
}

// ── Inp ───────────────────────────────────────────────────────────────────────
export function Inp({ value, onChange, placeholder = '', type = 'text', readOnly = false, sx = {} }) {
  return (
    <input
      type={type} value={value} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly}
      style={{
        background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8,
        padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8,
        width: '100%', outline: 'none', opacity: readOnly ? 0.6 : 1, ...sx,
      }}
    />
  );
}

// ── Sel ───────────────────────────────────────────────────────────────────────
export function Sel({ value, onChange, children, sx = {} }) {
  return (
    <select
      value={value} onChange={onChange}
      style={{
        background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8,
        padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8,
        width: '100%', ...sx,
      }}
    >
      {children}
    </select>
  );
}

// ── FR (form row) ─────────────────────────────────────────────────────────────
export function FR({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
        textTransform: 'uppercase', color: C.ink5,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── PBar ──────────────────────────────────────────────────────────────────────
export function PBar({ pct }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: C.ink5, marginBottom: 5 }}>
        <span>Progress</span><span>{Math.round(p)}%</span>
      </div>
      <div style={{ height: 6, background: C.cr2, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: C.acc, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ── Eyebrow ───────────────────────────────────────────────────────────────────
export function Eyebrow({ children }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
      textTransform: 'uppercase', color: C.ink3, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children }) {
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', background: C.bg,
        borderRadius: isMobile ? 0 : 16,
        padding: isMobile ? '20px 16px' : 24,
        width: '100%', maxWidth: isMobile ? '100%' : isTablet ? 580 : 500,
        maxHeight: isMobile ? '100vh' : '85vh',
        height: isMobile ? '100vh' : 'auto',
        overflowY: 'auto',
        boxShadow: isMobile ? 'none' : '0 24px 60px rgba(0,0,0,.4)',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer' }}>×</button>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 19 : 22, letterSpacing: '-.02em', margin: '0 0 16px', color: C.ink9 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── ConfirmDialog — §16 global destructive-action guard ───────────────────────
// Every delete / remove / unlink across the app routes through this so the
// pattern is consistent:
//   • a modal that NAMES the item being destroyed,
//   • a danger "Yes, delete" button that is NOT the default-focused control
//     (Cancel takes focus, so a stray Enter cancels rather than deletes),
//   • the caller fires a success toast (with Undo where feasible) on confirm.
// Prefer the useConfirm() hook below over wiring this by hand.
export function ConfirmDialog({
  title = 'Are you sure?',
  message,
  itemName,
  confirmLabel = 'Yes, delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onClose,
}) {
  const cancelRef = useRef(null);
  // Focus Cancel — never the destructive button (§16).
  useEffect(() => { cancelRef.current?.focus(); }, []);

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <p style={{ fontSize: 14, color: C.ink7, lineHeight: 1.55, margin: 0 }}>
        {message || (
          <>This will permanently remove{' '}
            <strong style={{ color: C.ink9 }}>{itemName || 'this item'}</strong>. This cannot be undone.</>
        )}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
        <button
          ref={cancelRef}
          onClick={onClose}
          disabled={busy}
          style={{
            padding: '8px 14px', borderRadius: 8, fontFamily: SANS, fontWeight: 500,
            fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', background: 'transparent',
            color: C.ink5, border: `1px solid ${C.cr3}`,
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          style={{
            padding: '8px 14px', borderRadius: 8, fontFamily: SANS, fontWeight: 600,
            fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', background: C.red,
            color: '#fff', border: '1px solid transparent', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * useConfirm() → [confirmNode, confirm]
 *
 * Drop {confirmNode} into your view's JSX, then call:
 *   confirm({
 *     itemName: row.name,                       // or message: '…'
 *     confirmLabel: 'Yes, remove',
 *     onConfirm: async () => { await deleteThing(row.id); showToast('Removed'); },
 *   });
 * The dialog stays open (and shows "Working…") until onConfirm resolves, and
 * closes itself on success. Throw inside onConfirm to keep it open on error.
 */
export function useConfirm() {
  const [cfg, setCfg]   = useState(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback((options) => setCfg(options || {}), []);
  const close   = useCallback(() => { setBusy(b => { if (!b) setCfg(null); return b; }); }, []);

  const handleConfirm = useCallback(async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      await cfg.onConfirm?.();
      setCfg(null);
    } catch {
      // leave the dialog open; the caller's onConfirm should surface the error
    } finally {
      setBusy(false);
    }
  }, [cfg]);

  const confirmNode = cfg
    ? <ConfirmDialog {...cfg} busy={busy} onClose={close} onConfirm={handleConfirm} />
    : null;

  return [confirmNode, confirm];
}

// ── Drawer ────────────────────────────────────────────────────────────────────
export function Drawer({ title, sub, onClose, children }) {
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.4)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: isMobile ? '100%' : isTablet ? 'min(560px,100%)' : 'min(480px,100%)',
        left: isMobile ? 0 : 'auto',
        background: C.bg, boxShadow: '0 0 60px rgba(0,0,0,.35)',
        padding: isMobile ? '20px 16px 80px' : 24,
        overflowY: 'auto',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 24, color: C.ink3, cursor: 'pointer' }}>×</button>
        {sub && <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Detail</div>}
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 22 : 28, letterSpacing: '-.025em', margin: '0 0 4px', color: C.ink9, lineHeight: 1.1 }}>{title}</h2>
        {sub && <div style={{ fontSize: 13, color: C.ink5, marginBottom: 18 }}>{sub}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); });
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: C.ink9, color: C.bg, padding: '10px 20px', borderRadius: 10,
      fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 300,
      fontFamily: SANS, maxWidth: 320, textAlign: 'center',
    }}>
      {msg}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: checked ? C.ink9 : C.cr3, borderRadius: 999, transition: '.15s' }}>
        <span style={{ position: 'absolute', height: 18, width: 18, left: 3, top: 3, background: 'white', borderRadius: '50%', transition: '.2s', transform: checked ? 'translateX(20px)' : 'none' }} />
      </span>
    </label>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20, color = C.acc }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid ${color}30`,
      borderTop: `2px solid ${color}`,
      animation: 'spin .6s linear infinite',
    }} />
  );
}

// ── VoiceMic — real recording button ─────────────────────────────────────────
/**
 * Props:
 *   label       — idle label text
 *   onTranscript(text)  — called with the transcribed text once done
 *   context     — object passed to voice-parse (tasks, contacts, etc.)
 *   onParsed(result)    — optional: called with AI parse result
 *   size        — button size in px (default 72)
 */
export function VoiceMic({ label = 'Tap to speak', onTranscript, size = 72 }) {
  const [ph, setPh] = useState('idle'); // idle | recording | processing | error
  const [err, setErr] = useState(null);
  const recRef   = useRef(null);
  const chunks   = useRef([]);

  const start = async () => {
    if (ph !== 'idle') return;
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimes  = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
      const mime   = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      chunks.current = [];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      recRef.current = rec;
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setPh('processing');
        try {
          const blob  = new Blob(chunks.current, { type: mime || 'audio/webm' });
          const b64   = await new Promise(res => {
            const r = new FileReader();
            r.onloadend = () => res(r.result.split(',')[1]);
            r.readAsDataURL(blob);
          });
          const { transcript } = await transcribeAudio(b64, mime || 'audio/webm');
          onTranscript && onTranscript(transcript);
          setPh('idle');
        } catch (e) {
          setErr('Transcription failed: ' + e.message);
          setPh('error');
        }
      };
      rec.start(250);
      setPh('recording');
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? 'Mic access denied.' : e.message);
      setPh('error');
    }
  };

  const stop = () => {
    if (recRef.current && recRef.current.state === 'recording') recRef.current.stop();
  };

  const icon = ph === 'recording' ? '◼' : ph === 'processing' ? '⟳' : '◉';
  const bg   = ph === 'recording' ? C.red : C.acc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0' }}>
      <button
        onClick={ph === 'recording' ? stop : start}
        style={{
          width: size, height: size, borderRadius: '50%', background: bg,
          border: 'none', fontSize: size * 0.35, cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          animation: ph === 'recording' ? 'pulse 1s ease-in-out infinite' : 'none',
        }}
      >
        {icon}
      </button>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>
        {ph === 'idle' ? label : ph === 'recording' ? 'Recording… tap to stop' : ph === 'processing' ? 'Transcribing…' : 'Error — try again'}
      </span>
      {err && <p style={{ fontSize: 11, color: C.red, maxWidth: 260, textAlign: 'center', lineHeight: 1.4 }}>{err}</p>}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(176,58,58,.4); } 50% { box-shadow: 0 0 0 12px rgba(176,58,58,0); } }
      `}</style>
    </div>
  );
}


