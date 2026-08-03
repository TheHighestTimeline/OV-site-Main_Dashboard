// Create or update a participation (one contact inside one workstream).
//
// SPRAWL RULE, enforced here rather than only in the UI: a workstream exists
// only if it has its own goal and its own counterparties. Otherwise it is a
// task, and a board full of one-person "workstreams" stops being scannable.
// Creating a participation therefore requires a real workstream link, and
// creating one against a workstream with no Goal is refused with a message that
// says why.
//
// POST /.netlify/functions/coo-participation-upsert
//   { id?, contactId, workstreamId, stage?, owner?, waitingOn?,
//     nextAction?, nextActionDate?, blockingItem?, entity?, status?, notes? }

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { TB, getRecord, listRecords, fromAirtableRecord, CONTACTS_MAP, OPPORTUNITIES_MAP } from './_airtable.js';
import {
  createParticipation, updateParticipation, getParticipation,
  participationsConfigured, participationName, NOT_CONFIGURED_MSG,
} from './_participations.js';
import { LABEL_TO_ID, ID_TO_LABEL, isValidStage, defaultStage, inferLifecycle } from './_stages.js';

const OPPS_TBL     = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  if (!participationsConfigured()) return err(400, NOT_CONFIGURED_MSG);

  try {
    const user = await getUser(event).catch(() => null);
    const body = JSON.parse(event.body || '{}');
    const {
      id, contactId, workstreamId, stage,
      owner, waitingOn, nextAction, nextActionDate,
      blockingItem, entity, status, notes,
    } = body;

    // ── Update path ──────────────────────────────────────────────────────────
    if (id) {
      const existing = await getParticipation(id);
      if (!existing) return err(404, 'Participation not found');

      const patch = {};
      if (owner          !== undefined) patch.owner          = owner;
      if (waitingOn      !== undefined) patch.waitingOn      = waitingOn;
      if (nextAction     !== undefined) patch.nextAction     = nextAction;
      if (nextActionDate !== undefined) patch.nextActionDate = nextActionDate || null;
      if (blockingItem   !== undefined) patch.blockingItem   = blockingItem;
      if (entity         !== undefined) patch.entity         = entity;
      if (status         !== undefined) patch.status         = status;
      if (notes          !== undefined) patch.notes          = notes;

      // Stage moves go through coo-stage-advance so evidence gates and the
      // stage-event history are never bypassed. Refuse it here explicitly
      // rather than silently dropping the field.
      if (stage !== undefined && stage !== existing.stage) {
        return err(400, 'Use coo-stage-advance to change stage; it enforces the evidence gate.');
      }

      const updated = await updateParticipation(id, patch);
      return ok({ participation: updated, created: false });
    }

    // ── Create path ──────────────────────────────────────────────────────────
    if (!contactId)    return err(400, 'contactId is required');
    if (!workstreamId) return err(400, 'workstreamId is required');

    const [contactRec, workstreamRec] = await Promise.all([
      getRecord(CONTACTS_TBL(), contactId),
      getRecord(OPPS_TBL(), workstreamId),
    ]);
    if (!contactRec)    return err(404, 'Contact not found');
    if (!workstreamRec) return err(404, 'Workstream not found');

    const contact    = fromAirtableRecord(contactRec, CONTACTS_MAP);
    const workstream = fromAirtableRecord(workstreamRec, OPPORTUNITIES_MAP);
    const goal       = workstreamRec.fields?.['Goal'] || '';

    // Sprawl rule. A workstream with no goal is a task wearing a costume.
    if (!goal.trim()) {
      return err(400,
        `"${workstream.name}" has no Goal set. A workstream needs its own goal and its own ` +
        'counterparties, otherwise it belongs on the board as a task. Set the Goal first.');
    }

    // Refuse a duplicate pairing rather than creating a second stage for the
    // same person on the same workstream, which would make both wrong.
    const existingAll = await listRecords(process.env.AIRTABLE_TB_PARTICIPATIONS, {
      fields: ['Contact', 'Workstream'],
    }).catch(() => []);
    const dupe = existingAll.find(r => {
      const cs = r.fields?.['Contact'] || [];
      const ws = r.fields?.['Workstream'] || [];
      return cs.includes(contactId) && ws.includes(workstreamId);
    });
    if (dupe) return err(409, 'That contact is already a participant in this workstream.');

    // Participations are always counterparty paperwork, so they open on the
    // Capital ladder regardless of the parent workstream's own lifecycle.
    const startStageId = stage ? (LABEL_TO_ID[stage] || stage) : defaultStage('capital');
    if (!isValidStage('capital', startStageId)) {
      return err(400, `"${stage}" is not a valid Capital stage.`);
    }

    const created = await createParticipation({
      name:           participationName(contact.name, workstream.name),
      contactIds:     [contactId],
      workstreamIds:  [workstreamId],
      stage:          ID_TO_LABEL[startStageId] || startStageId,
      stageEntered:   new Date().toISOString(),
      owner:          owner || contact.owner || '',
      waitingOn:      waitingOn || 'Us',
      nextAction:     nextAction || '',
      nextActionDate: nextActionDate || null,
      blockingItem:   blockingItem || '',
      entity:         entity || workstream.entity || '',
      status:         status || 'Active',
      notes:          notes || '',
    });

    // Seed the timeline so a brand new participation is not a blank page.
    try {
      const supabase = getSupabase();
      await supabase.from('coo_events').insert({
        participation_airtable_id: created.id,
        contact_airtable_id:       contactId,
        workstream_airtable_id:    workstreamId,
        event_type:  'stage_change',
        occurred_at: new Date().toISOString(),
        title:       `${contact.name} added to ${workstream.name}`,
        detail:      `Opened at ${ID_TO_LABEL[startStageId] || startStageId}`,
        actor:       'us',
        source:      'airtable',
        confidence:  'confirmed',
        dedupe_key:  `participation:created:${created.id}`,
      });
      await supabase.from('coo_stage_events').insert({
        participation_airtable_id: created.id,
        contact_airtable_id:       contactId,
        workstream_airtable_id:    workstreamId,
        from_stage:   null,
        to_stage:     startStageId,
        evidence_type:'manual',
        changed_by:   user?.id || '',
        note:         'Participation created',
      });
    } catch (e) {
      console.warn('[coo-participation-upsert] timeline seed failed:', e.message);
    }

    return ok({
      participation: created,
      created: true,
      lifecycle: inferLifecycle({ kind: workstream.kind, entity: workstream.entity }),
    });
  } catch (e) {
    console.error('[coo-participation-upsert]', e?.message || String(e));
    return err(500, e?.message || 'Failed to save participation');
  }
};
