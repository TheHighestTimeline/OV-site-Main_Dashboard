// Shared presentation pieces for the three Threads views.
//
// Styling follows the house pattern: inline style objects reading tokens from
// constants.js. No Tailwind. `C` is mutated in place by the theme toggle, so
// reading it at render time is what makes dark mode work without a context.

import { C, SERIF, SANS, MONO } from '../../constants.js';
import { COMPANY_META } from '../../constants/roles.js';

// ── Entity colours ───────────────────────────────────────────────────────────
// Entity chips are coloured consistently per entity; workstream chips stay
// neutral. Keeping the two visually distinct is deliberate: they sit next to
// each other on every card, and if both were coloured they would read as the
// same category of thing when they are not.
const ENTITY_COLORS = {};
for (const [slug, meta] of Object.entries(COMPANY_META)) {
  ENTITY_COLORS[meta.label.toLowerCase()] = meta.color_hex;
  ENTITY_COLORS[slug.toLowerCase()]       = meta.color_hex;
}

export function entityColor(entity) {
  if (!entity) return C.ink3;
  const key = String(entity).toLowerCase().trim();
  if (ENTITY_COLORS[key]) return ENTITY_COLORS[key];
  // Deterministic fallback so an unknown entity still gets a stable colour
  // rather than changing every render.
  const palette = [C.acc, C.blu, C.grn, C.yel, C.pur || C.blu, C.red];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Chips ────────────────────────────────────────────────────────────────────

export function EntityChip({ entity }) {
  if (!entity) return null;
  const col = entityColor(entity);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
      background: `${col}1f`, color: col, border: `1px solid ${col}55`,
      fontFamily: MONO, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>{entity}</span>
  );
}

export function WorkstreamChip({ name, onClick }) {
  if (!name) return null;
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
        background: C.bg2, color: C.ink5, border: `1px solid ${C.cr2}`,
        fontFamily: SANS, fontSize: 10, whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
      }}
      title={name}
    >{name}</span>
  );
}

// ── Stage badge ──────────────────────────────────────────────────────────────
// Days in stage is rendered loud and turns red past SLA. The number is the
// point: a stage label alone never tells you whether something is stuck.

const SLA_COLORS = {
  ok:       () => C.ink3,
  due:      () => C.yel,
  overdue:  () => C.red,
  escalate: () => C.red,
};

export function StageBadge({ stageLabel, daysInStage, slaStatus = 'ok', compact = false }) {
  if (!stageLabel) return null;
  const col = (SLA_COLORS[slaStatus] || SLA_COLORS.ok)();
  const loud = slaStatus === 'overdue' || slaStatus === 'escalate';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{
        fontFamily: SANS, fontSize: compact ? 11 : 12, fontWeight: 600, color: C.ink8,
        whiteSpace: 'nowrap',
      }}>{stageLabel}</span>
      {daysInStage != null && (
        <span style={{
          fontFamily: MONO, fontSize: compact ? 9 : 10, color: col,
          fontWeight: loud ? 700 : 400, whiteSpace: 'nowrap',
        }}>
          · {daysInStage}d in stage
        </span>
      )}
    </span>
  );
}

// ── Urgency dot ──────────────────────────────────────────────────────────────
// Red overdue, amber due today, blue inbound awaiting reply. On a card that
// aggregates several workstreams this shows the MOST urgent state, never an
// average: an average would hide the one thing that needs attention today.

export function urgencyOf(p) {
  if (!p) return null;
  if (p.terminal) return null;
  if (p.overdueTaskCount > 0) return 'overdue';
  if (p.slaStatus === 'overdue' || p.slaStatus === 'escalate') return 'overdue';
  if (p.nextActionDate) {
    const today = new Date().toISOString().slice(0, 10);
    const d = String(p.nextActionDate).slice(0, 10);
    if (d < today) return 'overdue';
    if (d === today) return 'today';
  }
  if (p.slaStatus === 'due') return 'today';
  if (p.lastDirection === 'inbound') return 'inbound';
  return null;
}

const URGENCY_META = {
  overdue: { color: () => C.red, label: 'Overdue' },
  today:   { color: () => C.yel, label: 'Due today' },
  inbound: { color: () => C.blu, label: 'Awaiting your reply' },
};

export function UrgencyDot({ urgency, size = 8 }) {
  if (!urgency) return null;
  const meta = URGENCY_META[urgency];
  if (!meta) return null;
  const col = meta.color();
  return (
    <span
      title={meta.label}
      style={{
        width: size, height: size, borderRadius: '50%', background: col,
        boxShadow: `0 0 0 3px ${col}22`, flexShrink: 0, display: 'inline-block',
      }}
    />
  );
}

/** Most urgent state across a set of participations. Never an average. */
export function worstUrgency(participations) {
  const rank = { overdue: 3, today: 2, inbound: 1 };
  let best = null;
  for (const p of participations) {
    const u = urgencyOf(p);
    if (u && (!best || rank[u] > rank[best])) best = u;
  }
  return best;
}

// ── Waiting-on pill ──────────────────────────────────────────────────────────

export function WaitingPill({ waitingOn }) {
  if (!waitingOn || waitingOn === 'Nobody') return null;
  const isUs = waitingOn === 'Us';
  const col  = isUs ? C.red : C.blu;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4,
      background: `${col}18`, color: col, fontFamily: MONO, fontSize: 9,
      letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {isUs ? '● on us' : '○ on them'}
    </span>
  );
}

// ── Cards and layout ─────────────────────────────────────────────────────────

export function Panel({ children, sx = {} }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10,
      padding: '14px 16px', ...sx,
    }}>{children}</div>
  );
}

export function SectionTitle({ children, count, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
        color: C.ink3,
      }}>{children}</span>
      {count != null && (
        <span style={{
          fontFamily: MONO, fontSize: 9, background: C.grS, color: C.ink5,
          borderRadius: 999, padding: '1px 7px',
        }}>{count}</span>
      )}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: C.acc, marginBottom: 8 }}>◐</div>
        <p style={{ color: C.ink3, fontSize: 12, fontFamily: SANS, margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}

export function Empty({ icon = '◇', title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 30, color: C.ink2, marginBottom: 10 }}>{icon}</div>
      <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, color: C.ink9, margin: '0 0 6px' }}>{title}</h3>
      {body && <p style={{ fontSize: 12.5, color: C.ink3, margin: '0 auto', maxWidth: 380, lineHeight: 1.55 }}>{body}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ── Date helpers local to Threads ────────────────────────────────────────────

export function relDays(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function fmtRel(iso) {
  const d = relDays(iso);
  if (d == null) return 'never';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Last name then first, for the A to Z sort. Falls back to the whole string. */
export function sortKeyByLastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return String(name || '').toLowerCase();
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`.toLowerCase();
}
