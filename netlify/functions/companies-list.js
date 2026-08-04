import { airtableList } from './_airtable.js';
import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { COMPANIES_TBL } from './_companies.js';

const CONTACTS_TBL   = () => process.env.AIRTABLE_TABLE_CONTACTS      || 'CRM Contacts';
const OPPS_TBL       = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || 'Opportunities';
const ACTIVITIES_TBL = () => process.env.AIRTABLE_TABLE_ACTIVITIES    || 'Activities';

const selVal = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.name : v) || null;

// Reads fields by name rather than going through toAirtableFields/
// fromAirtableRecord — there was never a COMPANIES_MAP in _airtable.js, and the
// mapping now lives in _companies.js alongside everything else company-shaped.
//
// `?rollups=0` skips the three joined reads below and returns the bare list.
// Every caller that only needs a picker (the opportunity popup, the contact
// form) passes it, because a dropdown does not need to know how many deals a
// company has and paying for three extra table reads to fill one is waste.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const wantRollups = (event.queryStringParameters || {}).rollups !== '0';

    const records = await airtableList(COMPANIES_TBL(), {
      sort: [{ field: 'Name', direction: 'asc' }],
    });

    // Counts come from the child tables, not from the company's own link fields.
    // The link fields are only populated when somebody filled them in from the
    // company side; an opportunity that links to a company does not necessarily
    // appear in that company's `Opportunities` field, and a count that reads low
    // because of a one-sided link is worse than no count at all.
    const safe = (p) => p.then(x => x).catch(() => []);
    const [contacts, opps, activities] = wantRollups
      ? await Promise.all([
          safe(airtableList(CONTACTS_TBL())),
          safe(airtableList(OPPS_TBL())),
          safe(airtableList(ACTIVITIES_TBL(), { sort: [{ field: 'Date', direction: 'desc' }] })),
        ])
      : [[], [], []];

    const bump = (map, ids) => {
      for (const id of ids || []) map.set(id, (map.get(id) || 0) + 1);
    };
    const peopleCount = new Map();
    const dealCount   = new Map();
    const lastTouch   = new Map();

    for (const r of contacts) bump(peopleCount, r.fields?.['Companies']);
    for (const r of opps)     bump(dealCount,   r.fields?.['Companies']);
    // Activities arrive newest-first, so the first date seen per company wins.
    for (const r of activities) {
      const d = r.fields?.['Date'];
      if (!d) continue;
      for (const id of r.fields?.['Company'] || []) if (!lastTouch.has(id)) lastTouch.set(id, d);
    }

    const companies = records.map(r => {
      const f = r.fields || {};
      return {
        id:                r.id,
        name:              f['Name'] || '',
        entityCode:        selVal(f['Entity Code']),
        shortCode:         f['Short Code'] || '',
        type:              selVal(f['Type']),
        status:            selVal(f['Status']),
        health:            f['Health'] || '',
        stage:             f['Stage'] || '',
        subjectDescriptor: f['Subject Descriptor'] || '',
        website:           f['Website'] || '',
        followUpDate:      f['Follow Up Date'] || '',
        summary:           f['Summary'] || '',
        callsNotes:        f['Calls/Notes'] || '',
        waitingOn:         f['Waiting On'] || '',
        parentCompanyIds:  f['Parent Company'] || [],
        contactIds:        f['CRM Contacts'] || [],
        opportunityIds:    f['Opportunities'] || [],
        peopleCount:       peopleCount.get(r.id) || 0,
        dealCount:         dealCount.get(r.id) || 0,
        lastActivityDate:  lastTouch.get(r.id) || null,
      };
    });

    return ok(companies);
  } catch (e) {
    return err(500, e.message);
  }
};
