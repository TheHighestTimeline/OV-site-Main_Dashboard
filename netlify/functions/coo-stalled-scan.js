// Scheduled job: move inactive participations to Stalled, and keep the
// workstream digests honest.
//
// 21 days with nothing recorded moves a participation to Stalled. That is not a
// judgment about the relationship, it is a statement that the board no longer
// knows anything current about it. Stalled carries a 14 day decision SLA, so it
// surfaces in Triage rather than sitting quietly.
//
// Stalled is reversible by definition: any new activity should move it back,
// which is why the previous stage is written into the stage-event note rather
// than being thrown away.
//
// Schedule: daily. Also callable manually.

import { ok, err, CORS } from './_http.js';
import { requireCoo } from './_cooAccess.js';
import { getSupabase } from './_supabase.js';
import { dateOnly } from './_airtable.js';
import { listParticipations, updateParticipation, participationsConfigured } from './_participations.js';
import { LABEL_TO_ID, ID_TO_LABEL, getStage, UNIVERSAL_STAGES } from './_stages.js';

const STALL = UNIVERSAL_STAGES.find(s => s.id === 'stalled');
const INACTIVE_DAYS = STALL?.autoEnterAfterInactiveDays || 21;

export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  if (event?.httpMethod) {
    const authErr = await requireCoo(event);
    if (authErr) return authErr;
  }

  if (!participationsConfigured()) {
    return ok({ skipped: true, reason: 'Participations table not configured' });
  }

  const supabase = getSupabase();
  const summary  = { checked: 0, stalled: 0, revived: 0, errors: [] };

  try {
    const participations = await listParticipations();
    const ids = participations.map(p => p.id);
    if (!ids.length) return ok(summary);

    // Last activity per participation, one query.
    const lastActivity = {};
    const { data: events } = await supabase
      .from('coo_events')
      .select('participation_airtable_id, occurred_at')
      .in('participation_airtable_id', ids)
      .order('occurred_at', { ascending: false })
      .limit(6000);
    for (const e of events || []) {
      const pid = e.participation_airtable_id;
      if (!lastActivity[pid]) lastActivity[pid] = e.occurred_at;
    }

    const now = Date.now();

    for (const p of participations) {
      summary.checked++;
      const stageId = LABEL_TO_ID[p.stage] || p.stage;
      const stage   = getStage(stageId);

      // Terminal rows are done. Nothing about them can go stale.
      if (stage?.terminal) continue;
      if (p.status === 'Inactive') continue;

      const last = lastActivity[p.id] || p.stageEntered;
      const days = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;

      // ── Revive: activity arrived on a stalled row ─────────────────────────
      if (stageId === 'stalled') {
        if (days != null && days < INACTIVE_DAYS) {
          const previous = await previousStage(supabase, p.id);
          if (previous) {
            try {
              await updateParticipation(p.id, {
                stage:        ID_TO_LABEL[previous] || previous,
                stageEntered: dateOnly(new Date().toISOString()),
              });
              await recordStageEvent(supabase, p, 'stalled', previous, 'Activity resumed, returned to prior stage');
              summary.revived++;
            } catch (e) {
              summary.errors.push(`${p.id} revive: ${e.message}`);
            }
          }
        }
        continue;
      }

      // ── Stall ────────────────────────────────────────────────────────────
      if (days != null && days >= INACTIVE_DAYS) {
        try {
          await updateParticipation(p.id, {
            stage:        ID_TO_LABEL.stalled || 'Stalled',
            stageEntered: dateOnly(new Date().toISOString()),
          });
          await recordStageEvent(
            supabase, p, stageId, 'stalled',
            `No activity in ${days} days. Previous stage: ${ID_TO_LABEL[stageId] || stageId}`,
          );
          summary.stalled++;
        } catch (e) {
          summary.errors.push(`${p.id} stall: ${e.message}`);
        }
      }
    }

    await supabase.from('coo_sync_state').upsert({
      source: 'stalled_scan',
      last_run_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: summary.errors.length ? summary.errors.slice(0, 3).join(' | ') : null,
    }, { onConflict: 'source' });

    console.log('[coo-stalled-scan] complete', summary);
    return ok(summary);
  } catch (e) {
    console.error('[coo-stalled-scan]', e?.message || String(e));
    return err(500, e?.message || 'Stalled scan failed');
  }
};

/** The stage a participation was in before it stalled, read from its history. */
async function previousStage(supabase, participationId) {
  const { data } = await supabase
    .from('coo_stage_events')
    .select('from_stage, to_stage')
    .eq('participation_airtable_id', participationId)
    .order('created_at', { ascending: false })
    .limit(5);

  const entry = (data || []).find(e => e.to_stage === 'stalled' && e.from_stage);
  return entry?.from_stage || null;
}

async function recordStageEvent(supabase, participation, fromStage, toStage, note) {
  const now = new Date().toISOString();

  await supabase.from('coo_stage_events').insert({
    participation_airtable_id: participation.id,
    contact_airtable_id:       participation.contactId,
    workstream_airtable_id:    participation.workstreamId,
    from_stage: fromStage,
    to_stage:   toStage,
    evidence_type: 'system',
    changed_by: 'system:stalled-scan',
    note,
  });

  await supabase.from('coo_events').insert({
    participation_airtable_id: participation.id,
    contact_airtable_id:       participation.contactId,
    workstream_airtable_id:    participation.workstreamId,
    event_type:  'stage_change',
    occurred_at: now,
    title:       `Stage: ${ID_TO_LABEL[fromStage] || fromStage} → ${ID_TO_LABEL[toStage] || toStage}`,
    detail:      note,
    actor:       'system',
    source:      'airtable',
    confidence:  'confirmed',
    dedupe_key:  `stage:auto:${participation.id}:${toStage}:${now.slice(0, 10)}`,
  });

  await supabase.from('coo_briefs')
    .update({ stale: true })
    .eq('participation_airtable_id', participation.id);
}
