import { airtableList, fromAirtableRecord, OPPORTUNITIES_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE        = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';
const PROJECTS_TBL = () => process.env.AIRTABLE_TABLE_PROJECTS      || 'Projects';
const TASKS_TBL    = () => process.env.AIRTABLE_TABLE_TASKS         || 'Master Action Board';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    // Load opportunities plus the two tables we walk to connect them to tasks:
    //   Opportunity --(Projects)--> Project --(Master Action Board)--> Task
    const [records, projectRecs, taskRecs] = await Promise.all([
      airtableList(TABLE()),
      airtableList(PROJECTS_TBL()).catch(() => []),
      airtableList(TASKS_TBL()).catch(() => []),
    ]);

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

      // Walk Opportunity -> Projects -> Tasks
      opp.projectNames = opp.projectIds.map(id => projectById[id]?.name || id);
      const taskIdSet  = new Set();
      opp.projectIds.forEach(pid => (projectById[pid]?.taskIds || []).forEach(tid => taskIdSet.add(tid)));
      opp.taskIds = [...taskIdSet];
      opp.tasks   = opp.taskIds.map(tid => taskById[tid]).filter(Boolean);

      // Entity drives the company tabs; Type drives the Internal/External toggle.
      opp.dealCategory = opp.entity ? [opp.entity] : [];
      opp.kanbanType   = opp.type ? String(opp.type).toLowerCase() : null;

      // Field not present in the live base — kept for frontend compatibility
      opp.driveLink = null;

      return opp;
    });

    return ok(opportunities);
  } catch (e) {
    return err(500, e.message);
  }
};
