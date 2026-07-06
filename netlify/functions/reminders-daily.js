// Daily reminder digest (2026-07 audit §7). Scheduled every morning (see
// netlify.toml): tasks due today/tomorrow, overdue tasks, and contacts whose
// Next Action date has passed — emailed to the team and (optionally) pushed
// to WhatsApp via Twilio. Nothing slips through the cracks.
import { ok, err, CORS } from './_http.js';
import { airtableList, fromAirtableRecord, TASKS_MAP, CONTACTS_MAP } from './_airtable.js';
import { recipients, sendHtmlEmail, sendWhatsApp, isScheduledOrSecret } from './_notify.js';

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DONE_STATUSES = new Set(['Done', 'Canceled', 'Submitted']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (!isScheduledOrSecret(event)) return err(401, 'Unauthorized');

  try {
    const today    = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const [taskRecs, contactRecs] = await Promise.all([
      airtableList(process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board', { maxRecords: 1000 }),
      airtableList(process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts', { maxRecords: 1000 }),
    ]);
    const tasks    = taskRecs.map(r => fromAirtableRecord(r, TASKS_MAP)).filter(t => !DONE_STATUSES.has(t.status));
    const contacts = contactRecs.map(r => fromAirtableRecord(r, CONTACTS_MAP));

    const overdue  = tasks.filter(t => t.dueDate && t.dueDate < today);
    const dueSoon  = tasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= tomorrow);
    const overdueContacts = contacts.filter(c => c.nextActionDate && c.nextActionDate < today && (c.status || 'Active') === 'Active');

    if (!overdue.length && !dueSoon.length && !overdueContacts.length) {
      return ok({ sent: false, reason: 'nothing due' });
    }

    const taskRow = t => `<li><b>${esc(t.task)}</b>${t.entity ? ` <span style="color:#888">[${esc(t.entity)}]</span>` : ''} — due ${esc(t.dueDate)}${t.status ? ` · ${esc(t.status)}` : ''}</li>`;
    const contactRow = c => `<li><b>${esc(c.name)}</b> — next action “${esc(c.nextAction || '—')}” was due ${esc(c.nextActionDate)}</li>`;

    const html = `
      <h2 style="margin:0 0 4px">OneVibe daily reminders — ${today}</h2>
      ${overdue.length ? `<h3 style="color:#b03a3a">⚠ Overdue tasks (${overdue.length})</h3><ul>${overdue.slice(0, 25).map(taskRow).join('')}</ul>` : ''}
      ${dueSoon.length ? `<h3>Due today / tomorrow (${dueSoon.length})</h3><ul>${dueSoon.slice(0, 25).map(taskRow).join('')}</ul>` : ''}
      ${overdueContacts.length ? `<h3 style="color:#d96b3a">Contacts waiting on you (${overdueContacts.length})</h3><ul>${overdueContacts.slice(0, 25).map(contactRow).join('')}</ul>` : ''}
      <p style="color:#888;font-size:12px">Open the dashboard → Tasks / Contacts to act on these. Sent automatically by the OneVibe Hub.</p>
    `;

    await sendHtmlEmail({
      to: recipients(),
      subject: `⏰ OneVibe reminders: ${overdue.length} overdue · ${dueSoon.length} due soon · ${overdueContacts.length} contacts waiting`,
      html,
    });

    const waText = [
      `⏰ OneVibe daily reminders (${today})`,
      overdue.length ? `⚠ Overdue: ${overdue.slice(0, 8).map(t => t.task).join(' | ')}` : null,
      dueSoon.length ? `Due soon: ${dueSoon.slice(0, 8).map(t => t.task).join(' | ')}` : null,
      overdueContacts.length ? `Reach out: ${overdueContacts.slice(0, 8).map(c => c.name).join(', ')}` : null,
    ].filter(Boolean).join('\n');
    const wa = await sendWhatsApp(waText);

    return ok({ sent: true, overdue: overdue.length, dueSoon: dueSoon.length, overdueContacts: overdueContacts.length, whatsapp: wa });
  } catch (e) {
    console.error('reminders-daily error:', e);
    return err(500, e.message);
  }
};
