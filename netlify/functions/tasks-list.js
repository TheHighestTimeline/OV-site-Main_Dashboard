import { airtableList, fromAirtableRecord, TASKS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const CONTACTS_TBL = process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';
  const PROJECTS_TBL = process.env.AIRTABLE_TABLE_PROJECTS || 'Projects';

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Due Date', direction: 'asc' }],
    });

    // Build id -> display-name lookups so linked records ('Assigned To',
    // 'Related Project') render as names instead of raw record IDs.
    const buildNameMap = async (table, nameField) => {
      try {
        const recs = await airtableList(table);
        return Object.fromEntries(recs.map(r => [r.id, r.fields?.[nameField] || '']));
      } catch { return {}; }
    };
    const [contactNames, projectNames] = await Promise.all([
      buildNameMap(CONTACTS_TBL, 'Full Name'),
      buildNameMap(PROJECTS_TBL, 'Project Name'),
    ]);

    const resolve = (val, lookup) => {
      const ids = Array.isArray(val) ? val : (val ? [val] : []);
      return ids.map(id => lookup[id] || id);
    };

    const tasks = records.map(r => {
      const t = fromAirtableRecord(r, TASKS_MAP);

      // owner: linked Contacts -> comma-joined names (frontend renders a string)
      const ownerNames = resolve(t.owner, contactNames);
      t.ownerIds = Array.isArray(t.owner) ? t.owner : (t.owner ? [t.owner] : []);
      t.owner    = ownerNames.join(', ');

      // related projects: linked Projects -> ids + names
      t.relatedProjectIds   = Array.isArray(t.relatedProjects) ? t.relatedProjects : (t.relatedProjects ? [t.relatedProjects] : []);
      t.relatedProjectNames = resolve(t.relatedProjects, projectNames);

      // Opportunity + Client links (raw record IDs for edit-form selection)
      t.opportunityIds = r.fields['Opportunity'] || [];
      t.clientIds      = r.fields['Client']      || [];

      // Entity (single-select) drives the company tabs. Expose it as the
      // dealCategory array the frontend filters on.
      t.dealCategory         = t.entity ? [t.entity] : [];
      t.relatedOpportunities = [];
      t.companyNames         = [];
      return t;
    });

    return ok(tasks);
  } catch (e) {
    return err(500, e.message);
  }
};
