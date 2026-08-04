// Triage: the buckets that answer "what needs me right now" without anyone
// having to compose a query.
//
// Six buckets from the spec, plus one that the Zurlia acceptance case forces:
// EVIDENCE MISSING. The case is one intermediary, five introductions into the
// same workstream, and one counterparty who said an NCNDA was signed when no
// executed document exists. That contradiction has to surface on its own,
// because nobody goes looking for a discrepancy they do not know about. The
// Monday SOP already calls for exactly this audit ("anything at NCNDA Signed or
// later without a Documents record"), so the bucket makes the routine automatic
// rather than manual.
//
// GET /.netlify/functions/coo-triage

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps, entityFilterFor } from './_cooAccess.js';
import { getSupabase, explainSupabaseError } from './_supabase.js';
import { TB, listRecords, listRecordsLenient } from './_airtable.js';
import { listParticipations } from './_participations.js';
import { LABEL_TO_ID, getStage, daysInStage, slaStatus, isTerminalTaskStatus } from './_stages.js';

const DOCS_TBL     = () => process.env.AIRTABLE_TABLE_DOCUMENTS || TB.DOCUMENTS;
const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS     || TB.TASKS;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS  || TB.CONTACTS;
const OPPS_TBL     = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;

const GONE_QUIET_DAYS   = 10;
const DELEGATED_DAYS    = 3;
const REPLY_SLA_DAYS    = 3;

// Stages at or past which an executed document must exist. Everything from
// NCNDA Signed onward asserts that paperwork happened.
const EVIDENCE_REQUIRED_FROM = new Set([
  'ncnda_signed', 'discovery_call', 'contract_negotiation', 'deal_finalization', 'closed',
]);

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  try {
    const keep     = await entityFilterFor(event);
    const supabase = getSupabase();
    const today    = new Date().toISOString().slice(0, 10);

    const [participations, contactRecs, oppRecs, taskRecs, docRecs] = await Promise.all([
      listParticipations(),
      listRecords(CONTACTS_TBL(), { fields: ['Full Name', 'Email'] }),
      listRecords(OPPS_TBL(),     { fields: ['Opportunity Name', 'Entity'] }),
      listRecordsLenient(TASKS_TBL(), { fields: ['Action Name', 'Status', 'Due Date', 'Assigned To', 'Participation', 'Entity', 'Focus', 'Last Modified Time'] }),
      listRecords(DOCS_TBL(),     { fields: ['Name', 'Signed Date', 'Contact', 'Opportunity'] }),
    ]);

    const contactName = Object.fromEntries(contactRecs.map(r => [r.id, r.fields?.['Full Name'] || '']));
    const oppName     = Object.fromEntries(oppRecs.map(r => [r.id, r.fields?.['Opportunity Name'] || '']));
    const oppEntity   = Object.fromEntries(oppRecs.map(r => [r.id, r.fields?.['Entity'] || '']));

    // ── Shape participations with everything the buckets need ────────────────
    const rows = participations.map(p => {
      const stageId = LABEL_TO_ID[p.stage] || p.stage || null;
      const stage   = getStage(stageId);
      return {
        id:             p.id,
        contactId:      p.contactId,
        contactName:    contactName[p.contactId] || p.name || '',
        workstreamId:   p.workstreamId,
        workstreamName: oppName[p.workstreamId] || '',
        entity:         p.entity || oppEntity[p.workstreamId] || '',
        stageId,
        stageLabel:     stage?.label || p.stage || '',
        stageEntered:   p.stageEntered,
        daysInStage:    daysInStage(p.stageEntered),
        slaStatus:      slaStatus(stageId, p.stageEntered),
        slaDays:        stage?.slaDays ?? null,
        terminal:       Boolean(stage?.terminal),
        waitingOn:      p.waitingOn || 'Nobody',
        owner:          p.owner || '',
        nextAction:     p.nextAction || '',
        blockingItem:   p.blockingItem || '',
        status:         p.status || 'Active',
      };
    }).filter(keep);

    const byId   = Object.fromEntries(rows.map(r => [r.id, r]));
    const active = rows.filter(r => !r.terminal && r.status !== 'Inactive');

    // ── Last inbound / outbound per participation ────────────────────────────
    const lastIn  = {};
    const lastOut = {};
    const lastAny = {};
    try {
      const ids = rows.map(r => r.id);
      if (ids.length) {
        const { data } = await supabase
          .from('coo_events')
          .select('participation_airtable_id, event_type, occurred_at')
          .in('participation_airtable_id', ids)
          .order('occurred_at', { ascending: false })
          .limit(5000);

        for (const e of data || []) {
          const pid = e.participation_airtable_id;
          if (!lastAny[pid]) lastAny[pid] = e.occurred_at;
          if (e.event_type === 'message_in'  && !lastIn[pid])  lastIn[pid]  = e.occurred_at;
          if (e.event_type === 'message_out' && !lastOut[pid]) lastOut[pid] = e.occurred_at;
        }
      }
    } catch (e) {
      console.warn('[coo-triage] event read failed:', e.message);
    }

    // ── Bucket 1: they're waiting on me ──────────────────────────────────────
    // Last message was inbound and nothing has gone out since.
    const waitingOnMe = active.filter(r => {
      const i = lastIn[r.id], o = lastOut[r.id];
      if (!i) return r.waitingOn === 'Us';
      return !o || new Date(i) > new Date(o);
    }).map(r => ({
      ...r,
      since:     lastIn[r.id] || r.stageEntered,
      daysWaiting: daysSince(lastIn[r.id] || r.stageEntered),
      reason:    lastIn[r.id] ? 'Their message is the last one in the thread' : 'Waiting On is set to Us',
    })).sort((a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0));

    // ── Bucket 2: I'm waiting on them, past SLA ──────────────────────────────
    const waitingOnThem = active.filter(r => {
      const i = lastOut[r.id], reply = lastIn[r.id];
      if (!i) return false;
      if (reply && new Date(reply) > new Date(i)) return false;
      return (daysSince(i) || 0) >= REPLY_SLA_DAYS;
    }).map(r => ({
      ...r,
      since:       lastOut[r.id],
      daysWaiting: daysSince(lastOut[r.id]),
      reason:      `No reply in ${daysSince(lastOut[r.id])} days`,
    })).sort((a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0));

    // ── Bucket 3: gone quiet ─────────────────────────────────────────────────
    const goneQuiet = active.filter(r => {
      const last = lastAny[r.id] || r.stageEntered;
      return (daysSince(last) || 0) >= GONE_QUIET_DAYS;
    }).map(r => ({
      ...r,
      since:       lastAny[r.id] || r.stageEntered,
      daysQuiet:   daysSince(lastAny[r.id] || r.stageEntered),
      reason:      `Nothing recorded in ${daysSince(lastAny[r.id] || r.stageEntered)} days`,
    })).sort((a, b) => (b.daysQuiet || 0) - (a.daysQuiet || 0));

    // ── Bucket 4: stage overdue ──────────────────────────────────────────────
    const stageOverdue = active
      .filter(r => r.slaStatus === 'overdue' || r.slaStatus === 'escalate')
      .map(r => ({
        ...r,
        daysOver: r.slaDays != null && r.daysInStage != null ? r.daysInStage - r.slaDays : null,
        reason:   `${r.daysInStage}d in ${r.stageLabel}, SLA is ${r.slaDays}d`,
      }))
      .sort((a, b) => (b.daysOver || 0) - (a.daysOver || 0));

    // ── Bucket 5: committed today ────────────────────────────────────────────
    // Tasks due today, any owner. Mirrors the Overview Today card so there is
    // one source of truth showing on two surfaces.
    const committedToday = taskRecs
      .filter(t => {
        if (isTerminalTaskStatus(t.fields?.['Status'])) return false;
        const due = t.fields?.['Due Date'];
        return due && String(due).slice(0, 10) <= today;
      })
      .map(t => {
        const pid = arr(t.fields?.['Participation'])[0] || null;
        const p   = pid ? byId[pid] : null;
        const due = String(t.fields?.['Due Date']).slice(0, 10);
        return {
          taskId:   t.id,
          name:     t.fields?.['Action Name'] || '',
          dueDate:  due,
          overdue:  due < today,
          daysOver: Math.max(0, Math.floor((new Date(today) - new Date(due)) / 86400000)),
          status:   t.fields?.['Status'] || '',
          entity:   t.fields?.['Entity'] || p?.entity || '',
          focus:    t.fields?.['Focus'] || '',
          participationId: pid,
          contactName:     p?.contactName || '',
          workstreamName:  p?.workstreamName || '',
        };
      })
      .filter(keep)
      .sort((a, b) => b.daysOver - a.daysOver);

    // ── Bucket 6: delegated, unconfirmed ─────────────────────────────────────
    // Assigned out, still not Done, and nothing has moved in DELEGATED_DAYS.
    const delegated = taskRecs
      .filter(t => {
        if (isTerminalTaskStatus(t.fields?.['Status'])) return false;
        return arr(t.fields?.['Assigned To']).length > 0;
      })
      .map(t => {
        const pid = arr(t.fields?.['Participation'])[0] || null;
        const p   = pid ? byId[pid] : null;
        // "No status change in N days" needs a modified timestamp. Airtable only
        // exposes one when a Last Modified Time field exists on the table, so we
        // fall back to createdTime — which is the correct reading anyway for a
        // task that was assigned and then never touched.
        const movedAt = t.fields?.['Last Modified Time'] || t.createdTime || null;
        return {
          taskId:   t.id,
          name:     t.fields?.['Action Name'] || '',
          assignees: arr(t.fields?.['Assigned To']).map(id => contactName[id] || id),
          status:   t.fields?.['Status'] || '',
          dueDate:  t.fields?.['Due Date'] || null,
          entity:   t.fields?.['Entity'] || p?.entity || '',
          participationId: pid,
          contactName:     p?.contactName || '',
          workstreamName:  p?.workstreamName || '',
          lastMovedAt: movedAt,
          daysSinceMove: daysSince(movedAt),
        };
      })
      .filter(t => t.status === 'Not Started' || t.status === 'Submitted')
      .filter(t => (t.daysSinceMove ?? 0) >= DELEGATED_DAYS)
      .filter(keep)
      .sort((a, b) => (b.daysSinceMove || 0) - (a.daysSinceMove || 0));

    // ── Bucket 7: evidence missing (the Zurlia contradiction) ────────────────
    // A participation asserting NCNDA Signed or later, with no Documents record
    // carrying a Signed Date. This is the row where what was said and what was
    // executed disagree, and it must appear without anyone querying for it.
    const evidenceMissing = active
      .filter(r => EVIDENCE_REQUIRED_FROM.has(r.stageId))
      .map(r => {
        const doc = docRecs.find(d => {
          if (!d.fields?.['Signed Date']) return false;
          return arr(d.fields?.['Contact']).includes(r.contactId)
              || arr(d.fields?.['Opportunity']).includes(r.workstreamId);
        });
        return doc ? null : {
          ...r,
          reason: `Claims ${r.stageLabel} but no executed document is on file`,
          severity: 'contradiction',
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0));

    return ok({
      generatedAt: new Date().toISOString(),
      buckets: {
        waitingOnMe:     { label: "They're waiting on me",   items: waitingOnMe },
        waitingOnThem:   { label: "I'm waiting on them",     items: waitingOnThem },
        goneQuiet:       { label: 'Gone quiet',              items: goneQuiet },
        stageOverdue:    { label: 'Stage overdue',           items: stageOverdue },
        committedToday:  { label: 'Committed today',         items: committedToday },
        delegated:       { label: 'Delegated, unconfirmed',  items: delegated },
        evidenceMissing: { label: 'Evidence missing',        items: evidenceMissing },
      },
      counts: {
        waitingOnMe:     waitingOnMe.length,
        waitingOnThem:   waitingOnThem.length,
        goneQuiet:       goneQuiet.length,
        stageOverdue:    stageOverdue.length,
        committedToday:  committedToday.length,
        delegated:       delegated.length,
        evidenceMissing: evidenceMissing.length,
      },
    });
  } catch (e) {
    console.error('[coo-triage]', e?.message || String(e));
    return err(500, explainSupabaseError(e) || 'Triage failed');
  }
};
