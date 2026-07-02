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

async function req(path, opts = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}/${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
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

// Notes (contact notes)
export const getNotes    = contactId    => req(`notes-list?contactId=${contactId}`);
export const createNote  = data         => req('notes-create',  { method: 'POST',  body: JSON.stringify(data) });
export const updateNote  = (id, data)   => req('notes-update',  { method: 'PATCH', body: JSON.stringify({ id, ...data }) });
export const deleteNote  = id           => req('notes-delete',  { method: 'POST',  body: JSON.stringify({ id }) });

// Companies (entity master list — Entity Code/Type/Parent Company/Subject Descriptor)
export const getCompanies = () => req('companies-list');

// Activities (contact/company interaction timeline — calls, notes, meetings,
// voice notes, transcripts. Distinct from the older per-contact Notes above:
// an Activity links to exactly one Company, so it can answer "what happened
// with Carbon Sponge" even though the Contact also works with OVMG.)
export const getActivities    = (companyId) => req(`activities-list?companyId=${encodeURIComponent(companyId)}`);
export const createActivity   = data        => req('activities-create', { method: 'POST', body: JSON.stringify(data) });

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

// Documents (legacy Notion-backed — kept for any consumer that still uses them)
export const getDocs   = ()         => req('docs-list');
export const createDoc = data       => req('docs-create', { method: 'POST', body: JSON.stringify(data) });
export const updateDoc = (id, data) => req('docs-update', { method: 'POST', body: JSON.stringify({ id, ...data }) });
export const deleteDoc = id         => req('docs-delete', { method: 'POST', body: JSON.stringify({ id }) });

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
