import { airtableList, fromAirtableRecord, CONTACTS_MAP } from './_airtable.js';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const TABLE = () => process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const records = await airtableList(TABLE(), {
      sort: [{ field: 'Full Name', direction: 'asc' }],
    });

    // Resolve linked Companies record IDs -> display names for the frontend.
    const COMPANIES_TBL = process.env.AIRTABLE_TABLE_COMPANIES || 'Companies';
    let companyNames = {};
    let companyIdByName = {};   // lowercased name -> record id (for free-text resolution)
    try {
      const companyRecords = await airtableList(COMPANIES_TBL);
      companyNames = Object.fromEntries(companyRecords.map(r => [r.id, r.fields?.['Name'] || '']));
      companyIdByName = Object.fromEntries(
        companyRecords
          .filter(r => r.fields?.['Name'])
          .map(r => [String(r.fields['Name']).toLowerCase().trim(), r.id])
      );
    } catch { /* Companies table not reachable — companyNames stays empty, UI falls back gracefully */ }

    // Self name map for resolving the "Referred By" referral link.
    const contactNameById = Object.fromEntries(records.map(r => [r.id, r.fields?.['Full Name'] || '']));

    const contacts = records.map(r => {
      const c = fromAirtableRecord(r, CONTACTS_MAP);

      // Referral graph: "Referred By" links to another CRM contact (the parent).
      const refIds = r.fields['Referred By'] || [];
      c.referrerId = refIds[0] || null;
      c.referrerName = c.referrerId ? (contactNameById[c.referrerId] || '') : '';

      // Phone can come back as a number (Number field type) or array (Lookup/
      // linked-record field) instead of a string — normalise to string.
      if (typeof c.phone === 'number') c.phone = String(c.phone);
      if (Array.isArray(c.phone))      c.phone = c.phone.join(', ');

      // Company: try several possible field names (Notion exports vary).
      c.company = r.fields['Company']
               || r.fields['Organization']
               || r.fields['Company Name']
               || null;

      c.website = r.fields['Website'] || r.fields['URL'] || null;

      // New multi-company linked field (record IDs). Names get resolved
      // below via a Companies lookup, same pattern tasks-list.js uses for
      // owner/project names.
      c.companyIds = r.fields['Companies'] || [];
      c.companyNames = c.companyIds.map(id => companyNames[id]).filter(Boolean);
      // Index-aligned {id,name} pairs (companyNames above is filtered, so it
      // can't be safely zipped with companyIds). Used to open the CompanySnapshot
      // modal from clickable company chips (contact profile + Contacts list).
      c.companies = c.companyIds.map(id => ({ id, name: companyNames[id] || '' }));
      // Fallback: not linked via the Companies field, but the free-text Company
      // name matches a Companies record → resolve it so the chip is still
      // clickable (opens the CompanySnapshot). Exact case-insensitive match.
      if (c.companies.length === 0 && c.company) {
        const match = companyIdByName[String(c.company).toLowerCase().trim()];
        if (match) c.companies = [{ id: match, name: companyNames[match] || c.company }];
      }

      // Bridge to the snake_case key the frontend already reads/writes
      // (see Contacts.jsx handleLogContact). daysSinceContact drives the
      // amber/red staleness badge — null/undefined means never contacted.
      c.last_contacted_at = c.lastContactedAt || null;
      c.daysSinceContact = c.last_contacted_at
        ? Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000)
        : null;

      return c;
    });

    return ok(contacts);
  } catch (e) {
    return err(500, e.message);
  }
};
