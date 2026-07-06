// Friday slippage report (2026-07 audit §7): the report that catches what's
// falling through the cracks — stale open opportunities, tasks stuck in
// waiting states, and contacts more than a week past their next-action date.
import { ok, err, CORS } from './_http.js';
import { airtableList, fromAirtableRecord, TASKS_MAP, CONTACTS_MAP, OPPORTUNITIES_MAP } from './_airtable.js';
import { recipients, sendHtmlEmail, sendWhatsApp, isScheduledOrSecret } from './_notify.js';

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STUCK_STATUSES = new Set(['Waiting On Response', 'Needs Attention', 'On Hold']);
const OPEN_STAGES    = new Set(['Lead', 'Qualified', 'Proposal', 'Negotiation']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (!isScheduledOrSecret(event)) return err(401, 'Unauthorized');

  try {
    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const [taskRecs, contactRecs, oppRecs] = await Promise.all([
      airtableList(process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board', { maxRecords: 1000 }),
      airtableList(process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts', { maxRecords: 1000 }),
      airtableList(process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities', { maxRecords: 1000 }),
    ]);
    const tasks    = taskRecs.map(r => fromAirtableRecord(r, TASKS_MAP));
    const contacts = contactRecs.map(r => fromAirtableRecord(r, CONTACTS_MAP));
    // Keep the raw record so we can read Last Modified for staleness.
    const opps = oppRecs.map(r => ({ ...fromAirtableRecord(r, OPPORTUNITIES_MAP), _modified: r.fields['Last Modified'] || null }));

    const stuckTasks = tasks.filter(t => STUCK_STATUSES.has(t.status));
    const staleOpps  = opps.filter(o =>
      OPEN_STAGES.has(o.stage) &&
      (!o._modified || String(o._modified).slice(0, 10) < weekAgo)
    );
    const pastClose  = opps.filter(o => OPEN_STAGES.has(o.stage) && o.closeDate && o.closeDate < today);
    const veryOverdueContacts = contacts.filter(c =>
      c.nextActionDate && c.nextActionDate < weekAgo && (c.status || 'Active') === 'Active'
    );

    const html = `
      <h2 style="margin:0 0 4px">OneVibe weekly slippage report — week ending ${today}</h2>
      ${staleOpps.length ? `<h3>💤 Open deals with no movement in 7+ days (${staleOpps.length})</h3><ul>${staleOpps.slice(0, 20).map(o => `<li><b>${esc(o.name)}</b> — ${esc(o.stage)}${o.dealValue ? ` · $${Number(o.dealValue).toLocaleString()}` : ''}</li>`).join('')}</ul>` : ''}
      ${pastClose.length ? `<h3 style="color:#b03a3a">📅 Open deals past their close date (${pastClose.length})</h3><ul>${pastClose.slice(0, 20).map(o => `<li><b>${esc(o.name)}</b> — was closing ${esc(o.closeDate)} (${esc(o.stage)})</li>`).join('')}</ul>` : ''}
      ${stuckTasks.length ? `<h3 style="color:#d96b3a">🧱 Tasks stuck in waiting states (${stuckTasks.length})</h3><ul>${stuckTasks.slice(0, 25).map(t => `<li><b>${esc(t.task)}</b> — ${esc(t.status)}${t.entity ? ` [${esc(t.entity)}]` : ''}</li>`).join('')}</ul>` : ''}
      ${veryOverdueContacts.length ? `<h3>👋 Contacts 7+ days past next action (${veryOverdueContacts.length})</h3><ul>${veryOverdueContacts.slice(0, 25).map(c => `<li><b>${esc(c.name)}</b> — “${esc(c.nextAction || '—')}” due ${esc(c.nextActionDate)}</li>`).join('')}</ul>` : ''}
      ${!staleOpps.length && !pastClose.length && !stuckTasks.length && !veryOverdueContacts.length ? '<p>✅ Nothing slipping this week. Clean board.</p>' : ''}
      <p style="color:#888;font-size:12px">Sent every Friday by the OneVibe Hub.</p>
    `;

    await sendHtmlEmail({
      to: recipients(),
      subject: `📋 Weekly slippage: ${staleOpps.length} stale deals · ${stuckTasks.length} stuck tasks · ${veryOverdueContacts.length} overdue contacts`,
      html,
    });

    await sendWhatsApp(`📋 OneVibe weekly slippage — ${staleOpps.length} stale deals, ${pastClose.length} past close date, ${stuckTasks.length} stuck tasks, ${veryOverdueContacts.length} overdue contacts. Details in email / dashboard.`);

    return ok({ sent: true, staleOpps: staleOpps.length, pastClose: pastClose.length, stuckTasks: stuckTasks.length, overdueContacts: veryOverdueContacts.length });
  } catch (e) {
    console.error('weekly-report error:', e);
    return err(500, e.message);
  }
};
