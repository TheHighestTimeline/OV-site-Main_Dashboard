// Propose participations from the links the CRM already has.
//
// WHY THIS EXISTS. The Threads tab is built on participations, and a base with
// none is an empty tab with 114 contacts sitting next to 40 opportunities that
// have never been connected to each other. Hand-linking them is hours of work
// nobody does, so the tab stays empty and the whole thing looks broken.
//
// WHAT IT WILL NOT DO. It will not join contacts to opportunities through the
// `Companies` link on either table. That field on an Opportunity records which
// OneVibe entity OWNS the deal, not who we are dealing with — almost every
// opportunity points at OneVibeMediaGroup. Joining on it produces "Tanner South
// is a counterparty to OVMG's own $270M raise" roughly a hundred times over.
// The same trap sits in Master Action Board's Contact + Opportunity pairs: all
// fourteen of them are internal staff against OVMG's own deals. Both were
// checked and both were rejected as sources.
//
// WHAT IT DOES. It matches the COUNTERPARTY company on a contact against the
// name of an opportunity — BrightSunSolr the company against "BrightSunSolr JV
// / Blaze Merger" the deal. That is an inference, not a fact, which is exactly
// what the evidence layer says must only ever propose. So GET returns proposals
// and writes nothing; POST writes only the ones a human ticked.
//
// GET  → { proposals: [{ workstreamId, workstreamName, goal, entity, people: [] }], skipped }
// POST { groups: [{ workstreamId, goal?, contactIds: [] }] } → creates them

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import {
  TB, listRecords, listRecordsLenient, airtableUpdate,
  fromAirtableRecord, CONTACTS_MAP, OPPORTUNITIES_MAP,
} from './_airtable.js';
import {
  createParticipation, listParticipations, participationName,
  participationsConfigured, NOT_CONFIGURED_MSG,
} from './_participations.js';
import { ID_TO_LABEL, defaultStage } from './_stages.js';

const OPPS_TBL     = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

// Words that carry no identity. "Genesis Group" must still match "Genesis 'Box'
// Program" on `genesis`, so the generic half of a company name is dropped rather
// than the whole name being required.
const NOISE = new Set([
  'the', 'and', 'of', 'a', 'an', 'x', 'llc', 'inc', 'ltd', 'lp', 'llp', 'co',
  'corp', 'company', 'group', 'holdings', 'partners', 'partner', 'agency',
  'services', 'service', 'consulting', 'capital', 'fund', 'ventures', 'labs',
  'global', 'international', 'solutions', 'systems', 'enterprises', 'network',
  'deal', 'raise', 'jv', 'program', 'project', 'tier', 'round', 'site', 'new',
  // Ordinary English that happens to appear in company names. "Miho Family
  // Offices" matching "Friends & Family Tier" on `family` is the failure mode
  // these prevent: a plausible-looking link between two unrelated things.
  'family', 'friends', 'office', 'offices', 'associates', 'management',
  'advisors', 'advisory', 'trust', 'first', 'world', 'house', 'data', 'energy',
]);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s) {
  return norm(s).split(' ').filter(Boolean);
}

/**
 * Does this company name identify this opportunity?
 *
 * Two ways to qualify, both deliberately strict — a false proposal costs more
 * than a missed one, because a wrong participation puts a real person at a real
 * stage on a deal they are not part of.
 */
function matchReason(companyName, opportunityName) {
  const c = norm(companyName);
  const o = norm(opportunityName);
  if (!c || !o) return null;

  // 1. The whole company name appears in the deal name. Catches "808 Amp" in
  //    "808 Amp JV" and "Pro Performance" in "Pro Performance - Website",
  //    where every token on its own is too short or too generic to trust.
  if (o.includes(c)) return `"${companyName}" appears in the name`;

  // 2. A distinctive token appears. Four characters or more and not a word that
  //    every second company uses, or "solutions" alone would link half the base.
  const oTokens = new Set(tokens(o));
  const hits = tokens(c).filter(t => t.length >= 4 && !NOISE.has(t) && oTokens.has(t));
  if (hits.length) return `matched on "${hits.join('", "')}"`;

  return null;
}

/** Internal OneVibe entities are never counterparties to their own deals. */
function isInternalCompany(rec) {
  if (rec.type === 'Internal') return true;
  if (rec.entityCode) return true;
  // Two records ("OneVibe Data LLC", "OVMG Bennettsville LLC") predate the Type
  // field and carry neither flag. The name is unambiguous.
  return /^(one\s*vibe|ovmg)/i.test(String(rec.name || '').trim());
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  if (!participationsConfigured()) return err(400, NOT_CONFIGURED_MSG);

  try {
    if (event.httpMethod === 'POST') return await applyGroups(event);
    if (event.httpMethod !== 'GET')  return err(405, 'GET or POST only');

    const [contactRecs, oppRecs, companyRecs, existing] = await Promise.all([
      listRecordsLenient(CONTACTS_TBL(), { fields: ['Full Name', 'Email', 'Companies', 'Owner', 'Status'] }),
      listRecords(OPPS_TBL()),
      listRecordsLenient(TB.COMPANIES, { fields: ['Name', 'Type', 'Entity Code'] }),
      listParticipations(),
    ]);

    const companyById = Object.fromEntries(companyRecs.map(r => [r.id, {
      id:         r.id,
      name:       r.fields?.['Name'] || '',
      type:       r.fields?.['Type'] || '',
      entityCode: r.fields?.['Entity Code'] || '',
    }]));

    // Already-paired contacts must never be proposed again; the create would be
    // refused as a duplicate and the row is noise on the review screen.
    const alreadyPaired = new Set(
      existing.map(p => `${p.contactId}::${p.workstreamId}`),
    );

    const opps = oppRecs.map(r => {
      const o = fromAirtableRecord(r, OPPORTUNITIES_MAP);
      return {
        id:     o.id,
        name:   o.name || '',
        entity: o.entity || '',
        goal:   String(r.fields?.['Goal'] || '').trim(),
        parentIds: arr(r.fields?.['Parent Opportunity']),
      };
    }).filter(o => o.name);

    // Same rule the board uses: a childless top-level opportunity is the work
    // itself and can hold participations. A parent of others is an umbrella.
    const hasChildren = new Set(opps.flatMap(o => o.parentIds));
    const targets = opps.filter(o => !hasChildren.has(o.id));

    const skipped = { internalCompany: 0, noCompany: 0, noMatch: 0, alreadyLinked: 0 };
    const byWorkstream = new Map();

    for (const rec of contactRecs) {
      const c = fromAirtableRecord(rec, CONTACTS_MAP);
      const companyIds = arr(rec.fields?.['Companies']);
      if (!companyIds.length) { skipped.noCompany++; continue; }

      const companies = companyIds.map(id => companyById[id]).filter(Boolean);
      const external  = companies.filter(co => !isInternalCompany(co));
      if (!external.length) { skipped.internalCompany++; continue; }

      let matched = false;
      for (const co of external) {
        for (const ws of targets) {
          const reason = matchReason(co.name, ws.name);
          if (!reason) continue;
          if (alreadyPaired.has(`${c.id}::${ws.id}`)) { skipped.alreadyLinked++; matched = true; continue; }

          matched = true;
          if (!byWorkstream.has(ws.id)) {
            byWorkstream.set(ws.id, {
              workstreamId:   ws.id,
              workstreamName: ws.name,
              entity:         ws.entity,
              goal:           ws.goal,
              needsGoal:      !ws.goal,
              people:         [],
            });
          }
          const group = byWorkstream.get(ws.id);
          if (group.people.some(p => p.contactId === c.id)) continue;
          group.people.push({
            contactId: c.id,
            name:      c.name || '',
            email:     c.email || '',
            company:   co.name,
            owner:     c.owner || '',
            reason,
          });
        }
      }
      if (!matched) skipped.noMatch++;
    }

    const proposals = [...byWorkstream.values()]
      .map(g => ({ ...g, people: g.people.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.people.length - a.people.length || a.workstreamName.localeCompare(b.workstreamName));

    return ok({
      proposals,
      proposedCount: proposals.reduce((n, g) => n + g.people.length, 0),
      skipped,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[coo-participation-suggest]', e?.message || String(e));
    return err(500, e?.message || 'Could not build suggestions');
  }
};

/** Write only what a human ticked. */
async function applyGroups(event) {
  const user = await getUser(event).catch(() => null);
  const { groups = [] } = JSON.parse(event.body || '{}');
  if (!Array.isArray(groups) || !groups.length) return err(400, 'groups is required');

  const [contactRecs, oppRecs, existing] = await Promise.all([
    listRecordsLenient(CONTACTS_TBL(), { fields: ['Full Name', 'Owner'] }),
    listRecords(OPPS_TBL()),
    listParticipations(),
  ]);

  const contactById = Object.fromEntries(contactRecs.map(r => [r.id, {
    name:  r.fields?.['Full Name'] || '',
    owner: r.fields?.['Owner'] || '',
  }]));
  const oppById = Object.fromEntries(oppRecs.map(r => [r.id, {
    name:   r.fields?.['Opportunity Name'] || '',
    entity: r.fields?.['Entity'] || null,
    goal:   String(r.fields?.['Goal'] || '').trim(),
  }]));
  const alreadyPaired = new Set(existing.map(p => `${p.contactId}::${p.workstreamId}`));

  const startStageId = defaultStage('capital');
  const created = [];
  const errors  = [];

  for (const g of groups) {
    const ws = oppById[g.workstreamId];
    if (!ws) { errors.push(`Unknown workstream ${g.workstreamId}`); continue; }

    // Same sprawl rule as the single-add path, satisfiable in the same request.
    let goal = ws.goal;
    if (!goal && String(g.goal || '').trim()) {
      goal = String(g.goal).trim();
      await airtableUpdate(OPPS_TBL(), g.workstreamId, { Goal: goal });
    }
    if (!goal) {
      errors.push(`"${ws.name}" needs a Goal before anyone can be added to it.`);
      continue;
    }

    for (const contactId of arr(g.contactIds)) {
      if (alreadyPaired.has(`${contactId}::${g.workstreamId}`)) continue;
      const contact = contactById[contactId];
      if (!contact) { errors.push(`Unknown contact ${contactId}`); continue; }

      try {
        const rec = await createParticipation({
          name:          participationName(contact.name, ws.name),
          contactIds:    [contactId],
          workstreamIds: [g.workstreamId],
          stage:         ID_TO_LABEL[startStageId] || startStageId,
          stageEntered:  new Date().toISOString(),
          owner:         contact.owner || '',
          waitingOn:     'Us',
          // null, never '': Airtable reads '' on a singleSelect as a request to
          // create an option named "" and fails the whole write.
          entity:        ws.entity || null,
          status:        'Active',
        });
        alreadyPaired.add(`${contactId}::${g.workstreamId}`);
        created.push({ id: rec.id, contactId, workstreamId: g.workstreamId, name: contact.name });
      } catch (e) {
        errors.push(`${contact.name} → ${ws.name}: ${e.message}`);
      }
    }
  }

  console.log(`[coo-participation-suggest] applied ${created.length} by ${user?.email || 'unknown'}`);

  return ok({ created, createdCount: created.length, errors });
}
