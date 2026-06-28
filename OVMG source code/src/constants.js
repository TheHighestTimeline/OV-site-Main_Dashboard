// ── Color palette ────────────────────────────────────────────────────────────
// LIGHT is the original cream palette. DARK is a true dark theme — same token
// names with role-appropriate dark values, so dark mode renders as a real dark
// UI instead of a color inversion. `C` is mutated in place by applyPalette()
// (the object reference never changes, so every component that imports it picks
// up the swap on the next render — see setTheme + the theme re-render in main).
const LIGHT = {
  ink9: '#0e1014', ink8: '#161922', ink7: '#1f232e', ink5: '#3a4050',
  ink3: '#6b7180', ink2: '#a6abb8',
  cr1: '#f3eee4', cr2: '#ebe4d3', cr3: '#ddd3bb',
  bg: '#fbf8f2', bg2: '#f4f0e6',
  acc: '#d96b3a', accS: '#f5e2d3', accD: '#a04b22',
  grn: '#2f7d5f', grnS: '#d6ebdf',
  yel: '#b48a1e', yelS: '#f3e6c4',
  red: '#b03a3a', redS: '#f1d6d6',
  blu: '#2c5d8a', bluS: '#d6e2ef',
  grS: '#e4e1d8',
  // Persistent dark chrome (sidebar, mobile top bar, task lane bars). These stay
  // dark in BOTH themes — unlike ink9, which doubles as primary text and so has
  // to flip light in dark mode. chromeFg/chromeMut are the text on that chrome.
  chromeBg: '#0e1014', chromeBg2: '#1f232e', chromeFg: '#fbf8f2', chromeMut: '#a6abb8',
};

const DARK = {
  // Text/chrome tokens flip from near-black → near-white (and keep their
  // light→dark ordering: ink9 = strongest).
  ink9: '#f4f1ea', ink8: '#e7e3da', ink7: '#d3cec3', ink5: '#9aa1ad',
  ink3: '#7e8794', ink2: '#5c6573',
  // Surfaces/borders: dark panels, progressively lighter for borders.
  cr1: '#1b212b', cr2: '#2a313c', cr3: '#3a434f',
  bg: '#0e1014', bg2: '#161b22',
  // Accents stay vivid (slightly brightened); the soft "S" backgrounds become
  // dark tints so a tag's bright foreground keeps strong contrast.
  acc: '#e07b4a', accS: '#3a2418', accD: '#f0a075',
  grn: '#45b389', grnS: '#15281f',
  yel: '#d2a23a', yelS: '#2c2611',
  red: '#e06a6a', redS: '#2e1616',
  blu: '#5b97cf', bluS: '#13202c',
  grS: '#2a313c',
  // Dark-mode chrome: near-black nav slightly darker than the page (#0e1014),
  // with light text — so the sidebar/top bar/lane bars read as dark, not flipped.
  chromeBg: '#0a0c10', chromeBg2: '#1b212c', chromeFg: '#f4f1ea', chromeMut: '#8b93a1',
};

// Live palette — start from LIGHT; applyPalette swaps values in place.
export const C = { ...LIGHT };

export function applyPalette(mode) {
  Object.assign(C, mode === 'dark' ? DARK : LIGHT);
}

export const SERIF = "'Fraunces',Georgia,serif";
export const SANS  = "'Geist',system-ui,sans-serif";
export const MONO  = "'Geist Mono',monospace";

// ── Dark mode ────────────────────────────────────────────────────────────────
// A real dark palette (no invert filter). setTheme swaps the `C` tokens, toggles
// the root class (for the pre-paint background in index.html), persists the
// choice, and fires `ovmg:theme` so the React root re-renders with new tokens.
export function getTheme() {
  try { return localStorage.getItem('ovmg.theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function setTheme(mode) {
  const dark = mode === 'dark';
  applyPalette(dark ? 'dark' : 'light');
  try {
    document.documentElement.classList.toggle('ovmg-dark', dark);
    localStorage.setItem('ovmg.theme', dark ? 'dark' : 'light');
  } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('ovmg:theme')); } catch { /* ignore */ }
}
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// Apply the saved palette at module load so the very first render is themed
// correctly (before any component reads C).
try { applyPalette(getTheme()); } catch { /* ignore */ }

// ── Notion database IDs ──────────────────────────────────────────────────────
export const DB = {
  CRM:       '311ec2c4642881c2af03f92bb583f4ba',
  TASKS:     '311ec2c46428817a9cb8c18ea82101b0',
  GOALS:     '5baaa13aba09464aa686122518fd63e8',
  FINANCIAL: '20eec2c4642881608f64f87fd778f27e',
  COMPANIES: '312ec2c4642880aea5facc7396fb9327',
  NOTES:     '314ec2c4642880e28bd2000b1bc2224d',
};

// ── Task statuses ────────────────────────────────────────────────────────────
// MUST match the Airtable "Master Action Board" Status single-select options
// EXACTLY (case included) — and the Projects "Status" field uses the same set —
// or status writes create duplicate options. Order = column order on the board.
export const STATUSES = [
  'Submitted',
  'Not Started',
  'In Progress',
  'Needs Attention',
  'Waiting On Response',
  'On Hold',
  'Done',
  'Canceled',
];

// ── Related entities — canonical Notion multi_select values for CRM "Relates To"
// These are the real option names stored in Notion; companyNameMatchesSlug
// maps them back to website slugs for per-company filtering.
export const RELATES = [
  'OneVibeMediaGroup', 'ONEVIBEMEDIA', 'ONEVIBEDATA', 'ONEVIBEFEST',
  'AMPLIFYARTISTS', 'AMPLIFYBRANDS', 'Carbon Sponge',
  'OneVibeGroup', 'DATA CENTERS', 'ONEVIBEPRODUCTIONS', 'SOLR ESS',
];

// ── Status color helpers ──────────────────────────────────────────────────────
export const stBg = s => {
  if (!s) return C.grS;
  const x = s.toLowerCase();
  if (x.includes('cancel')) return C.grS;
  if (x.includes('attention')) return C.redS;
  if (x.includes('done') || x.includes('track') || x === 'active') return C.grnS;
  if (x.includes('progress')) return C.bluS;
  if (x.includes('risk') || x.includes('waiting')) return C.yelS;
  if (x.includes('hold') || x.includes('blocked') || x.includes('benched')) return C.redS;
  return C.grS;
};
export const stFg = s => {
  if (!s) return C.ink5;
  const x = s.toLowerCase();
  if (x.includes('cancel')) return C.ink5;
  if (x.includes('attention')) return C.red;
  if (x.includes('done') || x.includes('track') || x === 'active') return C.grn;
  if (x.includes('progress')) return C.blu;
  if (x.includes('risk') || x.includes('waiting')) return C.yel;
  if (x.includes('hold') || x.includes('blocked') || x.includes('benched')) return C.red;
  return C.ink5;
};
export const prBg = p => {
  if (!p) return C.grS;
  const x = p.toLowerCase();
  if (x === 'high') return C.redS;
  if (x === 'medium') return C.yelS;
  if (x === 'low') return C.bluS;
  return C.grS;
};
export const prFg = p => {
  if (!p) return C.ink5;
  const x = p.toLowerCase();
  if (x === 'high') return C.red;
  if (x === 'medium') return C.yel;
  if (x === 'low') return C.blu;
  return C.ink5;
};

// ── Date helpers ─────────────────────────────────────────────────────────────
export const fmtD = iso => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
};
export const fmtC = n =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const dUntil = iso => {
  if (!iso) return null;
  const d = new Date(iso), t = new Date();
  d.setHours(0,0,0,0); t.setHours(0,0,0,0);
  return Math.round((d - t) / 86400000);
};
export const fmtR = iso => {
  if (!iso) return '—';
  const x = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return x === 0 ? 'today' : x === 1 ? 'yesterday' : x < 7 ? `${x}d ago` : fmtD(iso);
};

let _uid = 0;
export const uid = () => `x${++_uid}`;

// Build the canonical Notion page URL from a record's id (Notion page id). Used
// for "Edit in Notion" links on Tasks / Opportunities / Contacts so a record can
// be opened and edited directly in Notion.
export const notionUrl = id => id ? `https://www.notion.so/${String(id).replace(/-/g, '')}` : null;
