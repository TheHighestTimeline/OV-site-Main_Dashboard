// ============================================================================
// OVMG: lifecycles and stages  (v2)
//
// WHAT CHANGED FROM v1
// v1 had one long capital ladder and forced everything through it. Bennettsville
// does not have a "discovery call". A homepage edit does not have a "term sheet".
// v2 introduces LIFECYCLES: named stage sets, each fitting a kind of work.
//
// TWO SEPARATE STAGE AXES. Do not conflate them.
//   1. OPPORTUNITY stage  = how is this effort going       (Delivery / Client)
//   2. PARTICIPATION stage = where is this person in the   (Capital)
//                            paperwork with us
// Bennettsville the program is `in_progress` on the Delivery lifecycle while
// Greg Shore inside its bridge loan workstream is `ncnda_signed` on Capital.
// Both are true at once and neither overrides the other.
//
// Single source of truth. The UI, auto-tasks, Triage and the brief all read
// from here. Do not hardcode a stage name anywhere else.
// ============================================================================

export const EVIDENCE = {
  NONE:         'none',
  DOCUMENT:     'document',      // a Documents record with a Signed Date + Signed tag
  DRIVE_ACCESS: 'drive_access',  // confirmed Drive permission grant
  MESSAGE:      'message',
  CALENDAR:     'calendar',
};

export const LIFECYCLE = {
  CAPITAL:  'capital',    // counterparty paperwork: funding, offtake, JV
  DELIVERY: 'delivery',   // internal build work: sites, campuses, websites
  CLIENT:   'client',     // OVM / Amplify client accounts
};

// ── CAPITAL: Tanner's stage list, verbatim ──────────────────────────────────
// Applies to PARTICIPATIONS (a person inside a workstream) and to Kind = Deal
// opportunities. No Won/Lost split: a deal either closes or gets archived.
export const CAPITAL_STAGES = [
  {
    id: 'initial_outreach', label: 'Initial Outreach', order: 1,
    slaDays: 3, requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Make contact or request a warm intro',
    exit: 'First outbound sent',
  },
  {
    id: 'ncnda_sent', label: 'NCNDA Sent', order: 2,
    slaDays: 3, escalateAfterDays: 7, requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Follow up on signature',
    exit: 'Executed copy received and filed',
  },
  {
    id: 'ncnda_signed', label: 'NCNDA Signed', order: 3,
    slaDays: 1, requiresEvidence: EVIDENCE.DOCUMENT,
    nextAction: 'Grant data room access',
    exit: 'Drive access granted',
    // EVIDENCE GATE. Requires a Documents record with a Signed Date. This is
    // what catches "they told me it was signed" when nothing was executed.
  },
  {
    id: 'discovery_call', label: 'Discovery Call', order: 4,
    slaDays: 5, requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Book the call, send prep pack',
    exit: 'Call happens',
  },
  {
    id: 'contract_negotiation', label: 'Contract Negotiation', order: 5,
    slaDays: 5, requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Turn redlines',
    exit: 'Terms agreed',
  },
  {
    id: 'deal_finalization', label: 'Deal Finalization', order: 6,
    slaDays: 7, requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Counsel review and close checklist',
    exit: 'Signed',
  },
  {
    id: 'closed', label: 'Closed', order: 7,
    slaDays: null, requiresEvidence: EVIDENCE.DOCUMENT,
    nextAction: 'Post-close obligations',
    terminal: true,
  },
];

// ── DELIVERY: internal build work ───────────────────────────────────────────
// Bennettsville, site work, the website. Kind = Workstream.
export const DELIVERY_STAGES = [
  { id: 'not_started', label: 'Not Started', order: 1, slaDays: 14, requiresEvidence: EVIDENCE.NONE, nextAction: 'Define scope and owner' },
  { id: 'in_progress', label: 'In Progress', order: 2, slaDays: 30, requiresEvidence: EVIDENCE.NONE, nextAction: 'Advance the current milestone' },
  { id: 'blocked',     label: 'Blocked',     order: 3, slaDays: 3,  requiresEvidence: EVIDENCE.NONE, nextAction: 'Clear the blocker', requiresNote: true },
  { id: 'in_review',   label: 'In Review',   order: 4, slaDays: 5,  requiresEvidence: EVIDENCE.NONE, nextAction: 'Get sign-off' },
  { id: 'done',        label: 'Done',        order: 5, slaDays: null, requiresEvidence: EVIDENCE.NONE, nextAction: null, terminal: true },
];

// ── CLIENT: OVM and Amplify accounts ────────────────────────────────────────
export const CLIENT_STAGES = [
  { id: 'client_identified', label: 'Identified',   order: 1, slaDays: 5,  requiresEvidence: EVIDENCE.NONE,     nextAction: 'Qualify and reach out' },
  { id: 'pitched',           label: 'Pitched',      order: 2, slaDays: 3,  requiresEvidence: EVIDENCE.MESSAGE,  nextAction: 'Follow up on pitch' },
  { id: 'proposal_out',      label: 'Proposal Out', order: 3, slaDays: 4,  requiresEvidence: EVIDENCE.DOCUMENT, nextAction: 'Follow up on proposal' },
  { id: 'negotiating',       label: 'Negotiating',  order: 4, slaDays: 5,  requiresEvidence: EVIDENCE.NONE,     nextAction: 'Resolve open terms' },
  { id: 'signed',            label: 'Signed',       order: 5, slaDays: 2,  requiresEvidence: EVIDENCE.DOCUMENT, nextAction: 'Kick off onboarding' },
  { id: 'onboarding',        label: 'Onboarding',   order: 6, slaDays: 7,  requiresEvidence: EVIDENCE.NONE,     nextAction: 'Complete onboarding checklist' },
  { id: 'active',            label: 'Active',       order: 7, slaDays: 30, requiresEvidence: EVIDENCE.NONE,     nextAction: 'Monthly check-in' },
  { id: 'renewal',           label: 'Renewal',      order: 8, slaDays: 14, requiresEvidence: EVIDENCE.NONE,     nextAction: 'Open renewal conversation' },
];

// ── UNIVERSAL: available on every lifecycle ─────────────────────────────────
// Per Tanner: no "Lost". But something must leave the board, or the pipeline
// fills with dead weight and stops being scannable. `archived` is that exit.
// It is not a judgment, just a way out, and it requires a reason so the record
// stays useful later.
export const UNIVERSAL_STAGES = [
  {
    id: 'stalled', label: 'Stalled', order: 90, slaDays: 14,
    requiresEvidence: EVIDENCE.NONE,
    nextAction: 'Decide: revive or archive',
    autoEnterAfterInactiveDays: 21,
    returnsToPrevious: true,
  },
  {
    id: 'archived', label: 'Archived', order: 99, slaDays: null,
    requiresEvidence: EVIDENCE.NONE,
    nextAction: null, terminal: true, requiresNote: true,
  },
];

export const LIFECYCLES = {
  [LIFECYCLE.CAPITAL]:  { label: 'Capital',  stages: CAPITAL_STAGES  },
  [LIFECYCLE.DELIVERY]: { label: 'Delivery', stages: DELIVERY_STAGES },
  [LIFECYCLE.CLIENT]:   { label: 'Client',   stages: CLIENT_STAGES   },
};

// ── BLOCKED IS A FLAG, NOT A STAGE (capital only) ───────────────────────────
// "They need a power letter" used to be its own stage in v1. That was wrong:
// asking for a document during Contract Negotiation should not reset where the
// deal is. Instead set `Waiting On = Them`/`Us` plus a named-deliverable task.
// The stage holds. Delivery keeps a real `blocked` stage because for build work
// being blocked genuinely IS the state.
export const WAITING_ON = ['Us', 'Them', 'Nobody'];

// ── Lookups ─────────────────────────────────────────────────────────────────
const ALL = [...CAPITAL_STAGES, ...DELIVERY_STAGES, ...CLIENT_STAGES, ...UNIVERSAL_STAGES];
const BY_ID = Object.fromEntries(ALL.map(s => [s.id, s]));

export const ALL_STAGES = ALL;
export const getStage = id => BY_ID[id] || null;

export function stagesFor(lifecycle) {
  const set = LIFECYCLES[lifecycle];
  if (!set) throw new Error(`Unknown lifecycle: ${lifecycle}`);
  return [...set.stages, ...UNIVERSAL_STAGES].sort((a, b) => a.order - b.order);
}

/** Is this stage legal on this lifecycle? Enforced server-side on every write. */
export function isValidStage(lifecycle, stageId) {
  return stagesFor(lifecycle).some(s => s.id === stageId);
}

/** The stage a newly created record starts in. */
export function defaultStage(lifecycle) {
  return LIFECYCLES[lifecycle]?.stages[0]?.id || null;
}

/**
 * Pick a lifecycle when one was not set explicitly.
 * Opportunities.Kind already exists in Airtable (fldVjvHM75QQ7FPyJ) as
 * Deal vs Workstream, so it does the work. Entity breaks the tie for clients.
 */
export function inferLifecycle({ kind, entity } = {}) {
  const clientEntities = ['OVM', 'OneVibeMedia', 'Amplify Artists', 'Amplify'];
  if (clientEntities.includes(entity)) return LIFECYCLE.CLIENT;
  if (kind === 'Workstream')           return LIFECYCLE.DELIVERY;
  if (kind === 'Deal')                 return LIFECYCLE.CAPITAL;
  return LIFECYCLE.DELIVERY;   // safest default: no counterparty assumed
}

export function daysInStage(stageEnteredISO, now = new Date()) {
  if (!stageEnteredISO) return null;
  return Math.floor((now - new Date(stageEnteredISO)) / 86400000);
}

/** 'ok' | 'due' | 'overdue' | 'escalate'. Drives the colour in Triage. */
export function slaStatus(stageId, stageEnteredISO, now = new Date()) {
  const stage = getStage(stageId);
  const days  = daysInStage(stageEnteredISO, now);
  if (!stage || stage.slaDays == null || days == null) return 'ok';
  if (stage.escalateAfterDays && days >= stage.escalateAfterDays) return 'escalate';
  if (days >  stage.slaDays) return 'overdue';
  if (days === stage.slaDays) return 'due';
  return 'ok';
}

/** Task payload written to Master Action Board when a record enters a stage. */
export function buildNextActionTask(stageId, { subjectName, entity, opportunityId, deliverable } = {}) {
  const stage = getStage(stageId);
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  if (!stage.nextAction && !deliverable) return null;   // terminal stages create nothing

  const due = stage.slaDays == null
    ? null
    : new Date(Date.now() + stage.slaDays * 86400000).toISOString().slice(0, 10);

  return {
    actionName: deliverable
      ? `${deliverable} for ${subjectName}`
      : `${stage.nextAction}: ${subjectName}`,
    dueDate:     due,
    entity:      entity || null,
    opportunity: opportunityId || null,
    priority:    stage.escalateAfterDays ? 'High' : 'Medium',
    stageId,
  };
}

// ── Airtable singleSelect option lists ──────────────────────────────────────
// Airtable allows ONE option list per singleSelect field. So `Stage` holds the
// UNION of every lifecycle's stages, and the Lifecycle field controls which
// subset the dashboard offers and `isValidStage()` enforces.
//
// TRADE-OFF, stated plainly: editing a record directly in the Airtable UI will
// show all options, including ones invalid for its lifecycle. Only the
// dashboard enforces the rule. The alternative is a separate stage field per
// lifecycle, which is worse: sparse columns, unusable rollups, no shared views.
export const STAGE_OPTIONS = ALL.map(s => s.label);
export const LIFECYCLE_OPTIONS = Object.values(LIFECYCLES).map(l => l.label);

/** Label to id, for reading values written through the Airtable UI. */
export const LABEL_TO_ID = Object.fromEntries(ALL.map(s => [s.label, s.id]));
export const ID_TO_LABEL = Object.fromEntries(ALL.map(s => [s.id, s.label]));
