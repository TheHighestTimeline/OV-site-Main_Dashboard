// Shared constants / helpers for the Social sub-components.
// All sub-components import from here so they match Social.jsx's aesthetic.

export const T = {
  ink9: '#0e1014', ink8: '#161922', ink7: '#1f232e', ink6: '#252a36',
  ink5: '#3a4050', ink3: '#6b7180', ink2: '#a6abb8', ink1: '#d1d5db',
  fg:   '#f0ede8',
  acc:  '#d96b3a', accD: '#a04b22',
  grn:  '#22c58b', red: '#f25c5c', amb: '#f5a623', pur: '#9b6dff', blu: '#4d9fff',
};

export const SERIF = "'Fraunces',Georgia,serif";
export const SANS  = "'Geist',system-ui,sans-serif";
export const MONO  = "'Geist Mono',monospace";

export const ALL_PLAT = {
  instagram: { label: 'Instagram', color: '#e1306c', icon: '◉',  charLimit: 2200 },
  tiktok:    { label: 'TikTok',    color: '#69c9d0', icon: '◈',  charLimit: 2200 },
  twitter:   { label: 'X / Twitter', color: '#1da1f2', icon: '✕', charLimit: 280  },
  threads:   { label: 'Threads',   color: '#9ca3af', icon: '◎',  charLimit: 500  },
  linkedin:  { label: 'LinkedIn',  color: '#0077b5', icon: '◈',  charLimit: 3000 },
  youtube:   { label: 'YouTube',   color: '#ff4444', icon: '▶',  charLimit: 5000 },
  facebook:  { label: 'Facebook',  color: '#4f87f5', icon: '◇',  charLimit: 63206 },
};
export const PLAT_LIST = ['instagram','tiktok','twitter','threads','linkedin','youtube','facebook'];

export const STATUS_META = {
  draft:          { label: 'Draft',     color: T.ink3 },
  pending_review: { label: 'In Review', color: T.amb  },
  approved:       { label: 'Approved',  color: T.blu  },
  scheduled:      { label: 'Scheduled', color: T.pur  },
  posted:         { label: 'Posted',    color: T.grn  },
  failed:         { label: 'Failed',    color: T.red  },
};

export const tag = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 999,
  background: color + '20', color, fontSize: 10, fontFamily: MONO, letterSpacing: '.04em',
});

export const inputStyle = {
  background: T.ink7, border: `1px solid ${T.ink5}`, borderRadius: 8,
  color: T.fg, fontFamily: SANS, fontSize: 13, padding: '8px 11px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

export const btn = (variant = 'primary', extra = {}) => ({
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

export function Lbl({ children }) {
  return (
    <div style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', marginBottom: 6, textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

export function SectionLbl({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: T.ink3, marginBottom: 10 }}>
      {children}
    </div>
  );
}
