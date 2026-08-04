# Threads — operating SOP

How to actually run the tab. `THREADS_TAB.md` is the build handoff; this is the
day-to-day.

---

## The one rule everything hangs off

**A participation is one person inside one workstream, and it is the only record
that carries a stage.**

```
Entity (OVMG)
  └── Workstream ("Bennettsville — $20M Note")        ← must have a Goal
        └── PARTICIPATION (Greg + that workstream)     ← carries the stage
              ├── Tasks      Master Action Board → Participation
              ├── Documents  gate the NCNDA Signed and Closed stages
              └── Timeline   messages, notes, signals
```

Stage is never on the contact. Greg can be NCNDA Signed on the bridge loan and
Initial Outreach on a future raise at the same moment and both are true — a
single field on his contact record can only hold one of them.

If a person is not in a workstream, they do not appear in Triage, Pipeline,
Accountability or the brief. That is not a bug; they have no state to report.

---

## One-time setup

1. **Threads → ⌁ Suggest links.** 13 pre-matched people across 9 workstreams.
   Give each group a one-line goal, untick anything wrong, apply.
2. **Run `migrations/0002_coo_threads_schema.sql`** in the Supabase SQL editor.
   Until this runs, the timeline, notes, briefs and both Queues error out. See
   "What works without it" below.
3. **Set `COO_CAPITAL_ENTITIES`** in Netlify to the real entity names. The
   defaults are guesses, and the `ops` role restriction is not meaningful until
   they are right.

---

## Daily

### Morning — Overview

Look at the **Today card**. Five tasks, hard capped. Tagging a sixth prompts you
to swap one out rather than silently accepting it. The cap is the entire
mechanism; do not work around it by setting Focus directly in Airtable.

A card tagged three or more days ago is marked stale. Repeated carryover means
the task is mis-sized or you are avoiding it. The date deliberately does not
reset on carryover, because hiding that defeats the point.

### Through the day — Capture

The **◉ Capture** button takes voice or text. It produces a *proposal*, never a
write. You get an editable review screen; only what you approve reaches Airtable.

A task missing entity, owner, or due date is written as `Submitted` with no Focus.
That is the Inbox lane, and it is what you empty in the evening. A task nobody
owns with no date is not a commitment, and pretending otherwise is what made the
old board untrustworthy.

### Evening — Triage

Seven buckets, in the order you should work them:

| Bucket | Rule |
|---|---|
| **Committed today** | Task due today or already overdue |
| **They're waiting on me** | Last message was inbound, nothing sent since — or `Waiting On = Us` |
| **Stage overdue** | Past the stage's SLA (see ladder below) |
| **Evidence missing** | Sitting at a stage that requires a signed document, with none on file |
| **I'm waiting on them** | Sent 3+ days ago, no reply |
| **Delegated, unconfirmed** | Assigned out, nothing moved in 3+ days |
| **Gone quiet** | No activity at all for 10+ days |

Empty the Inbox lane (`Submitted` tasks) at the same time: give each one an
entity, an owner and a date, or kill it.

---

## Weekly — Friday

**Accountability** view, two halves:

- **Delegation.** Per assignee: open, overdue, completed this week, and — the one
  that matters — *how many of their open tasks have no Context*. A delegated task
  with no context sends the assignee back to ask you three questions. That is the
  failure this tab exists to prevent.
- **Referral tree.** Introductions grouped under whoever made them, with NCNDA
  status per person. An intermediary whose introductions have all gone quiet is
  the signal — the referrer stopped, not just the referrals.

**Pipeline** view for the stage-by-stage picture across everything.

---

## The stage ladder (Capital)

| Stage | SLA | Gate |
|---|---|---|
| Initial Outreach | 3d | — |
| NCNDA Sent | 3d (escalates at 7) | — |
| **NCNDA Signed** | 1d | **Requires a Document with a Signed Date** |
| Discovery Call | 5d | — |
| Contract Negotiation | 5d | — |
| Deal Finalization | 7d | — |
| **Closed** | — | **Requires a Document with a Signed Date** |
| Stalled | 14d | — |

Delivery and Client ladders exist too, inferred from the workstream's `Kind` and
`Entity`. Override with the `Lifecycle` field only when the inference is wrong.

**Advance a stage only through the tab, never by editing the Stage field in
Airtable.** The tab is where the evidence gate lives, where the stage-change
history is written, and where the next-action task is created. A direct field
edit skips all three.

Refusing a gated move returns a clear message, not a silent failure: *"NCNDA
Signed requires a Documents record with a Signed Date."* File the document, then
move the stage.

### Blocked ≠ moved backwards

If you are waiting on a power letter mid-negotiation, set **Blocking Item** and
**Waiting On**. Do not drop the stage. Asking for a document during Contract
Negotiation must not move the deal backwards, or the pipeline lies about where
things actually stand.

---

## Delegating

From a participation, **Delegate**. It writes the task to Master Action Board with
`Context` populated from the current state of the relationship: stage, days in
stage, waiting-on, open asks, last commitment, documents on file.

That is the whole point. "Follow up with Greg" makes the assignee come back and
ask three questions before they can start. The context field means they can act
without asking.

Set **Resolves On** if a detected signal should close the task automatically.
Only `access_granted` closes on its own; everything else proposes into the
Resolved? queue and waits for a human.

---

## Adding people

- **From Opportunities** — pick a workstream, **＋ Add participant**, choose the
  person.
- **From People** — find anyone in your CRM, **＋ Add to workstream**.

Either way, if the workstream has no Goal you will be asked for one. That is the
sprawl rule: a workstream exists only if it has its own goal and its own
counterparties. Anything else is a task, and a board full of one-person
"workstreams" stops being scannable.

---

## What works without the Supabase migration

Everything below reads Airtable and works today:

- Opportunities and People boards, stages, SLA colours
- Triage — 6 of 7 buckets. *"I'm waiting on them"* needs message history and stays
  empty; *"Gone quiet"* falls back to stage-entered date instead of last contact
- Delegation, Accountability, Pipeline
- Voice capture and the Today card

These need `migrations/0002_coo_threads_schema.sql`:

- Timeline and notes on a participation
- The brief
- Signals queue and Identities queue
- Gmail ingest

---

## Rules that are enforced, not suggested

- Today is capped at **five**. A sixth requires a swap.
- **NCNDA Signed** and **Closed** require a signed document on file.
- A workstream with no **Goal** takes no participants.
- Voice **never** writes without a review screen.
- Inferred signals **propose**; only deterministic ones apply. Suggested links,
  detected signals and identity merges all wait for a tick.
- A thread routes to exactly **one** participation. Never fan one conversation
  across workstreams — that is how the same obligation gets "resolved" somewhere
  it was never owed.
