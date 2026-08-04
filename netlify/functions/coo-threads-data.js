// The single read that backs the Threads tab.
//
// WHY ONE ENDPOINT AND NOT FIVE
// Airtable allows 5 requests per second per base. The Threads UI needs
// opportunities, contacts, participations, last-activity and open-task counts
// to render even its first screen. Fetching those per card is an N+1 that trips
// the limiter and locks the base out for 30 seconds. So this endpoint does the
// four list reads once, joins in memory, and returns the whole tree.
//
// GET /.netlify/functions/coo-threads-data
//   → { programs, workstreams, participations, contacts, generatedAt }
//
// Everything the three views need is derived from this payload on the client.

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps, entityFilterFor } from './_cooAccess.js';
import { getSupabase, explainSupabaseError } from './_supabase.js';
import {
  TB, listRecords, listRecordsLenient, fromAirtableRecord,
  CONTACTS_MAP, OPPORTUNITIES_MAP,
} from './_airtable.js';
import { listParticipations, participationsConfigured } from './_participations.js';
import {
  inferLifecycle, LABEL_TO_ID, ID_TO_LABEL, getStage,
  daysInStage, slaStatus, defaultStage, isTerminalTaskStatus,
} from './_stages.js';

const OPPS_TBL     = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;
const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS         || TB.TASKS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  try {
    const keep = await entityFilterFor(event);

    // ── Airtable reads, sequential through the shared limiter ────────────────
    const [oppRecords, contactRecords, participations] = await Promise.all([
      listRecords(OPPS_TBL()),
      listRecords(CONTACTS_TBL()),
      listParticipations(),
    ]);

    // ── Contacts: a lookup, not a full payload ───────────────────────────────
    const contacts = contactRecords.map(r => {
      const c = fromAirtableRecord(r, CONTACTS_MAP);
      return {
        id:            c.id,
        name:          c.name || '',
        email:         c.email || '',
        phone:         c.phone || '',
        company:       arr(r.fields?.['Companies']).length ? '' : (c.companyAddress || ''),
        companyIds:    arr(r.fields?.['Companies']),
        owner:         c.owner || '',
        status:        c.status || '',
        currentSummary: c.currentSummary || '',
        referredBy:    arr(r.fields?.['Referred By']),
        lastContacted: c.lastContactedAt || null,
        entity:        Array.isArray(c.relatesTo) ? c.relatesTo[0] || '' : (c.relatesTo || ''),
      };
    });
    const contactById = Object.fromEntries(contacts.map(c => [c.id, c]));

    // ── Companies: resolve names for the People view chips ───────────────────
    let companyById = {};
    try {
      const companyRecords = await listRecords(TB.COMPANIES, { fields: ['Company Name', 'Name'] });
      companyById = Object.fromEntries(companyRecords.map(r => [
        r.id,
        r.fields?.['Company Name'] || r.fields?.['Name'] || '',
      ]));
    } catch (e) {
      // Non-fatal: the view degrades to no company chip rather than no view.
      console.warn('[coo-threads-data] company lookup failed:', e.message);
    }
    for (const c of contacts) {
      c.company = c.companyIds.map(id => companyById[id]).filter(Boolean).join(', ');
    }

    // ── Opportunities split into programs and workstreams ────────────────────
    // `Parent Opportunity` empty = Program (umbrella). Set = Workstream.
    const opps = oppRecords.map(r => {
      const o = fromAirtableRecord(r, OPPORTUNITIES_MAP);
      const parentIds = arr(r.fields?.['Parent Opportunity']);
      const lifecycleLabel = r.fields?.['Lifecycle'] || null;
      const lifecycle = lifecycleLabel
        ? String(lifecycleLabel).toLowerCase()
        : inferLifecycle({ kind: o.kind, entity: o.entity });

      return {
        id:          o.id,
        name:        o.name || '',
        kind:        o.kind || '',
        entity:      o.entity || '',
        lifecycle,
        stageId:     LABEL_TO_ID[o.stage] || null,
        stageLabel:  o.stage || null,
        goal:        r.fields?.['Goal'] || '',
        lane:           o.lane || '',
        paperworkStage: o.paperworkStage || '',
        contactIds:  arr(r.fields?.['Associated Contact']),
        taskIds:     arr(r.fields?.['Master Action Board']),
        dataRoom:    o.dataRoom || '',
        nextStep:    o.nextStep || '',
        priority:    o.priority || '',
        dealValue:   o.dealValue ?? null,
        targetValue: r.fields?.['Target Value'] ?? null,
        parentId:    parentIds[0] || null,
        isProgram:   parentIds.length === 0,
      };
    }).filter(keep);

    const oppById = Object.fromEntries(opps.map(o => [o.id, o]));

    // ── Epic / Story ─────────────────────────────────────────────────────────
    // EPIC   = a top-level opportunity   ("OVMG X Genesis — Bennettsville $20M")
    // STORY  = a sub-opportunity under it ("OVMG X Adam Shore — Loan Solutions")
    // TASK   = Master Action Board, linked to either.
    //
    // A story is ONE THREAD: one company, one or two people, its own paperwork
    // stage, its own timeline. That is the unit you work, and it is why a story
    // links contacts as a list rather than one — a two-person email thread is
    // still one thread and must not be split into two cards.
    const hasChildren = new Set(opps.map(o => o.parentId).filter(Boolean));
    for (const o of opps) {
      o.isEpic  = !o.parentId;
      o.isStory = Boolean(o.parentId);
      // Retained for Pipeline and the older views, which key off these names.
      o.isProgram = o.isEpic && hasChildren.has(o.id);
      o.standalone = o.isEpic && !hasChildren.has(o.id);
    }

    // Archived work is finished work. Threads is the board for what is live, and
    // an archived deal sitting in the rail is noise you have to skip every time.
    const isArchived = o =>
      String(o.lane || '').toLowerCase() === 'archive' ||
      String(o.paperworkStage || '').toLowerCase() === 'archived';

    const epics   = opps.filter(o => o.isEpic   && !isArchived(o));
    const stories = opps.filter(o => o.isStory  && !isArchived(o));

    const programs    = opps.filter(o => o.isProgram);
    const workstreams = opps.filter(o => !o.isProgram);

    // ── Participations, joined and scored ────────────────────────────────────
    const shaped = participations.map(p => {
      const contact    = contactById[p.contactId] || null;
      const workstream = oppById[p.workstreamId]  || null;

      // Entity falls back to the workstream's, because a participation created
      // from the UI often leaves it blank and an unlabelled row would otherwise
      // bypass the ops entity filter entirely.
      const entity = p.entity || workstream?.entity || '';

      const stageId = LABEL_TO_ID[p.stage] || p.stage || null;
      const stage   = getStage(stageId);

      return {
        id:              p.id,
        name:            p.name || '',
        contactId:       p.contactId,
        contactName:     contact?.name || '',
        contactEmail:    contact?.email || '',
        contactCompany:  contact?.company || '',
        workstreamId:    p.workstreamId,
        workstreamName:  workstream?.name || '',
        programId:       workstream?.parentId || null,
        programName:     workstream?.parentId ? oppById[workstream.parentId]?.name || '' : '',
        entity,
        stageId,
        stageLabel:      stage?.label || p.stage || null,
        stageEntered:    p.stageEntered || null,
        daysInStage:     daysInStage(p.stageEntered),
        slaStatus:       slaStatus(stageId, p.stageEntered),
        terminal:        Boolean(stage?.terminal),
        owner:           p.owner || '',
        waitingOn:       p.waitingOn || 'Nobody',
        nextAction:      p.nextAction || '',
        nextActionDate:  p.nextActionDate || null,
        blockingItem:    p.blockingItem || '',
        status:          p.status || 'Active',
        threadKey:       p.threadKey || '',
        notes:           p.notes || '',
        // filled in below
        lastActivityAt:  null,
        lastDirection:   null,
        openTaskCount:   0,
        overdueTaskCount: 0,
      };
    }).filter(keep);

    const byId = Object.fromEntries(shaped.map(p => [p.id, p]));

    // ── Last activity per participation, from the timeline ───────────────────
    // One query, grouped in memory. coo_events is indexed on
    // (participation_airtable_id, occurred_at desc) so this stays cheap.
    try {
      const supabase = getSupabase();
      const ids = shaped.map(p => p.id).filter(Boolean);
      if (ids.length) {
        const { data, error } = await supabase
          .from('coo_events')
          .select('participation_airtable_id, occurred_at, event_type')
          .in('participation_airtable_id', ids)
          .order('occurred_at', { ascending: false })
          .limit(4000);

        if (error) throw new Error(error.message);
        for (const e of data || []) {
          const p = byId[e.participation_airtable_id];
          if (!p || p.lastActivityAt) continue;      // rows arrive newest first
          p.lastActivityAt = e.occurred_at;
          p.lastDirection  = e.event_type === 'message_in'  ? 'inbound'
                           : e.event_type === 'message_out' ? 'outbound'
                           : null;
        }
      }
    } catch (e) {
      // The timeline is additive context. Losing it must not lose the board.
      console.warn('[coo-threads-data] event rollup failed:', e.message);
    }

    // ── Open task counts, per participation and per opportunity ──────────────
    // The id sets let epics and stories count their own linked tasks without a
    // second pass over the table.
    const openTaskIds    = new Set();
    const overdueTaskIds = new Set();
    // The rows themselves, so a story can LIST its work rather than report a
    // number the user then has to go elsewhere to expand.
    const taskById       = {};
    try {
      const taskRecords = await listRecordsLenient(TASKS_TBL(), {
        fields: ['Action Name', 'Status', 'Due Date', 'Priority', 'Participation'],
      });
      const today = new Date().toISOString().slice(0, 10);
      for (const t of taskRecords) {
        if (isTerminalTaskStatus(t.fields?.['Status'])) continue;
        const due     = t.fields?.['Due Date'];
        const overdue = Boolean(due && String(due).slice(0, 10) < today);
        openTaskIds.add(t.id);
        if (overdue) overdueTaskIds.add(t.id);
        taskById[t.id] = {
          id:       t.id,
          name:     t.fields?.['Action Name'] || '',
          status:   t.fields?.['Status'] || '',
          dueDate:  t.fields?.['Due Date'] || null,
          priority: t.fields?.['Priority'] || '',
          overdue,
        };

        for (const pid of arr(t.fields?.['Participation'])) {
          const p = byId[pid];
          if (!p) continue;
          p.openTaskCount++;
          if (overdue) p.overdueTaskCount++;
        }
      }
    } catch (e) {
      console.warn('[coo-threads-data] task rollup failed:', e.message);
    }

    // ── Workstream digests, computed live ────────────────────────────────────
    for (const w of workstreams) {
      const members = shaped.filter(p => p.workstreamId === w.id);
      w.participantCount = members.length;
      w.blockedCount     = members.filter(p => p.waitingOn === 'Us' || p.blockingItem).length;
      w.stalledCount     = members.filter(p => p.stageId === 'stalled').length;
      w.stageCounts      = members.reduce((acc, p) => {
        const k = p.stageLabel || 'Unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      w.lastActivityAt = members
        .map(p => p.lastActivityAt)
        .filter(Boolean)
        .sort()
        .pop() || null;
    }

    // Program digests aggregate their workstreams one level up.
    for (const prog of programs) {
      const kids = workstreams.filter(w => w.parentId === prog.id);
      prog.workstreamCount  = kids.length;
      prog.participantCount = kids.reduce((n, w) => n + (w.participantCount || 0), 0);
      prog.blockedCount     = kids.reduce((n, w) => n + (w.blockedCount || 0), 0);
      prog.lastActivityAt   = kids.map(w => w.lastActivityAt).filter(Boolean).sort().pop() || null;
    }

    // ── Story rollups, then epic rollups one level up ────────────────────────
    for (const s of stories) {
      s.contacts = s.contactIds.map(id => contactById[id]).filter(Boolean)
        .map(c => ({ id: c.id, name: c.name, email: c.email, company: c.company }));
      s.tasks            = s.taskIds.map(id => taskById[id]).filter(Boolean);
      s.openTaskCount    = s.tasks.length;
      s.overdueTaskCount = s.tasks.filter(t => t.overdue).length;
      s.participations   = shaped.filter(p => p.workstreamId === s.id);
      s.lastActivityAt   = s.participations.map(p => p.lastActivityAt).filter(Boolean).sort().pop() || null;
    }

    for (const e of epics) {
      const kids = stories.filter(s => s.parentId === e.id);
      e.storyCount   = kids.length;
      e.contactCount = new Set(kids.flatMap(s => s.contactIds)).size;
      e.openTaskCount    = kids.reduce((n, s) => n + s.openTaskCount, 0)
                         + e.taskIds.filter(id => openTaskIds.has(id)).length;
      e.overdueTaskCount = kids.reduce((n, s) => n + s.overdueTaskCount, 0)
                         + e.taskIds.filter(id => overdueTaskIds.has(id)).length;
      e.signedCount  = kids.filter(s => s.paperworkStage === 'NCNDA Signed'
                                     || s.paperworkStage === 'Closed').length;
      e.laneCounts   = kids.reduce((acc, s) => {
        const k = s.lane || 'Unassigned';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      e.lastActivityAt = kids.map(s => s.lastActivityAt).filter(Boolean).sort().pop() || null;
    }

    return ok({
      configured:   participationsConfigured(),
      epics,
      stories,
      programs,
      workstreams,
      participations: shaped,
      contacts,
      stageLabels:  ID_TO_LABEL,
      defaultCapitalStage: defaultStage('capital'),
      generatedAt:  new Date().toISOString(),
    });
  } catch (e) {
    console.error('[coo-threads-data]', e?.message || String(e));
    return err(500, explainSupabaseError(e) || 'Failed to load Threads data');
  }
};
