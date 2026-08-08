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

// ── FilterPills (2026-07 audit §2.3) ─────────────────────────────────────────
// THE canonical pill filter row — previously copy-pasted with slight drift in
// Opportunities, Tasks, References, Review, Contacts. options: [{value,label,
// color?}] or plain strings. Use everywhere a row of toggle pills is needed.
export function FilterPills({ options, value, onChange, sx = {} }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', ...sx }}>
      {options.map(opt => {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        const on = value === o.value;
        const color = o.color || C.ink9;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            background: on ? (o.color ? color + '18' : C.ink9) : C.bg,
            color: on ? (o.color ? color : C.bg) : C.ink5,
            border: `1px solid ${on ? color : C.cr3}`, borderRadius: 999,
            padding: '4px 11px', fontSize: 11, fontFamily: SANS, cursor: 'pointer',
            whiteSpace: 'nowrap', fontWeight: on ? 600 : 400,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── FilterDropdown (2026-07 UI pass) ─────────────────────────────────────────
// THE canonical filter control for Tasks/Kanban and any view with more than a
// couple of options. A compact pill trigger ("Priority · High ▾") that opens a
// smooth dropdown panel — replaces the long scrolling pill rows. Highlights
// when a non-default value is active. options: strings or {v, l, color?}.
export function FilterDropdown({ label, value, onChange, options, allValue = 'All', sx = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const norm    = options.map(o => (typeof o === 'string' ? { v: o, l: o } : o));
  const current = norm.find(o => o.v === value);
  const active  = value !== allValue && value != null && value !== '';
  const accent  = (current && current.color) || C.acc;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, ...sx }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '6px 12px', borderRadius: 999,
          border: `1px solid ${active ? accent : C.cr3}`,
          background: active ? accent + '14' : C.bg2,
          color: active ? accent : C.ink5,
          fontFamily: SANS, fontSize: 12, fontWeight: active ? 600 : 400,
          cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 230,
          transition: 'border-color .15s, background .15s, color .15s',
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: active ? accent : C.ink3 }}>
          {label}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active ? (current?.l ?? String(value)) : (norm.find(o => o.v === allValue)?.l || 'All')}
        </span>
        <span style={{ fontSize: 8, opacity: .7, display: 'inline-block', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 240,
          background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,.16)', padding: 6,
          minWidth: 190, maxHeight: 320, overflowY: 'auto',
          animation: 'ovmgDropIn .13s ease',
        }}>
          <style>{`@keyframes ovmgDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, padding: '5px 10px 3px' }}>
            {label}
          </div>
          {norm.map(o => {
            const on = o.v === value;
            const oc = o.color || C.ink9;
            return (
              <button
                key={String(o.v)}
                onClick={() => { onChange(o.v); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', border: 'none', borderRadius: 8, textAlign: 'left',
                  background: on ? (o.color ? oc + '16' : C.bg2) : 'transparent',
                  color: on ? C.ink9 : C.ink5, fontFamily: SANS, fontSize: 13,
                  fontWeight: on ? 600 : 400, cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = C.bg2; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                {o.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.l}</span>
                {on && <span style={{ color: o.color || C.acc, fontSize: 12 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── FilterBar — dropdown row + active count + one-click clear ────────────────
// Wrap FilterDropdowns in this to get a "Clear ✕" button whenever any filter
// is off its default. filters: [{ value, defaultValue = 'All', reset }].
export function FilterBar({ children, filters = [], sx = {} }) {
  const dirty = filters.filter(f => f.value !== (f.defaultValue ?? 'All'));
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18, ...sx }}>
      {children}
      {dirty.length > 0 && (
        <button
          onClick={() => dirty.forEach(f => f.reset(f.defaultValue ?? 'All'))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
            borderRadius: 999, border: 'none', background: 'transparent',
            color: C.ink3, fontFamily: SANS, fontSize: 11, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Clear {dirty.length} filter{dirty.length === 1 ? '' : 's'} ✕
        </button>
      )}
    </div>
  );
}

// ── PageHeader (2026-07 audit §2.3) ──────────────────────────────────────────
// Standard view header: eyebrow + serif title + optional subtitle + actions.
export function PageHeader({ eyebrow, title, sub, actions, isMobile = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 27 : 36, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
          {title}
        </h1>
        {sub && <div style={{ fontSize: 13, color: C.ink5, marginTop: 6 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ── Card (2026-07 audit §2.3) ────────────────────────────────────────────────
// Standard bordered card container.
export function Card({ children, pad = '16px 18px', sx = {} }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 12, padding: pad, ...sx }}>
      {children}
    </div>
  );
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
//
// `size` picks how much room the dialog gets:
//   'default'  500px (580 on tablet) — a form, a confirm, a short list.
//   'wide'     880px — a comparison table, a two-column form.
//   'full'     the whole viewport, minus a hairline. For a record editor with
//              enough fields that a 500px column turns it into a scroll tunnel.
//
// At 'full' the title bar and the `footer` stop scrolling with the body. That
// is the point of the size, not a decoration: in a long editor the close button
// and the save row are what you reach for, and having to scroll back to the top
// to find them is the thing that makes a cramped popup feel cramped.
export function Modal({ title, sub = null, onClose, children, size = 'default', footer = null, headerRight = null }) {
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const full = size === 'full' && !isMobile;
  const maxWidth = isMobile ? '100%'
    : full ? 'none'
    : size === 'wide' ? 880
    : isTablet ? 580 : 500;

  const shell = {
    position: 'relative', background: C.bg,
    borderRadius: isMobile ? 0 : full ? 14 : 16,
    width: '100%', maxWidth,
    boxShadow: isMobile ? 'none' : '0 24px 60px rgba(0,0,0,.4)',
    animation: 'ovmgPop .18s cubic-bezier(.2,.9,.3,1)',
  };
  const closeBtn = (
    <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer', lineHeight: 1, zIndex: 2 }}>×</button>
  );
  const heading = (
    <>
      {/* headerRight rides beside the title so a dialog can carry its own
          controls (expand, tabs) without them scrolling away with the body. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: 30 }}>
        <h2 style={{ flex: 1, minWidth: 0, fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 19 : 22, letterSpacing: '-.02em', margin: 0, color: C.ink9 }}>{title}</h2>
        {headerRight}
      </div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, marginTop: 5 }}>{sub}</div>}
    </>
  );

  const backdrop = (
    <>
      <style>{`
        @keyframes ovmgFade   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovmgPop    { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
      `}</style>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.5)', backdropFilter: 'blur(4px)', animation: 'ovmgFade .15s ease' }} />
    </>
  );

  // Full screen: chrome is pinned, only the body scrolls.
  if (full) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', padding: 14 }}>
        {backdrop}
        <div style={{ ...shell, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '18px 28px 14px', borderBottom: `1px solid ${C.cr2}` }}>
            {closeBtn}
            {heading}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>{children}</div>
          {footer && (
            <div style={{ flexShrink: 0, borderTop: `1px solid ${C.cr2}`, padding: '12px 28px', background: C.bg }}>{footer}</div>
          )}
        </div>
      </div>
    );
  }

  // Everything else keeps the original single-scroll shape.
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 16 }}>
      {backdrop}
      <div style={{
        ...shell,
        padding: isMobile ? '20px 16px' : 24,
        maxHeight: isMobile ? '100vh' : '85vh',
        height: isMobile ? '100vh' : 'auto',
        overflowY: 'auto',
      }}>
        {closeBtn}
        <div style={{ marginBottom: 16 }}>{heading}</div>
        {children}
        {footer && <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.cr2}` }}>{footer}</div>}
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
      <style>{`
        @keyframes ovmgFade    { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovmgSlideIn { from { transform: translateX(60px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes ovmgSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.4)', backdropFilter: 'blur(3px)', animation: 'ovmgFade .15s ease' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: isMobile ? '100%' : isTablet ? 'min(560px,100%)' : 'min(480px,100%)',
        left: isMobile ? 0 : 'auto',
        background: C.bg, boxShadow: '0 0 60px rgba(0,0,0,.35)',
        padding: isMobile ? '20px 16px 80px' : 24,
        overflowY: 'auto',
        animation: `${isMobile ? 'ovmgSlideUp' : 'ovmgSlideIn'} .2s cubic-bezier(.2,.9,.3,1)`,
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
// 2026-07 UI pass: msg can be a string OR { text, actionLabel, onAction } —
// action toasts (e.g. "Moved to Proposal · Undo") stay up longer and slide in.
export function Toast({ msg, onDone }) {
  const obj    = typeof msg === 'string' ? { text: msg } : (msg || {});
  const hasAct = !!(obj.actionLabel && obj.onAction);
  useEffect(() => { const t = setTimeout(onDone, hasAct ? 6000 : 2800); return () => clearTimeout(t); });
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: C.ink9, color: C.bg, padding: hasAct ? '9px 12px 9px 20px' : '10px 20px', borderRadius: 10,
      fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 300,
      fontFamily: SANS, maxWidth: 380, textAlign: 'center',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'ovmgToastIn .18s ease',
    }}>
      <style>{`@keyframes ovmgToastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      <span>{obj.text}</span>
      {hasAct && (
        <button
          onClick={() => { try { obj.onAction(); } finally { onDone(); } }}
          style={{
            background: 'rgba(255,255,255,.14)', border: 'none', color: C.acc,
            fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            padding: '5px 12px', borderRadius: 7, whiteSpace: 'nowrap',
          }}
        >
          {obj.actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Skeleton (2026-07 UI pass) ───────────────────────────────────────────────
// Shimmering placeholder blocks shown on FIRST load (cached revisits render
// real data instantly via lib/cache.js). Compose freely: <Skeleton h={14} w="60%" />
export function Skeleton({ h = 12, w = '100%', r = 6, sx = {} }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: r,
      background: `linear-gradient(90deg, ${C.cr1} 25%, ${C.cr2} 50%, ${C.cr1} 75%)`,
      backgroundSize: '400px 100%',
      animation: 'ovmgShimmer 1.3s ease-in-out infinite',
      ...sx,
    }}>
      <style>{`@keyframes ovmgShimmer { from { background-position: -400px 0; } to { background-position: 400px 0; } }`}</style>
    </div>
  );
}

// Ready-made skeleton layouts
export function SkeletonRows({ rows = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', border: `1px solid ${C.cr1}`, borderRadius: 10 }}>
          <Skeleton h={28} w={28} r={14} sx={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton h={12} w={`${45 + (i * 13) % 40}%`} />
            <Skeleton h={9} w={`${20 + (i * 7) % 25}%`} />
          </div>
          <Skeleton h={18} w={64} r={999} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ lanes = 5 }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
      {Array.from({ length: lanes }).map((_, i) => (
        <div key={i} style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton h={34} r="8px 8px 0 0" />
          {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
            <div key={j} style={{ border: `1px solid ${C.cr1}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Skeleton h={12} w="80%" />
              <Skeleton h={9} w="45%" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── EmptyState (2026-07 UI pass) ─────────────────────────────────────────────
export function EmptyState({ icon = '◇', title, body, actionLabel, onAction }) {
  return (
    <div style={{ padding: '44px 24px', textAlign: 'center', background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 14 }}>
      <div style={{ fontFamily: SERIF, fontSize: 30, color: C.acc, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink9, marginBottom: 6 }}>{title}</div>
      {body && <p style={{ fontSize: 13, color: C.ink5, lineHeight: 1.55, margin: '0 auto', maxWidth: 380 }}>{body}</p>}
      {actionLabel && onAction && (
        <div style={{ marginTop: 16 }}><Btn onClick={onAction}>{actionLabel}</Btn></div>
      )}
    </div>
  );
}

// ── Avatar (2026-07 UI pass) ─────────────────────────────────────────────────
// Deterministic-color initials avatar for contacts/owners.
const AVATAR_COLORS = ['#d96b3a', '#2c5d8a', '#2f7d5f', '#b48a1e', '#7c3d8f', '#3a7d44', '#8a5c2c', '#5c2c8a'];
export function Avatar({ name = '', size = 28, sx = {} }) {
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color + '22', color, border: `1px solid ${color}40`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: SANS, fontSize: size * 0.38, fontWeight: 700, letterSpacing: '.02em',
      ...sx,
    }}>
      {initials}
    </span>
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
      // iOS FIX (§1.2): include audio/mp4 — it's the ONLY format iPhone Safari
      // supports; without it the blob was mislabeled as webm and transcription
      // failed server-side.
      const mimes  = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'];
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


