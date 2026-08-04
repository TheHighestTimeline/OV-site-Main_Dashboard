// Apply the actions a human confirmed on the voice review screen (WP10).
//
// NOTHING REACHES AIRTABLE FROM VOICE WITHOUT REVIEW. voice-parse produces a
// proposal; the client renders it as an editable confirm screen; only the edited,
// approved payload arrives here. This endpoint therefore trusts its input to
// have been seen by a person, and its job is to write it correctly, not to guess.
//
// THE INBOX LANE: a task missing entity, owner or due date is written with
// Status 'Submitted' and no Focus, which is the lane that gets emptied in the
// evening SOP. It is not put on the board, because a task nobody owns with no
// date is not a commitment and pretending otherwise is what made the old board
// untrustworthy.
//
// POST { newTasks: [], taskUpdates: [], focusRequests: [], notes: [], transcript? }

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase, explainSupabaseError } from './_supabase.js';
import { TB, listRecords, createRecords, updateRecords } from './_airtable.js';
import { isTerminalTaskStatus } from './_stages.js';

const TASKS_TBL = () => process.env.AIRTABLE_TABLE_TASKS || TB.TASKS;

/** A task is board-ready only with all three. Otherwise it goes to the Inbox. */
function isBoardReady(t) {
  return Boolean(String(t.entity || '').trim())
      && Boolean(String(t.owner || '').trim() || (t.assigneeContactId || '').trim?.())
      && Boolean(t.dueDate);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  try {
    const user = await getUser(event).catch(() => null);
    const {
      newTasks = [], taskUpdates = [], focusRequests = [], notes = [], transcript = '',
    } = JSON.parse(event.body || '{}');

    const supabase = getSupabase();
    const result = { created: [], updated: [], focused: [], notes: [], inbox: 0, errors: [] };

    // ── New tasks ────────────────────────────────────────────────────────────
    if (newTasks.length) {
      // Resolve owner names to contact records. Never create a contact from a
      // spoken name: typecast on a linked field silently invents CRM records,
      // which is how the contact list filled up with junk before.
      let contactsByName = {};
      try {
        const recs = await listRecords(process.env.AIRTABLE_TABLE_CONTACTS || TB.CONTACTS, {
          fields: ['Full Name'],
        });
        contactsByName = Object.fromEntries(
          recs.map(r => [String(r.fields?.['Full Name'] || '').trim().toLowerCase(), r.id]),
        );
      } catch (e) {
        console.warn('[coo-voice-apply] contact index failed:', e.message);
      }

      const rows = newTasks.map(t => {
        const ready = isBoardReady(t);
        const fields = {
          'Action Name': String(t.actionName || '').trim().slice(0, 500),
          // Inbox lane: 'Submitted' is the existing status the board already
          // treats as not-yet-real, so this needs no new vocabulary.
          'Status':   ready ? 'Not Started' : 'Submitted',
          'Priority': t.priority || 'Medium',
        };
        if (t.dueDate) fields['Due Date'] = String(t.dueDate).slice(0, 10);
        if (t.entity)  fields['Entity']   = t.entity;

        const ownerId = t.assigneeContactId
          || contactsByName[String(t.owner || '').trim().toLowerCase()]
          || null;
        if (ownerId) fields['Assigned To'] = [ownerId];

        if (t.opportunityId)   fields['Opportunity']   = [t.opportunityId];
        if (t.contactId)       fields['Contact']       = [t.contactId];
        if (t.participationId) fields['Participation'] = [t.participationId];
        if (transcript)        fields['Description']   = `Captured by voice on ${new Date().toISOString().slice(0, 10)}.\n\n"${String(transcript).slice(0, 2000)}"`;

        if (!ready) result.inbox++;
        return { fields, meta: t };
      }).filter(r => r.fields['Action Name']);

      if (rows.length) {
        try {
          const created = await createRecords(TASKS_TBL(), rows.map(r => ({ fields: r.fields })));
          created.forEach((rec, i) => {
            result.created.push({
              id: rec.id,
              name: rows[i].fields['Action Name'],
              inbox: rows[i].fields['Status'] === 'Submitted',
            });
          });

          // Timeline entries for anything scoped to a participation.
          const events = created.map((rec, i) => {
            const pid = rows[i].meta.participationId;
            if (!pid) return null;
            return {
              participation_airtable_id: pid,
              contact_airtable_id:       rows[i].meta.contactId || null,
              event_type:  'task_created',
              occurred_at: new Date().toISOString(),
              title:       rows[i].fields['Action Name'],
              detail:      'Captured by voice',
              actor:       'us',
              source:      'manual',
              confidence:  'confirmed',
              dedupe_key:  `task:created:${rec.id}`,
            };
          }).filter(Boolean);
          if (events.length) await supabase.from('coo_events').insert(events);
        } catch (e) {
          result.errors.push(`task create: ${e.message}`);
        }
      }
    }

    // ── Task updates ─────────────────────────────────────────────────────────
    const updates = taskUpdates.filter(u => u.taskId);
    if (updates.length) {
      try {
        await updateRecords(TASKS_TBL(), updates.map(u => {
          const fields = {};
          if (u.newStatus) fields['Status'] = u.newStatus;
          if (u.note) {
            const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            fields['Description'] = `[${ts}] ${String(u.note).trim()}`;
          }
          return { id: u.taskId, fields };
        }));
        result.updated = updates.map(u => ({ id: u.taskId, status: u.newStatus || null }));
      } catch (e) {
        result.errors.push(`task update: ${e.message}`);
      }
    }

    // ── Focus requests ("put the Genesis redlines on today's list") ──────────
    // The five-cap is enforced by tasks-focus, not here. Voice must not be a
    // side door around it, so anything beyond the cap is reported back for the
    // user to resolve with a swap rather than written anyway.
    if (focusRequests.length) {
      try {
        const all = await listRecords(TASKS_TBL(), { fields: ['Focus', 'Status'] });
        const current = all.filter(r =>
          r.fields?.['Focus'] === 'Doing Now' &&
          !isTerminalTaskStatus(r.fields?.['Status']),
        ).length;

        let slots = Math.max(0, 5 - current);
        const writes = [];

        for (const f of focusRequests) {
          if (!f.taskId) continue;
          if (f.focus === 'Doing Now' && slots <= 0) {
            result.errors.push(`"${f.taskTitle || f.taskId}" not added: Today is already full at 5. Swap one out first.`);
            continue;
          }
          if (f.focus === 'Doing Now') slots--;
          writes.push({
            id: f.taskId,
            fields: {
              'Focus': f.focus,
              'Focus Set At': new Date().toISOString().slice(0, 10),
              ...(f.focus === 'Doing Now' ? { 'Focus Order': 5 - slots } : {}),
            },
          });
        }

        if (writes.length) {
          await updateRecords(TASKS_TBL(), writes);
          result.focused = writes.map(w => ({ id: w.id, focus: w.fields['Focus'] }));
        }
      } catch (e) {
        result.errors.push(`focus: ${e.message}`);
      }
    }

    // ── Notes ────────────────────────────────────────────────────────────────
    for (const n of notes) {
      const text = String(n.text || '').trim();
      if (!text) continue;
      if (!n.participationId && !n.contactId) continue;
      try {
        const firstLine = text.split('\n')[0].trim();
        await supabase.from('coo_events').insert({
          participation_airtable_id: n.participationId || null,
          contact_airtable_id:       n.contactId || null,
          event_type:  'note',
          occurred_at: new Date().toISOString(),
          title:       firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine,
          detail:      text.length > firstLine.length ? text : null,
          actor:       'us',
          source:      'manual',
          confidence:  'confirmed',
        });
        result.notes.push(n.participationId || n.contactId);
        if (n.participationId) {
          await supabase.from('coo_briefs').update({ stale: true })
            .eq('participation_airtable_id', n.participationId);
        }
      } catch (e) {
        result.errors.push(`note: ${e.message}`);
      }
    }

    console.log(`[coo-voice-apply] ${result.created.length} created (${result.inbox} to inbox), ` +
                `${result.updated.length} updated by ${user?.email || 'unknown'}`);

    return ok(result);
  } catch (e) {
    console.error('[coo-voice-apply]', e?.message || String(e));
    return err(500, explainSupabaseError(e) || 'Voice apply failed');
  }
};
