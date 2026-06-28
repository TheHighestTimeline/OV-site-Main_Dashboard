// netlify/functions/amplify-projects-list.js
// Returns all records from the Amplify Projects table for the Amplify kanban.
import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_AMPLIFY_PROJECTS || 'Amplify Projects';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Name', direction: 'asc' }],
    });

    const projects = records.map(r => ({
      id:              r.id,
      name:            r.fields['Name']                || '',
      status:          r.fields['Status']              || 'Not Started',
      client:          r.fields['Client / Artist Name'] || r.fields['Client'] || '',
      deliverableType: typeof r.fields['Deliverable Type'] === 'object'
                         ? r.fields['Deliverable Type']?.name
                         : r.fields['Deliverable Type'] || null,
      productPurchased: typeof r.fields['Product Purchased'] === 'object'
                         ? r.fields['Product Purchased']?.name
                         : r.fields['Product Purchased'] || null,
      priority:        r.fields['Priority']            || null,
      dueDate:         r.fields['Due Date']            || null,
      driveFolder:     r.fields['Drive Folder']        || null,
      tallyLink:       r.fields['Tally / Brief Link']  || null,
      googleDocLink:   r.fields['Google Doc Link']     || null,
      notes:           r.fields['Internal Notes']      || null,
      amplifyNumber:   r.fields['Amplify Number']      || null,
    }));

    return ok(projects);
  } catch (e) {
    return err(500, e.message);
  }
};
