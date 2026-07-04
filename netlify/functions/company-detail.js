import { airtableGet, airtableList } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const COMPANIES_TBL = () => process.env.AIRTABLE_TABLE_COMPANIES  || 'Companies';
const DOCUMENTS_TBL = () => process.env.AIRTABLE_TABLE_DOCUMENTS  || 'Documents';
const FOLDERS_TBL   = () => process.env.AIRTABLE_TABLE_FOLDERS    || 'Folders';
const ACTIVITIES_TBL= () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';
const TASKS_TBL     = () => process.env.AIRTABLE_TABLE_TASKS      || 'Master Action Board';
const CONTACTS_TBL  = () => process.env.AIRTABLE_TABLE_CONTACTS   || 'CRM Contacts';
const OPPS_TBL      = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';

// A task counts as "open" unless it's in one of these terminal states.
// Mirrors ContactProfile.jsx isDone() plus a couple of spelling variants.
const DONE_STATES = new Set(['done', 'complete', 'completed', 'canceled', 'cancelled']);
const isOpen = (status) => !DONE_STATES.has(String(status || '').toLowerCase().trim());

const selVal = (v) => (v && typeof v === 'object' ? v.name : v) || null;

// ── Company drill-down aggregation ────────────────────────────────────────────
// One call powers the "Company Snapshot" modal opened from a contact:
//   notes (Calls/Notes + Summary + Waiting On + recent Activities),
//   documents (with folderIds so the UI can group), folders,
//   open tasks (Entity-matched OR linked to one of the company's contacts),
//   people (other contacts at the company), opportunities.
//
// Required query param: ?companyId=recXXX
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const params = event.queryStringParameters || {};
    const companyId = params.companyId;
    if (!companyId) return err(400, 'companyId is required');

    const rec = await airtableGet(COMPANIES_TBL(), companyId);
    const f = rec.fields || {};

    const entityCode      = selVal(f['Entity Code']);
    const contactLinkIds  = f['CRM Contacts'] || [];
    const oppLinkIds       = f['Opportunities'] || [];

    const company = {
      id:          rec.id,
      name:        f['Name'] || '',
      entityCode,
      shortCode:   f['Short Code'] || '',
      type:        selVal(f['Type']),
      status:      selVal(f['Status']),
      health:      f['Health'] || '',
      stage:       f['Stage'] || '',
      website:     f['Website'] || '',
      followUpDate: f['Follow Up Date'] || '',
      notes: {
        callsNotes: f['Calls/Notes'] || '',
        summary:    f['Summary'] || '',
        waitingOn:  f['Waiting On'] || '',
      },
    };

    // Pull the linked/related tables in parallel. Any individual failure
    // degrades gracefully to an empty list rather than failing the whole call.
    const safe = (p) => p.then(x => x).catch(() => []);
    const [allDocs, allFolders, allActivities, allTasks, allContacts, allOpps] = await Promise.all([
      safe(airtableList(DOCUMENTS_TBL(),  { sort: [{ field: 'Name', direction: 'asc' }] })),
      safe(airtableList(FOLDERS_TBL(),    { sort: [{ field: 'Folder Name', direction: 'asc' }] })),
      safe(airtableList(ACTIVITIES_TBL(), { sort: [{ field: 'Date', direction: 'desc' }] })),
      safe(airtableList(TASKS_TBL(),      { sort: [{ field: 'Due Date', direction: 'asc' }] })),
      safe(airtableList(CONTACTS_TBL())),
      safe(airtableList(OPPS_TBL())),
    ]);

    const contactNameById = Object.fromEntries(allContacts.map(r => [r.id, r.fields?.['Full Name'] || '']));
    const companyContactIdSet = new Set(contactLinkIds);

    // Documents scoped to this company
    const documents = allDocs
      .filter(r => (r.fields['Company'] || []).includes(companyId))
      .map(r => ({
        id:         r.id,
        name:       r.fields['Name'] || '',
        type:       selVal(r.fields['Type']),
        driveLink:  r.fields['Drive Link'] || '',
        tags:       r.fields['Tags'] || [],
        signedDate: r.fields['Signed Date'] || '',
        version:    r.fields['Version'] || '',
        folderIds:  r.fields['Folder'] || [],
      }));

    // Folders scoped to this company
    const folders = allFolders
      .filter(r => (r.fields['Company'] || []).includes(companyId))
      .map(r => ({
        id:          r.id,
        name:        r.fields['Folder Name'] || '',
        purpose:     r.fields['Purpose'] || '',
        documentIds: r.fields['Documents'] || [],
      }));

    // Recent activities about this company
    const activities = allActivities
      .filter(r => (r.fields['Company'] || []).includes(companyId))
      .slice(0, 25)
      .map(r => ({
        id:        r.id,
        title:     r.fields['Title'] || '',
        type:      selVal(r.fields['Type']),
        source:    selVal(r.fields['Source']),
        date:      r.fields['Date'] || '',
        body:      r.fields['Body'] || '',
        aiSummary: r.fields['AI Summary'] || '',
      }));

    // Open tasks: Entity single-select matches this company's Entity Code,
    // OR the task is linked to one of the company's contacts.
    const openTasks = allTasks
      .filter(r => {
        if (!isOpen(selVal(r.fields['Status']))) return false;
        const entityMatch = entityCode && selVal(r.fields['Entity']) === entityCode;
        const contactMatch = (r.fields['Contact'] || []).some(id => companyContactIdSet.has(id));
        return entityMatch || contactMatch;
      })
      .map(r => ({
        id:       r.id,
        task:     r.fields['Action Name'] || '',
        status:   selVal(r.fields['Status']),
        priority: selVal(r.fields['Priority']),
        dueDate:  r.fields['Due Date'] || '',
        taskType: selVal(r.fields['Task Type']),
        contactNames: (r.fields['Contact'] || []).map(id => contactNameById[id]).filter(Boolean),
      }));

    // People: the company's linked CRM Contacts
    const people = contactLinkIds.map(id => {
      const cr = allContacts.find(x => x.id === id);
      if (!cr) return { id, name: contactNameById[id] || '' };
      return {
        id,
        name:  cr.fields['Full Name'] || '',
        role:  cr.fields['Title'] || '',
        email: cr.fields['Email'] || '',
        status: selVal(cr.fields['Status']),
      };
    });

    // Opportunities linked to this company (union of the company's link field
    // and any opp that links back to this company).
    const opportunities = allOpps
      .filter(r => oppLinkIds.includes(r.id) || (r.fields['Companies'] || []).includes(companyId))
      .map(r => ({
        id:        r.id,
        name:      r.fields['Opportunity Name'] || '',
        stage:     selVal(r.fields['Stage']),
        dealValue: r.fields['Deal Value'] ?? null,
        closeDate: r.fields['Close Date'] || '',
        nextStep:  r.fields['Next Step'] || '',
      }));

    return ok({ company, documents, folders, activities, openTasks, people, opportunities });
  } catch (e) {
    return err(500, e.message);
  }
};
