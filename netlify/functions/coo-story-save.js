// Save a sub-opportunity and keep its per-person paperwork rows in step.
//
// WHY THIS ENDPOINT EXISTS. A story (sub-opportunity) is one thread and holds a
// LIST of people. A participation is one person's paperwork inside that thread —
// their stage, their evidence gate, their days-in-stage. Two people on the same
// email can sign an NCNDA weeks apart, so the stage cannot live on the thread.
//
// Nobody should have to manage that by hand. Adding someone to a thread creates
// their paperwork row; removing them marks it Inactive. That is the whole job of
// this endpoint, and it is why story writes go through here rather than through
// the generic opportunities-create / opportunities-update.
//
// REMOVAL NEVER DELETES. A participation carries stage history and evidence; a
// person taken off a thread by mistake would take that history with them. It is
// marked Inactive instead, which drops it out of routing and Triage while
// leaving the record intact.
//
// POST { id?, parentId?, name, lane?, paperworkStage?, goal?, entity?, kind?, contactIds: [] }

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import {
  TB, airtableCreate, airtableUpdate, getRecord, listRecords,
  toAirtableFields, fromAirtableRecord, OPPORTUNITIES_MAP,
} from './_airtable.js';
import {
  createParticipation, updateParticipation, participationName,
  participationsConfigured, PARTICIPATIONS_TABLE, toParticipation,
} from './_participations.js';
import { LABEL_TO_ID, ID_TO_LABEL, isValidStage, defaultStage } from './_stages.js';

const OPPS_TBL     = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  try {
    const user = await getUser(event).catch(() => null);
    const {
      id, parentId, name, lane, paperworkStage, goal, entity, kind,
      contactIds = [],
    } = JSON.parse(event.body || '{}');

    if (!String(name || '').trim()) return err(400, 'name is required');
    if (!id && !parentId)           return err(400, 'parentId is required for a new sub-opportunity');

    // ── Write the story itself ───────────────────────────────────────────────
    const obj = { name: String(name).trim() };
    if (goal           !== undefined) obj.goal           = goal;
    // null, never '': Airtable reads '' on a singleSelect as a request to create
    // an option named "" and rejects the whole write.
    if (lane           !== undefined) obj.lane           = lane || null;
    if (paperworkStage !== undefined) obj.paperworkStage = paperworkStage || null;
    if (entity)                       obj.entity         = entity;
    if (kind)                         obj.kind           = kind;

    const fields = toAirtableFields(obj, OPPORTUNITIES_MAP);
    fields['Associated Contact'] = arr(contactIds);
    if (parentId && !id) fields['Parent Opportunity'] = [parentId];

    let storyId = id;
    if (id) {
      await airtableUpdate(OPPS_TBL(), id, fields);
    } else {
      const rec = await airtableCreate(OPPS_TBL(), fields);
      storyId = rec.id;
    }

    const storyRec   = await getRecord(OPPS_TBL(), storyId);
    const story      = fromAirtableRecord(storyRec, OPPORTUNITIES_MAP);
    const storyGoal  = String(storyRec.fields?.['Goal'] || '').trim();

    // ── Reconcile the per-person paperwork rows ──────────────────────────────
    const sync = { created: [], reactivated: [], deactivated: [], skipped: null };

    if (!participationsConfigured()) {
      sync.skipped = 'AIRTABLE_TB_PARTICIPATIONS is not set, so per-person paperwork was not tracked.';
      return ok({ id: storyId, story, sync });
    }

    // The sprawl rule still applies: participations need a goal on the thread.
    // A story with no goal keeps its people on the Airtable link but gets no
    // paperwork rows, rather than failing the whole save.
    if (!storyGoal) {
      sync.skipped = 'No goal set on this sub-opportunity, so per-person paperwork rows were not created. Add one and save again.';
      return ok({ id: storyId, story, sync });
    }

    const wanted = new Set(arr(contactIds));

    const [existingRecs, contactRecs] = await Promise.all([
      listRecords(PARTICIPATIONS_TABLE(), {
        fields: ['Contact', 'Workstream', 'Status', 'Stage'],
      }).catch(() => []),
      listRecords(CONTACTS_TBL(), { fields: ['Full Name', 'Owner'] }).catch(() => []),
    ]);

    const contactById = Object.fromEntries(contactRecs.map(r => [r.id, {
      name:  r.fields?.['Full Name'] || '',
      owner: r.fields?.['Owner'] || '',
    }]));

    const mine = existingRecs
      .map(toParticipation)
      .filter(p => p.workstreamIds.includes(storyId));
    const byContact = Object.fromEntries(mine.map(p => [p.contactId, p]));

    // A new row opens at the thread's paperwork stage when one is set, so adding
    // a second person to a thread already at NCNDA Sent does not reset them to
    // the beginning. Their stage moves independently from there.
    const seedId = paperworkStage && isValidStage('capital', LABEL_TO_ID[paperworkStage] || paperworkStage)
      ? (LABEL_TO_ID[paperworkStage] || paperworkStage)
      : defaultStage('capital');
    const seedLabel = ID_TO_LABEL[seedId] || seedId;

    for (const contactId of wanted) {
      const existing = byContact[contactId];
      if (existing) {
        if (existing.status === 'Inactive') {
          await updateParticipation(existing.id, { status: 'Active' });
          sync.reactivated.push(contactId);
        }
        continue;
      }
      try {
        const created = await createParticipation({
          name:          participationName(contactById[contactId]?.name, story.name),
          contactIds:    [contactId],
          workstreamIds: [storyId],
          stage:         seedLabel,
          stageEntered:  new Date().toISOString(),
          owner:         contactById[contactId]?.owner || '',
          waitingOn:     'Us',
          entity:        story.entity || null,
          status:        'Active',
        });
        sync.created.push({ id: created.id, contactId });
      } catch (e) {
        console.warn('[coo-story-save] participation create failed:', e.message);
      }
    }

    // Marked Inactive, never deleted — the stage history and evidence would go
    // with it, and taking someone off a thread is routinely a correction.
    for (const p of mine) {
      if (wanted.has(p.contactId) || p.status === 'Inactive') continue;
      try {
        await updateParticipation(p.id, { status: 'Inactive' });
        sync.deactivated.push(p.contactId);
      } catch (e) {
        console.warn('[coo-story-save] deactivate failed:', e.message);
      }
    }

    console.log(`[coo-story-save] ${story.name}: +${sync.created.length} ` +
                `~${sync.reactivated.length} -${sync.deactivated.length} by ${user?.email || 'unknown'}`);

    return ok({ id: storyId, story, sync });
  } catch (e) {
    console.error('[coo-story-save]', e?.message || String(e));
    return err(500, e?.message || 'Could not save the sub-opportunity');
  }
};
