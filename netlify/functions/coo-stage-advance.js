// Move a participation to a new stage, enforcing the evidence gate.
//
// THE EVIDENCE GATE IS THE POINT. `NCNDA Signed` requires a Documents record
// with a Signed Date. Without that check the board records what someone said on
// a call rather than what actually happened, and "they told me it was signed"
// becomes indistinguishable from an executed agreement. When evidence is
// missing this refuses the transition and says exactly what is missing, rather
// than failing quietly or advancing anyway.
//
// POST /.netlify/functions/coo-stage-advance
//   { participationId, toStage, note?, evidenceRef?, override?, overrideReason? }
//
// `override` exists because refusing forever is its own failure mode: sometimes
// the executed copy lives somewhere the detector cannot see. An override is
// allowed, requires a written reason, and is recorded as an override in the
// stage history so the audit trail never claims evidence that was not there.

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { TB, listRecords, createRecords, dateOnly } from './_airtable.js';
import { getParticipation, updateParticipation, participationsConfigured, NOT_CONFIGURED_MSG } from './_participations.js';
import {
  EVIDENCE, LABEL_TO_ID, ID_TO_LABEL, getStage, isValidStage,
  buildNextActionTask, stagesFor,
} from './_stages.js';

const DOCS_TBL  = () => process.env.AIRTABLE_TABLE_DOCUMENTS || TB.DOCUMENTS;
const TASKS_TBL = () => process.env.AIRTABLE_TABLE_TASKS     || TB.TASKS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  if (!participationsConfigured()) return err(400, NOT_CONFIGURED_MSG);

  try {
    const user = await getUser(event).catch(() => null);
    const {
      participationId, toStage, note = '',
      evidenceRef = null, override = false, overrideReason = '',
    } = JSON.parse(event.body || '{}');

    if (!participationId) return err(400, 'participationId is required');
    if (!toStage)         return err(400, 'toStage is required');

    const participation = await getParticipation(participationId);
    if (!participation) return err(404, 'Participation not found');

    const toStageId   = LABEL_TO_ID[toStage] || toStage;
    const fromStageId = LABEL_TO_ID[participation.stage] || participation.stage || null;
    const target      = getStage(toStageId);

    if (!target) return err(400, `Unknown stage "${toStage}"`);

    // Participations always run the Capital ladder.
    if (!isValidStage('capital', toStageId)) {
      return err(400,
        `"${target.label}" is not a Capital stage. Valid stages: ` +
        stagesFor('capital').map(s => s.label).join(', '));
    }
    if (toStageId === fromStageId) {
      return ok({ participation, changed: false, message: 'Already at that stage.' });
    }

    // Stages that require a written reason get one, or they do not happen.
    // Archived without a reason is how a pipeline loses its own history.
    if (target.requiresNote && !note.trim() && !overrideReason.trim()) {
      return err(400, `"${target.label}" requires a note explaining why.`);
    }

    // ── Evidence gate ────────────────────────────────────────────────────────
    let evidence = { type: 'manual', ref: evidenceRef, satisfied: true, detail: '' };

    if (target.requiresEvidence && target.requiresEvidence !== EVIDENCE.NONE) {
      evidence = await checkEvidence({
        requirement:   target.requiresEvidence,
        participation,
        explicitRef:   evidenceRef,
      });

      if (!evidence.satisfied) {
        if (!override) {
          return {
            statusCode: 409,
            headers: { ...CORS, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: evidence.detail,
              code:  'EVIDENCE_REQUIRED',
              required: target.requiresEvidence,
              stage:    target.label,
              // The UI surfaces this as a refusal with an explicit override, so
              // advancing without evidence is always a deliberate act.
              canOverride: true,
            }),
          };
        }
        if (!overrideReason.trim()) {
          return err(400, 'An override needs a written reason. Say where the evidence actually is.');
        }
        evidence.type = 'override';
      }
    }

    // ── Apply ────────────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const updated = await updateParticipation(participationId, {
      stage:        ID_TO_LABEL[toStageId] || toStageId,
      stageEntered: dateOnly(now),
      // Entering a terminal stage clears the waiting-on flag: nobody owes
      // anybody anything on a closed or archived row, and leaving it set makes
      // Triage permanently wrong.
      ...(target.terminal ? { waitingOn: 'Nobody', blockingItem: '' } : {}),
      ...(target.nextAction && !target.terminal ? { nextAction: target.nextAction } : {}),
    });

    const supabase = getSupabase();

    await supabase.from('coo_stage_events').insert({
      participation_airtable_id: participationId,
      contact_airtable_id:       participation.contactId,
      workstream_airtable_id:    participation.workstreamId,
      from_stage:    fromStageId,
      to_stage:      toStageId,
      evidence_type: evidence.type,
      evidence_ref:  evidence.ref || null,
      changed_by:    user?.id || '',
      note:          [note.trim(), overrideReason.trim() && `OVERRIDE: ${overrideReason.trim()}`]
                       .filter(Boolean).join(' — ') || null,
    });

    await supabase.from('coo_events').insert({
      participation_airtable_id: participationId,
      contact_airtable_id:       participation.contactId,
      workstream_airtable_id:    participation.workstreamId,
      event_type:  'stage_change',
      occurred_at: now,
      title:       `Stage: ${ID_TO_LABEL[fromStageId] || 'new'} → ${target.label}`,
      detail:      [note.trim(), evidence.detail, overrideReason.trim() && `Override: ${overrideReason.trim()}`]
                     .filter(Boolean).join('\n') || null,
      actor:       'us',
      source:      'airtable',
      confidence:  evidence.type === 'override' ? 'inferred' : 'confirmed',
      dedupe_key:  `stage:${participationId}:${toStageId}:${now}`,
    });

    // The brief's whole job is to say where things stand, so a stage move
    // invalidates it.
    await supabase.from('coo_briefs')
      .update({ stale: true })
      .eq('participation_airtable_id', participationId);

    // ── Auto-create the stage's next-action task ─────────────────────────────
    let createdTask = null;
    const taskSpec = buildNextActionTask(toStageId, {
      subjectName:   participation.name || 'participation',
      entity:        participation.entity,
      opportunityId: participation.workstreamId,
    });

    if (taskSpec) {
      try {
        const fields = {
          'Action Name': taskSpec.actionName,
          'Status':      'Not Started',
          'Priority':    taskSpec.priority,
        };
        if (taskSpec.dueDate) fields['Due Date'] = taskSpec.dueDate;
        if (taskSpec.entity)  fields['Entity']   = taskSpec.entity;
        if (participation.workstreamId) fields['Opportunity']  = [participation.workstreamId];
        if (participation.contactId)    fields['Contact']      = [participation.contactId];
        fields['Participation'] = [participationId];
        // Wire the resolver so a detector can close this task later without a
        // human ticking a box that they already satisfied in the real world.
        if (toStageId === 'ncnda_signed') fields['Resolves On'] = 'access_granted';
        if (toStageId === 'ncnda_sent')   fields['Resolves On'] = 'doc_signed';

        const [rec] = await createRecords(TASKS_TBL(), [{ fields }]);
        createdTask = { id: rec.id, name: taskSpec.actionName, dueDate: taskSpec.dueDate };

        await supabase.from('coo_events').insert({
          participation_airtable_id: participationId,
          contact_airtable_id:       participation.contactId,
          workstream_airtable_id:    participation.workstreamId,
          event_type:  'task_created',
          occurred_at: now,
          title:       taskSpec.actionName,
          detail:      taskSpec.dueDate ? `Due ${taskSpec.dueDate}` : null,
          actor:       'system',
          source:      'airtable',
          confidence:  'confirmed',
          dedupe_key:  `task:created:${rec.id}`,
        });
      } catch (e) {
        // A failed task write must not roll back a stage that already moved.
        console.error('[coo-stage-advance] next-action task failed:', e.message);
      }
    }

    return ok({
      participation: updated,
      changed:  true,
      fromStage: fromStageId,
      toStage:   toStageId,
      evidence:  { type: evidence.type, ref: evidence.ref, detail: evidence.detail },
      task:      createdTask,
    });
  } catch (e) {
    console.error('[coo-stage-advance]', e?.message || String(e));
    return err(500, e?.message || 'Stage change failed');
  }
};

// ── Evidence checks ─────────────────────────────────────────────────────────

async function checkEvidence({ requirement, participation, explicitRef }) {
  if (requirement === EVIDENCE.DOCUMENT) return checkDocument(participation, explicitRef);
  if (requirement === EVIDENCE.DRIVE_ACCESS) return checkDriveAccess(participation);
  if (requirement === EVIDENCE.MESSAGE) return checkMessage(participation);
  if (requirement === EVIDENCE.CALENDAR) return checkMeeting(participation);
  return { type: 'manual', ref: explicitRef, satisfied: true, detail: '' };
}

/**
 * A Documents record linked to this contact (or its workstream) carrying a
 * Signed Date. The Signed Date is the load-bearing part: a document row with a
 * Drive link and no signed date is a draft, and treating it as evidence is
 * exactly the failure this gate exists to prevent.
 */
async function checkDocument(participation, explicitRef) {
  try {
    const docs = await listRecords(DOCS_TBL(), {
      fields: ['Name', 'Signed Date', 'Tags', 'Contact', 'Opportunity', 'Drive Link'],
    });

    const match = docs.find(d => {
      if (explicitRef && d.id === explicitRef) return true;
      if (!d.fields?.['Signed Date']) return false;
      const linkedContact = arr(d.fields?.['Contact']).includes(participation.contactId);
      const linkedOpp     = arr(d.fields?.['Opportunity']).includes(participation.workstreamId);
      return linkedContact || linkedOpp;
    });

    if (match && match.fields?.['Signed Date']) {
      return {
        type: 'document',
        ref:  match.id,
        satisfied: true,
        detail: `Evidence: "${match.fields['Name'] || match.id}" signed ${String(match.fields['Signed Date']).slice(0, 10)}`,
      };
    }

    return {
      type: 'document',
      ref:  null,
      satisfied: false,
      detail:
        'No executed document on file. This stage needs a Documents record linked to ' +
        'this contact or workstream with a Signed Date filled in. If it was signed, ' +
        'file it in Documents first; if it only got promised on a call, the stage has not moved yet.',
    };
  } catch (e) {
    console.error('[coo-stage-advance] document check failed:', e.message);
    // A lookup failure is not the same as missing evidence. Do not claim the
    // document is absent when we simply could not read the table.
    return {
      type: 'document', ref: null, satisfied: false,
      detail: `Could not verify documents (${e.message}). Retry, or override with a reason.`,
    };
  }
}

async function checkDriveAccess(participation) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('coo_signals')
      .select('id, evidence_url, detected_at')
      .eq('participation_airtable_id', participation.id)
      .eq('signal_type', 'access_granted')
      .in('status', ['auto_applied', 'confirmed'])
      .order('detected_at', { ascending: false })
      .limit(1);

    if (data?.length) {
      return {
        type: 'drive_access', ref: data[0].id, satisfied: true,
        detail: `Evidence: Drive access confirmed ${String(data[0].detected_at).slice(0, 10)}`,
      };
    }
    return {
      type: 'drive_access', ref: null, satisfied: false,
      detail: 'No confirmed Drive access grant for this participation yet.',
    };
  } catch (e) {
    return { type: 'drive_access', ref: null, satisfied: false, detail: `Could not verify Drive access (${e.message}).` };
  }
}

async function checkMessage(participation) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('coo_events')
      .select('id, occurred_at')
      .eq('participation_airtable_id', participation.id)
      .in('event_type', ['message_out', 'message_in'])
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (data?.length) {
      return { type: 'message', ref: data[0].id, satisfied: true, detail: `Evidence: message on ${String(data[0].occurred_at).slice(0, 10)}` };
    }
    return { type: 'message', ref: null, satisfied: false, detail: 'No message recorded on this participation yet.' };
  } catch (e) {
    return { type: 'message', ref: null, satisfied: false, detail: `Could not verify messages (${e.message}).` };
  }
}

async function checkMeeting(participation) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('coo_events')
      .select('id, occurred_at')
      .eq('participation_airtable_id', participation.id)
      .in('event_type', ['meeting', 'call'])
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (data?.length) {
      return { type: 'calendar', ref: data[0].id, satisfied: true, detail: `Evidence: meeting on ${String(data[0].occurred_at).slice(0, 10)}` };
    }
    return { type: 'calendar', ref: null, satisfied: false, detail: 'No meeting or call recorded on this participation yet.' };
  } catch (e) {
    return { type: 'calendar', ref: null, satisfied: false, detail: `Could not verify meetings (${e.message}).` };
  }
}
