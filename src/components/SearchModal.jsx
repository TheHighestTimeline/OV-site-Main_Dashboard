import { useState, useEffect, useMemo, useRef } from 'react';
import { C, SERIF, SANS, MONO, toggleTheme } from '../constants.js';
import { Spinner } from './UI.jsx';
import { getContacts, getTasks, getOpportunities, listResources } from '../api.js';
import { COMPANIES, COMPANY_META } from '../constants/roles.js';

// ── Global search / Cmd-K (2026-07 audit §5.3) ───────────────────────────────
// One search box over Contacts, Tasks, Opportunities, Documents and References.
// Data loads once per open (parallel, cached 5 min) and filters client-side,
// so typing is instant. Documents/References with links open directly; other
// results jump to their view.

let _cache = null;
let _cacheAt = 0;

async function loadAll() {
  if (_cache && Date.now() - _cacheAt < 5 * 60 * 1000) return _cache;
  const [contacts, tasks, opps, resources, documents] = await Promise.all([
    getContacts().catch(() => []),
    getTasks().catch(() => []),
    getOpportunities().catch(() => []),
    listResources().catch(() => ({ resources: [] })),
    fetch('/.netlify/functions/documents-list', {
      headers: { Authorization: `Bearer ${await window.Clerk?.session?.getToken()}` },
    }).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  _cache = {
    contacts:  Array.isArray(contacts) ? contacts : [],
    tasks:     Array.isArray(tasks) ? tasks : [],
    opps:      Array.isArray(opps) ? opps : [],
    resources: Array.isArray(resources) ? resources : (resources?.resources || []),
    documents: Array.isArray(documents) ? documents : [],
  };
  _cacheAt = Date.now();
  return _cache;
}

const GROUPS = [
  { key: 'contacts',  label: 'Contacts',      icon: '◉' },
  { key: 'tasks',     label: 'Tasks',         icon: '▤' },
  { key: 'opps',      label: 'Opportunities', icon: '◆' },
  { key: 'documents', label: 'Documents',     icon: '◫' },
  { key: 'resources', label: 'References',    icon: '⊞' },
];

function matchText(item, group) {
  switch (group) {
    case 'contacts':  return [item.name, item.company, item.email, item.role].filter(Boolean).join(' ');
    case 'tasks':     return [item.task || item.name, item.owner, item.status].filter(Boolean).join(' ');
    case 'opps':      return [item.name, item.stage, ...(item.dealCategory || [])].filter(Boolean).join(' ');
    case 'documents': return [item.name, item.type, item.entity].filter(Boolean).join(' ');
    case 'resources': return [item.title || item.name, item.url, item.category, item.company].filter(Boolean).join(' ');
    default:          return '';
  }
}

function primaryLabel(item, group) {
  if (group === 'commands') return item.label;
  switch (group) {
    case 'contacts':  return item.name;
    case 'tasks':     return item.task || item.name;
    case 'opps':      return item.name;
    case 'documents': return item.name;
    case 'resources': return item.title || item.name;
    default:          return '';
  }
}

function secondaryLabel(item, group) {
  if (group === 'commands') return item.hint || '';
  switch (group) {
    case 'contacts':  return [item.company, item.role].filter(Boolean).join(' · ');
    case 'tasks':     return [item.status, item.owner].filter(Boolean).join(' · ');
    case 'opps':      return [item.stage, (item.dealCategory || [])[0]].filter(Boolean).join(' · ');
    case 'documents': return [item.type, item.entity].filter(Boolean).join(' · ');
    case 'resources': return item.url || item.category || '';
    default:          return '';
  }
}

export default function SearchModal({ onClose, setView }) {
  const [q, setQ]           = useState('');
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const inputRef            = useRef(null);

  useEffect(() => {
    loadAll().then(setData).catch(e => setError(e.message));
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // ── Commands (2026-07 UI pass): ⌘K doubles as a command palette ────────────
  const commands = useMemo(() => ([
    { id: 'go-overview', label: 'Go to Overview',  hint: 'g o', run: () => setView('overview') },
    { id: 'go-myday',    label: 'Go to My Day',    hint: 'g m', run: () => setView('my-day') },
    { id: 'go-tasks',    label: 'Go to Tasks',     hint: 'g t', run: () => setView('tasks') },
    { id: 'go-kanban',   label: 'Go to Kanban',    hint: 'g k', run: () => setView('kanban') },
    { id: 'go-contacts', label: 'Go to Contacts',  hint: 'g c', run: () => setView('contacts') },
    { id: 'go-review',   label: 'Go to Review',    hint: 'g r', run: () => setView('review') },
    { id: 'go-settings', label: 'Go to Settings',  hint: '',    run: () => setView('settings') },
    { id: 'theme',       label: 'Toggle dark mode', hint: '',   run: () => toggleTheme() },
    ...COMPANIES.map(s => ({
      id: `hub-${s}`, label: `Open ${COMPANY_META[s]?.label || s} hub`, hint: '⌂',
      color: COMPANY_META[s]?.color_hex,
      run: () => setView(`company:${s}:hq`),
    })),
  ]), [setView]);

  const results = useMemo(() => {
    if (!data || q.trim().length < 2) return null;
    const needle = q.trim().toLowerCase();
    const out = [];
    const cmdHits = commands.filter(c => c.label.toLowerCase().includes(needle)).slice(0, 5);
    if (cmdHits.length) out.push({ key: 'commands', label: 'Commands', icon: '⌘', hits: cmdHits });
    for (const g of GROUPS) {
      const hits = (data[g.key] || [])
        .filter(item => matchText(item, g.key).toLowerCase().includes(needle))
        .slice(0, 6);
      if (hits.length) out.push({ ...g, hits });
    }
    return out;
  }, [data, q, commands]);

  const open = (item, group) => {
    if (group === 'commands') { item.run(); onClose(); return; }
    // Documents & references with a link open directly — fastest path to a file.
    const url = group === 'documents' ? item.driveLink : group === 'resources' ? item.url : null;
    if (url) { window.open(url, '_blank', 'noopener'); onClose(); return; }
    const viewFor = { contacts: 'contacts', tasks: 'tasks', opps: 'kanban' };
    if (viewFor[group]) { setView(viewFor[group], { search: primaryLabel(item, group) }); }
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 280 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.45)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', margin: '10vh auto 0', width: 'min(620px, calc(100% - 24px))',
        background: C.bg, borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.35)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.cr2}` }}>
          <span style={{ fontFamily: SERIF, color: C.acc, fontSize: 16 }}>◎</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search contacts, tasks, deals, documents, links…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: SANS, fontSize: 16, color: C.ink9 }}
          />
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '2px 6px' }}>ESC</span>
        </div>

        <div style={{ overflowY: 'auto', padding: '6px 8px 12px' }}>
          {!data && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 18, color: C.ink3, fontSize: 12 }}>
              <Spinner size={16} /> Loading index…
            </div>
          )}
          {error && <div style={{ padding: 18, color: C.red, fontSize: 12 }}>Search unavailable: {error}</div>}
          {data && q.trim().length < 2 && (
            <div style={{ padding: 18, color: C.ink3, fontSize: 12 }}>Type at least 2 characters…</div>
          )}
          {results && results.length === 0 && (
            <div style={{ padding: 18, color: C.ink3, fontSize: 12 }}>No matches for “{q}”.</div>
          )}
          {results && results.map(g => (
            <div key={g.key} style={{ marginTop: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, padding: '4px 10px' }}>
                {g.icon} {g.label}
              </div>
              {g.hits.map(item => (
                <button
                  key={item.id || primaryLabel(item, g.key)}
                  onClick={() => open(item, g.key)}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
                    padding: '9px 12px', border: 'none', borderRadius: 8, textAlign: 'left',
                    background: 'transparent', cursor: 'pointer', fontFamily: SANS,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 13.5, color: C.ink9, fontWeight: 500, flexShrink: 0, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {primaryLabel(item, g.key)}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {secondaryLabel(item, g.key)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
