// Assign work out of the Threads tab with the relationship attached (WP11).
//
// THIS IS THE WHOLE POINT OF DELEGATION HERE. A task that says "follow up with
// Greg" makes the assignee come back and ask three questions before they can
// start. So `Context` on Master Action Board is populated from the current brief
// at assign time: stage, days in stage, what we want, what they are waiting on,
// last commitment, documents on file. The assignee can act without asking.
//
// POST { participationId, actionName, assigneeContactId?, dueDate?, priority?,
//        resolvesOn?, extraContext? }

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { TB, listRecords, createRecords, getRecord } from './_airtable.js';
import { getParticipation, participationsConfigured, NOT_CONFIGURED_MSG } from './_participations.js';
import { LABEL_TO_ID, getStage, daysInStage } from './_stages.js';

const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS     || TB.TASKS;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS  || TB.CONTACTS;
const DOCS_TBL     = () => process.env.AIRTABLE_TABLE_DOCUMENTS || TB.DOCUMENTS;

const RESOLVES_ON = [
  'access_granted', 'access_requested', 'doc_signed', 'doc_sent',
  'meeting_held', 'reply_received', 'ncnda_signed',
];

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
      participationId, actionName, assigneeContactId = null,
      dueDate = null, priority = 'Medium', resolvesOn = null, extraContext = '',
    } = JSON.parse(event.body || '{}');

    if (!participationId) return err(400, 'participationId is required');
    if (!String(actionName || '').trim()) return err(400, 'actionName is required');
    if (resolvesOn && !RESOLVES_ON.includes(resolvesOn)) {
      return err(400, `resolvesOn must be one of: ${RESOLVES_ON.join(', ')}`);
    }

    const participation = await getParticipation(participationId);
    if (!participation) return err(404, 'Participation not found');

    if (assigneeContactId) {
      const assignee = await getRecord(CONTACTS_TBL(), assigneeContactId);
      if (!assignee) return err(404, 'Assignee contact not found');
    }

    const context = await buildContext(participation, extraContext);

    const fields = {
      'Action Name': String(actionName).trim(),
      'Status':      'Not Started',
      'Priority':    priority,
      'Context':     context,
      'Participation': [participationId],
    };
    if (dueDate) fields['Due Date'] = String(dueDate).slice(0, 10);
    if (participation.entity)       fields['Entity']      = participation.entity;
    if (participation.workstreamId) fields['Opportunity'] = [participation.workstreamId];
    if (participation.contactId)    fields['Contact']     = [participation.contactId];
    if (assigneeContactId)          fields['Assigned To'] = [assigneeContactId];
    if (resolvesOn)                 fields['Resolves On'] = resolvesOn;

    const [record] = await createRecords(TASKS_TBL(), [{ fields }]);

    try {
      const supabase = getSupabase();
      await supabase.from('coo_events').insert({
        participation_airtable_id: participationId,
        contact_airtable_id:       participation.contactId,
        workstream_airtable_id:    participation.workstreamId,
        event_type:  'task_created',
        occurred_at: new Date().toISOString(),
        title:       assigneeContactId ? `Delegated: ${actionName}` : `Task: ${actionName}`,
        detail:      dueDate ? `Due ${String(dueDate).slice(0, 10)}` : null,
        actor:       'us',
        source:      'airtable',
        confidence:  'confirmed',
        dedupe_key:  `task:created:${record.id}`,
      });
    } catch (e) {
      console.warn('[coo-delegate] timeline write failed:', e.message);
    }

    console.log(`[coo-delegate] ${actionName} → ${assigneeContactId || 'unassigned'} by ${user?.email || 'unknown'}`);

    return ok({ taskId: record.id, context, assigned: Boolean(assigneeContactId) });
  } catch (e) {
    console.error('[coo-delegate]', e?.message || String(e));
    return err(500, e?.message || 'Delegation failed');
  }
};

/**
 * Compose the handoff context. Reads the cached brief when there is one, and
 * always includes the hard facts (stage, waiting-on, documents) directly from
 * the record so the context is useful even when no brief has been generated.
 */
async function buildContext(participation, extraContext) {
  const stageId = LABEL_TO_ID[participation.stage] || participation.stage;
  const stage   = getStage(stageId);
  const days    = daysInStage(participation.stageEntered);

  const lines = [
    `RELATIONSHIP: ${participation.name || participation.id}`,
    `STAGE: ${stage?.label || participation.stage || 'unknown'}${days != null ? ` (${days} days)` : ''}`,
    `WAITING ON: ${participation.waitingOn || 'Nobody'}`,
  ];

  if (participation.nextAction)   lines.push(`RECORDED NEXT ACTION: ${participation.nextAction}`);
  if (participation.blockingItem) lines.push(`BLOCKED BY: ${participation.blockingItem}`);
  if (participation.owner)        lines.push(`OWNER: ${participation.owner}`);

  try {
    const supabase = getSupabase();
    const { data: brief } = await supabase
      .from('coo_briefs')
      .select('summary, open_asks, last_commitment, stale, generated_at')
      .eq('participation_airtable_id', participation.id)
      .maybeSingle();

    if (brief?.summary) {
      lines.push('', 'WHERE THIS STANDS:', brief.summary);
      if (brief.stale) {
        // Say so. A handoff note that silently carries week-old context is how
        // the assignee ends up acting on something that already changed.
        lines.push(`(Brief generated ${String(brief.generated_at).slice(0, 10)} and is marked stale.)`);
      }
      const asks = Array.isArray(brief.open_asks) ? brief.open_asks : [];
      if (asks.length) {
        lines.push('', 'OPEN ASKS:');
        for (const a of asks) {
          lines.push(`- ${a.who || 'someone'}: ${a.what || ''}${a.when ? ` (by ${a.when})` : ''}`);
        }
      }
      if (brief.last_commitment) lines.push('', `LAST COMMITMENT: ${brief.last_commitment}`);
    }
  } catch (e) {
    console.warn('[coo-delegate] brief read failed:', e.message);
  }

  // Documents on file, with signed status. The single most common question an
  // assignee has to go and ask.
  try {
    const docs = await listRecords(DOCS_TBL(), {
      fields: ['Name', 'Signed Date', 'Contact', 'Opportunity', 'Drive Link'],
    });
    const mine = docs.filter(d =>
      arr(d.fields?.['Contact']).includes(participation.contactId) ||
      arr(d.fields?.['Opportunity']).includes(participation.workstreamId));

    if (mine.length) {
      lines.push('', 'DOCUMENTS ON FILE:');
      for (const d of mine.slice(0, 8)) {
        const signed = d.fields?.['Signed Date'];
        lines.push(`- ${d.fields?.['Name'] || d.id}: ${signed ? `signed ${String(signed).slice(0, 10)}` : 'NOT SIGNED'}`);
      }
    } else {
      lines.push('', 'DOCUMENTS ON FILE: none');
    }
  } catch (e) {
    console.warn('[coo-delegate] document read failed:', e.message);
  }

  if (String(extraContext || '').trim()) {
    lines.push('', 'ADDITIONAL CONTEXT:', String(extraContext).trim());
  }

  return lines.join('\n');
}
