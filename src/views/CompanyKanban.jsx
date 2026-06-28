import { useState, useEffect, useRef } from 'react';
import { C, SERIF, SANS, MONO, prBg, prFg } from '../constants.js';
import { Eyebrow, Btn, Tag, Inp, FR, Sel, useConfirm } from '../components/UI.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { getAppState, setAppState } from '../api.js';
import { NotesList, LinksList, Collapsible } from '../components/CardExtras.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// CompanyKanban — generic, editable, persisted "business profile" board.
// Each card is a business/prospect with website, socials, notes and priority.
// Cards can be added, edited, deleted, and dragged between lanes. State is
// persisted server-side via the app_state KV store (key: kanban:<slug>).
// ─────────────────────────────────────────────────────────────────────────────

const LANES = ['Lead', 'Contacted', 'In Talks', 'Active', 'Closed'];

const LANE_STYLE = {
  'Lead':      { hBg: C.ink5, hFg: '#fff', border: C.ink5 },
  'Contacted': { hBg: C.blu,  hFg: '#fff', border: C.blu  },
  'In Talks':  { hBg: C.yel,  hFg: '#fff', border: C.yel  },
  'Active':    { hBg: C.grn,  hFg: '#fff', border: C.grn  },
  'Closed':    { hBg: C.acc,  hFg: '#fff', border: C.acc  },
};

const PRIORITY_OPTIONS = ['', 'High', 'Medium', 'Low'];

function makeId() { return 'k' + Math.random().toString(36).slice(2, 10); }

function sampleCards(name) {
  return [
    { id: makeId(), lane: 'Lead',      name: 'Sample Business (delete me)', url: 'https://example.com', instagram: '@samplebiz', tiktok: '', linkedin: '', notes: 'This is a sample card — edit or delete it.', priority: 'Medium' },
    { id: makeId(), lane: 'Contacted', name: 'Another Prospect',            url: '', instagram: '', tiktok: '@prospect', linkedin: '', notes: 'Reached out via email.', priority: 'Low' },
  ];
}

// ── Card ─────────────────────────────────────────────────────────────────────
function KanbanCard({ card, onClick, onDragStart, onDelete }) {
  const socials = [
    card.instagram && { label: 'IG', val: card.instagram },
    card.tiktok    && { label: 'TT', val: card.tiktok },
    card.linkedin  && { label: 'IN', val: card.linkedin },
  ].filter(Boolean);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: '#fff', border: `1px solid ${C.cr2}`, borderRadius: 8,
        padding: '10px 12px', cursor: 'grab', userSelect: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'box-shadow .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9, lineHeight: 1.3, marginBottom: 4 }}>
          {card.name || 'Untitled'}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(card); }}
          title="Delete card"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {card.url && (
        <a href={card.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: C.blu, marginBottom: 6, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.url.replace(/^https?:\/\//, '')}
        </a>
      )}

      {socials.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {socials.map(s => (
            <span key={s.label} style={{ fontFamily: MONO, fontSize: 9, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 5, padding: '1px 6px', color: C.ink5 }}>
              {s.label} {s.val}
            </span>
          ))}
        </div>
      )}

      {card.notes && (
        <div style={{ fontSize: 11, color: C.ink5, lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {card.notes}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {card.priority && <Tag bg={prBg(card.priority)} fg={prFg(card.priority)}>{card.priority}</Tag>}
        {(card.noteList || []).length > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>📝 {card.noteList.length}</span>
        )}
        {(card.links || []).length > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>🔗 {card.links.length}</span>
        )}
      </div>
    </div>
  );
}

// ── Lane column ──────────────────────────────────────────────────────────────
function LaneColumn({ lane, cards, dragOverLane, onCardClick, onDragStart, onDragOver, onDrop, onDragLeave, onAddCard, onDelete }) {
  const st = LANE_STYLE[lane] || LANE_STYLE['Lead'];
  const isOver = dragOverLane === lane;
  return (
    <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px', borderRadius: '8px 8px 0 0', background: st.hBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: st.hFg }}>{lane}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,255,255,.18)', color: st.hFg, padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
          <button onClick={() => onAddCard(lane)} title="Add card" style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: st.hFg, borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0 }}>+</button>
        </div>
      </div>
      <div
        onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
        style={{
          flex: 1, overflowY: 'auto', padding: '7px 6px',
          background: isOver ? `${st.hBg}22` : C.bg2,
          border: `1px solid ${isOver ? st.border : C.cr2}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 120, transition: 'background .15s, border-color .15s',
        }}
      >
        {cards.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: MONO, opacity: isOver ? .3 : .6 }}>Drop here</div>
        ) : cards.map(c => (
          <KanbanCard key={c.id} card={c} onClick={() => onCardClick(c)} onDragStart={e => onDragStart(e, c)} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ── Add / Edit modal ─────────────────────────────────────────────────────────
function CardModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const textarea = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
    color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,20,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9, marginBottom: 16 }}>
          {initial._isNew ? 'Add Business' : 'Edit Business'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <FR label="Business Name *"><Inp value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Co." /></FR>
          <FR label="Website"><Inp value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://…" /></FR>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FR label="Instagram"><Inp value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@handle" /></FR>
            <FR label="TikTok"><Inp value={form.tiktok} onChange={e => set('tiktok', e.target.value)} placeholder="@handle" /></FR>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FR label="LinkedIn"><Inp value={form.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/…" /></FR>
            <FR label="Priority">
              <Sel value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p || '— None —'}</option>)}
              </Sel>
            </FR>
          </div>
          <FR label="Lane">
            <Sel value={form.lane} onChange={e => set('lane', e.target.value)}>{LANES.map(l => <option key={l}>{l}</option>)}</Sel>
          </FR>
          <FR label="Summary">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Quick summary, next steps…" style={textarea} />
          </FR>

          <Collapsible title="Notes Log" icon="📝" count={(form.noteList || []).length}>
            <NotesList notes={form.noteList || []} onChange={v => set('noteList', v)} />
          </Collapsible>
          <Collapsible title="Links" icon="🔗" count={(form.links || []).length}>
            <LinksList links={form.links || []} onChange={v => set('links', v)} namePlaceholder="Label" urlPlaceholder="https://… (drive, deck, doc)" />
          </Collapsible>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn v="gho" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { if (!form.name.trim()) return; onSave(form); }} disabled={!form.name.trim()}>
            {initial._isNew ? 'Add' : 'Save'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Mobile board ─────────────────────────────────────────────────────────────
function MobileBoard({ byLane, onCardClick, onAddCard, onDelete }) {
  const first = LANES.find(l => (byLane[l] || []).length > 0) || LANES[0];
  const [activeLane, setActiveLane] = useState(first);
  const cards = byLane[activeLane] || [];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
        {LANES.map(l => {
          const active = l === activeLane; const sty = LANE_STYLE[l]; const cnt = (byLane[l] || []).length;
          return (
            <button key={l} onClick={() => setActiveLane(l)} style={{
              flex: '0 0 auto', background: active ? sty.hBg : C.bg, color: active ? sty.hFg : C.ink5,
              border: `1px solid ${active ? sty.border : C.cr3}`, borderRadius: 999, padding: '6px 12px',
              fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {l}<span style={{ background: active ? 'rgba(255,255,255,.22)' : C.cr2, color: active ? sty.hFg : C.ink3, fontSize: 10, padding: '1px 6px', borderRadius: 99 }}>{cnt}</span>
            </button>
          );
        })}
      </div>
      <Btn onClick={() => onAddCard(activeLane)} sx={{ marginBottom: 10 }}>+ Add to {activeLane}</Btn>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 10 }}>No businesses in {activeLane}</div>
        ) : cards.map(c => <KanbanCard key={c.id} card={c} onClick={() => onCardClick(c)} onDragStart={() => {}} onDelete={onDelete} />)}
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function CompanyKanban({ slug, companyName, user, showToast }) {
  const isMobile = useIsMobile();
  const isAdmin  = user?.isAdmin || user?.roles?.includes('admin') || (user?.email || '').endsWith('@onevibemediagroup.com');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { card } | null
  const [search, setSearch] = useState('');
  const [dragOverLane, setDragOverLane] = useState(null);
  const dragCard = useRef(null);
  const [confirmNode, confirm] = useConfirm();

  const KEY = `kanban:${slug}`;
  const didLoad = useRef(false);

  // Load from server on mount
  useEffect(() => {
    let alive = true;
    didLoad.current = false;
    (async () => {
      try {
        const { data } = await getAppState(KEY);
        if (alive) setCards(Array.isArray(data) ? data : sampleCards(companyName));
      } catch {
        if (alive) setCards(sampleCards(companyName));
      } finally {
        if (alive) { setLoading(false); didLoad.current = true; }
      }
    })();
    return () => { alive = false; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on change — only after load so we never overwrite server data on mount.
  useEffect(() => {
    if (didLoad.current) setAppState(KEY, cards).catch(() => {});
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = cards.filter(c => {
    if (!search) return true;
    const hay = [c.name, c.notes, c.url, c.instagram, c.tiktok, c.linkedin].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(search.toLowerCase());
  });
  const byLane = Object.fromEntries(LANES.map(l => [l, []]));
  filtered.forEach(c => { (byLane[c.lane] || byLane[LANES[0]]).push(c); });

  const handleDragStart = (e, card) => { dragCard.current = card; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, lane) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverLane(lane); };
  const handleDrop = (e, targetLane) => {
    e.preventDefault(); setDragOverLane(null);
    const card = dragCard.current;
    if (!card || card.lane === targetLane) return;
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, lane: targetLane } : c));
    dragCard.current = null;
  };

  const openNew = (lane = LANES[0]) => setModal({ card: { _isNew: true, id: makeId(), lane, name: '', url: '', instagram: '', tiktok: '', linkedin: '', notes: '', priority: '' } });
  const openEdit = card => setModal({ card: { ...card } });
  const saveCard = (form) => {
    const { _isNew, ...clean } = form;
    setCards(prev => _isNew ? [...prev, clean] : prev.map(c => c.id === clean.id ? clean : c));
    setModal(null);
  };
  const deleteCard = (card) => confirm({
    itemName: card.name || 'this business',
    confirmLabel: 'Delete',
    onConfirm: () => setCards(prev => prev.filter(c => c.id !== card.id)),
  });

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 12 }}>Loading board…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {confirmNode}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <Eyebrow>{companyName}</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
            Business Board
          </h1>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, marginTop: 6 }}>{cards.length} businesses tracked</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" sx={{ width: isMobile ? '100%' : 200 }} />
          {isAdmin && <Btn onClick={() => openNew()}>+ Add</Btn>}
        </div>
      </div>

      {isMobile ? (
        <MobileBoard byLane={byLane} onCardClick={openEdit} onAddCard={openNew} onDelete={deleteCard} />
      ) : (
        <div style={{ overflowX: 'auto', flex: 1, paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {LANES.map(lane => (
              <LaneColumn
                key={lane}
                lane={lane}
                cards={byLane[lane] || []}
                dragOverLane={dragOverLane}
                onCardClick={openEdit}
                onDragStart={handleDragStart}
                onDragOver={e => handleDragOver(e, lane)}
                onDrop={e => handleDrop(e, lane)}
                onDragLeave={() => setDragOverLane(null)}
                onAddCard={openNew}
                onDelete={deleteCard}
              />
            ))}
          </div>
        </div>
      )}

      {modal && (
        <CardModal initial={modal.card} onSave={saveCard} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
