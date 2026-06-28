// ════════════════════════════════════════════════════════════════════════════
// OneVibe SOCIAL — Clients dashboard
// Multi-client social media manager. Notion-backed clients, Anthropic-powered
// campaign builder, calendar + approvals + analytics. Falls back to sample
// data when backend isn't wired so the tab is always usable.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo, Component } from 'react';
import BrandPortfolio    from '../components/social/BrandPortfolio.jsx';
import ContentComposer   from '../components/social/ContentComposer.jsx';
import ExistingContent, { CsvImportModal } from '../components/social/ExistingContent.jsx';
import ClientCalendar    from '../components/social/ClientCalendar.jsx';
import DriveAssets       from '../components/social/DriveAssets.jsx';
import AdManager         from '../components/social/AdManager.jsx';
import { upsertClientPlatform, listClientPlatforms } from '../api.js';

// ── Design tokens (Linear/Notion/Anthropic console aesthetic) ───────────────
const T = {
  ink9: '#0e1014', ink8: '#161922', ink7: '#1f232e', ink6: '#252a36',
  ink5: '#3a4050', ink3: '#6b7180', ink2: '#a6abb8', ink1: '#d1d5db',
  fg:   '#f0ede8',
  acc:  '#d96b3a', accD: '#a04b22',
  grn:  '#22c58b', red: '#f25c5c', amb: '#f5a623', pur: '#9b6dff', blu: '#4d9fff',
};
const SERIF = "'Fraunces',Georgia,serif";
const SANS  = "'Geist',system-ui,sans-serif";
const MONO  = "'Geist Mono',monospace";

const PLAT = {
  instagram: { label: 'Instagram', color: '#e1306c', icon: '◉' },
  tiktok:    { label: 'TikTok',    color: '#69c9d0', icon: '◈' },
  facebook:  { label: 'Facebook',  color: '#4f87f5', icon: '◇' },
  youtube:   { label: 'YouTube',   color: '#ff4444', icon: '▶' },
  threads:   { label: 'Threads',   color: '#9ca3af', icon: '◎' },
};
const PLAT_LIST = ['instagram','tiktok','facebook','youtube','threads'];

const STATUS_META = {
  draft:          { label: 'Draft',     color: T.ink3 },
  pending_review: { label: 'In Review', color: T.amb  },
  approved:       { label: 'Approved',  color: T.blu  },
  scheduled:      { label: 'Scheduled', color: T.pur  },
  posted:         { label: 'Posted',    color: T.grn  },
  failed:         { label: 'Failed',    color: T.red  },
};

const CAMPAIGN_TYPES = [
  { id: 'launch',     label: 'Launch',           desc: 'New product or release' },
  { id: 'awareness',  label: 'Awareness',        desc: 'Brand visibility push'  },
  { id: 'engagement', label: 'Engagement',       desc: 'Community + interaction' },
  { id: 'promo',      label: 'Sale / Promo',     desc: 'Offer-driven push' },
  { id: 'story',      label: 'Storytelling',     desc: 'Narrative + brand depth' },
  { id: 'bts',        label: 'Behind-the-Scenes', desc: 'Process + authenticity' },
];
const DURATIONS = [
  { id: '1w', label: '1 Week',   posts: 7,  days: 7  },
  { id: '2w', label: '2 Weeks',  posts: 12, days: 14 },
  { id: '1m', label: '1 Month',  posts: 18, days: 30 },
  { id: '3m', label: '3 Months', posts: 24, days: 90 },
];

// ── Sample data (fallback so the tab works before Notion is wired) ──────────
const SAMPLE_CLIENTS = [
  { id: 'c1', name: 'Acme Coffee Co', genre: 'Food & Beverage', color: '#d96b3a', initials: 'AC',
    handles: { instagram: '@acmecoffee', tiktok: '@acme.coffee', facebook: 'AcmeCoffee' },
    followers: { instagram: '18.4K', tiktok: '31.2K', facebook: '9.8K' },
    bio: 'Specialty coffee roasters from Portland, OR. Single-origin beans from 12 countries.',
    brandVoice: 'Warm, approachable, passionate. Casual but knowledgeable. Never pretentious. Short sentences. Coffee metaphors welcome.',
    targetAudience: 'Coffee enthusiasts 25–45, urban professionals, home baristas, sustainability-conscious consumers.',
    dos: ['Sensory language (aroma, taste, texture)','Share origin stories','Encourage community','Educational brewing content'],
    donts: ['Never use "java" unironically','No corporate-speak','Avoid over-promoting discounts'],
    brandColors: ['#d96b3a','#6b4423','#f5e6d3','#2c1810'],
    platforms: ['instagram','tiktok','facebook'] },
  { id: 'c2', name: 'Carbon Sponge', genre: 'Alt Rock', color: '#9b6dff', initials: 'CS',
    handles: { instagram: '@carbonsponge', tiktok: '@carbonsponge', youtube: 'CarbonSpongeOfficial' },
    followers: { instagram: '42.1K', tiktok: '89.7K', youtube: '24.3K' },
    bio: 'Alt-rock band from LA. Genre-bending sound fusing grunge nostalgia with electronic textures.',
    brandVoice: 'Raw, authentic, slightly cryptic. Lowercase preferred. Short punchy lines. Lyric fragments.',
    targetAudience: 'Music fans 18–35, alt-rock and indie listeners, concert-goers, vinyl collectors.',
    dos: ['Lowercase aesthetic','Lyric fragments','Cryptic image captions','Tour date drops'],
    donts: ['No exclamation marks','Never beg for streams','No corporate language'],
    brandColors: ['#9b6dff','#0e1014','#f25c5c','#252a36'],
    platforms: ['instagram','tiktok','youtube'] },
  { id: 'c3', name: 'Maya Soleil', genre: 'R&B / Soul', color: '#f5a623', initials: 'MS',
    handles: { instagram: '@mayasoleil', tiktok: '@maya.soleil', facebook: 'MayaSoleilMusic' },
    followers: { instagram: '12.8K', tiktok: '24.6K', facebook: '4.3K' },
    bio: 'Independent R&B artist blending neo-soul with modern production.',
    brandVoice: 'Intimate, poetic, emotionally honest. Vulnerability is strength.',
    targetAudience: 'R&B fans 22–40, neo-soul appreciators, emotional-music listeners.',
    dos: ['Lyric callouts','Emotional honesty','Studio process shots'],
    donts: ['Avoid clichés','No over-promotion'],
    brandColors: ['#f5a623','#6b4423','#f0ede8','#2c1810'],
    platforms: ['instagram','tiktok','facebook'] },
  { id: 'c4', name: 'Dante Cruz', genre: 'Latin Trap', color: '#22c58b', initials: 'DC',
    handles: { instagram: '@dantecruz', tiktok: '@dante.cruz', youtube: 'DanteCruzTV' },
    followers: { instagram: '56.7K', tiktok: '128K', youtube: '18.4K' },
    bio: 'Latin trap artist from Miami. Bilingual content for a bicultural audience.',
    brandVoice: 'High energy, confident, bilingual (ES/EN). Street credibility with crossover appeal.',
    targetAudience: 'Latin trap fans 16–30, bilingual youth, Miami-culture followers.',
    dos: ['Mix ES/EN','High energy','Studio + lifestyle content','Bilingual hooks'],
    donts: ['No watered-down translations','Avoid generic captions'],
    brandColors: ['#22c58b','#0e1014','#d96b3a','#f0ede8'],
    platforms: ['instagram','tiktok','youtube'] },
];

const SAMPLE_AI_RESPONSES = {
  c1: [
    'New micro-lot Ethiopia just landed. Notes of blueberry and bergamot. Floral, bright, unforgettable.',
    'Pour-over Sunday at the roastery. Walk-ins welcome. Bring your questions.',
    'The bag tells you the altitude. The cup tells you the story.',
  ],
  c2: [
    'rehearsal room. 4am. something\'s working.',
    'new track friday. it\'s not what you expect.',
    'lyric drop. find the rest in the bio.',
  ],
  c3: [
    'wrote this one at 3am. some songs need that hour to exist.',
    'studio mood: candles, headphones, and one verse on repeat.',
    'soft launch of the next single. listen with someone you love.',
  ],
  c4: [
    'Estudio toda la noche. New heat dropping soon. 🔥',
    'From the block to the booth. Miami, esto es para ti.',
    'New visual coming. Bilingual hooks, global energy. Vamos.',
  ],
};

// ── extractJSON: tolerates markdown fences + stray prose ────────────────────
function extractJSON(raw) {
  if (!raw) return null;
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : raw).trim();
  try { return JSON.parse(body); } catch {}
  const start = body.indexOf('{');
  const startA = body.indexOf('[');
  const i = (start === -1) ? startA : (startA === -1 ? start : Math.min(start, startA));
  if (i < 0) return null;
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (end <= i) return null;
  try { return JSON.parse(body.slice(i, end + 1)); } catch { return null; }
}

// ── API helper (Clerk JWT auth) ─────────────────────────────────────────────
async function getToken() {
  try { return (await window.Clerk?.session?.getToken?.()) ?? null; } catch { return null; }
}
async function api(path, opts = {}) {
  const token = await getToken();
  const res = await fetch(`/.netlify/functions/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Shared style helpers ────────────────────────────────────────────────────
const tag = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 999,
  background: color + '20', color, fontSize: 10, fontFamily: MONO, letterSpacing: '.04em',
});
const inputStyle = {
  background: T.ink7, border: `1px solid ${T.ink5}`, borderRadius: 8,
  color: T.fg, fontFamily: SANS, fontSize: 13, padding: '8px 11px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btn = (variant = 'primary', extra = {}) => ({
  padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
  fontFamily: MONO, fontSize: 11, letterSpacing: '.04em', fontWeight: 600,
  transition: 'all .15s', ...({
    primary: { background: T.acc, color: T.ink9 },
    ghost:   { background: 'transparent', color: T.ink2, border: `1px solid ${T.ink5}` },
    success: { background: T.grn, color: T.ink9 },
    danger:  { background: T.red, color: T.fg },
    purple:  { background: T.pur, color: T.fg },
  }[variant]), ...extra,
});

// ── Relative time ───────────────────────────────────────────────────────────
function fmtRel(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ════════════════════════════════════════════════════════════════════════════
// Error boundary — never let this view white-screen the whole app again.
// ════════════════════════════════════════════════════════════════════════════
class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[SOCIAL]', err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: T.ink9, color: T.fg, fontFamily: SANS, padding: 40 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 40, color: T.amb, marginBottom: 14 }}>⚠</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, margin: '0 0 8px' }}>Something broke in this view</h2>
          <p style={{ fontSize: 13, color: T.ink2, marginBottom: 14 }}>{String(this.state.err?.message || this.state.err)}</p>
          <button onClick={() => this.setState({ err: null })} style={btn('primary')}>Try again</button>
        </div>
      </div>
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
function SocialInner({ user, showToast }) {
  const [view, setView]       = useState('roster'); // roster | detail | campaign | calendar | approvals | analytics
  const [clients, setClients] = useState([]);
  const [selectedId, setSel]  = useState(null);
  const [posts, setPosts]     = useState([]);
  const [usingSample, setUS]  = useState(false);

  // modals
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPrefill, setCP]        = useState(null);
  const [onboardOpen, setOnboardOpen]   = useState(false);
  const [previewPostId, setPPI]         = useState(null);

  // right-panel chat
  const [messages, setMessages]   = useState([{ role: 'assistant', content: "Hey Tanner — I'm your OneVibe Social AI. Pick a client and tell me what you need. I'll write captions, build campaigns, schedule posts, and keep everything on-brand." }]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef(null);

  const selected = clients.find(c => c.id === selectedId) || null;
  const previewPost = posts.find(p => p.id === previewPostId) || null;

  // ── Load clients on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('artists-list');
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (Array.isArray(data?.clients) ? data.clients : []);
        if (list.length > 0) {
          setClients(list);
          setSel(list[0].id);
        } else {
          // Empty backend → fall back to sample data so the tab is usable
          setClients(SAMPLE_CLIENTS);
          setSel(SAMPLE_CLIENTS[0].id);
          setUS(true);
        }
      } catch (e) {
        if (cancelled) return;
        setClients(SAMPLE_CLIENTS);
        setSel(SAMPLE_CLIENTS[0].id);
        setUS(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load posts when client changes ──
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`posts-list?client_id=${encodeURIComponent(selectedId)}`);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        if (list.length > 0) setPosts(list);
        else setPosts(generateSamplePosts(selectedId));
      } catch {
        if (!cancelled) setPosts(generateSamplePosts(selectedId));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Helpers ──
  const totalPending = posts.filter(p => p.status === 'pending_review').length;

  function selectClient(id) { setSel(id); setView('detail'); }
  function openComposer(prefill = null) { setCP(prefill); setComposerOpen(true); }

  // Delete (archive) a client. Backed by artists-delete (Notion archive). The
  // caller (Detail) handles the "are you sure?" gating before invoking this.
  async function deleteClient(id) {
    // Demo/sample clients aren't real Notion pages — just drop them locally so
    // the action doesn't 500 against a non-existent page id.
    if (usingSample) {
      setClients(prev => { const next = prev.filter(c => c.id !== id); setSel(next[0]?.id || null); return next; });
      setView('roster');
      showToast?.('Client removed');
      return;
    }
    try {
      await api('artists-delete', { method: 'POST', body: JSON.stringify({ id }) });
      setClients(prev => {
        const next = prev.filter(c => c.id !== id);
        setSel(next[0]?.id || null);
        return next;
      });
      setView('roster');
      showToast?.('Client deleted');
    } catch (e) {
      showToast?.('Delete failed: ' + e.message);
    }
  }

  // ── AI chat ──
  async function sendMsg(text) {
    const msg = (text || chatInput).trim();
    if (!msg || aiLoading) return;
    setChatInput('');
    const next = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setAiLoading(true);
    try {
      const data = await api('social-ai', {
        method: 'POST',
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          client: selected ? { name: selected.name, genre: selected.genre, brandVoice: selected.brandVoice, dos: selected.dos, donts: selected.donts, targetAudience: selected.targetAudience } : null,
        }),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'No response.' }]);
    } catch {
      // Fallback to per-client mock pool
      const pool = (selected && SAMPLE_AI_RESPONSES[selected.id]) || ['I can help with captions, hashtags, scheduling — pick a client to get started.'];
      const reply = pool[Math.floor(Math.random() * pool.length)];
      await new Promise(r => setTimeout(r, 700 + Math.random() * 600));
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    }
    setAiLoading(false);
  }

  // ── Post status updates ──
  function updatePostStatus(postId, status) {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p));
    api('posts-update', { method: 'PATCH', body: JSON.stringify({ id: postId, status }) }).catch(() => {});
    showToast?.(`Post ${STATUS_META[status]?.label.toLowerCase() || status}`);
  }

  function addPost(post) {
    const local = { id: 'p' + Date.now() + Math.random().toString(36).slice(2,6), ...post };
    setPosts(prev => [local, ...prev]);
    api('posts-create', { method: 'POST', body: JSON.stringify(local) }).catch(() => {});
    return local;
  }
  function addPosts(list) {
    const locals = list.map((p, i) => ({ id: 'p' + Date.now() + i + Math.random().toString(36).slice(2,4), ...p }));
    setPosts(prev => [...locals, ...prev]);
    locals.forEach(p => api('posts-create', { method: 'POST', body: JSON.stringify(p) }).catch(() => {}));
  }

  // ── Render ──
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: T.ink9, color: T.fg, fontFamily: SANS, overflow: 'hidden' }}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════ */}
      <aside style={{ width: 220, background: T.ink8, borderRight: `1px solid ${T.ink7}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${T.ink7}` }}>
          <span style={{ fontFamily: SERIF, fontSize: 22, color: T.acc, lineHeight: 1 }}>◐</span>
          <div>
            <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15, lineHeight: 1, color: T.fg }}>OneVibe</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: T.ink3, letterSpacing: '.12em', marginTop: 2 }}>SOCIAL</div>
          </div>
        </div>

        <nav style={{ padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            ['roster',    '◇', 'Clients'],
            ['campaign',  '✦', 'Campaign'],
            ['calendar',  '▤', 'Calendar'],
            ['approvals', '◈', 'Approvals'],
            ['analytics', '⊞', 'Analytics'],
          ].map(([id, icon, label]) => (
            <button key={id} onClick={() => setView(id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', border: 'none',
              background: view === id ? T.ink7 : 'transparent', color: view === id ? T.fg : T.ink2,
              fontFamily: SANS, fontSize: 13, borderRadius: 6, textAlign: 'left', cursor: 'pointer',
            }}>
              <span style={{ fontFamily: SERIF, fontSize: 13, color: view === id ? T.acc : T.ink3, width: 14 }}>{icon}</span>
              {label}
              {id === 'approvals' && totalPending > 0 && (
                <span style={{ marginLeft: 'auto', background: T.amb + '28', color: T.amb, fontSize: 9, fontFamily: MONO, padding: '1px 6px', borderRadius: 999 }}>{totalPending}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ padding: '10px 14px 4px', fontSize: 9, fontFamily: MONO, color: T.ink3, letterSpacing: '.12em' }}>CLIENTS</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px 8px' }}>
          {clients.map(c => (
            <button key={c.id} onClick={() => selectClient(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '6px 8px',
              border: 'none', background: selectedId === c.id ? T.ink7 : 'transparent',
              borderRadius: 6, textAlign: 'left', cursor: 'pointer', marginBottom: 2,
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, fontFamily: MONO, flexShrink: 0 }}>{c.initials}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: selectedId === c.id ? T.fg : T.ink2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ color: T.ink3, fontSize: 9, fontFamily: MONO, letterSpacing: '.04em' }}>{c.genre}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.ink7}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => openComposer()} style={btn('primary', { width: '100%' })}>+ New Post</button>
          <button onClick={() => setOnboardOpen(true)} style={btn('ghost', { width: '100%' })}>+ Add Client</button>
        </div>

        <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${T.ink7}` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.acc, color: T.ink9, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, fontFamily: MONO }}>
            {(user?.fullName || 'T')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: T.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || 'Tanner'}</div>
            <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.06em' }}>OVM · social</div>
          </div>
          {usingSample && <span style={{ ...tag(T.amb), fontSize: 9 }} title="Backend not wired — showing sample data">DEMO</span>}
        </div>
      </aside>

      {/* ══ MAIN ═══════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.ink9 }}>
        {view === 'roster'    && <Roster clients={clients} posts={posts} onSelect={selectClient} onAdd={() => setOnboardOpen(true)} />}
        {view === 'detail'    && selected && <Detail client={selected} posts={posts.filter(p => p.client_id === selected.id)} onBack={() => setView('roster')} onCompose={(prefill) => openComposer({ client_id: selected.id, ...prefill })} updatePostStatus={updatePostStatus} onDelete={deleteClient} showToast={showToast} />}
        {view === 'campaign'  && <CampaignBuilder clients={clients} selectedId={selectedId} onPickClient={setSel} onGenerated={(posts) => { addPosts(posts); setView('approvals'); showToast?.(`${posts.length} posts queued for review`); }} showToast={showToast} />}
        {view === 'calendar'  && <Calendar posts={posts} clients={clients} onPickPost={(id) => setPPI(id)} onAddOnDate={(d) => openComposer({ scheduled_at: d })} />}
        {view === 'approvals' && <Approvals posts={posts} clients={clients} onUpdate={updatePostStatus} onEdit={(p) => openComposer(p)} />}
        {view === 'analytics' && <Analytics posts={posts} clients={clients} />}
      </main>

      {/* ══ RIGHT PANEL — AI ASSISTANT ════════════════════════════════════ */}
      <aside style={{ width: 320, background: T.ink8, borderLeft: `1px solid ${T.ink7}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.ink7}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${T.pur}, ${T.acc})`, display: 'grid', placeItems: 'center', color: T.fg, fontSize: 13 }}>✦</div>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 14, color: T.fg, lineHeight: 1 }}>AI Assistant</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: selected ? T.grn : T.ink3, marginTop: 3, letterSpacing: '.06em' }}>
              {selected ? `${selected.name.toUpperCase()} VOICE` : 'NO CLIENT SELECTED'}
            </div>
          </div>
        </div>

        {previewPost && (
          <div style={{ padding: 12, borderBottom: `1px solid ${T.ink7}`, background: T.ink9 }}>
            <PostPreviewCard post={previewPost} client={clients.find(c => c.id === previewPost.client_id)} onClose={() => setPPI(null)} onApprove={() => { updatePostStatus(previewPost.id, 'approved'); setPPI(null); }} onReject={() => { updatePostStatus(previewPost.id, 'draft'); setPPI(null); }} />
          </div>
        )}

        <div style={{ padding: '8px 12px', display: 'flex', gap: 5, flexWrap: 'wrap', borderBottom: `1px solid ${T.ink7}` }}>
          {(selected
            ? ['Write an Instagram caption', 'Suggest 3 hashtag sets', 'Rewrite for TikTok']
            : ['Which client needs attention?', 'What content performs best?']
          ).map(q => (
            <button key={q} onClick={() => sendMsg(q)} style={{
              padding: '3px 9px', borderRadius: 999, border: `1px solid ${T.ink7}`,
              background: 'transparent', color: T.ink2, fontSize: 10, fontFamily: MONO, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{q}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role !== 'user' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: T.pur, color: T.fg, display: 'grid', placeItems: 'center', fontSize: 9 }}>✦</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: T.ink3, letterSpacing: '.06em' }}>AI</span>
                </div>
              )}
              <div style={{
                maxWidth: '90%', padding: '8px 11px',
                borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: m.role === 'user' ? T.acc : T.ink7, color: m.role === 'user' ? T.ink9 : T.fg,
                fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordWrap: 'break-word',
              }}>{m.content}</div>
            </div>
          ))}
          {aiLoading && (
            <div style={{ display: 'inline-flex', gap: 4, padding: '8px 12px', background: T.ink7, borderRadius: '12px 12px 12px 3px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.pur, animation: 'ovmPulse 1.2s infinite' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.pur, animation: 'ovmPulse 1.2s infinite .2s' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.pur, animation: 'ovmPulse 1.2s infinite .4s' }} />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: 10, borderTop: `1px solid ${T.ink7}`, display: 'flex', gap: 7 }}>
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
            placeholder={selected ? `Ask about ${selected.name}…` : 'Pick a client to start…'} rows={2}
            style={{ ...inputStyle, resize: 'none', flex: 1, fontSize: 12 }} />
          <button onClick={() => sendMsg()} disabled={aiLoading || !chatInput.trim()}
            style={{ ...btn('primary'), padding: '0 14px', opacity: (aiLoading || !chatInput.trim()) ? 0.4 : 1 }}>→</button>
        </div>
      </aside>

      {/* ══ MODALS ════════════════════════════════════════════════════════ */}
      {composerOpen && <Composer clients={clients} prefill={composerPrefill} onClose={() => setComposerOpen(false)} onSave={(p) => { addPost(p); setComposerOpen(false); showToast?.('Post saved'); }} />}
      {onboardOpen && <Onboarding onClose={() => setOnboardOpen(false)} onCreate={(c) => { setClients(prev => [...prev, c]); setOnboardOpen(false); setSel(c.id); setView('detail'); showToast?.(`${c.name} added`); }} />}

      <style>{`
        @keyframes ovmSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ovmPulse { 0%,100% { opacity: .3; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.1); } }
        @keyframes ovmFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ovmAgentGlow { 0%,100% { box-shadow: 0 0 0 1px ${T.pur}40, 0 0 18px ${T.pur}30; } 50% { box-shadow: 0 0 0 1px ${T.pur}90, 0 0 28px ${T.pur}60; } }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ROSTER
// ════════════════════════════════════════════════════════════════════════════
function Roster({ clients, posts, onSelect, onAdd }) {
  const [q, setQ] = useState('');
  const filtered = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.genre?.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: T.fg, margin: 0, letterSpacing: '-.02em' }}>Clients</h1>
          <div style={{ fontSize: 12, color: T.ink3, fontFamily: MONO, marginTop: 4, letterSpacing: '.04em' }}>{clients.length} ACTIVE</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ ...inputStyle, width: 220 }} />
          <button onClick={onAdd} style={btn('primary')}>+ Add Client</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(c => {
          const pending = posts.filter(p => p.client_id === c.id && p.status === 'pending_review').length;
          const week    = posts.filter(p => p.client_id === c.id && p.scheduled_at && new Date(p.scheduled_at) > new Date(Date.now() - 7*86400000)).length;
          return (
            <div key={c.id} onClick={() => onSelect(c.id)} style={{
              background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 12, padding: 16,
              cursor: 'pointer', transition: 'all .18s cubic-bezier(.22,1,.36,1)', animation: 'ovmFadeUp .24s ease-out',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.acc; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.ink7; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, fontFamily: MONO }}>{c.initials}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: T.fg, lineHeight: 1.1 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.ink3, fontFamily: MONO, marginTop: 2 }}>{c.genre}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                {(c.platforms || Object.keys(c.handles || {})).map(p => PLAT[p] && (
                  <span key={p} style={tag(PLAT[p].color)}>{PLAT[p].icon} {PLAT[p].label}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.ink3, fontFamily: MONO, letterSpacing: '.04em' }}>
                <div><span style={{ color: T.fg, fontWeight: 600 }}>{week}</span> THIS WEEK</div>
                <div><span style={{ color: pending > 0 ? T.amb : T.fg, fontWeight: 600 }}>{pending}</span> PENDING</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DETAIL — with full sub-tab navigation
// Sub-tabs: Brand Portfolio | New Content | Existing Content | Calendar |
//           Drive Assets | Ad Manager
// ════════════════════════════════════════════════════════════════════════════
function Detail({ client, posts, onBack, onCompose, updatePostStatus, onDelete, showToast }) {
  const [tab, setTab]   = useState('brand');
  const [edit, setEdit] = useState(client);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // Platform data for BrandPortfolio
  const [platforms, setPlatforms] = useState(null); // null = loading
  const [platLoaded, setPlatLoaded] = useState(false);

  // Load client platform data when Brand Portfolio tab opens
  useEffect(() => {
    if (tab === 'brand' && !platLoaded) {
      listClientPlatforms(client.id)
        .then(d => { setPlatforms(d.platforms || {}); setPlatLoaded(true); })
        .catch(() => { setPlatforms({}); setPlatLoaded(true); });
    }
  }, [tab, client.id, platLoaded]);

  // When client changes reset
  useEffect(() => {
    setEdit(client);
    setPlatforms(null);
    setPlatLoaded(false);
    setTab('brand');
    setConfirmDel(false);
  }, [client.id]);

  const TABS = [
    ['brand',     'Brand Portfolio'],
    ['compose',   'New Content'],
    ['scheduled', 'Scheduled Content'],
    ['content',   'Existing Content'],
    ['calendar',  'Calendar'],
    ['drive',     'Drive Assets'],
    ['ads',       'Ad Manager'],
  ];

  // Posts whose scheduled time has arrived (and aren't posted yet) — surfaced as
  // a count badge on the Scheduled Content tab so it acts as a "post these now" cue.
  const dueCount = (posts || []).filter(p =>
    p.status !== 'posted' && p.status !== 'failed' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= Date.now()
  ).length;

  async function savePlatforms(data) {
    await upsertClientPlatform({ clientId: client.id, platforms: data });
    setPlatforms(data);
  }

  async function savePost(postData) {
    return api('posts-create', { method: 'POST', body: JSON.stringify(postData) }).catch(() => {});
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.ink3, fontFamily: MONO, fontSize: 11, cursor: 'pointer', marginBottom: 16, letterSpacing: '.04em' }}>← BACK TO CLIENTS</button>

      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: 14, background: client.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, fontFamily: MONO }}>{client.initials}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, color: T.fg, margin: 0, letterSpacing: '-.02em' }}>{client.name}</h1>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.ink3, fontFamily: MONO, marginTop: 6 }}>
            {Object.entries(client.handles || {}).map(([p, h]) => (
              <span key={p} style={{ color: PLAT[p]?.color || T.ink3 }}>{h}</span>
            ))}
          </div>
        </div>
        <button onClick={onCompose} style={btn('primary')}>+ New Post</button>
        {/* Gated delete — two-step confirm so a stray click can't remove a client */}
        {onDelete && (confirmDel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: T.ink3, fontFamily: MONO }}>Delete {client.name}?</span>
            <button onClick={() => onDelete(client.id)} style={{ ...btn('primary'), background: T.red, borderColor: T.red, color: '#fff' }}>Yes, delete</button>
            <button onClick={() => setConfirmDel(false)} style={btn('ghost')}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)} title="Delete client"
            style={{ ...btn('ghost'), color: T.red, borderColor: T.red }}>Delete client</button>
        ))}
      </div>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.ink7}`, marginBottom: 22, overflowX: 'auto' }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 14px', border: 'none', background: 'transparent', whiteSpace: 'nowrap',
            color: tab === id ? T.fg : T.ink3, borderBottom: tab === id ? `2px solid ${T.acc}` : '2px solid transparent',
            fontFamily: MONO, fontSize: 11, letterSpacing: '.04em', cursor: 'pointer', marginBottom: -1,
          }}>
            {label}
            {id === 'scheduled' && dueCount > 0 && (
              <span style={{ marginLeft: 6, background: T.red, color: '#fff', borderRadius: 999, fontSize: 9, padding: '1px 6px', fontFamily: MONO }}>{dueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Brand Portfolio ──────────────────────────────────────────────── */}
      {tab === 'brand' && (
        <div>
          {/* Legacy editable fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 1100, marginBottom: 24 }}>
            <BrandField label="Bio"             value={edit.bio}            onChange={v => setEdit({ ...edit, bio: v })} multi />
            <BrandField label="Brand Voice"     value={edit.brandVoice}     onChange={v => setEdit({ ...edit, brandVoice: v })} multi />
            <BrandField label="Target Audience" value={edit.targetAudience} onChange={v => setEdit({ ...edit, targetAudience: v })} multi />
            <div>
              <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 6 }}>BRAND COLORS</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(edit.brandColors || []).map((col, i) => (
                  <div key={i} style={{ width: 36, height: 36, borderRadius: 8, background: col, border: `1px solid ${T.ink5}` }} title={col} />
                ))}
              </div>
            </div>
            <ListField label="Do's"   items={edit.dos   || []} color={T.grn} onChange={v => setEdit({ ...edit, dos: v })} />
            <ListField label="Don'ts" items={edit.donts || []} color={T.red} onChange={v => setEdit({ ...edit, donts: v })} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
              <button onClick={() => {
                api('artists-update', { method: 'PATCH', body: JSON.stringify({ id: client.id, ...edit }) }).catch(() => {});
                showToast?.('Brand profile saved ✓');
              }} style={btn('primary')}>Save brand profile</button>
            </div>
          </div>

          {/* Per-platform portfolio */}
          <div style={{ maxWidth: 1100 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: T.ink3, marginBottom: 12 }}>Per-platform presence</div>
            {!platLoaded
              ? <div style={{ color: T.ink3, fontFamily: MONO, fontSize: 12 }}>Loading…</div>
              : <BrandPortfolio client={client} platforms={platforms} onChange={setPlatforms} onSave={savePlatforms} showToast={showToast} />
            }
          </div>
        </div>
      )}

      {/* ── New Content (Content Composer) ───────────────────────────────── */}
      {tab === 'compose' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowCsvImport(true)} style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 11, fontFamily: MONO, cursor: 'pointer',
              background: 'transparent', color: T.ink2, border: `1px solid ${T.ink5}`,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>⇪ Bulk import from CSV</button>
          </div>
          <ContentComposer
            client={client}
            clients={[client]}
            onSave={savePost}
            showToast={showToast}
          />
          {showCsvImport && (
            <CsvImportModal
              clientId={client.id}
              defaultStatus="pending_review"
              onClose={() => setShowCsvImport(false)}
              onDone={() => showToast?.('Imported — open Existing Content to review')}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {/* ── Scheduled Content ─────────────────────────────────────────────── */}
      {tab === 'scheduled' && (
        <ScheduledContent
          client={client}
          posts={posts}
          onCompose={onCompose}
          updatePostStatus={updatePostStatus}
          showToast={showToast}
        />
      )}

      {/* ── Existing Content ──────────────────────────────────────────────── */}
      {tab === 'content' && (
        <ExistingContent
          client={client}
          posts={posts}
          onUpdateStatus={updatePostStatus}
          showToast={showToast}
        />
      )}

      {/* ── Per-client Calendar ──────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <ClientCalendar
          client={client}
          posts={posts}
          onCompose={onCompose}
        />
      )}

      {/* ── Drive Assets ─────────────────────────────────────────────────── */}
      {tab === 'drive' && (
        <DriveAssets client={client} showToast={showToast} />
      )}

      {/* ── Ad Manager ───────────────────────────────────────────────────── */}
      {tab === 'ads' && (
        <AdManager client={client} showToast={showToast} />
      )}
    </div>
  );
}
// Where "Open & copy" sends you to actually post. Best-effort web entry points —
// IG/FB/Threads have no reliable web composer URL, so we open the site; TikTok and
// YouTube open their upload surfaces.
const POST_URL = {
  instagram: 'https://www.instagram.com/',
  tiktok:    'https://www.tiktok.com/upload',
  facebook:  'https://www.facebook.com/',
  youtube:   'https://studio.youtube.com/',
  threads:   'https://www.threads.net/',
};

// ════════════════════════════════════════════════════════════════════════════
// SCHEDULED CONTENT — the "ready to post" queue. Posts you've set up (caption +
// hashtags + asset + schedule) live here until you post them. When it's time,
// "Open & copy" copies the caption + hashtags and opens the platform so you can
// paste-and-post, then mark it Posted.
// ════════════════════════════════════════════════════════════════════════════
function ScheduledContent({ client, posts, onCompose, updatePostStatus, showToast }) {
  const now = Date.now();
  const FAR = 8640000000000000; // posts with no date sort to the end
  const queue = (posts || [])
    .filter(p => p.status !== 'posted' && p.status !== 'failed')
    .sort((a, b) => new Date(a.scheduled_at || FAR) - new Date(b.scheduled_at || FAR));

  const assetOf = p => p.media_url || p.asset_url || p.asset || p.media || p.image_url || '';
  const copy = (text, label) => {
    if (!text) { showToast?.('Nothing to copy'); return; }
    try { navigator.clipboard.writeText(text); showToast?.(`${label} copied ✓`); }
    catch { showToast?.('Copy failed — select and copy manually'); }
  };
  const openPlatform = (p) => {
    const text = [p.caption, p.hashtags].filter(Boolean).join('\n\n');
    if (text) { try { navigator.clipboard.writeText(text); showToast?.('Caption + hashtags copied — paste in the app'); } catch {} }
    const url = POST_URL[p.platform];
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: T.ink3, marginBottom: 4 }}>Ready to post</div>
          <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
            Posts you've set up, queued by date. When one's due, hit <strong style={{ color: T.fg }}>Open &amp; copy</strong> — it copies the caption + hashtags and opens the platform so you can paste, post, then mark it Posted.
          </div>
        </div>
        <button onClick={() => onCompose?.()} style={btn('primary')}>+ New Post</button>
      </div>

      {queue.length === 0 ? (
        <div style={{ padding: 44, textAlign: 'center', color: T.ink3, fontFamily: MONO, fontSize: 12, border: `1px dashed ${T.ink5}`, borderRadius: 12 }}>
          Nothing queued yet. Hit <strong style={{ color: T.ink2 }}>+ New Post</strong>, write the caption + hashtags, and give it a schedule date.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {queue.map(p => {
            const due   = p.scheduled_at && new Date(p.scheduled_at).getTime() <= now;
            const asset = assetOf(p);
            const pc    = PLAT[p.platform]?.color || T.ink3;
            return (
              <div key={p.id} style={{ border: `1px solid ${due ? T.amb : T.ink7}`, background: due ? T.amb + '12' : 'transparent', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={tag(pc)}>{PLAT[p.platform]?.icon} {PLAT[p.platform]?.label || p.platform}</span>
                  <span style={tag(STATUS_META[p.status]?.color || T.ink3)}>{STATUS_META[p.status]?.label || p.status}</span>
                  {p.scheduled_at && (
                    <span style={{ fontFamily: MONO, fontSize: 11, color: due ? T.amb : T.ink3 }}>
                      {due ? '⏰ DUE · ' : '⏱ '}{new Date(p.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {p.caption  && <p style={{ fontSize: 13, color: T.ink2, lineHeight: 1.55, margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{p.caption}</p>}
                {p.hashtags && <div style={{ fontSize: 11, color: pc, fontFamily: MONO, marginBottom: 8 }}>{p.hashtags}</div>}
                {asset && (
                  <a href={asset} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 11, color: T.blu, textDecoration: 'none', marginBottom: 10 }}>
                    ◫ Asset ↗
                  </a>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                  <button onClick={() => openPlatform(p)} style={btn('primary')}>Open {PLAT[p.platform]?.label || 'platform'} &amp; copy ↗</button>
                  <button onClick={() => copy(p.caption, 'Caption')} style={btn('ghost')}>Copy caption</button>
                  <button onClick={() => copy(p.hashtags, 'Hashtags')} style={btn('ghost')}>Copy hashtags</button>
                  {asset && <button onClick={() => copy(asset, 'Asset link')} style={btn('ghost')}>Copy asset</button>}
                  <button onClick={() => { updatePostStatus?.(p.id, 'posted'); showToast?.('Marked posted ✓'); }}
                    style={btn('ghost', { color: T.grn, border: `1px solid ${T.grn}`, marginLeft: 'auto' })}>Mark posted ✓</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function BrandField({ label, value, onChange, multi }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 6 }}>{label.toUpperCase()}</div>
      {multi
        ? <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
        : <input value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />}
    </div>
  );
}
function ListField({ label, items, onChange, color }) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 6 }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
        {items.map((s, i) => (
          <span key={i} style={{ ...tag(color), fontSize: 11, padding: '3px 9px' }}>
            {s}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'inherit', marginLeft: 5, cursor: 'pointer', fontSize: 10 }}>×</button>
          </span>
        ))}
      </div>
      <input value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}
        placeholder="Add and press enter…" style={{ ...inputStyle, fontSize: 12 }} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CAMPAIGN BUILDER (with multi-agent orchestration)
// ════════════════════════════════════════════════════════════════════════════
function CampaignBuilder({ clients, selectedId, onPickClient, onGenerated, showToast }) {
  const [phase, setPhase]         = useState('setup'); // setup | running | preview
  const [campaignType, setCT]     = useState('launch');
  const [duration, setDur]        = useState('2w');
  const [platforms, setPlatforms] = useState(['instagram','tiktok']);
  const [brief, setBrief]         = useState('');
  const [liveMode, setLive]       = useState(false);
  const [generated, setGenerated] = useState([]);

  const AGENTS = [
    { id: 'research', name: 'Research Agent',  model: 'Haiku',  desc: 'Analyzing brand voice & strategy…' },
    { id: 'caption',  name: 'Caption Agent',   model: 'Sonnet', desc: 'Crafting platform-native captions…' },
    { id: 'hashtag',  name: 'Hashtag Agent',   model: 'Haiku',  desc: 'Building tag clusters…' },
    { id: 'schedule', name: 'Scheduler Agent', model: 'Haiku',  desc: 'Mapping optimal post times…' },
    { id: 'review',   name: 'Review Agent',    model: 'Haiku',  desc: 'Consistency & quality pass…' },
  ];
  const [agentStates, setAS] = useState(() => Object.fromEntries(AGENTS.map(a => [a.id, 'waiting'])));

  const client     = clients.find(c => c.id === selectedId) || clients[0];
  const dur        = DURATIONS.find(d => d.id === duration);
  const ctMeta     = CAMPAIGN_TYPES.find(c => c.id === campaignType);

  async function generate() {
    if (!client) return showToast?.('Pick a client first');
    if (platforms.length === 0) return showToast?.('Pick at least one platform');

    setPhase('running');
    setAS(Object.fromEntries(AGENTS.map(a => [a.id, 'waiting'])));

    // ── Live mode: call server-side social-ai-campaign ────────────────────────
    // C-1 full migration — replaces the old BYO-key direct-from-browser call.
    // Server uses the dashboard's own ANTHROPIC_API_KEY env var. The 3-stage
    // pipeline runs in one HTTP call; UI shows fake staggered progress per
    // agent while we wait, then jumps each to "done" when the response arrives.
    if (liveMode) {
      // Stagger the visible agent progress timers in parallel with the server call.
      const offsets  = { research: 0,    caption: 1500, hashtag: 3500, schedule: 4500, review: 5500 };
      Object.entries(offsets).forEach(([id, ms]) =>
        setTimeout(() => setAS(s => s[id] === 'waiting' ? { ...s, [id]: 'running' } : s), ms),
      );

      try {
        const data = await api('social-ai-campaign', {
          method: 'POST',
          body: JSON.stringify({
            client,
            campaignType: ctMeta,
            brief,
            platforms,
            durLabel: dur.id,
            durPosts: dur.posts,
            durDays:  dur.days,
          }),
        });
        setAS({ research: 'done', caption: 'done', hashtag: 'done', schedule: 'done', review: 'done' });
        const posts = (data.posts || []).map((p, i) => ({
          ...p,
          client_id:    client.id,
          scheduled_at: p.scheduled_at || new Date(Date.now() + i * 86400000 + 10 * 3600000).toISOString(),
        }));
        setGenerated(posts);
        setPhase('preview');
      } catch (e) {
        showToast?.('AI error: ' + (e.message || 'campaign generation failed'));
        setPhase('setup');
      }
      return;
    }

    // Mock mode — staggered delays per spec
    const offsets  = { research: 0,   caption: 1200, hashtag: 2800, schedule: 3800, review: 4600 };
    const finishes = { research: 1600, caption: 4400, hashtag: 4400, schedule: 5000, review: 6000 };
    Object.entries(offsets).forEach(([id, ms]) => setTimeout(() => setAS(s => ({ ...s, [id]: 'running' })), ms));
    Object.entries(finishes).forEach(([id, ms]) => setTimeout(() => setAS(s => ({ ...s, [id]: 'done' })), ms));

    await new Promise(r => setTimeout(r, 6200));
    const pool = SAMPLE_AI_RESPONSES[client.id] || SAMPLE_AI_RESPONSES.c1;
    const posts = Array.from({ length: dur.posts }, (_, i) => ({
      client_id: client.id,
      platform: platforms[i % platforms.length],
      caption:  pool[i % pool.length],
      hashtags: '#newpost #' + (client.genre || 'brand').toLowerCase().replace(/\s+/g, ''),
      type: ['photo','video','carousel','reel'][i % 4],
      status: 'pending_review',
      ai_generated: true,
      qualityScore: 7 + Math.floor(Math.random() * 4),
      scheduled_at: new Date(Date.now() + Math.floor(i * (dur.days / dur.posts)) * 86400000 + 10*3600000).toISOString(),
    }));
    setGenerated(posts);
    setPhase('preview');
  }

  if (phase === 'setup') {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 880 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: T.fg, margin: '0 0 4px', letterSpacing: '-.02em' }}>Campaign Builder</h1>
        <p style={{ fontSize: 13, color: T.ink3, margin: '0 0 22px' }}>Five AI agents collaborate to draft a full campaign in one shot.</p>

        <Section label="Client">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {clients.map(c => (
              <button key={c.id} onClick={() => onPickClient(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px',
                background: client?.id === c.id ? T.ink7 : 'transparent',
                border: `1px solid ${client?.id === c.id ? T.acc : T.ink5}`,
                borderRadius: 8, cursor: 'pointer', color: T.fg, fontSize: 12,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, fontFamily: MONO }}>{c.initials}</span>
                {c.name}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Campaign Type">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {CAMPAIGN_TYPES.map(t => (
              <button key={t.id} onClick={() => setCT(t.id)} style={{
                padding: '10px 13px', borderRadius: 8, textAlign: 'left',
                background: campaignType === t.id ? T.ink7 : 'transparent',
                border: `1px solid ${campaignType === t.id ? T.acc : T.ink5}`,
                cursor: 'pointer', color: T.fg,
              }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginTop: 3 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Duration">
          <div style={{ display: 'flex', gap: 8 }}>
            {DURATIONS.map(d => (
              <button key={d.id} onClick={() => setDur(d.id)} style={{
                padding: '7px 14px', borderRadius: 999,
                background: duration === d.id ? T.acc : 'transparent',
                border: `1px solid ${duration === d.id ? T.acc : T.ink5}`,
                color: duration === d.id ? T.ink9 : T.ink2,
                cursor: 'pointer', fontSize: 12, fontFamily: MONO, fontWeight: 600,
              }}>{d.label} · {d.posts} posts</button>
            ))}
          </div>
        </Section>

        <Section label="Platforms">
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {PLAT_LIST.map(p => (
              <button key={p} onClick={() => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} style={{
                padding: '6px 12px', borderRadius: 999,
                background: platforms.includes(p) ? PLAT[p].color + '28' : 'transparent',
                border: `1px solid ${platforms.includes(p) ? PLAT[p].color : T.ink5}`,
                color: platforms.includes(p) ? PLAT[p].color : T.ink3,
                cursor: 'pointer', fontSize: 11, fontFamily: MONO,
              }}>{PLAT[p].icon} {PLAT[p].label}</button>
            ))}
          </div>
        </Section>

        <Section label="Campaign Brief">
          <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4}
            placeholder="What's this campaign about? Any announcements, products, or dates?"
            style={{ ...inputStyle, resize: 'vertical' }} />
        </Section>

        {/* C-1 full migration — live mode now calls the server-side
            social-ai-campaign function (uses the dashboard's ANTHROPIC_API_KEY).
            No more BYO key — the dashboard pays via its own Anthropic billing. */}
        <div style={{ marginBottom: 20, padding: 12, background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 12, color: T.ink2 }}>
            <input type="checkbox" checked={liveMode} onChange={e => setLive(e.target.checked)} style={{ accentColor: T.acc }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.04em' }}>USE LIVE AI</span>
            <span style={{ color: T.ink3, fontSize: 11 }}>— off uses mocked outputs; on calls Claude via the OVMG server</span>
          </label>
        </div>

        <button onClick={generate} style={{ ...btn('primary'), padding: '12px 28px', fontSize: 13 }}>
          Generate Campaign ✦
        </button>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 720 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 28, color: T.fg, margin: '0 0 6px' }}>Generating campaign…</h1>
        <p style={{ fontSize: 13, color: T.ink3, margin: '0 0 24px' }}>{client?.name} · {ctMeta.label} · {dur.posts} posts across {platforms.length} platform{platforms.length !== 1 ? 's' : ''}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {AGENTS.map(a => {
            const state = agentStates[a.id];
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: T.ink8,
                border: `1px solid ${state === 'done' ? T.grn + '60' : state === 'running' ? T.pur : T.ink7}`,
                animation: state === 'running' ? 'ovmAgentGlow 1.8s infinite' : 'none',
                transition: 'border-color .3s',
              }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: a.model === 'Sonnet' ? T.pur : T.pur + '60', color: T.fg, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, fontFamily: MONO, flexShrink: 0 }}>
                  {a.model === 'Sonnet' ? 'S' : 'H'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: T.fg }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: T.ink3, fontFamily: MONO, marginTop: 2 }}>{a.desc}</div>
                </div>
                <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                  {state === 'waiting' && <div style={{ width: 6, height: 6, margin: 'auto', borderRadius: '50%', background: T.ink5 }} />}
                  {state === 'running' && <div style={{ width: 14, height: 14, border: `2px solid ${T.pur}40`, borderTopColor: T.pur, borderRadius: '50%', animation: 'ovmSpin 1s linear infinite' }} />}
                  {state === 'done'    && <div style={{ color: T.grn, fontSize: 14 }}>✓</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 28, color: T.fg, margin: 0 }}>
          {generated.length} posts ready to review
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPhase('setup')} style={btn('ghost')}>Regenerate</button>
          <button onClick={() => onGenerated(generated)} style={btn('primary')}>Push to Approvals</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {generated.map((p, i) => (
          <div key={i} style={{ background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={tag(PLAT[p.platform].color)}>{PLAT[p.platform].icon} {PLAT[p.platform].label}</span>
              {p.qualityScore && <span style={{ ...tag(T.grn), fontSize: 9 }}>★ {p.qualityScore}/10</span>}
              <span style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginLeft: 'auto' }}>{new Date(p.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <textarea defaultValue={p.caption} rows={4} onBlur={e => { generated[i].caption = e.target.value; }} style={{ ...inputStyle, fontSize: 12, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: PLAT[p.platform].color, fontFamily: MONO, marginTop: 7 }}>{p.hashtags}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 8 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════════════════════════════════════════
function Calendar({ posts, clients, onPickPost, onAddOnDate }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = new Date();
  const first = new Date(cur.y, cur.m, 1).getDay();
  const days  = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: T.fg, margin: 0, letterSpacing: '-.02em' }}>
          {new Date(cur.y, cur.m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h1>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => setCur(c => ({ y: c.m === 0 ? c.y-1 : c.y, m: (c.m+11)%12 }))} style={btn('ghost', { padding: '7px 11px' })}>‹</button>
          <button onClick={() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); }} style={btn('ghost')}>Today</button>
          <button onClick={() => setCur(c => ({ y: c.m === 11 ? c.y+1 : c.y, m: (c.m+1)%12 }))} style={btn('ghost', { padding: '7px 11px' })}>›</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', textAlign: 'center', padding: 4 }}>{d.toUpperCase()}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateIso = new Date(cur.y, cur.m, day).toISOString();
          const dayPosts = posts.filter(p => p.scheduled_at && new Date(p.scheduled_at).getDate() === day && new Date(p.scheduled_at).getMonth() === cur.m && new Date(p.scheduled_at).getFullYear() === cur.y);
          const isToday = day === today.getDate() && cur.m === today.getMonth() && cur.y === today.getFullYear();
          return (
            <div key={i} style={{
              minHeight: 92, padding: 7, borderRadius: 8,
              background: T.ink8, border: `1px solid ${isToday ? T.acc : T.ink7}`,
              display: 'flex', flexDirection: 'column', gap: 3, position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: isToday ? T.acc : T.ink2, fontFamily: MONO, fontWeight: isToday ? 600 : 400 }}>{day}</span>
                <button onClick={() => onAddOnDate(dateIso)} style={{ background: 'none', border: 'none', color: T.ink5, fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1 }}>+</button>
              </div>
              {dayPosts.slice(0, 3).map(p => (
                <button key={p.id} onClick={() => onPickPost(p.id)} style={{
                  padding: '2px 6px', borderRadius: 4, border: 'none',
                  background: (PLAT[p.platform]?.color || T.acc) + '22',
                  color: PLAT[p.platform]?.color || T.acc,
                  fontSize: 9, fontFamily: MONO, textAlign: 'left',
                  cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{PLAT[p.platform]?.label || p.platform}</button>
              ))}
              {dayPosts.length > 3 && <span style={{ fontSize: 9, color: T.ink3, fontFamily: MONO }}>+{dayPosts.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APPROVALS
// ════════════════════════════════════════════════════════════════════════════
function Approvals({ posts, clients, onUpdate, onEdit }) {
  const [filter, setFilter] = useState('all');
  const pending = posts.filter(p => p.status === 'pending_review' && (filter === 'all' || p.client_id === filter)).sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: T.fg, margin: '0 0 4px', letterSpacing: '-.02em' }}>Approvals</h1>
      <p style={{ fontSize: 13, color: T.ink3, margin: '0 0 18px' }}>{pending.length} post{pending.length !== 1 ? 's' : ''} waiting on review</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '5px 12px', borderRadius: 999,
          background: filter === 'all' ? T.acc : 'transparent', color: filter === 'all' ? T.ink9 : T.ink2,
          border: `1px solid ${filter === 'all' ? T.acc : T.ink5}`, fontSize: 11, fontFamily: MONO, cursor: 'pointer',
        }}>All</button>
        {clients.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '5px 12px', borderRadius: 999,
            background: filter === c.id ? c.color + '28' : 'transparent',
            color: filter === c.id ? c.color : T.ink2,
            border: `1px solid ${filter === c.id ? c.color : T.ink5}`,
            fontSize: 11, fontFamily: MONO, cursor: 'pointer',
          }}>{c.name}</button>
        ))}
      </div>

      {pending.length === 0 ? (
        <div style={{ background: T.ink8, border: `1px dashed ${T.ink7}`, borderRadius: 10, padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
          Nothing waiting — generate a campaign or create a post.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {pending.map(p => {
            const c = clients.find(c => c.id === p.client_id);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: (c?.color || T.ink7) + '40', display: 'grid', placeItems: 'center', color: c?.color || T.ink3, fontSize: 20, flexShrink: 0 }}>
                  {PLAT[p.platform]?.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {c && <span style={{ width: 18, height: 18, borderRadius: 4, background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 700, fontFamily: MONO }}>{c.initials}</span>}
                    <span style={{ fontSize: 12, color: T.fg, fontWeight: 500 }}>{c?.name || 'Unknown'}</span>
                    <span style={tag(PLAT[p.platform]?.color || T.ink3)}>{PLAT[p.platform]?.label}</span>
                    {p.scheduled_at && <span style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginLeft: 'auto' }}>{new Date(p.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: T.ink2, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.caption}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onEdit(p)} style={btn('ghost')}>Edit</button>
                  <button onClick={() => onUpdate(p.id, 'draft')} style={btn('danger')}>Reject</button>
                  <button onClick={() => onUpdate(p.id, 'approved')} style={btn('success')}>Approve ✓</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════
function Analytics({ posts, clients }) {
  const weekAgo = Date.now() - 7*86400000;
  const total   = posts.length;
  const week    = posts.filter(p => p.scheduled_at && new Date(p.scheduled_at).getTime() > weekAgo).length;
  const byPlat  = PLAT_LIST.reduce((acc, p) => ({ ...acc, [p]: posts.filter(x => x.platform === p).length }), {});
  const byStat  = Object.keys(STATUS_META).reduce((acc, s) => ({ ...acc, [s]: posts.filter(x => x.status === s).length }), {});
  const maxPlat = Math.max(1, ...Object.values(byPlat));
  const maxStat = Math.max(1, ...Object.values(byStat));

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 30, color: T.fg, margin: '0 0 18px', letterSpacing: '-.02em' }}>Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 22 }}>
        <KPI label="Total Posts"     value={total} />
        <KPI label="This Week"       value={week} />
        <KPI label="Clients"         value={clients.length} />
        <KPI label="Avg Quality"     value={posts.filter(p => p.qualityScore).length ? (posts.reduce((s, p) => s + (p.qualityScore || 0), 0) / posts.filter(p => p.qualityScore).length).toFixed(1) : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card title="Posts by Platform">
          {PLAT_LIST.map(p => (
            <BarRow key={p} label={PLAT[p].label} value={byPlat[p]} max={maxPlat} color={PLAT[p].color} />
          ))}
        </Card>
        <Card title="Posts by Status">
          {Object.entries(STATUS_META).map(([id, m]) => (
            <BarRow key={id} label={m.label} value={byStat[id] || 0} max={maxStat} color={m.color} />
          ))}
        </Card>
      </div>

      <Card title="Per-Client Breakdown" style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {clients.map(c => {
            const cp = posts.filter(p => p.client_id === c.id);
            return (
              <div key={c.id} style={{ padding: 12, background: T.ink9, borderRadius: 8, border: `1px solid ${T.ink7}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, fontFamily: MONO }}>{c.initials}</span>
                  <span style={{ fontSize: 12, color: T.fg }}>{c.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 10, color: T.ink3, fontFamily: MONO }}>
                  <span><span style={{ color: T.fg }}>{cp.length}</span> POSTS</span>
                  <span><span style={{ color: T.amb }}>{cp.filter(p => p.status === 'pending_review').length}</span> PENDING</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
function KPI({ label, value }) {
  return (
    <div style={{ padding: '14px 16px', background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10 }}>
      <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 5 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: T.fg }}>{value}</div>
    </div>
  );
}
function Card({ title, children, style }) {
  return (
    <div style={{ padding: 18, background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10, ...style }}>
      <div style={{ fontSize: 11, color: T.ink2, fontFamily: MONO, letterSpacing: '.06em', marginBottom: 12 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}
function BarRow({ label, value, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 80, fontSize: 11, color: T.ink2 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: T.ink9, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
      <div style={{ width: 30, textAlign: 'right', fontSize: 11, color: T.fg, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// POST PREVIEW CARD (in right panel when calendar chip clicked)
// ════════════════════════════════════════════════════════════════════════════
function PostPreviewCard({ post, client, onClose, onApprove, onReject }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        {client && <span style={{ width: 20, height: 20, borderRadius: 5, background: client.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, fontFamily: MONO }}>{client.initials}</span>}
        <span style={tag(PLAT[post.platform]?.color || T.ink3)}>{PLAT[post.platform]?.label}</span>
        <span style={tag(STATUS_META[post.status]?.color || T.ink3)}>{STATUS_META[post.status]?.label}</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.ink3, fontSize: 16, cursor: 'pointer' }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: '0 0 6px' }}>{post.caption}</p>
      {post.hashtags && <div style={{ fontSize: 10, color: PLAT[post.platform]?.color || T.ink3, fontFamily: MONO, marginBottom: 8 }}>{post.hashtags}</div>}
      {post.status === 'pending_review' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onReject}  style={{ ...btn('danger'), flex: 1, fontSize: 10, padding: '6px' }}>Reject</button>
          <button onClick={onApprove} style={{ ...btn('success'), flex: 1, fontSize: 10, padding: '6px' }}>Approve ✓</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSER MODAL
// ════════════════════════════════════════════════════════════════════════════
function Composer({ clients, prefill, onClose, onSave }) {
  const [clientId, setClientId] = useState(prefill?.client_id || clients[0]?.id || '');
  const [platforms, setPlatforms] = useState(prefill?.platform ? [prefill.platform] : ['instagram']);
  const [caption, setCaption]   = useState(prefill?.caption || '');
  const [hashtags, setHash]     = useState(prefill?.hashtags || '');
  const [scheduledAt, setSched] = useState(prefill?.scheduled_at ? new Date(prefill.scheduled_at).toISOString().slice(0, 16) : '');

  function save(status) {
    onSave({
      client_id: clientId,
      platform: platforms[0],
      caption, hashtags,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      status, ai_generated: false,
    });
  }

  return (
    <Modal onClose={onClose} title="New Post" width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Lbl>Client</Lbl>
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Platforms</Lbl>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLAT_LIST.map(p => (
              <button key={p} onClick={() => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} style={{
                padding: '5px 11px', borderRadius: 999,
                background: platforms.includes(p) ? PLAT[p].color + '28' : 'transparent',
                border: `1px solid ${platforms.includes(p) ? PLAT[p].color : T.ink5}`,
                color: platforms.includes(p) ? PLAT[p].color : T.ink3,
                cursor: 'pointer', fontSize: 11, fontFamily: MONO,
              }}>{PLAT[p].icon} {PLAT[p].label}</button>
            ))}
          </div>
        </div>
        <div>
          <Lbl>Caption <span style={{ color: T.ink5, fontFamily: MONO, marginLeft: 6 }}>{caption.length} chars</span></Lbl>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5} placeholder="Write the caption…" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div>
          <Lbl>Hashtags</Lbl>
          <textarea value={hashtags} onChange={e => setHash(e.target.value)} rows={2} placeholder="#newpost …" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div>
          <Lbl>Schedule for</Lbl>
          <input type="datetime-local" value={scheduledAt} onChange={e => setSched(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>
        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={() => save('draft')} style={btn('ghost')}>Save Draft</button>
          <button onClick={() => save('pending_review')} style={btn('primary')}>Send for Review →</button>
        </div>
      </div>
    </Modal>
  );
}
function Lbl({ children }) { return <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 6 }}>{String(children).toUpperCase ? children : children}</div>; }

// ════════════════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ════════════════════════════════════════════════════════════════════════════
function Onboarding({ onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ name: '', genre: '', ig: '', tiktok: '' });
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!scraping) return;
    let p = 0;
    const t = setInterval(() => {
      p += 2;
      setProgress(Math.min(100, p));
      if (p >= 100) { clearInterval(t); setScraping(false); }
    }, 50);
    return () => clearInterval(t);
  }, [scraping]);

  function finish() {
    const colors = ['#d96b3a','#9b6dff','#f5a623','#22c58b','#4d9fff','#f25c5c'];
    const initials = data.name.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() || 'NC';
    const newClient = {
      id: 'c' + Date.now(),
      name: data.name,
      genre: data.genre || 'New Client',
      color: colors[Math.floor(Math.random() * colors.length)],
      initials,
      handles: { instagram: data.ig, tiktok: data.tiktok },
      platforms: ['instagram', 'tiktok'].filter(p => data[p === 'instagram' ? 'ig' : 'tiktok']),
      brandVoice: '',
      targetAudience: '',
      dos: [], donts: [], brandColors: [],
    };
    api('artists-create', { method: 'POST', body: JSON.stringify(newClient) }).catch(() => {});
    onCreate(newClient);
  }

  return (
    <Modal onClose={onClose} title="Add Client" width={560}>
      <Stepper step={step} total={4} />
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <div><Lbl>Client Name</Lbl><input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} placeholder="e.g. Acme Coffee Co" style={inputStyle} /></div>
          <div><Lbl>Genre / Category</Lbl><input value={data.genre} onChange={e => setData({ ...data, genre: e.target.value })} placeholder="e.g. Food & Beverage" style={inputStyle} /></div>
          <p style={{ fontSize: 11, color: T.ink3, margin: 0, lineHeight: 1.5 }}>We'll create a Google Drive folder and client record for <strong style={{ color: T.fg }}>{data.name || 'this client'}</strong> after setup.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setStep(2)} disabled={!data.name.trim()} style={{ ...btn('primary'), opacity: data.name.trim() ? 1 : 0.4 }}>Next →</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <p style={{ fontSize: 13, color: T.ink2, margin: '0 0 18px' }}>Connect Google Drive to give the AI access to {data.name}'s assets.</p>
          <button onClick={() => { setTimeout(() => setStep(3), 1800); }} style={btn('primary')}>🔐 Connect Google Drive</button>
          <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, marginTop: 14 }}>OR <button onClick={() => setStep(3)} style={{ background: 'none', border: 'none', color: T.ink2, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>skip for now</button></div>
        </div>
      )}
      {step === 3 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: T.ink2, margin: 0, lineHeight: 1.5 }}>We'll pull your client's last 36 public posts so the AI learns their actual voice & cadence.</p>
          <div><Lbl>Instagram handle</Lbl><input value={data.ig} onChange={e => setData({ ...data, ig: e.target.value })} placeholder="@acmecoffee" style={inputStyle} /></div>
          <div><Lbl>TikTok handle</Lbl><input value={data.tiktok} onChange={e => setData({ ...data, tiktok: e.target.value })} placeholder="@acme.coffee" style={inputStyle} /></div>
          {scraping && (
            <div>
              <div style={{ height: 6, background: T.ink7, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: T.acc, transition: 'width .05s linear' }} />
              </div>
              <div style={{ fontSize: 10, color: T.ink3, fontFamily: MONO, textAlign: 'center' }}>{progress}% — scraping recent posts…</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <button onClick={() => setStep(2)} style={btn('ghost')}>← Back</button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setScraping(true); setTimeout(() => setStep(4), 2700); }} disabled={scraping || (!data.ig && !data.tiktok)} style={{ ...btn('primary'), opacity: (scraping || (!data.ig && !data.tiktok)) ? 0.4 : 1 }}>{scraping ? 'Scraping…' : 'Scrape Last 36 Posts'}</button>
              <button onClick={() => setStep(4)} style={btn('ghost')}>Skip →</button>
            </div>
          </div>
        </div>
      )}
      {step === 4 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[
            ['📋', `Client record created for ${data.name}`],
            ['📁', 'Google Drive folder linked'],
            ['📷', data.ig || data.tiktok ? '36 scraped posts imported' : 'Scraping skipped'],
            ['🗄️', 'Client record saved'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.ink9, borderRadius: 8, border: `1px solid ${T.ink7}` }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 12, color: T.fg }}>{label}</span>
              <span style={{ color: T.grn, fontSize: 14 }}>✓</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={finish} style={btn('primary')}>Add Client →</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
function Stepper({ step, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => {
        const s = i + 1;
        const done = s < step, cur = s === step;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: done ? T.grn : cur ? T.acc : T.ink7,
              color: done || cur ? T.ink9 : T.ink3,
              display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, fontFamily: MONO,
            }}>{done ? '✓' : s}</div>
            {i < total - 1 && <div style={{ flex: 1, height: 2, background: done ? T.grn : T.ink7 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════════════════════════════════
function Modal({ onClose, title, width = 520, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,20,.78)', zIndex: 400, animation: 'ovmFadeUp .15s' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 401, width, maxHeight: '86vh', background: T.ink8,
        borderRadius: 14, border: `1px solid ${T.ink7}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,.6)', animation: 'ovmFadeUp .2s ease-out',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.ink7}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, color: T.fg, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SAMPLE POST + SCRAPED GENERATORS
// ════════════════════════════════════════════════════════════════════════════
function generateSamplePosts(clientId) {
  const pool = SAMPLE_AI_RESPONSES[clientId] || SAMPLE_AI_RESPONSES.c1;
  const platforms = ['instagram','tiktok','facebook','youtube'];
  const statuses  = ['posted','posted','posted','scheduled','scheduled','pending_review','pending_review','draft'];
  return Array.from({ length: 14 }, (_, i) => ({
    id: 'sp_' + clientId + '_' + i,
    client_id: clientId,
    platform: platforms[i % platforms.length],
    caption: pool[i % pool.length],
    hashtags: '#newmusic #artist #' + (clientId.replace('c','client')),
    status: statuses[i % statuses.length],
    ai_generated: i % 2 === 0,
    scheduled_at: new Date(Date.now() + (i - 7) * 86400000 + 9*3600000).toISOString(),
    qualityScore: 6 + (i % 4),
  }));
}
function generateScrapedPosts(clientId) {
  const pool = SAMPLE_AI_RESPONSES[clientId] || SAMPLE_AI_RESPONSES.c1;
  return Array.from({ length: 6 }, (_, i) => ({
    platform: ['instagram','tiktok','instagram','tiktok','facebook','instagram'][i],
    caption: pool[i % pool.length],
    likes: 200 + Math.floor(Math.random() * 4000),
    comments: 10 + Math.floor(Math.random() * 180),
    date: ['2d ago','5d ago','1w ago','2w ago','3w ago','1mo ago'][i],
  }));
}

// ════════════════════════════════════════════════════════════════════════════
export default function Social(props) {
  return (
    <ErrorBoundary>
      <SocialInner {...props} />
    </ErrorBoundary>
  );
}
