// The Friday review surfaces (WP11): delegation by assignee, and the referral
// tree.
//
// DELEGATION is the whole point of assigning work out of this tab. The assignee
// gets the state of the relationship, not "follow up with Greg" — so the
// `Context` field on Master Action Board is populated from the current brief at
// assign time, and this endpoint reports back on what happened to it.
//
// THE REFERRAL TREE runs off the existing `Referred By` self-link on CRM
// Contacts. No new field. Intermediaries go quiet when their introductions do,
// which is invisible until you look at the introductions grouped under the
// person who made them.
//
// GET ?view=delegation | referrals | both

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps, entityFilterFor } from './_cooAccess.js';
import { TB, listRecordsLenient } from './_airtable.js';
import { listParticipations } from './_participations.js';
import { LABEL_TO_ID, getStage, daysInStage } from './_stages.js';

const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS    || TB.TASKS;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS || TB.CONTACTS;

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
    const view = (event.queryStringParameters || {}).view || 'both';
    const keep = await entityFilterFor(event);

    const [contactRecs, taskRecs, participations] = await Promise.all([
      listRecordsLenient(CONTACTS_TBL(), { fields: ['Full Name', 'Email', 'Referred By', 'Status', 'Last Contacted'] }),
      view === 'referrals' ? Promise.resolve([])
        : listRecordsLenient(TASKS_TBL(), { fields: ['Action Name', 'Status', 'Due Date', 'Assigned To', 'Entity', 'Participation', 'Context', 'Last Modified Time'] }),
      listParticipations(),
    ]);

    const contactById = Object.fromEntries(contactRecs.map(r => [r.id, {
      id:     r.id,
      name:   r.fields?.['Full Name'] || '',
      email:  r.fields?.['Email'] || '',
      status: r.fields?.['Status'] || '',
      lastContacted: r.fields?.['Last Contacted'] || null,
      referredBy: arr(r.fields?.['Referred By']),
    }]));

    const out = { generatedAt: new Date().toISOString() };

    // ── Delegation ───────────────────────────────────────────────────────────
    if (view === 'delegation' || view === 'both') {
      const today   = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const byAssignee = {};

      for (const t of taskRecs) {
        const assignees = arr(t.fields?.['Assigned To']);
        if (!assignees.length) continue;

        const entity = t.fields?.['Entity'] || '';
        if (!keep({ entity })) continue;

        const status  = t.fields?.['Status'] || '';
        const due     = t.fields?.['Due Date'] ? String(t.fields['Due Date']).slice(0, 10) : null;
        const isDone  = status === 'Done';
        const modified = t.fields?.['Last Modified Time'] || t.createdTime || null;

        for (const aid of assignees) {
          const person = contactById[aid];
          const key    = aid;
          byAssignee[key] ||= {
            contactId: aid,
            name:      person?.name || aid,
            email:     person?.email || '',
            open: [], overdue: [], completedThisWeek: [],
          };

          const row = {
            taskId:  t.id,
            name:    t.fields?.['Action Name'] || '',
            status,
            dueDate: due,
            entity,
            hasContext: Boolean(String(t.fields?.['Context'] || '').trim()),
            participationId: arr(t.fields?.['Participation'])[0] || null,
            daysSinceMove: daysSince(modified),
          };

          if (isDone) {
            // "Completed this week" needs a completion date. Airtable does not
            // give one for free, so the modified timestamp is the closest honest
            // proxy and is labelled as such in the UI.
            if (modified && String(modified).slice(0, 10) >= weekAgo) {
              byAssignee[key].completedThisWeek.push(row);
            }
          } else if (status !== 'Canceled') {
            byAssignee[key].open.push(row);
            if (due && due < today) byAssignee[key].overdue.push(row);
          }
        }
      }

      out.delegation = Object.values(byAssignee)
        .map(a => ({
          ...a,
          openCount:      a.open.length,
          overdueCount:   a.overdue.length,
          completedCount: a.completedThisWeek.length,
          // A delegated task with no Context is the failure mode this feature
          // exists to prevent: the assignee got a title and nothing else.
          missingContextCount: a.open.filter(t => !t.hasContext).length,
        }))
        .sort((a, b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount);
    }

    // ── Referral tree ────────────────────────────────────────────────────────
    if (view === 'referrals' || view === 'both') {
      // Participation state per contact, so each introduced person shows where
      // they actually got to rather than just that they exist.
      const stateByContact = {};
      for (const p of participations) {
        if (!p.contactId) continue;
        const stageId = LABEL_TO_ID[p.stage] || p.stage;
        const stage   = getStage(stageId);
        const entry = {
          participationId: p.id,
          workstreamId:    p.workstreamId,
          stageId,
          stageLabel:      stage?.label || p.stage || '',
          daysInStage:     daysInStage(p.stageEntered),
          terminal:        Boolean(stage?.terminal),
          entity:          p.entity || '',
        };
        (stateByContact[p.contactId] ||= []).push(entry);
      }

      const children = {};
      for (const c of Object.values(contactById)) {
        for (const parentId of c.referredBy) {
          (children[parentId] ||= []).push(c);
        }
      }

      out.referrals = Object.keys(children).map(rootId => {
        const root = contactById[rootId];
        const kids = children[rootId].map(c => {
          const states = stateByContact[c.id] || [];
          return {
            contactId:   c.id,
            name:        c.name,
            status:      c.status,
            lastContacted: c.lastContacted,
            daysSinceContact: daysSince(c.lastContacted),
            participations: states,
            // NCNDA status is the question actually asked of a referral tree.
            ncndaSigned: states.some(s =>
              ['ncnda_signed', 'discovery_call', 'contract_negotiation', 'deal_finalization', 'closed'].includes(s.stageId)),
            furthestStage: states.filter(s => !s.terminal).sort((a, b) =>
              (getStage(b.stageId)?.order || 0) - (getStage(a.stageId)?.order || 0))[0]?.stageLabel || null,
          };
        }).filter(k => keep({ entity: k.participations[0]?.entity || '' }));

        return {
          contactId:      rootId,
          name:           root?.name || rootId,
          email:          root?.email || '',
          introducedCount: kids.length,
          ncndaSignedCount: kids.filter(k => k.ncndaSigned).length,
          // An intermediary whose introductions have all gone quiet is the
          // signal: the referrer stopped, not just the referrals.
          quietCount:     kids.filter(k => (k.daysSinceContact ?? 999) > 21).length,
          lastActivityDays: Math.min(...kids.map(k => k.daysSinceContact ?? 999)),
          introduced:     kids.sort((a, b) => (a.daysSinceContact ?? 999) - (b.daysSinceContact ?? 999)),
        };
      })
        .filter(r => r.introducedCount > 0)
        .sort((a, b) => b.introducedCount - a.introducedCount);
    }

    return ok(out);
  } catch (e) {
    console.error('[coo-accountability]', e?.message || String(e));
    return err(500, e?.message || 'Accountability read failed');
  }
};
