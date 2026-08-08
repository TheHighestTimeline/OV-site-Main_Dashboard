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
// GET ?unlinkedTasks=1    → deals to link to tasks that belong to nothing

import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { TB, listRecordsLenient, getRecord } from './_airtable.js';
import { companyKey } from '../../src/lib/companyName.js';

const CONTACTS_TBL  = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;
const OPPS_TBL      = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const COMPANIES_TBL = () => process.env.AIRTABLE_TABLE_COMPANIES     || TB.COMPANIES;
const TASKS_TBL     = () => process.env.AIRTABLE_TABLE_TASKS         || TB.TASKS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

// Words that carry no signal on their own. A task called "Send the capital
// deck" must not match "Capital Partners Round 2" on `capital` — a wrong link
// filed quietly is worse than no link, because nothing tells you to check it.
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'a', 'an', 'of',
  'llc', 'inc', 'ltd', 'lp', 'llp', 'co', 'corp', 'company', 'group', 'holdings',
  'partners', 'partner', 'agency', 'services', 'service', 'consulting',
  'capital', 'fund', 'funding', 'ventures', 'labs', 'global', 'international',
  'solutions', 'systems', 'enterprises', 'network', 'deal', 'raise', 'jv',
  'program', 'project', 'tier', 'round', 'site', 'new', 'family', 'friends',
  'office', 'offices', 'associates', 'management', 'advisors', 'advisory',
  'trust', 'first', 'world', 'house', 'data', 'energy', 'phase', 'update',
  'call', 'email', 'send', 'follow', 'review', 'draft', 'meeting', 'notes',
]);

function tokenSet(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(t => t.length >= 4 && !NOISE.has(t)),
  );
}

const TERMINAL = new Set(['done', 'complete', 'completed', 'canceled', 'cancelled', 'archive', 'archived']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const q = event.queryStringParameters || {};
    if (q.contactId)     return ok(await forContact(q.contactId));
    if (q.opportunityId) return ok(await forOpportunity(q.opportunityId));
    if (q.unlinkedTasks) return ok(await forUnlinkedTasks());
    return err(400, 'contactId, opportunityId or unlinkedTasks is required');
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

// ── Suggestions for tasks that belong to nothing ─────────────────────────────
//
// The Master Action Board fills up with work typed in a hurry, and a task with
// no Opportunity link is invisible from the deal it actually belongs to. These
// propose a home for each one. Same rule as everywhere else here: the reason is
// part of the suggestion, and nothing is applied without a click.

async function forUnlinkedTasks() {
  const [tasks, opps, companies] = await Promise.all([
    listRecordsLenient(TASKS_TBL(), {
      fields: ['Action Name', 'Status', 'Opportunity', 'Related Project', 'Description', 'Entity'],
    }),
    listRecordsLenient(OPPS_TBL(), {
      fields: ['Opportunity Name', 'Companies', 'Projects', 'Entity', 'Lane'],
    }),
    listRecordsLenient(COMPANIES_TBL(), { fields: ['Name'] }).catch(() => []),
  ]);

  // Only live deals are candidates. Proposing that a new task belongs to an
  // archived raise is noise you have to read and reject every time.
  const live = opps.filter(o => String(o.fields?.['Lane'] || '').toLowerCase() !== 'archive');

  const companyNameById = Object.fromEntries(companies.map(c => [c.id, c.fields?.['Name'] || '']));

  const oppIndex = live.map(o => {
    const name = o.fields?.['Opportunity Name'] || '';
    const coNames = arr(o.fields?.['Companies']).map(id => companyNameById[id]).filter(Boolean);
    return {
      id: o.id,
      name,
      entity: o.fields?.['Entity'] || '',
      projectIds: arr(o.fields?.['Projects']),
      nameTokens: tokenSet(name),
      companyTokens: new Set(coNames.flatMap(n => [...tokenSet(n)])),
      companyNames: coNames,
    };
  });

  const items = [];
  for (const t of tasks) {
    if (arr(t.fields?.['Opportunity']).length) continue;                 // already has a home
    if (TERMINAL.has(String(t.fields?.['Status'] || '').toLowerCase())) continue;

    const taskName    = t.fields?.['Action Name'] || '';
    const taskTokens  = tokenSet(`${taskName} ${t.fields?.['Description'] || ''}`);
    const taskProjects = arr(t.fields?.['Related Project']);

    let best = null;
    for (const o of oppIndex) {
      // 1. Same project. The strongest signal available without reading the
      //    text at all: two records already pointing at the same third record.
      const sharedProject = taskProjects.filter(p => o.projectIds.includes(p));
      if (sharedProject.length) {
        best = pickBetter(best, {
          targetId: o.id, targetName: o.name,
          confidence: 'high', confidenceScore: 80,
          reason: 'This task and that deal are on the same project.',
        });
        continue;
      }

      // 2. A company on the deal is named in the task.
      const coHit = [...o.companyTokens].filter(tk => taskTokens.has(tk));
      if (coHit.length) {
        best = pickBetter(best, {
          targetId: o.id, targetName: o.name,
          confidence: 'medium', confidenceScore: 60,
          reason: `The task mentions ${o.companyNames[0] || 'a company'}, which is on that deal.`,
        });
        continue;
      }

      // 3. Distinctive words shared with the deal's own name. Two or more, or
      //    one long enough to be a proper noun — one short common word is how
      //    you get "Send deck" filed under the first deal with "deck" in it.
      const nameHit = [...o.nameTokens].filter(tk => taskTokens.has(tk));
      if (nameHit.length >= 2 || nameHit.some(tk => tk.length >= 6)) {
        best = pickBetter(best, {
          targetId: o.id, targetName: o.name,
          confidence: nameHit.length >= 2 ? 'medium' : 'low',
          confidenceScore: nameHit.length >= 2 ? 55 : 35,
          reason: `Task name shares "${nameHit.join('", "')}" with that deal.`,
        });
      }
    }

    if (!best) continue;
    items.push({
      id: t.id,
      name: taskName || '(untitled task)',
      status: t.fields?.['Status'] || '',
      ...best,
    });
  }

  items.sort((a, b) => b.confidenceScore - a.confidenceScore || a.name.localeCompare(b.name));
  return { items: items.slice(0, 40), applied: false, generatedAt: new Date().toISOString() };
}

/** Keep the strongest candidate; ties go to the one already held so the scan is stable. */
function pickBetter(current, next) {
  if (!current) return next;
  return next.confidenceScore > current.confidenceScore ? next : current;
}
