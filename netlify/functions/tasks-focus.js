// The Today list (WP9). Focus is a field on Master Action Board, not a separate
// store: one source of truth, surfaced on Overview and mirrored into Triage's
// "Committed today" bucket.
//
// THE CAP OF FIVE IS THE ENTIRE MECHANISM. Without it this is the paper list
// again inside a week. A sixth tag is refused with the current five returned so
// the UI can offer a swap: pick one to drop. There is deliberately no "just this
// once" bypass.
//
// GET                          → { doingNow, nextUp }
// POST { taskId, focus }       → set 'Doing Now' | 'Next Up' | null
// POST { taskId, focus, swapOutTaskId } → atomic swap when already at five
// POST { order: [taskId,...] } → reorder Doing Now
//
// Note: this endpoint uses requireAuth, not the COO roles. The Today card is the
// first thing seen each morning and must not need a role check to render.

import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { TB, listRecordsLenient, updateRecords } from './_airtable.js';

const TASKS_TBL = () => process.env.AIRTABLE_TABLE_TASKS || TB.TASKS;

export const MAX_DOING_NOW = 5;
const STALE_CARRYOVER_DAYS = 3;

const FIELDS = [
  'Action Name', 'Status', 'Priority', 'Due Date', 'Entity',
  'Focus', 'Focus Order', 'Focus Set At', 'Assigned To', 'Participation',
];

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    if (event.httpMethod === 'GET') {
      const { doingNow, nextUp } = await readFocus();
      return ok({ doingNow, nextUp, max: MAX_DOING_NOW, atCapacity: doingNow.length >= MAX_DOING_NOW });
    }

    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
      return err(405, 'GET or POST only');
    }

    const body = JSON.parse(event.body || '{}');

    // ── Reorder ──────────────────────────────────────────────────────────────
    if (Array.isArray(body.order)) {
      await updateRecords(TASKS_TBL(), body.order.map((id, i) => ({
        id, fields: { 'Focus Order': i + 1 },
      })));
      const state = await readFocus();
      return ok({ ...state, max: MAX_DOING_NOW, reordered: true });
    }

    const { taskId, focus, swapOutTaskId } = body;
    if (!taskId) return err(400, 'taskId is required');
    if (focus !== null && !['Doing Now', 'Next Up'].includes(focus)) {
      return err(400, "focus must be 'Doing Now', 'Next Up' or null");
    }

    const { doingNow } = await readFocus();
    const alreadyFocused = doingNow.some(t => t.id === taskId);

    // ── Clear ────────────────────────────────────────────────────────────────
    if (focus === null) {
      await updateRecords(TASKS_TBL(), [{
        id: taskId,
        fields: { 'Focus': null, 'Focus Order': null, 'Focus Set At': null },
      }]);
      const state = await readFocus();
      return ok({ ...state, max: MAX_DOING_NOW, cleared: true });
    }

    // ── Next Up is unlimited: it is the on-deck lane, not the commitment ─────
    if (focus === 'Next Up') {
      await updateRecords(TASKS_TBL(), [{
        id: taskId,
        fields: { 'Focus': 'Next Up', 'Focus Order': null, 'Focus Set At': today() },
      }]);
      const state = await readFocus();
      return ok({ ...state, max: MAX_DOING_NOW });
    }

    // ── Doing Now: enforce the cap ───────────────────────────────────────────
    if (!alreadyFocused && doingNow.length >= MAX_DOING_NOW) {
      if (!swapOutTaskId) {
        // Refuse, and hand back exactly what the UI needs to render the swap
        // prompt. Silently allowing a sixth is the failure this exists to stop.
        return {
          statusCode: 409,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: `Today is full at ${MAX_DOING_NOW}. Pick one to drop.`,
            code: 'FOCUS_FULL',
            max: MAX_DOING_NOW,
            doingNow,
          }),
        };
      }
      if (!doingNow.some(t => t.id === swapOutTaskId)) {
        return err(400, 'swapOutTaskId is not currently in Doing Now');
      }
      // The dropped task lands in Next Up rather than nowhere. It was a real
      // commitment ten seconds ago; losing it entirely is how work evaporates.
      await updateRecords(TASKS_TBL(), [{
        id: swapOutTaskId,
        fields: { 'Focus': 'Next Up', 'Focus Order': null, 'Focus Set At': today() },
      }]);
    }

    const nextOrder = alreadyFocused
      ? (doingNow.find(t => t.id === taskId)?.focusOrder || doingNow.length)
      : doingNow.filter(t => t.id !== swapOutTaskId).length + 1;

    await updateRecords(TASKS_TBL(), [{
      id: taskId,
      fields: {
        'Focus': 'Doing Now',
        'Focus Order': nextOrder,
        // Focus Set At is preserved on a re-tag so carryover stays visible.
        // Resetting it every morning would hide the exact thing worth seeing.
        ...(alreadyFocused ? {} : { 'Focus Set At': today() }),
      },
    }]);

    const state = await readFocus();
    return ok({ ...state, max: MAX_DOING_NOW, swapped: Boolean(swapOutTaskId) });
  } catch (e) {
    console.error('[tasks-focus]', e?.message || String(e));
    return err(500, e?.message || 'Focus update failed');
  }
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function readFocus() {
  // Strict here on purpose: if Focus itself is missing there is no Today
  // list to render, and the card says so rather than silently showing nothing.
  const records = await listRecordsLenient(TASKS_TBL(), { fields: FIELDS });
  if (records.missingFields?.includes('Focus')) {
    throw new Error('The Focus field does not exist on Master Action Board yet.');
  }

  const shape = (r) => {
    const setAt = r.fields?.['Focus Set At'] || null;
    const age   = daysSince(setAt);
    return {
      id:         r.id,
      name:       r.fields?.['Action Name'] || '',
      status:     r.fields?.['Status'] || '',
      priority:   r.fields?.['Priority'] || '',
      dueDate:    r.fields?.['Due Date'] || null,
      entity:     r.fields?.['Entity'] || '',
      focus:      r.fields?.['Focus'] || null,
      focusOrder: r.fields?.['Focus Order'] ?? null,
      focusSetAt: setAt,
      daysOpen:   age,
      // Carryover is visible, never silent. Three days on the same item means
      // it is mis-sized or being avoided, and hiding that defeats the point.
      stale:      age != null && age >= STALE_CARRYOVER_DAYS,
      assigneeIds: arr(r.fields?.['Assigned To']),
      participationId: arr(r.fields?.['Participation'])[0] || null,
    };
  };

  const live = records.filter(r => {
    const s = r.fields?.['Status'] || '';
    return s !== 'Done' && s !== 'Canceled';
  });

  const doingNow = live
    .filter(r => r.fields?.['Focus'] === 'Doing Now')
    .map(shape)
    .sort((a, b) => (a.focusOrder ?? 99) - (b.focusOrder ?? 99));

  const nextUp = live
    .filter(r => r.fields?.['Focus'] === 'Next Up')
    .map(shape)
    .sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0));

  return { doingNow, nextUp };
}
