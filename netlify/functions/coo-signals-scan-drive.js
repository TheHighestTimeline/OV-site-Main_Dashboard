// COO-11: Drive permission detector.
//
// The first evidence detector, and deliberately so. It is DETERMINISTIC: a
// person either holds a permission on the data room folder or they do not.
// Nothing is inferred from a filename or a subject line, so this one is allowed
// to auto-apply.
//
// What it does each run:
//   1. Reads the data room folder permission list from Drive.
//   2. Diffs it against the last known snapshot in coo_sync_state.
//   3. For each newly granted email, resolves it to a coo_identities row and
//      therefore to a participation.
//   4. Writes a coo_signals row (status auto_applied) and a coo_events row.
//   5. Completes any open task whose Resolves On is access_granted for that
//      participation, and marks the brief stale.
//
// Revocations are recorded as events but never auto-complete anything.
//
// Schedule (add to netlify.toml):
//   [functions."coo-signals-scan-drive"]
//     schedule = "*/15 * * * *"
//
// Also callable over HTTP for a manual run. Requires the coo role.

import { ok, err, CORS } from './_http.js';
import { requireCoo } from './_cooAccess.js';
import { getSupabase } from './_supabase.js';
import { getDrive, listPermissions, getFileMeta } from './_drive.js';
import { TB, listRecords, updateRecords, esc, dateTime } from './_airtable.js';
import { routeParticipation, participationsConfigured } from './_participations.js';
import { TERMINAL_TASK_STATUSES } from './_stages.js';

const SYNC_KEY   = 'drive_permissions';
const SCAN_OWNER = process.env.COO_SCAN_USER_ID || null; // Clerk user id whose Google account is used

const OPPS_TBL = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;

/**
 * Extract a Drive folder id from any of the URL shapes Drive hands out, or from
 * a bare id that was pasted straight in.
 */
export function folderIdFromUrl(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/,           // .../drive/folders/<id>
    /[?&]id=([a-zA-Z0-9_-]{10,})/,               // ...open?id=<id>
    /\/d\/([a-zA-Z0-9_-]{10,})/,                 // .../file/d/<id>
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  // A bare id: no slashes, no spaces, long enough to be real.
  if (/^[a-zA-Z0-9_-]{15,}$/.test(s)) return s;
  return null;
}

/**
 * Folders to watch.
 *
 * Primary source is the Opportunities `Data Room` field, so adding a workstream
 * with a data room auto-enrolls it and there is nothing to configure. The env
 * var stays as an override for folders that are not attached to an opportunity.
 *
 * Returns [{ folderId, workstreamId, workstreamName }].
 */
async function watchedFolders() {
  const out = new Map();

  try {
    const opps = await listRecords(OPPS_TBL(), {
      fields: ['Opportunity Name', 'Data Room'],
    });
    for (const o of opps) {
      const id = folderIdFromUrl(o.fields?.['Data Room']);
      if (!id || out.has(id)) continue;
      out.set(id, {
        folderId:       id,
        workstreamId:   o.id,
        workstreamName: o.fields?.['Opportunity Name'] || '',
      });
    }
  } catch (e) {
    console.error('[coo-drive] could not read Data Room fields:', e.message);
  }

  for (const id of (process.env.COO_DATA_ROOM_FOLDER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const extracted = folderIdFromUrl(id) || id;
    if (!out.has(extracted)) {
      out.set(extracted, { folderId: extracted, workstreamId: null, workstreamName: '' });
    }
  }

  return [...out.values()];
}

// Roles that actually constitute "they have access". A pending owner or a
// discovery-only role does not count.
const ACCESS_ROLES = new Set(['reader', 'commenter', 'writer', 'fileOrganizer', 'organizer', 'owner']);

// Our own accounts never count as evidence that a counterparty got access.
function isInternal(email) {
  return email.endsWith('@onevibemediagroup.com');
}

export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  // Scheduled invocations have no httpMethod. Only gate real HTTP calls.
  if (event?.httpMethod) {
    const authErr = await requireCoo(event);
    if (authErr) return authErr;
  }

  const supabase = getSupabase();
  const folders  = await watchedFolders();

  if (!folders.length) {
    return err(400,
      'No data rooms to scan. Set a Drive URL in the Opportunities "Data Room" field, ' +
      'or list folder ids in COO_DATA_ROOM_FOLDER_IDS.');
  }

  const summary = { scanned: 0, granted: 0, revoked: 0, unmatched: 0, tasksClosed: 0, errors: [] };

  try {
    const drive = await getDrive(SCAN_OWNER);

    // Previous snapshot: { "<folderId>": { "email": "role", ... } }
    const { data: syncRow } = await supabase
      .from('coo_sync_state').select('cursor').eq('source', SYNC_KEY).maybeSingle();

    let previous = {};
    try { previous = syncRow?.cursor ? JSON.parse(syncRow.cursor) : {}; } catch { previous = {}; }

    const next = {};

    for (const { folderId, workstreamId, workstreamName } of folders) {
      summary.scanned++;
      const meta = await getFileMeta(drive, folderId);
      const folderName = meta?.name || workstreamName || folderId;

      const perms = await listPermissions(drive, folderId);
      const current = {};
      for (const p of perms) {
        if (!p.emailAddress) continue;            // domain/anyone links are not per-person evidence
        if (!ACCESS_ROLES.has(p.role)) continue;
        if (isInternal(p.emailAddress)) continue;
        current[p.emailAddress] = p.role;
      }
      next[folderId] = current;

      const before = previous[folderId] || {};

      // First run on a folder: seed the snapshot without firing signals, or the
      // whole existing access list arrives as a wave of false "just granted".
      if (!previous[folderId]) {
        console.log(`[coo-drive] seeding baseline for ${folderName}, ${Object.keys(current).length} existing grants`);
        continue;
      }

      // ── Newly granted ──────────────────────────────────────────────────────
      for (const [email, role] of Object.entries(current)) {
        if (before[email]) continue;
        const res = await recordGrant({ supabase, email, role, folderId, folderName, meta, workstreamId });
        if (res.matched) summary.granted++; else summary.unmatched++;
        summary.tasksClosed += res.tasksClosed;
      }

      // ── Revoked ────────────────────────────────────────────────────────────
      for (const email of Object.keys(before)) {
        if (current[email]) continue;
        await recordRevoke({ supabase, email, folderId, folderName, workstreamId });
        summary.revoked++;
      }
    }

    await supabase.from('coo_sync_state').upsert({
      source:          SYNC_KEY,
      cursor:          JSON.stringify(next),
      last_run_at:     new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error:      null,
    }, { onConflict: 'source' });

    console.log('[coo-drive] scan complete', summary);
    return ok(summary);

  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[coo-drive] scan failed:', msg);
    await supabase.from('coo_sync_state').upsert({
      source: SYNC_KEY, last_run_at: new Date().toISOString(), last_error: msg,
    }, { onConflict: 'source' });
    return err(500, msg);
  }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve an email to { contactId, participationId }.
 *
 * Scoping matters more than matching here. The data room folder belongs to one
 * workstream, so the participation we resolve to MUST be that person inside
 * THAT workstream. Granting Greg access to the bridge loan data room says
 * nothing about where he stands on a different raise, and closing a task over
 * there would be a false completion — the exact failure the evidence layer
 * exists to prevent.
 */
async function resolveIdentity(supabase, email, workstreamId) {
  const { data } = await supabase
    .from('coo_identities')
    .select('contact_airtable_id')
    .eq('channel', 'email')
    .eq('handle', email)
    .maybeSingle();

  let contactId = data?.contact_airtable_id || null;

  // Fall back to a direct CRM lookup before giving up: the identities table is
  // populated by Gmail ingest, and a Drive grant can easily arrive for someone
  // who has never emailed this inbox.
  if (!contactId) {
    try {
      const matches = await listRecords(TB.CONTACTS, {
        filterByFormula: `LOWER({Email}) = "${esc(email)}"`,
        fields: ['Full Name', 'Email'],
        maxRecords: 1,
      });
      if (matches.length) contactId = matches[0].id;
    } catch (e) {
      console.warn('[coo-drive] contact lookup failed:', e.message);
    }
  }

  // Record the identity either way. An unmatched row is the queue the evening
  // SOP clears; dropping it silently is how a person stays invisible for weeks.
  await supabase.from('coo_identities').upsert(
    { channel: 'email', handle: email, contact_airtable_id: contactId },
    { onConflict: 'channel,handle' },
  );

  if (!contactId || !participationsConfigured()) {
    return { contactId, participationId: null };
  }

  const participation = await routeParticipation(contactId, { preferWorkstreamId: workstreamId });

  // If this person has participations but none in this workstream, do NOT fall
  // back to another one. Better to leave the signal unattached and visible than
  // to attach it to the wrong relationship.
  if (participation && workstreamId && participation.workstreamId !== workstreamId) {
    return { contactId, participationId: null };
  }

  return { contactId, participationId: participation?.id || null };
}

async function recordGrant({ supabase, email, role, folderId, folderName, meta, workstreamId }) {
  const { contactId, participationId } = await resolveIdentity(supabase, email, workstreamId);
  const dedupe = `drive:grant:${folderId}:${email}`;
  const now    = new Date().toISOString();
  const url    = meta?.webViewLink || null;

  await supabase.from('coo_signals').upsert({
    participation_airtable_id: participationId,
    contact_airtable_id:       contactId,
    signal_type:  'access_granted',
    kind:         'deterministic',
    source:       'drive',
    evidence_ref: `${folderId}:${email}`,
    evidence_url: url,
    detected_at:  now,
    status:       contactId ? 'auto_applied' : 'pending',
    dedupe_key:   dedupe,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  await supabase.from('coo_events').upsert({
    participation_airtable_id: participationId,
    contact_airtable_id:       contactId,
    workstream_airtable_id:    workstreamId || null,
    event_type:  'access_granted',
    occurred_at: now,
    title:       `Drive access granted to ${email}`,
    detail:      `${role} on ${folderName}`,
    actor:       'us',
    source:      'drive',
    ref_drive_file_id: folderId,
    ref_url:     url,
    confidence:  'confirmed',
    dedupe_key:  dedupe,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  let tasksClosed = 0;
  if (participationId) {
    tasksClosed = await closeResolvedTasks(supabase, participationId, 'access_granted');
    await supabase.from('coo_briefs')
      .update({ stale: true })
      .eq('participation_airtable_id', participationId);
  }

  return { matched: Boolean(contactId), tasksClosed };
}

async function recordRevoke({ supabase, email, folderId, folderName, workstreamId }) {
  const { contactId, participationId } = await resolveIdentity(supabase, email, workstreamId);
  const now = new Date().toISOString();

  // Revocations are logged, never auto-resolving. Losing access is not evidence
  // that an obligation was met, and it may be the thing you need to notice.
  await supabase.from('coo_events').upsert({
    participation_airtable_id: participationId,
    contact_airtable_id:       contactId,
    workstream_airtable_id:    workstreamId || null,
    event_type:  'access_revoked',
    occurred_at: now,
    title:       `Drive access removed for ${email}`,
    detail:      folderName,
    actor:       'us',
    source:      'drive',
    ref_drive_file_id: folderId,
    confidence:  'confirmed',
    dedupe_key:  `drive:revoke:${folderId}:${email}:${now.slice(0, 10)}`,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
}

/**
 * Complete open Master Action Board tasks whose `Resolves On` matches this
 * signal for this participation.
 *
 * Scoping is deliberate and narrow: participation AND signal type AND not
 * already done. A signal on the bridge loan workstream must never close a task
 * on a different workstream for the same person.
 */
async function closeResolvedTasks(supabase, participationId, signalType) {
  if (!TB.PARTICIPATIONS) {
    console.warn('[coo-drive] AIRTABLE_TB_PARTICIPATIONS not set, skipping task auto-close');
    return 0;
  }

  // Every terminal status, not just Done. The live board clears work by setting
  // Status to Archive, so a Done-only filter would keep "re-closing" tasks that
  // were finished weeks ago and re-firing their timeline events.
  const notTerminal = TERMINAL_TASK_STATUSES
    .map(s => `{Status} != "${esc(s)}"`)
    .join(',');

  const formula = `AND(` +
    `{Resolves On} = "${esc(signalType)}",` +
    `FIND("${esc(participationId)}", ARRAYJOIN({Participation})) > 0,` +
    notTerminal +
  `)`;

  let open = [];
  try {
    open = await listRecords(TB.TASKS, { filterByFormula: formula, fields: ['Status'] });
  } catch (e) {
    console.error('[coo-drive] task lookup failed:', e.message);
    return 0;
  }
  if (!open.length) return 0;

  const now = dateTime(new Date().toISOString());
  try {
    await updateRecords(TB.TASKS, open.map(r => ({
      id: r.id,
      fields: { Status: 'Done', 'Confirmed At': now, 'Resolved By Signal': true },
    })));
  } catch (e) {
    console.error('[coo-drive] task close failed:', e.message);
    return 0;
  }

  // Record the closure on the timeline so the board clearing itself is visible
  // rather than mysterious.
  await supabase.from('coo_events').insert(open.map(r => ({
    participation_airtable_id: participationId,
    event_type:  'task_completed',
    occurred_at: now,
    title:       'Task auto-completed by Drive access grant',
    detail:      `Task ${r.id}`,
    actor:       'system',
    source:      'drive',
    confidence:  'confirmed',
    dedupe_key:  `task:autoclose:${r.id}`,
  })));

  return open.length;
}
