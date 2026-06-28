import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { C, SERIF, SANS, MONO, getTheme, toggleTheme } from './constants.js';
import { Toast, Drawer, Modal } from './components/UI.jsx';
import useIsMobile, { useDevice } from './hooks/useIsMobile.js';
import { canAccess } from './lib/access.js';
import { COMPANIES, COMPANY_META, COMPANY_SUBTAB_LABELS } from './constants/roles.js';

// Overview is the default landing view, so it stays eagerly imported — code-
// splitting the first screen the user sees would only add a spinner to the
// initial load. AccountSwitcher is part of the always-visible sidebar chrome,
// so it stays eager too.
import Overview        from './views/Overview.jsx';
import AccountSwitcher from './components/AccountSwitcher.jsx';

// Every other view is loaded on demand. Previously all ~19 views were statically
// imported here, so the entire app (Social ~1.6k lines, References, Outreach,
// Tasks, Email, Calendar, …) shipped in one chunk that had to download and parse
// before the user saw anything — the bulk of the "unused JavaScript" flagged by
// PageSpeed. Now each view becomes its own chunk, fetched only when navigated to.
const MyDay         = lazy(() => import('./views/MyDay.jsx'));
const Contacts      = lazy(() => import('./views/Contacts.jsx'));
const Tasks         = lazy(() => import('./views/Tasks.jsx'));
const Opportunities = lazy(() => import('./views/Opportunities.jsx'));
const Settings      = lazy(() => import('./views/Settings.jsx'));
const Admin         = lazy(() => import('./views/Admin.jsx'));
const Ncnda         = lazy(() => import('./views/Ncnda.jsx'));
const Signature     = lazy(() => import('./views/Signature.jsx'));
const References    = lazy(() => import('./views/References.jsx'));
const Outreach      = lazy(() => import('./views/Outreach.jsx'));
const Email         = lazy(() => import('./views/Email.jsx'));
const Websites      = lazy(() => import('./views/Websites.jsx'));
const Tools         = lazy(() => import('./views/Tools.jsx'));
const Booking       = lazy(() => import('./views/Booking.jsx'));
const CostDashboard = lazy(() => import('./views/CostDashboard.jsx'));
const AudioDump     = lazy(() => import('./views/AudioDump.jsx'));
const CompanyView   = lazy(() => import('./views/CompanyView.jsx'));

// ── URL ↔ view sync (§10: refresh stays on the current route) ─────────────────
// The app routes off a single `view` string (e.g. 'tasks', 'company:ovm:tasks').
// We mirror it into the URL hash so a hard refresh (F5/Cmd-R) or a shared deep
// link restores the exact route and re-fetches that route's data, instead of
// bouncing back to Overview. Hash-based (not pathname) so it needs no server
// rewrite beyond the existing SPA redirect and never collides with Clerk or the
// /book/:slug public routes handled in main.jsx.
function parseHashView() {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '').trim();
    // Take the first path segment as the top-level view. Sub-routes like
    // `tools/email` (the Tools secondary sidebar) keep the rest of the path for
    // the child view to read; we only need the leading segment to land on the
    // right top-level route. Without this, any hash with a `/` was rejected and
    // a refresh bounced the user back to Overview.
    const seg = raw.split('/')[0];
    if (seg && /^[a-z0-9:_-]+$/i.test(seg)) return decodeURIComponent(seg);
  } catch {}
  return '';
}

// ── Access denied splash ──────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
      <span style={{ fontSize: 36, color: C.acc }}>◐</span>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: 0, color: C.ink9 }}>Access restricted</h2>
      <p style={{ fontSize: 13, color: C.ink3, margin: 0 }}>You do not have permission to view this page.</p>
    </div>
  );
}

// ── Top-level nav items ───────────────────────────────────────────────────────
const NAV_META = [
  { id: 'overview',   icon: '◇', label: 'Overview'   },
  { id: 'audio-dump', icon: '◎', label: 'Audio Dump', adminOnly: true },
  { id: 'contacts',   icon: '◉', label: 'Contacts'   },
  { id: 'tasks',      icon: '▤', label: 'Tasks'      },
  { id: 'kanban',     icon: '▦', label: 'Kanban'     },
  { id: 'tools',      icon: '⚒', label: 'Tools'      },
  { id: 'references', icon: '⊞', label: 'References' },
  { id: 'settings',   icon: '⚙', label: 'Settings'   },
  // Admin + Cost moved into Settings (admin-only links there) to free sidebar
  // space — their routes still resolve below for deep links / Settings nav.
];

// Sub-tab icons (shared with CompanyView)
const SUBTAB_ICONS = {
  contacts:   '◉',
  tasks:      '▤',
  kanban:     '▦',
  opportunities: '◆',
  drive:      '◫',
  references: '⊞',
  tools:      '⚒',
  html:       '◧',
  email:      '◈',
};

// ── Company section — collapsible (controlled) ────────────────────────────────
function CompanySection({ slug, meta, activeView, onNavigate, isTablet, isOpen, onToggle }) {
  const isCompanyActive = typeof activeView === 'string' && activeView.startsWith(`company:${slug}`);
  const activeSubTab    = isCompanyActive ? activeView.split(':')[2] : null;

  return (
    <div>
      {/* Company header row */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', border: 'none',
          background: isCompanyActive ? C.chromeBg2 : 'transparent',
          color: isCompanyActive ? C.chromeFg : C.chromeMut,
          fontSize: isTablet ? 12 : 13, borderRadius: 6, textAlign: 'left',
          cursor: 'pointer', fontFamily: SANS, transition: 'all .15s ease',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: meta.color_hex,
        }} />
        <span style={{ flex: 1 }}>{meta.label}</span>
        <span style={{
          fontFamily: SERIF, fontSize: 10, color: C.chromeMut,
          display: 'inline-block', transition: 'transform .15s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
        }}>▶</span>
      </button>

      {/* Sub-tabs */}
      {isOpen && (
        <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
          {meta.sub_tabs.map(tab => {
            const isActive = activeSubTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onNavigate(`company:${slug}:${tab}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', border: 'none',
                  background: isActive ? meta.color_hex + '28' : 'transparent',
                  color: isActive ? C.chromeFg : C.chromeMut,
                  fontSize: isTablet ? 11 : 12, borderRadius: 5, textAlign: 'left',
                  cursor: 'pointer', fontFamily: SANS, transition: 'all .15s ease',
                  borderLeft: isActive ? `2px solid ${meta.color_hex}` : '2px solid transparent',
                }}
              >
                <span style={{
                  fontFamily: SERIF, fontSize: 11,
                  color: isActive ? meta.color_hex : C.chromeMut,
                  width: 12, textAlign: 'center',
                }}>
                  {SUBTAB_ICONS[tab] || '◇'}
                </span>
                {COMPANY_SUBTAB_LABELS[tab] || tab}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Suspense fallback shown briefly while a lazily-loaded view chunk downloads.
// Matches the app's loading style (the ◐ mark) and is centered in the content
// area. Only appears the first time a given view is opened in a session; the
// chunk is cached thereafter.
function ViewLoading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, color: C.acc, marginBottom: 10 }}>◐</div>
        <p style={{ color: C.ink3 || C.chromeMut, fontSize: 12, fontFamily: SANS }}>Loading…</p>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const isMobile = useIsMobile();
  const device   = useDevice();
  const isTablet = device === 'tablet';

  // Filter top-level nav to items the user can access
  const NAV_ITEMS = NAV_META.filter(item => {
    if (item.adminOnly && !user.isAdmin) return false;
    return canAccess(user, item.id);
  });

  // Default landing view
  const defaultView = (() => {
    const preferred = ['overview', 'outreach'];
    for (const id of preferred) {
      if (NAV_ITEMS.some(n => n.id === id)) return id;
    }
    return NAV_ITEMS[0]?.id || 'overview';
  })();

  // Initialise from the URL hash so refresh / deep links land on the right route.
  const [view,     _setView]    = useState(() => parseHashView() || defaultView);
  const [ov,       setOv]       = useState(null);
  const [toast,    setToast]    = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme,    setThemeState] = useState(getTheme);
  const flipTheme = useCallback(() => setThemeState(toggleTheme()), []);
  // Transient per-navigation params (e.g. Overview → Tasks with a filter, §9).
  // Not persisted to the URL — a refresh lands on the route without the filter.
  const [viewParams, setViewParams] = useState(null);

  // setView also writes the hash so the URL is the source of truth (§10).
  const setView = useCallback((next, params = null) => {
    _setView(next);
    setViewParams(params);
    try {
      const target = `#/${next}`;
      if (window.location.hash !== target) window.history.pushState(null, '', target);
    } catch {}
  }, []);

  // Keep view in sync with the URL on first paint + back/forward + hash edits.
  useEffect(() => {
    if (!parseHashView()) {
      try { window.history.replaceState(null, '', `#/${view}`); } catch {}
    }
    const onRoute = () => { const h = parseHashView(); if (h) { _setView(h); setViewParams(null); } };
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    return () => {
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Accordion: only one company section open at a time
  const COMPANY_STORAGE_KEY = 'sidebar_expanded_company';
  const [expandedCompany, setExpandedCompany] = useState(() => {
    try { return localStorage.getItem(COMPANY_STORAGE_KEY) || null; }
    catch { return null; }
  });
  const handleCompanyToggle = useCallback((slug) => {
    setExpandedCompany(prev => {
      const next = prev === slug ? null : slug;
      try {
        if (next) { localStorage.setItem(COMPANY_STORAGE_KEY, next); }
        else      { localStorage.removeItem(COMPANY_STORAGE_KEY); }
      } catch {}
      return next;
    });
  }, []);

  const showToast = m  => setToast(m);
  const closeOv   = () => setOv(null);
  const openOv    = v  => setOv(v);
  const ctx = { user, showToast, openOv, closeOv, setView };

  const handleNavClick = useCallback((id) => {
    setView(id);
    if (isMobile) setMenuOpen(false);
  }, [isMobile]);

  // Gate helper
  const gateView = (toolId, component) =>
    canAccess(user, toolId) ? component : <AccessDenied />;

  // ── View resolver ────────────────────────────────────────────────────────────
  const resolveView = () => {
    if (view.startsWith('company:')) {
      const parts  = view.split(':');
      const slug   = parts[1];
      const subTab = parts[2] || COMPANY_META[slug]?.sub_tabs[0];
      if (!slug || !COMPANY_META[slug]) {
        return <div style={{ color: C.ink3, padding: 32 }}>Unknown company.</div>;
      }
      if (!canAccess(user, `company:${slug}`)) return <AccessDenied />;
      return <CompanyView slug={slug} subTab={subTab} ctx={ctx} />;
    }

    const VIEWS = {
      'overview':   gateView('overview',   <Overview   {...ctx} />),
      'my-day':     gateView('my-day',     <MyDay      {...ctx} />),
      'audio-dump': user.isAdmin ? <AudioDump {...ctx} /> : <AccessDenied />,
      'contacts':   gateView('contacts',   <Contacts   {...ctx} />),
      'tasks':      gateView('tasks',      <Tasks      {...ctx} initialFilter={view === 'tasks' ? viewParams : null} />),
      // Main Kanban — all companies' opportunities in one Notion-backed board
      // (internal/external + Kanban⇄List). Same data as each company's Kanban
      // tab, so cards created here surface on the matching company tab too.
      'kanban':     gateView('kanban',     <Opportunities {...ctx} viewMode="kanban" allowViewToggle />),
      'settings':   gateView('settings',   <Settings   {...ctx} onLogout={onLogout} />),
      'admin':      gateView('admin',      <Admin      {...ctx} />),
      'cost':       user.isAdmin ? <CostDashboard {...ctx} /> : <AccessDenied />,
      'websites':   gateView('websites',   <Websites   {...ctx} />),
      'booking':    gateView('booking',    <Booking    {...ctx} />),
      'tools':      gateView('tools',      <Tools      {...ctx} />),
      'references': gateView('references', <References {...ctx} />),
      'outreach':   gateView('outreach',   <Outreach   {...ctx} />),
      // Legacy direct routes — bookmarks / deep links still work
      'ncnda':      gateView('ncnda',      <Ncnda      {...ctx} />),
      'signature':  gateView('signature',  <Signature  {...ctx} />),
      'email':      gateView('email',      <Email      {...ctx} />),
    };
    return VIEWS[view] || <div style={{ color: C.ink3, padding: 32 }}>View not found.</div>;
  };

  const currentView = resolveView();
  const isTools     = view === 'tools';
  const isFullBleed = isTools;

  // Mobile top bar label
  const currentLabel = (() => {
    if (view.startsWith('company:')) {
      const parts = view.split(':');
      const m     = COMPANY_META[parts[1]];
      if (!m) return '';
      return parts[2] ? `${m.label} / ${COMPANY_SUBTAB_LABELS[parts[2]] || parts[2]}` : m.label;
    }
    return (NAV_ITEMS.find(n => n.id === view) || {}).label || '';
  })();

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  const sidebar = (
    <aside style={{
      width: isTablet ? 168 : 212, background: C.chromeBg, display: 'flex', flexDirection: 'column',
      padding: '16px 10px', flexShrink: 0, overflowY: 'auto',
      ...(isMobile ? {
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 248, zIndex: 220,
        transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .22s ease',
        boxShadow: menuOpen ? '0 0 40px rgba(0,0,0,.4)' : 'none',
      } : {}),
    }}>
      {/* Logo + close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: SERIF, fontSize: 22, color: C.acc, lineHeight: 1 }}>◐</span>
          <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 16, color: C.chromeFg }}>OneVibe</span>
        </div>
        {isMobile && (
          <button onClick={() => setMenuOpen(false)}
            style={{ background: 'none', border: 'none', color: C.chromeMut, fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>
            ×
          </button>
        )}
      </div>

      {/* ── Main section ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.chromeMut, padding: '0 10px', marginBottom: 4 }}>
          Main
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV_ITEMS.map(item => {
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', border: 'none',
                  background: isActive ? C.chromeBg2 : 'transparent',
                  color: isActive ? C.chromeFg : C.chromeMut,
                  fontSize: isTablet ? 12 : 13, borderRadius: 6, textAlign: 'left',
                  cursor: 'pointer', fontFamily: SANS, transition: 'all .15s ease',
                }}
              >
                <span style={{ fontFamily: SERIF, fontSize: 13, color: isActive ? C.acc : C.chromeMut, width: 13, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: C.chromeBg2, margin: '6px 0 10px' }} />

      {/* ── Companies section ── */}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.chromeMut, padding: '0 10px', marginBottom: 4 }}>
          Companies
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {COMPANIES.map(slug => {
            const meta = COMPANY_META[slug];
            if (!meta) return null;
            if (!canAccess(user, `company:${slug}`)) return null;
            return (
              <CompanySection
                key={slug}
                slug={slug}
                meta={meta}
                activeView={view}
                onNavigate={handleNavClick}
                isTablet={isTablet}
                isOpen={expandedCompany === slug}
                onToggle={() => handleCompanyToggle(slug)}
              />
            );
          })}
        </div>
      </div>

      {/* Account switcher + user info */}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Dark mode toggle */}
        <button
          onClick={flipTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
            border: 'none', borderRadius: 8, background: C.chromeBg2, color: C.chromeFg,
            fontFamily: SANS, fontSize: 12, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.acc, width: 13, textAlign: 'center' }}>
            {theme === 'dark' ? '☀' : '☾'}
          </span>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <AccountSwitcher user={user} showToast={showToast} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, background: C.chromeBg2 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.acc, color: '#fff', fontWeight: 600, display: 'grid', placeItems: 'center', fontSize: 12, flexShrink: 0 }}>
            {(user.fullName || 'U')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.chromeFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', padding: 0, fontFamily: MONO, fontSize: 9, color: C.chromeMut, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: SANS, background: C.bg, overflow: 'hidden' }}>

      {/* Desktop: always-visible sidebar */}
      {!isMobile && sidebar}

      {/* Mobile: slide-out sidebar + backdrop */}
      {isMobile && sidebar}
      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,20,.5)', backdropFilter: 'blur(2px)', zIndex: 210 }} />
      )}

      <main style={{
        flex: 1,
        position: 'relative',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {/* Mobile top bar — shown for EVERY mobile view, including full-bleed
            ones (Tools/Social). It carries the only hamburger, so without it
            those views had no way back to the main sidebar. */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', flexShrink: 0,
            background: C.chromeBg, color: C.chromeFg,
          }}>
            <button onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{ background: 'none', border: 'none', color: C.chromeFg, cursor: 'pointer', padding: 4, lineHeight: 0 }}>
              <span style={{ display: 'block', width: 22 }}>
                <span style={{ display: 'block', height: 2, background: C.chromeFg, margin: '4px 0', borderRadius: 1 }} />
                <span style={{ display: 'block', height: 2, background: C.chromeFg, margin: '4px 0', borderRadius: 1 }} />
                <span style={{ display: 'block', height: 2, background: C.chromeFg, margin: '4px 0', borderRadius: 1 }} />
              </span>
            </button>
            <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500 }}>OneVibe</span>
            <span style={{ color: C.chromeMut, fontSize: 13, opacity: .6 }}>/</span>
            <span style={{ fontSize: 13, color: C.chromeMut, fontFamily: SANS }}>{currentLabel}</span>
          </div>
        )}

        {/* Content area. position:relative so full-bleed views that use
            position:absolute; inset:0 fill THIS region (below the top bar)
            rather than covering the bar. */}
        <div style={{
          flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
          overflowY: isFullBleed ? 'hidden' : 'auto',
          padding: isFullBleed ? 0 : (isMobile ? '12px 14px 24px' : isTablet ? '20px 22px' : '24px 30px'),
        }}>
          <Suspense fallback={<ViewLoading />}>
            {currentView}
          </Suspense>
        </div>
      </main>

      {ov && ov.kind === 'drawer' && (
        <Drawer title={ov.title} sub={ov.sub} onClose={closeOv}>{ov.body}</Drawer>
      )}
      {ov && ov.kind === 'modal' && (
        <Modal title={ov.title} onClose={closeOv}>{ov.body}</Modal>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
