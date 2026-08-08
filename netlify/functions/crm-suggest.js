// What is probably connected to this record but is not linked yet.
//
// The friction this removes: you add Adam to the Bennettsville epic, then open
// Adam's contact and his Deals section is empty, because the link was written on
// the opportunity and nothing looks the other way. Everything here is already in
// the base — it just was not being joined.
//
// EVERY SUGGESTION CARRIES ITS REASON AND A CONFIDENCE, and nothing is applied
// automatically. Same rule as the NCNDA detector and the participation matcher:
// a wrong link filed silently is worse than no link, because you will not know
// to go looking for it.
//
// GET ?contactId=rec…     → deals to link to this person
// GET ?opportunityId=rec… → people to link to this deal

import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { TB, listRecordsLenient, getRecord } from './_airtable.js';
import { companyKey } from '../../src/lib/companyName.js';

const CONTACTS_TBL  = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;
const OPPS_TBL      = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const COMPANIES_TBL = () => process.env.AIRTABLE_TABLE_COMPANIES     || TB.COMPANIES;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const q = event.queryStringParameters || {};
    if (q.contactId)     return ok(await forContact(q.contactId));
    if (q.opportunityId) return ok(await forOpportunity(q.opportunityId));
    return err(400, 'contactId or opportunityId is required');
  } catch (e) {
    console.error('[crm-suggest]', e?.message || String(e));
    return err(500, e?.message || 'Could not build suggestions');
  }
};

// ── Suggestions for a person ─────────────────────────────────────────────────

async function forContact(contactId) {
  const rec = await getRecord(CONTACTS_TBL(), contactId);
  if (!rec) throw new Error('Contact not found');

  const myCompanyIds = arr(rec.fields?.['Companies']);
  const myOppIds     = new Set(arr(rec.fields?.['Opportunities']));

  const [opps, companies] = await Promise.all([
    listRecordsLenient(OPPS_TBL(), {
      fields: ['Opportunity Name', 'Associated Contact', 'Companies', 'Entity', 'Lane'],
    }),
    listRecordsLenient(COMPANIES_TBL(), { fields: ['Name'] }).catch(() => []),
  ]);

  const companyNameById = Object.fromEntries(companies.map(c => [c.id, c.fields?.['Name'] || '']));
  const myCompanyKeys = new Set(myCompanyIds.map(id => companyKey(companyNameById[id])).filter(Boolean));

  const deals = [];
  for (const o of opps) {
    if (myOppIds.has(o.id)) continue;                      // already on the contact
    if (String(o.fields?.['Lane'] || '').toLowerCase() === 'archive') continue;

    const name   = o.fields?.['Opportunity Name'] || '';
    const linked = arr(o.fields?.['Associated Contact']);
    const oppCos = arr(o.fields?.['Companies']);

    // 1. The deal already names this person. This is the case that started it:
    //    the link exists, written from the opportunity side, and the contact's
    //    Deals section simply was not reading it.
    if (linked.includes(contactId)) {
      deals.push({
        id: o.id, name, entity: o.fields?.['Entity'] || '',
        confidence: 'certain', confidenceScore: 100,
        reason: 'This deal already lists them as an associated contact.',
      });
      continue;
    }

    // 2. Same company. Strong, not proof — a company has people who are not on
    //    any given deal, so it proposes rather than links.
    const shared = oppCos.filter(cid => myCompanyIds.includes(cid));
    if (shared.length) {
      deals.push({
        id: o.id, name, entity: o.fields?.['Entity'] || '',
        confidence: 'high', confidenceScore: 75,
        reason: `They work at ${companyNameById[shared[0]] || 'the same company'}, which is on this deal.`,
      });
      continue;
    }

    // 3. Their company name appears in the deal's name. Weakest, and held to the
    //    same bar as the participation matcher: a distinctive token, never a guess.
    const nameKey = companyKey(name);
    if (nameKey && [...myCompanyKeys].some(k => k.length >= 4 && nameKey.includes(k))) {
      deals.push({
        id: o.id, name, entity: o.fields?.['Entity'] || '',
        confidence: 'medium', confidenceScore: 50,
        reason: 'Their company name appears in this deal name.',
      });
    }
  }

  deals.sort((a, b) => b.confidenceScore - a.confidenceScore || a.name.localeCompare(b.name));
  return { contactId, deals: deals.slice(0, 12), applied: false, generatedAt: new Date().toISOString() };
}

// ── Suggestions for a deal ───────────────────────────────────────────────────

async function forOpportunity(opportunityId) {
  const rec = await getRecord(OPPS_TBL(), opportunityId);
  if (!rec) throw new Error('Opportunity not found');

  const linked  = new Set(arr(rec.fields?.['Associated Contact']));
  const oppCos  = arr(rec.fields?.['Companies']);
  const oppName = rec.fields?.['Opportunity Name'] || '';

  const [contacts, companies] = await Promise.all([
    listRecordsLenient(CONTACTS_TBL(), { fields: ['Full Name', 'Companies', 'Email'] }),
    listRecordsLenient(COMPANIES_TBL(), { fields: ['Name'] }).catch(() => []),
  ]);
  const companyNameById = Object.fromEntries(companies.map(c => [c.id, c.fields?.['Name'] || '']));
  const nameKey = companyKey(oppName);

  const people = [];
  for (const c of contacts) {
    if (linked.has(c.id)) continue;
    const cos  = arr(c.fields?.['Companies']);
    const name = c.fields?.['Full Name'] || '';

    const shared = cos.filter(id => oppCos.includes(id));
    if (shared.length) {
      people.push({
        id: c.id, name, email: c.fields?.['Email'] || '',
        confidence: 'high', confidenceScore: 75,
        reason: `They work at ${companyNameById[shared[0]] || 'a company on this deal'}.`,
      });
      continue;
    }

    if (nameKey) {
      const theirKeys = cos.map(id => companyKey(companyNameById[id])).filter(k => k && k.length >= 4);
      if (theirKeys.some(k => nameKey.includes(k))) {
        people.push({
          id: c.id, name, email: c.fields?.['Email'] || '',
          confidence: 'medium', confidenceScore: 50,
          reason: 'Their company name appears in this deal name.',
        });
      }
    }
  }

  people.sort((a, b) => b.confidenceScore - a.confidenceScore || a.name.localeCompare(b.name));
  return { opportunityId, people: people.slice(0, 12), applied: false, generatedAt: new Date().toISOString() };
}
