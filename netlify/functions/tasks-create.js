import { airtableCreate, toAirtableFields, TASKS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const body = JSON.parse(event.body || '{}');
    const { task, status, priority, owner, dueDate, entity, type, taskType,
            contactIds, relatedProjectIds, opportunityIds, clientIds } = body;
    if (!task) return err(400, 'task is required');

    // Only scalar columns are written here. 'Assigned To' and 'Related Project'
    // are LINKED fields in the live base — they accept arrays of record IDs, not
    // free-text names, so we only set 'Related Project' when caller passes IDs.
    const obj = {
      task,
      status: status || 'Not Started',
    };
    if (priority) obj.priority = priority;
    if (dueDate)  obj.dueDate  = dueDate;
    if (entity)   obj.entity   = entity;
    if (type)     obj.type     = type;
    if (taskType) obj.taskType = taskType;   // 'Task' | 'Reminder'

    const fields = toAirtableFields(obj, TASKS_MAP);
    // Linked-record fields take arrays of Airtable record IDs.
    if (Array.isArray(contactIds)        && contactIds.length)        fields['Contact']         = contactIds;
    if (Array.isArray(relatedProjectIds) && relatedProjectIds.length) fields['Related Project'] = relatedProjectIds;
    if (Array.isArray(opportunityIds)    && opportunityIds.length)    fields['Opportunity']     = opportunityIds;
    if (Array.isArray(clientIds)         && clientIds.length)         fields['Client']          = clientIds;

    const record = await airtableCreate(TABLE(), fields);

    return ok({ id: record.id, task, status, priority, owner: owner || '', dueDate, taskType: taskType || 'Task', contactIds: contactIds || [] });
  } catch (e) {
    return err(500, e.message);
  }
};
