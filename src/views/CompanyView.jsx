import { lazy, Suspense, useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Tag, Eyebrow, Spinner, ErrorBoundary } from '../components/UI.jsx';
import { COMPANIES, COMPANY_META, COMPANY_SUBTAB_LABELS } from '../constants/roles.js';

// ── Lazy imports (keep bundle chunks small) ────────────────────────────────────
const Contacts       = lazy(() => import('./Contacts.jsx'));
const Tasks          = lazy(() => import('./Tasks.jsx'));
const Opportunities  = lazy(() => import('./Opportunities.jsx'));
const AmplifyKanban  = lazy(() => import('./AmplifyKanban.jsx'));
const References     = lazy(() => import('./References.jsx'));
const Email          = lazy(() => import('./Email.jsx'));
const OvmHtml        = lazy(() => import('./OvmHtml.jsx'));
const Tools          = lazy(() => import('./Tools.jsx'));
const Outreach       = lazy(() => import('./Outreach.jsx'));
const DriveView      = lazy(() => import('./DriveView.jsx'));

// ── Sub-tab icon map ──────────────────────────────────────────────────────────
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

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Spinner size={28} />
    </div>
  );
}

function PlaceholderTab({ slug, subTab, meta }) {
  const subLabel = COMPANY_SUBTAB_LABELS[subTab] || subTab || 'Overview';
  const icon     = SUBTAB_ICONS[subTab] || '◇';
  return (
    <div style={{
      border: `1px solid ${C.cr3}`, borderRadius: 14, padding: 40,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, background: C.bg, textAlign: 'center', minHeight: 280,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: C.cr2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, color: C.ink3,
      }}>
        {icon}
      </div>
      <div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, letterSpacing: '-.02em', color: C.ink9, margin: '0 0 8px' }}>
          {meta.label} — {subLabel}
        </h2>
        <p style={{ fontSize: 14, color: C.ink3, margin: 0, fontFamily: SANS, lineHeight: 1.6, maxWidth: 360 }}>
          This section is coming soon. The{' '}
          <span style={{ fontFamily: MONO, fontSize: 12, background: C.cr2, padding: '1px 5px', borderRadius: 4 }}>
            {slug}/{subTab}
          </span>{' '}
          view will be built out in an upcoming phase.
        </p>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Tag bg={meta.color_hex + '18'} fg={meta.color_hex}>{meta.label}</Tag>
        <Tag bg={C.cr2} fg={C.ink5}>{subLabel}</Tag>
        <Tag bg={C.yelS} fg={C.yel}>Coming soon</Tag>
      </div>
    </div>
  );
}

// ── Per-company Tools hub (§6) ────────────────────────────────────────────────
// OVM's Tools tab combines the HTML editor + Email composer + Clients into one
// hub (all three stay mounted so an in-progress email draft / HTML edit survives
// switching between them). Every other company shows the "Coming soon"
// placeholder — the same pattern Carbon Sponge already used.
const COMPANY_TOOLSETS = {
  ovm: [
    { id: 'kanban', label: 'OVM Kanban',  icon: '◈', render: (p) => <Outreach {...p} /> },
    { id: 'html',   label: 'HTML Editor', icon: '◧', render: (p) => <OvmHtml {...p} /> },
    { id: 'email',  label: 'Email',       icon: '◈', render: (p) => <Email   {...p} /> },
  ],
};

function CompanyTools({ slug, sharedProps }) {
  const meta  = COMPANY_META[slug];
  const tools = COMPANY_TOOLSETS[slug];
  const [active, setActive] = useState(tools ? tools[0].id : null);

  // All companies without a custom toolset fall back to the generic Tools view
  // (NCNDA, Signature, OVM Kanban, HTML editor, Email) instead of a placeholder.
  if (!tools) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Tools {...sharedProps} companyFilter={slug} />
      </Suspense>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, flexShrink: 0 }}>
        {tools.map(t => {
          const on = t.id === active;
          return (
            <button key={t.id} onClick={() => setActive(t.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 13px', borderRadius: 8, fontSize: 12, fontFamily: SANS,
              cursor: 'pointer', border: `1px solid ${on ? meta.color_hex : C.cr3}`,
              background: on ? meta.color_hex : C.bg, color: on ? '#fff' : C.ink5,
              fontWeight: on ? 500 : 400, transition: 'all .15s',
            }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {tools.map(t => (
          <div key={t.id} style={{ display: t.id === active ? 'block' : 'none', height: '100%' }}>
            <Suspense fallback={<LoadingFallback />}>{t.render(sharedProps)}</Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubTabContent({ slug, subTab, user, showToast, openOv, closeOv, setView }) {
  const sharedProps = { user, showToast, openOv, closeOv, setView };

  switch (subTab) {
    case 'contacts':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Contacts {...sharedProps} companyFilter={slug} />
        </Suspense>
      );

    case 'tasks':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Tasks {...sharedProps} companyFilter={slug} />
        </Suspense>
      );

    case 'opportunities':
    case 'kanban':
      // Amplify Artists uses the dedicated Amplify Projects kanban (Airtable-backed,
      // populated by Zapier). All other companies use the shared Opportunities view.
      if (slug === 'amplify') {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <AmplifyKanban {...sharedProps} />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Opportunities {...sharedProps} companyFilter={slug} viewMode="kanban" allowViewToggle />
        </Suspense>
      );

    case 'drive':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <DriveView {...sharedProps} company={slug} />
        </Suspense>
      );

    case 'references':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <References {...sharedProps} companyFilter={slug} />
        </Suspense>
      );

    case 'html':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <OvmHtml {...sharedProps} />
        </Suspense>
      );

    case 'email':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Email {...sharedProps} />
        </Suspense>
      );

    case 'tools':
      return <CompanyTools slug={slug} sharedProps={sharedProps} />;

    default:
      return null;
  }
}

/**
 * CompanyView
 *
 * Props:
 *   slug    {string}  — company slug, e.g. 'ovmg'
 *   subTab  {string}  — active sub-tab, e.g. 'calendar'
 *   ctx     {object}  — dashboard context (user, showToast, setView, openOv, closeOv, etc.)
 */
export default function CompanyView({ slug, subTab, ctx = {} }) {
  const meta = COMPANY_META[slug];
  if (!meta) {
    return (
      <div style={{ padding: 32, color: C.ink3, fontFamily: SANS }}>
        Unknown company: {slug}
      </div>
    );
  }

  const { user, showToast, setView, openOv, closeOv } = ctx;
  const subLabel = COMPANY_SUBTAB_LABELS[subTab] || subTab || 'Overview';
  const icon     = SUBTAB_ICONS[subTab] || '◇';

  const hasContent = ['contacts', 'tasks', 'kanban', 'opportunities', 'drive', 'references', 'html', 'email', 'tools'].includes(subTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Company quick-switch — one box per company; click to jump to that
          company keeping the current sub-tab. The active company is highlighted. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, flexShrink: 0 }}>
        {COMPANIES.map(s => {
          const m = COMPANY_META[s];
          if (!m) return null;
          const on = s === slug;
          return (
            <button key={s} onClick={() => setView && setView(`company:${s}:${subTab}`)}
              title={m.label}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8,
                border: `1px solid ${on ? m.color_hex : C.cr3}`,
                background: on ? m.color_hex + '18' : C.bg,
                color: on ? m.color_hex : C.ink5, fontFamily: SANS, fontSize: 12,
                fontWeight: on ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color_hex, flexShrink: 0 }} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Company header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: meta.color_hex + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: meta.color_hex,
          border: `1.5px solid ${meta.color_hex}44`,
        }}>
          {icon}
        </div>
        <div>
          <Eyebrow>{meta.label}</Eyebrow>
          <h1 style={{
            fontFamily: SERIF, fontWeight: 500, fontSize: 26,
            letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1.1,
          }}>
            {subLabel}
          </h1>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Tag bg={meta.color_hex + '22'} fg={meta.color_hex}>
            {meta.label}
          </Tag>
        </div>
      </div>

      {/* Sub-tab nav pills */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: '10px 14px', background: C.bg2,
        borderRadius: 10, marginBottom: 20, flexShrink: 0,
        border: `1px solid ${C.cr3}`,
      }}>
        {meta.sub_tabs.map(tab => {
          const isActive = tab === subTab;
          return (
            <button
              key={tab}
              onClick={() => setView && setView(`company:${slug}:${tab}`)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                fontFamily: SANS, cursor: 'pointer', border: 'none',
                background: isActive ? meta.color_hex : 'transparent',
                color: isActive ? '#fff' : C.ink5,
                fontWeight: isActive ? 500 : 400,
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.8 }}>{SUBTAB_ICONS[tab] || '◇'}</span>
              {COMPANY_SUBTAB_LABELS[tab] || tab}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content — fills remaining height. overflowY:auto so tall
          sub-pages (notably Contacts) scroll instead of being clipped (§6). */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {hasContent ? (
          <ErrorBoundary key={`${slug}:${subTab}`} label={`${meta.label} — ${subLabel} hit an error`}>
            <SubTabContent
              slug={slug}
              subTab={subTab}
              user={user}
              showToast={showToast}
              openOv={openOv}
              closeOv={closeOv}
              setView={setView}
            />
          </ErrorBoundary>
        ) : (
          <PlaceholderTab slug={slug} subTab={subTab} meta={meta} />
        )}
      </div>
    </div>
  );
}
