import { useState } from 'react';
import { C, SANS, MONO } from '../constants.js';
import { Btn, Inp } from './UI.jsx';

// Shared rich-card building blocks used by the kanban card drawers:
//   <NotesList>     — multiple timestamped notes (add / delete)
//   <LinksList>     — multiple name+URL links (add / delete), e.g. data rooms,
//                     decks, branding assets, logos, Google Drive folders
//   <Collapsible>   — a toggle-dropdown section wrapper

function genId() { return 'x' + Math.random().toString(36).slice(2, 9); }

function fmtWhen(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

const LABEL = { fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 };

// ── Multiple timestamped notes ─────────────────────────────────────────────────
export function NotesList({ notes = [], onChange, authorName = '' }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([{ id: genId(), text: t, ts: Date.now(), author: authorName }, ...notes]);
    setText('');
  };
  const remove = (id) => onChange(notes.filter(n => n.id !== id));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
          rows={2}
          placeholder="Add a note… (⌘/Ctrl+Enter to save)"
          style={{
            flex: 1, boxSizing: 'border-box', padding: '8px 10px',
            border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
            color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
          }}
        />
        <Btn onClick={add} disabled={!text.trim()} sx={{ padding: '6px 12px', fontSize: 12, alignSelf: 'flex-start' }}>+ Note</Btn>
      </div>
      {notes.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg, border: `1px dashed ${C.cr3}`, borderRadius: 6 }}>
          No notes yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notes.map(n => (
            <div key={n.id} style={{ padding: '9px 11px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, color: C.ink8, fontFamily: SANS, lineHeight: 1.5, whiteSpace: 'pre-wrap', flex: 1 }}>{n.text}</div>
                <button onClick={() => remove(n.id)} title="Delete note"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ ...LABEL, marginTop: 5, fontSize: 8 }}>
                {fmtWhen(n.ts)}{n.author ? ` · ${n.author}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Multiple name+URL links ────────────────────────────────────────────────────
export function LinksList({ links = [], onChange, icon = '🔗', namePlaceholder = 'Label', urlPlaceholder = 'https://…' }) {
  const [name, setName] = useState('');
  const [url, setUrl]   = useState('');
  const add = () => {
    if (!name.trim() || !url.trim()) return;
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    onChange([...links, { id: genId(), name: name.trim(), url: u }]);
    setName(''); setUrl('');
  };
  const remove = (id) => onChange(links.filter(l => l.id !== id));

  return (
    <div>
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {links.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: C.blu, textDecoration: 'none', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.name}
              </a>
              <button onClick={() => remove(l.id)} title="Remove link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <Inp value={name} onChange={e => setName(e.target.value)} placeholder={namePlaceholder} sx={{ flex: '0 0 38%', fontSize: 12, padding: '6px 8px' }} />
        <Inp value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder={urlPlaceholder} sx={{ flex: 1, fontSize: 12, padding: '6px 8px' }} />
        <Btn onClick={add} disabled={!name.trim() || !url.trim()} sx={{ padding: '6px 12px', fontSize: 12 }}>+ Add</Btn>
      </div>
    </div>
  );
}

// ── Toggle-dropdown section ────────────────────────────────────────────────────
export function Collapsible({ title, icon, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${C.cr2}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: C.bg2, border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, color: C.ink3, transition: 'transform .15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span style={{ ...LABEL, flex: 1, color: C.ink7 }}>{title}</span>
        {count != null && <span style={{ fontFamily: MONO, fontSize: 10, background: C.cr2, color: C.ink5, padding: '1px 7px', borderRadius: 99 }}>{count}</span>}
      </button>
      {open && <div style={{ padding: '12px', background: C.bg }}>{children}</div>}
    </div>
  );
}
