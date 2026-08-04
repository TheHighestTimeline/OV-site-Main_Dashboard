// All API calls to Netlify Functions.
const BASE = '/.netlify/functions';

// ── Airtable schema ─────────────────────────────────────────────────────────
// Returns { tables: [{ id, name, fields: [{id, name, type}] }] }
// Used to build "Open in Airtable" deep-links and validate field mappings.
let _schemaCache = null;
export async function getAirtableSchema() {
  if (_schemaCache) return _schemaCache;
  try {
    const data = await req('airtable-schema');
    _schemaCache = data;
    return data;
  } catch {
    return { tables: [] };
  }
}
// Given a table name (e.g. 'Opportunities') and a record ID, returns the
// direct Airtable record URL. Falls back to the base if the table isn't found.
const BASE_ID = 'appgZ4EvfGEI4owb7';
export function airtableRecordUrl(tableId, recordId) {
  if (!tableId) return `https://airtable.com/${BASE_ID}`;
  if (!recordId) return `https://airtable.com/${BASE_ID}/${tableId}`;
  return `https://airtable.com/${BASE_ID}/${tableId}/${recordId}`;
}

// Clerk exposes window.Clerk after ClerkProvider mounts.
async function getToken() {
  try {
    return await window.Clerk?.session?.getToken() ?? null;
  } catch {
    return null;
  }
}

// Default 45s timeout (voice transcribe/parse can legitimately take a while;
// everything else fails long before that). Pass opts.timeoutMs to override.
async function req(path, opts = {}) {
  const token = await getToken();
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 45000);
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out — check your connection and try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText);
    let msg  = raw;
    let body = null;
    // Server errors arrive as {"error": "..."} — unwrap for readable toasts.
    try {
      body = JSON.parse(raw);
      if (body?.error) msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    } catch { /* not JSON; keep the raw text */ }

    const e = new Error(msg || `HTTP ${res.status}`);
    // Some endpoints refuse deliberately and hand back what the UI needs to
    // recover: the Today card's swap prompt (FOCUS_FULL) and the stage
    // evidence gate (EVIDENCE_REQUIRED) both arrive as a 409 with a payload.
    // Flattening those to a bare message would turn a designed interaction
    // into a dead-end toast.
    e.status = res.status;
    e.code   = body?.code || null;
    e.body   = body;
    throw e;
  }
  return res.json();
}

// Tasks
export const getTasks       = ()         => req('tasks-list');
// Opportunities (the overall effort; tasks relate to these)
export const getOpportunities    = ()         => req('opportunities-list');
export const createOpportunity   = data       => req('opportunities-create', { method: 'POST',   body: JSON.stringify(data) });
export const updateOpportunity   = (id, data) => req('opportunities-update', { method: 'PATCH',  body: JSON.stringify({ id, ...data }) });
export const deleteOpportunity   = id         => req('opportunities-delete', { method: 'DELETE', body: JSON.stringify({ id }) });
export const createTask     = data       => req('tasks-create',      { method: 'POST',  body: JSON.stringify(data) });
export const updateTask     = (id, data) => req('tasks-update',      { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteTask     = id         => req('tasks-delete',      { method: 'POST',  body: JSON.stringify({ id }) });
export const getTaskNotes   = id         => req(`tasks-notes-list?id=${encodeURIComponent(id)}`);

// Projects & Clients (for form connection dropdowns)
export const getProjects    = ()         => req('projects-list');
export const getClients     = ()         => req('clients-list');

// Contacts
export const getContacts   = ()         => req('contacts-list');
export const createContact = data       => req('contacts-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateContact = (id, data) => req('contacts-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
// Merge: `fields` carries the field-by-field survivor picks made on the merge
// screen, applied to the keeper in the same call so it is never half-merged.
export const mergeContacts = (keepId, dropIds, fields = undefined, companyIds = undefined) =>
  req('contacts-merge', { method: 'POST', body: JSON.stringify({ keepId, dropIds: [].concat(dropIds), fields, companyIds }) });
// Read-only: what each candidate holds, and what points at it.
export const previewContactMerge = (ids) =>
  req('contacts-merge', { method: 'POST', body: JSON.stringify({ preview: true, ids }) });
// Two calls by design — GET previews what a delete would unlink, DELETE does it.
export const previewContactDelete = (id) => req(`contacts-delete?id=${encodeURIComponent(id)}`);
export const deleteContact = (id) => req('contacts-delete', { method: 'DELETE', body: JSON.stringify({ id }) });

// Notes (contact notes)
export const getNotes    = contactId    => req(`notes-list?contactId=${contactId}`);
export const createNote  = data         => req('notes-create',  { method: 'POST',  body: JSON.stringify(data) });
export const updateNote  = (id, data)   => req('notes-update',  { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteNote  = id           => req('notes-delete',  { method: 'POST',  body: JSON.stringify({ id }) });

// Companies (entity master list — Entity Code/Type/Parent Company/Subject Descriptor)
// `rollups: false` skips the joined people/deal/last-activity counts. Pickers
// pass it; the Companies tab does not.
export const getCompanies = ({ rollups = true } = {}) =>
  req(`companies-list${rollups ? '' : '?rollups=0'}`);
export const createCompany = (data)     => req('companies-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateCompany = (id, data) => req('companies-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const previewCompanyDelete = (id) => req(`companies-delete?id=${encodeURIComponent(id)}`);
export const deleteCompany = (id) => req('companies-delete', { method: 'DELETE', body: JSON.stringify({ id }) });
export const previewCompanyMerge = (ids) =>
  req('companies-merge', { method: 'POST', body: JSON.stringify({ preview: true, ids }) });
export const mergeCompanies = (keepId, dropIds, fields = undefined) =>
  req('companies-merge', { method: 'POST', body: JSON.stringify({ keepId, dropIds: [].concat(dropIds), fields }) });

// Granola + Gmail auto-logging. Writes Activity rows and Last Contacted only —
// it never creates a task or moves a stage. See netlify/functions/crm-autolog.js.
export const runAutoLog = (only = null) =>
  req(`crm-autolog${only ? `?only=${only}` : ''}`, { method: 'POST', body: '{}' });

// Activities (contact/company interaction timeline — calls, notes, meetings,
// voice notes, transcripts. Distinct from the older per-contact Notes above:
// an Activity links to exactly one Company, so it can answer "what happened
// with Carbon Sponge" even though the Contact also works with OVMG.)
export const getActivities    = (companyId) => req(`activities-list?companyId=${encodeURIComponent(companyId)}`);
export const getActivitiesForContact = (contactId) => req(`activities-list?contactId=${encodeURIComponent(contactId)}`);
export const createActivity   = data        => req('activities-create', { method: 'POST', body: JSON.stringify(data) });

// Documents (Drive is the source of truth for the file; this stores metadata
// + the Drive link only — Airtable attachment URLs expire, so we never rely
// on Airtable to host the file itself).
export const getDocuments    = (companyId) => req(`documents-list?companyId=${encodeURIComponent(companyId)}`);
export const getDocumentsForContact = (contactId) => req(`documents-list?contactId=${encodeURIComponent(contactId)}`);
export const createDocument  = data         => req('documents-create', { method: 'POST', body: JSON.stringify(data) });
export const updateDocument  = (id, data)   => req('documents-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });

// Folders (Drive-folder registry — documents get filed into these). A folder is
// scoped to a company (company-shared) and/or a single contact (per-contact).
export const getFoldersForCompany = (companyId) => req(`folders-list?companyId=${encodeURIComponent(companyId)}`);
export const getFoldersForContact = (contactId) => req(`folders-list?contactId=${encodeURIComponent(contactId)}`);
export const createFolder    = data         => req('folders-create', { method: 'POST', body: JSON.stringify(data) });

// Company drill-down — one call returns notes, documents (+folders), open tasks,
// people, and opportunities for the "Company Snapshot" modal opened from a contact.
export const getCompanyDetail = (companyId) => req(`company-detail?companyId=${encodeURIComponent(companyId)}`);

// Goals
export const getGoals   = ()   => req('goals-list');
export const createGoal = data => req('goals-create', { method: 'POST', body: JSON.stringify(data) });

// Financial
export const getFinancial = () => req('financial-list');

// Voice
export const transcribeAudio = (base64Audio, mimeType) =>
  req('voice-transcribe', { method: 'POST', body: JSON.stringify({ audio: base64Audio, mimeType }) });
export const parseVoice = (transcript, context) =>
  req('voice-parse', { method: 'POST', body: JSON.stringify({ transcript, context }) });

// Outreach
export const getOutreach       = ()         => req('outreach-list');
export const createOutreach    = data       => req('outreach-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateOutreach    = (id, data) => req('outreach-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteOutreach    = id         => req('outreach-delete', { method: 'POST', body: JSON.stringify({ id }) });
export const getOutreachNotes  = id         => req(`outreach-notes-list?id=${encodeURIComponent(id)}`);
export const addOutreachNote   = (id, note) => req('outreach-update', { method: 'PATCH', body: JSON.stringify({ id, updateNote: note }) });

// Amplify Projects (Amplify Artists company kanban)
export const getAmplifyProjects    = ()         => req('amplify-projects-list');
export const updateAmplifyProject  = (id, data) => req('amplify-projects-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });

// Team
export const getTeamMembers = () => req('team-list');

// Generic key/value app state (Drive files, templates, company kanban boards, …)
export const getAppState = key        => req(`app-state-get?key=${encodeURIComponent(key)}`);
export const setAppState = (key, data) => req('app-state-set', { method: 'POST', body: JSON.stringify({ key, data }) });

// References — Phase 7 (Supabase-backed). The old Notion-backed
// getDocs/createDoc/updateDoc/deleteDoc helpers are kept below for backwards
// compatibility with any other code that still imports them.
export const submitReferenceNote = data => req('references-note', { method: 'POST', body: JSON.stringify(data) });
export const listResources     = ()                  => req('resources-list');
export const upsertResource    = data                => req('resources-upsert', { method: 'POST', body: JSON.stringify(data) });
export const deleteResource    = id                  => req('resources-delete', { method: 'POST', body: JSON.stringify({ id }) });
export const upsertCategory    = data                => req('categories-upsert', { method: 'POST', body: JSON.stringify(data) });
export const deleteCategory    = id                  => req('categories-delete', { method: 'POST', body: JSON.stringify({ id }) });

// (Legacy Notion-backed docs API removed 2026-07 — migration to Airtable is
// complete; use getDocuments/createDocument above.)

// Email
export const sendEmail          = data                 => req('send-email',           { method: 'POST', body: JSON.stringify(data) });
export const getEmailLabels     = ()                   => req('email-labels');
export const getEmailThreads    = (labelId, pageToken) => req('email-threads?labelId=' + encodeURIComponent(labelId) + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
export const getEmailThread     = id                   => req('email-thread-get?id=' + encodeURIComponent(id));
export const getEmailState      = ()                   => req('email-state');
export const saveEmailState     = data                 => req('email-state', { method: 'POST', body: JSON.stringify(data) });
export const modifyEmailThread  = (id, data)           => req('email-thread-modify',  { method: 'POST', body: JSON.stringify({ id, ...data }) });
export const deleteEmailThread  = (id, hard = false)   => req('email-thread-delete',  { method: 'POST', body: JSON.stringify({ id, hard }) });

// Admin
export const listUsers         = ()         => req('admin-list-users');
export const inviteUser        = data       => req('admin-invite-user',       { method: 'POST',  body: JSON.stringify(data) });
export const resetUserPassword = userId     => req('admin-reset-password',    { method: 'POST',  body: JSON.stringify({ userId }) });
export const updateUser        = (id, data) => req('admin-update-user',       { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const updateUserRoles   = (id, roles) => req('admin-update-user-roles', { method: 'POST', body: JSON.stringify({ id, roles }) });
export const setToolOverride   = (userId, tab, action) =>
  req('admin-set-tool-override', { method: 'POST', body: JSON.stringify({ userId, tab, action }) });

// NCNDA
export const sendNcnda         = data       =>
  req('ncnda-send', { method: 'POST', body: JSON.stringify(data) });

// Read-only. Reports what it found and how sure it is; never writes a signed
// date and never moves a stage — a human confirms.
export const detectNcnda = (contactId, entity) =>
  req(`ncnda-detect?contactId=${encodeURIComponent(contactId)}&entity=${encodeURIComponent(entity || '')}`);

// Bug reports (§2.4)
export const sendBugReport     = data       =>
  req('bug-report', { method: 'POST', body: JSON.stringify(data) });

// ── Review queue (§4 — Granola calls + audio dumps, approve-before-write) ────
export const listReviews       = (status = 'pending') => req(`reviews-list?status=${encodeURIComponent(status)}`);
export const countPendingReviews = ()       => req('reviews-list?status=pending&countOnly=1');
export const createReview      = data       => req('reviews-create', { method: 'POST', body: JSON.stringify(data) });
export const applyReview       = (id, actions) => req('reviews-apply', { method: 'POST', body: JSON.stringify({ id, actions }) });
export const updateReview      = (id, data) => req('reviews-update', { method: 'POST', body: JSON.stringify({ id, ...data }) });

// ── GitHub proxy (used by the Websites tab) ─────────────────────────────────
const ghProxy = (action, params = {}) =>
  req('github-proxy', { method: 'POST', body: JSON.stringify({ action, ...params }) });

export const listBranches  = (repo)                        => ghProxy('listBranches',  { repo });
export const getBranch     = (repo, branch)                => ghProxy('getBranch',     { repo, branch });
export const getFile       = (repo, ref, path)             => ghProxy('getFile',       { repo, ref, path });
export const listTree      = (repo, ref, recursive = false) => ghProxy('listTree',     { repo, ref, recursive });
export const getCommitDiff = (repo, sha)                   => ghProxy('getCommitDiff', { repo, sha });
export const createBranch  = (repo, fromBranch, newBranch) => ghProxy('createBranch',  { repo, fromBranch, newBranch });
export const detectSiteType = (repo, ref)                  => ghProxy('detectSiteType', { repo, ref });
export const compareCommits = (repo, base, head)           => ghProxy('compareCommits', { repo, base, head });
export const mergeBranch   = (repo, head, base)            => ghProxy('mergeBranch',   { repo, head, base });

// ── Netlify proxy (Path B branch previews + production deploys) ──────────────
const nlProxy = (action, params = {}) =>
  req('netlify-proxy', { method: 'POST', body: JSON.stringify({ action, ...params }) });

export const getSiteInfo      = (siteId)                   => nlProxy('getSiteInfo',      { siteId });
export const listSiteDeploys  = (siteId, limit = 5)        => nlProxy('listSiteDeploys',  { siteId, limit });
export const getBranchDeploy  = (siteId, branch)           => nlProxy('getBranchDeploy',  { siteId, branch });
export const triggerBuild     = (siteId, branch)           => nlProxy('triggerBuild',     { siteId, branch });

// ── Phase 8: Multi-account Google switcher ──────────────────────────────────
export const listGoogleAccounts     = ()        => req('google-accounts-list');
export const setActiveGoogleAccount = (id)      => req('google-accounts-set-active', { method: 'POST', body: JSON.stringify({ id }) });
export const removeGoogleAccount    = (id)      => req('google-accounts-remove',     { method: 'POST', body: JSON.stringify({ id }) });
export const startGoogleOAuth       = ()        => req('google-accounts-oauth-start',{ method: 'POST', body: JSON.stringify({}) });

// ── Phase 10: Booking pages ─────────────────────────────────────────────────
export const listBookingPages   = ()      => req('booking-pages-list');
export const upsertBookingPage  = data    => req('booking-pages-upsert', { method: 'POST', body: JSON.stringify(data) });
export const deleteBookingPage  = id      => req('booking-pages-delete', { method: 'POST', body: JSON.stringify({ id }) });

// Playbook removed — SOPs and references now live in Google Docs.
// Add Google Doc links as reference items in the References tab.

// ── Phase 12: Clients posts platform ────────────────────────────────────────
export const listPosts          = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return req(`posts-list?${qs}`);
};
export const upsertPost         = data    => req('posts-upsert', { method: 'POST', body: JSON.stringify(data) });
export const importPostsCSV     = (client_id, csv, status) => req('posts-csv-import', { method: 'POST', body: JSON.stringify({ client_id, csv, status }) });

// ── Phase 14: Cost dashboard + audit log ────────────────────────────────────
export const getCostDashboardData = (period = 'month') => req(`cost-dashboard-data?period=${encodeURIComponent(period)}`);
export const listAuditLog         = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return req(`audit-log-list?${qs}`);
};

// ── Audio logs (My Day + Audio Dump) ────────────────────────────────────────
export const listAudioLogs  = (params = {}) => { const qs = new URLSearchParams(params).toString(); return req(`audio-logs-list?${qs}`); };
export const createAudioLog = (data)        => req('audio-logs-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateAudioLog = (id, data)    => req('audio-logs-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });

// ── Phase 4 additions: Reference pins + Bookmark folders ────────────────────
export const pinReference         = (id)                   => req('references-pin',    { method: 'POST', body: JSON.stringify({ id }) });
export const unpinReference       = (id)                   => req('references-unpin',  { method: 'POST', body: JSON.stringify({ id }) });

export const listBookmarkFolders  = ()                      => req('bookmarks-list');
export const createBookmarkFolder = (data)                  => req('bookmarks-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateBookmarkFolder = (id, data)              => req('bookmarks-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteBookmarkFolder = (id)                    => req('bookmarks-delete', { method: 'POST',  body: JSON.stringify({ id }) });
export const addBookmark          = (folderId, referenceId) => req('bookmarks-add',    { method: 'POST',  body: JSON.stringify({ folderId, referenceId }) });
export const removeBookmark       = (folderId, referenceId) => req('bookmarks-remove', { method: 'POST',  body: JSON.stringify({ folderId, referenceId }) });

// ── Reference card comments ──────────────────────────────────────────────────
export const listResourceComments   = (resourceId)  => req(`resource-comments-list?resourceId=${encodeURIComponent(resourceId)}`);
export const createResourceComment  = (data)        => req('resource-comments-create', { method: 'POST',  body: JSON.stringify(data) });
export const updateResourceComment  = (id, data)    => req('resource-comments-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteResourceComment  = (id)          => req('resource-comments-delete', { method: 'POST',  body: JSON.stringify({ id }) });

// ── Contacts: log touch ─────────────────────────────────────────────────────
export const logContactTouched = (id) => req('contacts-update', { method: 'PATCH', body: JSON.stringify({ id, last_contacted_at: new Date().toISOString() }) });

// ── Comments (universal) ────────────────────────────────────────────────────
export const listComments  = (entity, entityId) => req(`comments-list?entity=${entity}&entityId=${entityId}`);
export const createComment = (data) => req('comments-create', { method: 'POST', body: JSON.stringify(data) });
export const updateComment = (id, data) => req('comments-update', { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteComment = (id) => req('comments-delete', { method: 'POST', body: JSON.stringify({ id }) });

// ── File uploads ────────────────────────────────────────────────────────────
export const uploadFile = (data) => req('file-upload', { method: 'POST', body: JSON.stringify(data) });

// ── Kanban (generic) ────────────────────────────────────────────────────────
export const listKanbanBoards = (scope) => req(`kanban-boards-list?scope=${scope}`);
export const listKanbanCards  = (boardId) => req(`kanban-cards-list?boardId=${boardId}`);
export const upsertKanbanCard = (data) => req('kanban-cards-upsert', { method: 'POST', body: JSON.stringify(data) });
export const moveKanbanCard   = (cardId, laneId, position) => req('kanban-cards-move', { method: 'POST', body: JSON.stringify({ cardId, laneId, position }) });
export const deleteKanbanCard = (id) => req('kanban-cards-delete', { method: 'POST', body: JSON.stringify({ id }) });
export const upsertKanbanLane = (data) => req('kanban-lanes-upsert', { method: 'POST', body: JSON.stringify(data) });
export const deleteKanbanLane = (id) => req('kanban-lanes-delete', { method: 'POST', body: JSON.stringify({ id }) });

// ── Client platforms ────────────────────────────────────────────────────────
export const listClientPlatforms  = (clientId) => req(`client-platforms-list?clientId=${clientId}`);
export const upsertClientPlatform = (data) => req('client-platforms-upsert', { method: 'POST', body: JSON.stringify(data) });

// ── Ads ─────────────────────────────────────────────────────────────────────
export const listAds  = (clientId) => req(`ads-list?clientId=${clientId}`);
export const upsertAd = (data) => req('ads-upsert', { method: 'POST', body: JSON.stringify(data) });
export const deleteAd = (id) => req('ads-delete', { method: 'POST', body: JSON.stringify({ id }) });

// ── Threads tab (WP2 through WP11) ──────────────────────────────────────────
// One read backs the whole tab: programs, workstreams, participations, contacts.
// Split reads would fan out into an N+1 straight through Airtable's 5 req/sec
// ceiling, so the server joins once and the client derives all three views.
export const getThreadsData = () => req('coo-threads-data');

// Participations — one contact inside one workstream. Carries the stage.
export const upsertParticipation = (data) =>
  req('coo-participation-upsert', { method: 'POST', body: JSON.stringify(data) });

// Sub-opportunities ("stories"). Goes through its own endpoint rather than
// opportunities-create/update because saving one also reconciles the per-person
// paperwork rows underneath it: adding someone to a thread opens their row,
// removing them marks it Inactive.
export const saveStory = (data) =>
  req('coo-story-save', { method: 'POST', body: JSON.stringify(data) });

// Proposed links, matched from the CRM's own company names. GET writes nothing;
// POST writes only what the user ticked. Inferences propose, they never apply.
export const getParticipationSuggestions = () => req('coo-participation-suggest');
export const applyParticipationSuggestions = (groups) =>
  req('coo-participation-suggest', { method: 'POST', body: JSON.stringify({ groups }) });

// Stage moves go through here, never through a plain field write, because this
// is where the evidence gate lives. A 409 with code EVIDENCE_REQUIRED means the
// transition was refused, not that it failed.
export const advanceStage = (data) =>
  req('coo-stage-advance', { method: 'POST', body: JSON.stringify(data) });

// Timeline
export const getCooEvents = (scope) => {
  const qs = new URLSearchParams(scope).toString();
  return req(`coo-events-list?${qs}`);
};
export const createCooNote = (data) =>
  req('coo-note-create', { method: 'POST', body: JSON.stringify(data) });

// Triage buckets
export const getTriage = () => req('coo-triage');

// The brief. GET returns cache (flagged when stale); POST regenerates.
export const getBrief       = (participationId) => req(`coo-brief-generate?participationId=${encodeURIComponent(participationId)}`);
export const regenerateBrief = (participationId) =>
  req('coo-brief-generate', { method: 'POST', body: JSON.stringify({ participationId, force: true }) }, );

// Signals — the Resolved? queue. Inferred signals propose; humans dispose.
export const getSignals    = (status = 'pending') => req(`coo-signals?status=${encodeURIComponent(status)}`);
export const resolveSignal = (id, decision, note) =>
  req('coo-signals', { method: 'POST', body: JSON.stringify({ id, decision, note }) });

// Unmatched identities queue + manual merge
export const getIdentities = (status = 'unmatched') => req(`coo-identities?status=${encodeURIComponent(status)}`);
export const linkIdentity  = (data) => req('coo-identities', { method: 'POST', body: JSON.stringify(data) });

// Delegation and the referral tree
export const delegateTask     = (data) => req('coo-delegate', { method: 'POST', body: JSON.stringify(data) });
export const getAccountability = (view = 'both') => req(`coo-accountability?view=${encodeURIComponent(view)}`);

// Voice capture into the Threads ecosystem. Always review before applying.
export const applyVoiceActions = (data) =>
  req('coo-voice-apply', { method: 'POST', body: JSON.stringify(data) });

// Manual scan triggers (also run on a schedule)
export const scanDrive       = () => req('coo-signals-scan-drive',  { method: 'POST', body: '{}' });
export const scanGmailSignals = () => req('coo-signals-scan-gmail', { method: 'POST', body: '{}' });
export const ingestGmail     = () => req('coo-ingest-gmail',        { method: 'POST', body: '{}' });

// ── Today list (WP9) — Focus is a field on Master Action Board ──────────────
// A 409 with code FOCUS_FULL is the swap prompt, not an error to swallow.
export const getFocus   = ()                   => req('tasks-focus');
export const setFocus   = (taskId, focus, swapOutTaskId) =>
  req('tasks-focus', { method: 'POST', body: JSON.stringify({ taskId, focus, swapOutTaskId }) });
export const reorderFocus = (order)            => req('tasks-focus', { method: 'POST', body: JSON.stringify({ order }) });
