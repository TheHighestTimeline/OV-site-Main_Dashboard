// The "Resolved?" queue: detected evidence awaiting a human decision (WP11).
//
// SIGNALS PROPOSE, HUMANS DISPOSE.
//
// An INFERRED signal (a filename containing "shore" and "executed", an email
// subject that looks like a signature completion) never completes a task or
// advances a stage on its own. It lands here with its evidence linked, one tap
// to confirm and one to reject.
//
// A DETERMINISTIC signal (a Drive permission that either exists or does not)
// auto-applies with status auto_applied, and still shows here so it can be
// reversed. The line between the two is whether the fact is directly observable
// or guessed at, and blurring it is the one thing this layer must not do:
// silently closing an obligation that was never met is far worse than a stale
// board, because a stale board is at least visibly wrong.
//
// GET  ?status=pending|all
// POST { id, decision: 'confirm' | 'reject', note? }

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { TB, listRecordsLenient, updateRecords } from './_airtable.js';
import { getParticipation } from './_participations.js';
import { isTerminalTaskStatus } from './_stages.js';

const TASKS_TBL = () => process.env.AIRTABLE_TABLE_TASKS || TB.TASKS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  const supabase = getSupabase();

  try {
    if (event.httpMethod === 'GET') {
      const q      = event.queryStringParameters || {};
      const status = q.status || 'pending';
      const limit  = Math.min(parseInt(q.limit || '100', 10), 300);

      let query = supabase
        .from('coo_signals')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (status === 'pending') query = query.eq('status', 'pending');
      else if (status !== 'all') query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return err(500, error.message);

      // Resolve participation labels so each row reads as a sentence rather
      // than a record id. A queue you have to decode is a queue nobody clears.
      const partIds = [...new Set((data || []).map(s => s.participation_airtable_id).filter(Boolean))];
      const labels  = {};
      for (const pid of partIds) {
        try {
          const p = await getParticipation(pid);
          if (p) labels[pid] = p.name || pid;
        } catch { /* label is cosmetic; never fail the queue over it */ }
      }

      const signals = (data || []).map(s => ({
        id:              s.id,
        type:            s.signal_type,
        kind:            s.kind,
        inferred:        s.kind === 'inferred',
        confidence:      s.confidence_score,
        source:          s.source,
        evidenceRef:     s.evidence_ref,
        evidenceUrl:     s.evidence_url,
        detectedAt:      s.detected_at,
        status:          s.status,
        proposesTaskId:  s.proposes_task_id,
        proposesStage:   s.proposes_stage,
        participationId: s.participation_airtable_id,
        participationName: labels[s.participation_airtable_id] || '',
        contactId:       s.contact_airtable_id,
        resolvedAt:      s.resolved_at,
      }));

      return ok({
        signals,
        pendingCount: signals.filter(s => s.status === 'pending').length,
      });
    }

    if (event.httpMethod !== 'POST') return err(405, 'GET or POST only');

    // ── Confirm / reject ─────────────────────────────────────────────────────
    const user = await getUser(event).catch(() => null);
    const { id, decision, note = '' } = JSON.parse(event.body || '{}');

    if (!id) return err(400, 'id is required');
    if (!['confirm', 'reject'].includes(decision)) {
      return err(400, "decision must be 'confirm' or 'reject'");
    }

    const { data: signal, error: readErr } = await supabase
      .from('coo_signals').select('*').eq('id', id).single();
    if (readErr || !signal) return err(404, 'Signal not found');

    const now = new Date().toISOString();

    const { error: updErr } = await supabase.from('coo_signals').update({
      status:      decision === 'confirm' ? 'confirmed' : 'rejected',
      resolved_by: user?.id || '',
      resolved_at: now,
    }).eq('id', id);
    if (updErr) return err(500, updErr.message);

    let tasksClosed = 0;

    if (decision === 'confirm') {
      // Confirming is what promotes an inferred event to a fact. Until now the
      // timeline showed it hollow and tagged UNCONFIRMED.
      await supabase.from('coo_events')
        .update({ confidence: 'confirmed' })
        .eq('dedupe_key', signal.dedupe_key);

      tasksClosed = await closeMatchingTasks(supabase, signal, user);

      await supabase.from('coo_briefs')
        .update({ stale: true })
        .eq('participation_airtable_id', signal.participation_airtable_id);
    } else {
      // A rejected signal's timeline entry is removed rather than left hollow
      // forever. The signal row itself stays, so the same evidence is not
      // re-proposed on the next scan.
      await supabase.from('coo_events')
        .delete()
        .eq('dedupe_key', signal.dedupe_key)
        .eq('confidence', 'inferred');
    }

    console.log(`[coo-signals] ${signal.signal_type} ${decision}ed by ${user?.email || 'unknown'}${note ? `: ${note}` : ''}`);

    return ok({ id, decision, tasksClosed });
  } catch (e) {
    console.error('[coo-signals]', e?.message || String(e));
    return err(500, e?.message || 'Signal operation failed');
  }
};

/**
 * Close open tasks whose `Resolves On` matches this signal type, scoped to this
 * participation.
 *
 * The scoping is the whole safety property: a signal on the bridge loan
 * workstream must never resolve a task on a different workstream for the same
 * person. Without a participation we close nothing at all.
 */
async function closeMatchingTasks(supabase, signal, user) {
  const participationId = signal.participation_airtable_id;
  if (!participationId) return 0;

  let candidates = [];
  try {
    candidates = await listRecordsLenient(TASKS_TBL(), {
      fields: ['Action Name', 'Status', 'Resolves On', 'Participation'],
    });
  } catch (e) {
    console.error('[coo-signals] task lookup failed:', e.message);
    return 0;
  }

  const open = candidates.filter(t => {
    if (isTerminalTaskStatus(t.fields?.['Status'])) return false;
    if ((t.fields?.['Resolves On'] || '') !== signal.signal_type) return false;
    return arr(t.fields?.['Participation']).includes(participationId);
  });

  if (!open.length) return 0;

  const now = new Date().toISOString();
  try {
    await updateRecords(TASKS_TBL(), open.map(t => ({
      id: t.id,
      fields: { 'Status': 'Done', 'Confirmed At': now.slice(0, 10), 'Resolved By Signal': true },
    })));
  } catch (e) {
    console.error('[coo-signals] task close failed:', e.message);
    return 0;
  }

  await supabase.from('coo_events').insert(open.map(t => ({
    participation_airtable_id: participationId,
    contact_airtable_id:       signal.contact_airtable_id,
    event_type:  'task_completed',
    occurred_at: now,
    title:       `Task closed: ${t.fields?.['Action Name'] || t.id}`,
    detail:      `Confirmed by ${user?.fullName || user?.email || 'a reviewer'} from a ${signal.signal_type} signal`,
    actor:       'us',
    source:      signal.source === 'drive' ? 'drive' : 'gmail',
    confidence:  'confirmed',
    dedupe_key:  `task:signalclose:${t.id}:${signal.id}`,
  })));

  return open.length;
}
