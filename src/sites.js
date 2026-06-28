// ── OVMG-managed sites registry ──────────────────────────────────────────────
// Each entry powers the Websites tab: identifies the repo, the live URL,
// the rendered-site type, and which branch is canonical for production.
//
// Adding a new site = add an entry here. No backend changes needed for
// Path A (free iframe preview); Path B kicks in automatically when a commit
// touches a function / build config / package.json.
//
// Tech-stack notes:
//   - type 'static'              → plain HTML/CSS/JS, no build step
//   - type 'static-with-functions' → static frontend + Netlify functions
//   - type 'built'               → frontend requires a Netlify build (React/Vite/etc.)

export const SITES = [
  {
    id:             'seed',
    label:          'Seed',
    repo:           'InTheNightRaider/SEED',
    netlifySiteId:  'seed',
    liveUrl:        'https://seed.netlify.app',
    type:           'static',
    defaultBranch:  'main',
    provider:       'netlify',
    description:    'OVMG seed concept site',
  },
  {
    id:             'kitchenagent',
    label:          'Kitchen Agent',
    repo:           'InTheNightRaider/kitchenagent',
    netlifySiteId:  'kitchenagent',
    liveUrl:        'https://kitchenagent.netlify.app',
    type:           'static-with-functions',
    defaultBranch:  'main',
    provider:       'external_url',   // Cloudflare-tunneled — iframe blocked, open in new tab
    noIframe:       true,             // flag: PreviewPane falls back to "Open in new tab"
    description:    'AI-powered kitchen agent (Claude + Composio integrations)',
  },
  {
    id:             'ovmgdashboard',
    label:          'OVMG Dashboard',
    repo:           'InTheNightRaider/OVMGDASHBOARD',
    netlifySiteId:  'ovmgdashboard',
    liveUrl:        'https://ovmgdashboard.netlify.app',
    type:           'built',                   // Vite React build — Path B (Netlify branch preview) only
    defaultBranch:  'master',
    provider:       'netlify',
    description:    'This dashboard itself. Branch/preview/deploy from inside the dashboard.',
  },
];

// Get a site by id (returns undefined if not found).
export const getSite = id => SITES.find(s => s.id === id);

// Files / paths that force Path B (Netlify branch preview) when changed.
// If any commit on a branch touches one of these, the dashboard renders the
// Netlify deploy preview instead of iframing the working files directly.
export const PATH_B_TRIGGERS = [
  /^netlify\/functions\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^netlify\.toml$/,
  /^vite\.config\./,
  /^webpack\.config\./,
];

// Returns true if a list of changed file paths requires Path B.
export function needsPathB(changedPaths = []) {
  return changedPaths.some(p => PATH_B_TRIGGERS.some(re => re.test(p)));
}
