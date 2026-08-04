import { airtableList, fromAirtableRecord, OPPORTUNITIES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';

const TABLE        = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';
const PROJECTS_TBL = () => process.env.AIRTABLE_TABLE_PROJECTS      || 'Projects';
const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS         || 'Master Action Board';
const COMPANIES_TBL= () => process.env.AIRTABLE_TABLE_COMPANIES     || 'Companies';
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS      || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    // Load opportunities plus the tables we walk to connect them to tasks:
    //   Opportunity --(Projects)--> Project --(Master Action Board)--> Task
    //   Opportunity --(Master Action Board)--> Task   (direct link)
    // Companies/Contacts are loaded only to resolve linked-record names so the
    // frontend can render clickable chips instead of raw record IDs.
    const [records, projectRecs, taskRecs, companyRecs, contactRecs] = await Promise.all([
      airtableList(TABLE()),
      airtableList(PROJECTS_TBL()).catch(() => []),
      airtableList(TASKS_TBL()).catch(() => []),
      airtableList(COMPANIES_TBL()).catch(() => []),
      airtableList(CONTACTS_TBL()).catch(() => []),
    ]);

    const companyNameById = Object.fromEntries(companyRecs.map(c => [c.id, c.fields?.['Name'] || '']));
    const contactNameById = Object.fromEntries(contactRecs.map(c => [c.id, c.fields?.['Full Name'] || '']));

    // id -> task summary
    const taskById = Object.fromEntries(taskRecs.map(t => [t.id, {
      id:     t.id,
      name:   t.fields?.['Action Name'] || '',
      status: t.fields?.['Status'] || '',
    }]));

    // id -> { name, taskIds } for each project
    const projectById = Object.fromEntries(projectRecs.map(p => [p.id, {
      name:    p.fields?.['Project Name'] || '',
      taskIds: p.fields?.['Master Action Board'] || [],
    }]));

    const opportunities = records.map(r => {
      const opp = fromAirtableRecord(r, OPPORTUNITIES_MAP);

      // Linked records (live base column names)
      opp.companyIds = r.fields['Companies']          || [];
      opp.projectIds = r.fields['Projects']           || [];
      opp.contactIds = r.fields['Associated Contact'] || [];

      // Self-link hierarchy. Empty parent = a top-level opportunity; set = a
      // sub-opportunity (one thread with one company or person) nested under it.
      opp.parentIds = r.fields['Parent Opportunity'] || [];
      opp.parentId  = opp.parentIds[0] || null;

      // Resolved {id,name} pairs for clickable chips in the UI.
      opp.companies = opp.companyIds.map(id => ({ id, name: companyNameById[id] || '' }));
      opp.contacts  = opp.contactIds.map(id => ({ id, name: contactNameById[id] || '' }));

      // Walk Opportunity -> Projects -> Tasks, PLUS the direct
      // Opportunity <-> Master Action Board link (a task's 'Opportunity' field).
      opp.projectNames = opp.projectIds.map(id => projectById[id]?.name || id);
      const taskIdSet  = new Set();
      opp.projectIds.forEach(pid => (projectById[pid]?.taskIds || []).forEach(tid => taskIdSet.add(tid)));
      (r.fields['Master Action Board'] || []).forEach(tid => taskIdSet.add(tid));
      opp.taskIds = [...taskIdSet];
      opp.tasks   = opp.taskIds.map(tid => taskById[tid]).filter(Boolean);

      // Entity drives the company tabs; Type drives the Internal/External toggle.
      opp.dealCategory = opp.entity ? [opp.entity] : [];
      opp.kanbanType   = opp.type ? String(opp.type).toLowerCase() : null;

      // Airtable percent fields are 0–1 fractions; the UI works in 0–100.
      opp.probability = opp.probability != null ? Math.round(Number(opp.probability) * 100) : null;
      // The frontend renders `nextAction` — alias the base's Next Step field.
      opp.nextAction = opp.nextStep || null;

      // Field not present in the live base — kept for frontend compatibility
      opp.driveLink = null;

      return opp;
    });

    return ok(opportunities);
  } catch (e) {
    return err(500, e.message);
  }
};
