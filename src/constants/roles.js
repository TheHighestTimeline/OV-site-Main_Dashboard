// ── Role definitions ──────────────────────────────────────────────────────────
export const ROLES = {
  admin:          { label: 'Admin',          desc: 'Full access + user management' },
  executive:      { label: 'Executive',      desc: 'All read-only + financials' },
  operations:     { label: 'Operations',     desc: 'Tasks, Contacts, Outreach, References' },
  sales:          { label: 'Sales',          desc: 'Outreach + References only' },
  finance:        { label: 'Finance',        desc: 'Financial + Overview' },
  member:         { label: 'Member',         desc: 'Standard access — scoped to assigned companies' },
  senior_partner: { label: 'Senior Partner', desc: 'Executive-level access with company scoping' },
  pm:             { label: 'PM',             desc: 'Project Manager — tasks, contacts, drive across assigned companies' },
  read_only:      { label: 'Read Only',      desc: 'View-only — cannot create or modify records' },
};

// ── Company slugs ─────────────────────────────────────────────────────────────
export const COMPANIES = [
  'ovmg', 'ovm', 'ovtv', 'ovf', 'amplify', 'carbonsponge', 'ovd', 'ovv',
];

// ── Company metadata ──────────────────────────────────────────────────────────
// sub_tabs: the tab IDs available inside each company section.
//
// §6 requirement: EVERY company exposes Tasks, Contacts, Drive, and Tools (plus a Kanban). Companies that don't have a bespoke tool set get the
// "Coming soon" Tools placeholder (same pattern Carbon Sponge already used).
// OVM's Tools tab is the combined hub (HTML editor + Email + Clients) — those
// three are reachable via the Tools tab rather than as separate sidebar pills.
export const COMPANY_META = {
  ovmg: {
    label:    'OVMG',
    color_hex: '#d96b3a',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  ovm: {
    label:    'OVM',
    color_hex: '#2c5d8a',
    // Tools = HTML editor + Email composer + Clients, combined (see CompanyView).
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  ovtv: {
    label:    'OVTV',
    color_hex: '#2f7d5f',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  ovf: {
    label:    'OVF',
    color_hex: '#b48a1e',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  amplify: {
    label:    'Amplify Artists',
    color_hex: '#7c3d8f',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  carbonsponge: {
    label:    'Carbon Sponge',
    color_hex: '#3a7d44',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  ovd: {
    label:    'OVD',
    color_hex: '#8a5c2c',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
  ovv: {
    label:    'OVV',
    color_hex: '#5c2c8a',
    sub_tabs: ['tasks', 'contacts', 'activities', 'kanban', 'drive', 'tools', 'references'],
  },
};

// ── Sub-tab labels (used inside company sections) ─────────────────────────────
export const COMPANY_SUBTAB_LABELS = {
  contacts:     'Contacts',
  activities:   'Activities',
  tasks:        'Tasks',
  kanban:       'Kanban',
  opportunities:'Opportunities',
  drive:      'Drive',
  references: 'References',
  tools:      'Tools',
  html:       'HTML Editor',
  email:      'Email',
  clients:    'Clients',
};

// ── Company-name → slug matching ──────────────────────────────────────────────
// Used to pre-filter company-scoped list views (Tasks, Contacts, References, …)
// so one company page never shows another company's records (§6). Short
// abbreviations are matched EXACTLY (so 'ovm' never matches 'ovmg'); longer
// phrases are matched as a case-insensitive substring.
export const COMPANY_FILTER_TOKENS = {
  ovmg:         ['ovmg', 'onevibemediagroup'],
  ovm:          ['ovm'],
  ovtv:         ['ovtv', 'onevibetv'],
  ovf:          ['ovf', 'onevibefest'],
  amplify:      ['amplify'],
  carbonsponge: ['carbonsponge', 'carbon sponge'],
  ovd:          ['ovd'],
  ovv:          ['ovv'],
};

export function companyNameMatchesSlug(name, slug) {
  if (!slug) return true;          // no filter → everything matches
  if (!name) return false;
  const n = String(name).toLowerCase().trim();
  const tokens = COMPANY_FILTER_TOKENS[slug] || [slug];
  return tokens.some(tok => (tok.length <= 4 ? n === tok : n.includes(tok)));
}

// ── Deal Category ↔ company-slug mapping ──────────────────────────────────────
// Per Tanner: in Notion, a task/opportunity is tied to an internal company via
// the "Deal Category" select. These are the canonical Deal Category values (as
// they appear in Notion) that map onto each website company tab. Spelling
// variants are included so matching survives minor differences. OVTV/OVV have
// no Deal Category yet — their tabs simply show nothing until one is assigned.
// Values match the "Entity" single-select options on the Master Action Board /
// Opportunities tables. Legacy Notion tokens are kept so older tagged records
// still resolve. Matching is space/case-insensitive (see _norm).
export const SLUG_TO_DEAL_CATEGORY = {
  ovmg:         ['OVMG'],
  ovm:          ['OVM', 'ONEVIBEMEDIA'],
  ovd:          ['OVD', 'ONEVIBEDATA'],
  ovf:          ['OVF', 'ONEVIBEFEST'],
  ovtv:         ['OVTV', 'ONEVIBETV'],
  ovv:          ['OVV'],
  amplify:      ['Amplify', 'AMPLIFYARTISTS', 'AMPLIFYBRANDS'],
  carbonsponge: ['Carbon Sponge', 'CARBONE SPONGE', 'CARBON SPONGE'],
};

const _norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

// True if any of a record's deal categories maps to the given company slug.
// Falls back to legacy company-name matching so already-tagged tasks still show.
export function dealCategoryMatchesSlug(dealCategories, slug, companyNames = []) {
  if (!slug) return true;
  const wanted = (SLUG_TO_DEAL_CATEGORY[slug] || []).map(_norm);
  const dc = (dealCategories || []).map(_norm);
  if (wanted.length && dc.some(d => wanted.includes(d))) return true;
  return (companyNames || []).some(n => companyNameMatchesSlug(n, slug));
}

// Which tab IDs each role can access.
// OVMG-email users and 'admin' role always get everything (handled in useAuth.js).
// Per-user overrides (publicMetadata.toolOverrides) can grant/deny individual
// tabs on top of role defaults — applied in useAuth.js + src/lib/access.js.
// read_only role is handled specially in canAccess() — it can see all tabs the
// user's other roles allow, but mutations are blocked at the component level.
export const TAB_ACCESS = {
  overview:     ['admin', 'executive', 'operations', 'finance', 'member', 'senior_partner', 'read_only'],
  'my-day':     ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'audio-dump': ['admin'],
  contacts:     ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  tasks:        ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  kanban:       ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  outreach:     ['admin', 'executive', 'operations', 'sales', 'member', 'senior_partner', 'read_only'],
  social:       ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  websites:     ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  tools:        ['admin', 'executive', 'operations', 'sales', 'member', 'senior_partner', 'read_only'],
  booking:      ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  references:   ['admin', 'executive', 'operations', 'sales', 'finance', 'member', 'senior_partner', 'read_only'],
  ncnda:        ['admin', 'executive', 'operations', 'sales', 'member', 'senior_partner'],
  signature:    ['admin', 'executive', 'operations', 'sales', 'finance', 'member', 'senior_partner', 'read_only'],
  email:        ['admin', 'executive', 'operations', 'member', 'senior_partner'],
  financial:    ['admin', 'executive', 'finance', 'senior_partner'],
  'team-goals': ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  settings:     ['admin', 'executive', 'operations', 'sales', 'finance', 'member', 'senior_partner', 'read_only'],
  admin:        ['admin'],
  cost:         ['admin'],
  // Company-scoped tabs — access checked via canAccess(user, 'company:slug')
  'company:ovmg':        ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:ovm':         ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:ovtv':        ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:ovf':         ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:amplify':     ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:carbonsponge':['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:ovd':         ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
  'company:ovv':         ['admin', 'executive', 'operations', 'member', 'senior_partner', 'read_only'],
};

// §15: the PM (Project Manager) role mirrors Operations' access across every
// tab + company section (tasks, contacts, drive, tools, etc.) without
// the finance/admin/cost/audio-dump surfaces. Derived rather than hand-listed so
// the two stay in sync. Admins assign 'pm' to users from the Admin panel.
for (const tab of Object.keys(TAB_ACCESS)) {
  if (TAB_ACCESS[tab].includes('operations') && !TAB_ACCESS[tab].includes('pm')) {
    TAB_ACCESS[tab].push('pm');
  }
}

export const ALL_TABS = [
  'overview', 'my-day', 'audio-dump',
  'contacts', 'tasks', 'outreach', 'social',
  'websites', 'tools', 'booking', 'references',
  'ncnda', 'signature', 'email', 'financial',
  'team-goals', 'settings', 'admin', 'cost',
  // Company tab entries
  'company:ovmg', 'company:ovm', 'company:ovtv', 'company:ovf',
  'company:amplify', 'company:carbonsponge', 'company:ovd', 'company:ovv',
];

// User-facing labels for each tab (used by the per-tool override admin UI).
export const TAB_LABELS = {
  overview:          'Overview',
  'my-day':          'My Day',
  'audio-dump':      'Audio Dump',
  contacts:          'Contacts',
  tasks:             'Tasks',
  outreach:          'Outreach',
  social:            'Clients',
  websites:          'Websites',
  tools:             'Tools',
  booking:           'Booking',
  references:        'References',
  ncnda:             'NCNDA Sender',
  signature:         'Signature Generator',
  email:             'Email Composer',
  financial:         'Financial',
  'team-goals':      'Team Goals',
  settings:          'Settings',
  admin:             'Admin',
  cost:              'Cost',
  // Company sections
  'company:ovmg':         'OVMG',
  'company:ovm':          'OVM',
  'company:ovtv':         'OVTV',
  'company:ovf':          'OVF',
  'company:amplify':      'Amplify Artists',
  'company:carbonsponge': 'Carbon Sponge',
  'company:ovd':          'OVD',
  'company:ovv':          'OVV',
};

// Tabs that should NEVER be grantable to non-OVMG-domain accounts via per-tool
// overrides. Hardcoded locks — admin UI cannot bypass these.
export const NEVER_OVERRIDABLE_TO_NON_OVMG = [
  'audio-dump',  // admin-only, no external grant path
];
