import { airtableGet, airtableList, airtableUpdate, toAirtableFields, TASKS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth, getUser } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, task, status, priority, owner, dueDate, dealCategory, taskType, entity, type,
            contactIds, relatedProjectIds, opportunityIds, clientIds, updateNote,
            links, sourceThread, appendLog } = body;
    if (!id) return err(400, 'id is required');

    const update = {};
    if (task         !== undefined) update.task         = task;
    if (status       !== undefined) update.status       = status;
    if (sourceThread !== undefined) update.sourceThread = sourceThread || '';
    // Stored as JSON text. Serialised here so a malformed array can never reach
    // the record and break every read of it.
    if (links !== undefined) {
      update.links = Array.isArray(links)
        ? JSON.stringify(links
            .filter(l => l && String(l.url || '').trim())
            .map(l => ({ label: String(l.label || '').trim().slice(0, 120), url: String(l.url).trim() })))
        : '';
    }
    if (priority     !== undefined) update.priority     = priority;
    if (dueDate      !== undefined) update.dueDate      = dueDate || null;
    if (taskType     !== undefined) update.taskType     = taskType || null;
    if (entity       !== undefined) update.entity       = entity || null;
    if (type         !== undefined) update.type         = type || null;
    if (dealCategory !== undefined) update.dealCategory = Array.isArray(dealCategory) ? dealCategory : [dealCategory].filter(Boolean);

    // Inline note: append timestamp + text to the Description field, preserving prior content.
    if (updateNote && String(updateNote).trim()) {
      const record = await airtableGet(TABLE(), id);
      const existing = record.fields?.['Description'] || '';
      const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const appended = existing
        ? `${existing}\n[${ts}] ${updateNote.trim()}`
        : `[${ts}] ${updateNote.trim()}`;
      update.notes = appended;
    }

    const fields = toAirtableFields(update, TASKS_MAP);

    // 'Assigned To' is a LINKED field to CRM Contacts, but the UI collects the
    // owner as free text. Previously the raw string was written with
    // typecast:true, which silently CREATES a new (junk) CRM Contact whenever
    // the spelling doesn't exactly match an existing record. Now: resolve to an
    // existing contact by case-insensitive Full Name; no match → skip the write
    // (never invent contacts). Empty string explicitly clears the assignment.
    if (owner !== undefined) {
      const trimmed = String(owner || '').trim();
      if (!trimmed) {
        fields['Assigned To'] = [];
      } else {
        try {
          const CONTACTS_TBL = process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';
          const contacts = await airtableList(CONTACTS_TBL);
          const match = contacts.find(c => String(c.fields?.['Full Name'] || '').trim().toLowerCase() === trimmed.toLowerCase());
          if (match) fields['Assigned To'] = [match.id];
          // no match → leave Assigned To untouched rather than creating a dup
        } catch { /* contacts unreachable — skip owner write */ }
      }
    }

    // Linked-record fields (arrays of record IDs). Passing [] clears the link.
    if (contactIds        !== undefined) fields['Contact']         = Array.isArray(contactIds)        ? contactIds        : [];
    if (relatedProjectIds !== undefined) fields['Related Project'] = Array.isArray(relatedProjectIds) ? relatedProjectIds : [];
    if (opportunityIds    !== undefined) fields['Opportunity']     = Array.isArray(opportunityIds)    ? opportunityIds    : [];
    if (clientIds         !== undefined) fields['Client']          = Array.isArray(clientIds)         ? clientIds         : [];

    if (Object.keys(fields).length === 0) return ok({ id, updated: false });

    // Work log is append-only, newest first. Read-modify-write rather than a
    // plain set, because two people logging on the same task minutes apart must
    // not silently overwrite each other. Airtable has no append primitive.
    if (String(appendLog || '').trim()) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const who   = (await getUser(event).catch(() => null))?.email || 'unknown';
      let existing = '';
      try {
        const cur = await airtableGet(TABLE(), id);
        existing = cur?.fields?.['Work Log'] || '';
      } catch { /* first entry, or the read failed — do not lose the new one */ }
      fields['Work Log'] = `[${stamp} · ${who}] ${String(appendLog).trim()}` +
        (existing ? `\n\n${existing}` : '');
    }

    await airtableUpdate(TABLE(), id, fields);
    return ok({ id, updated: true });
  } catch (e) {
    return err(500, e.message);
  }
};
