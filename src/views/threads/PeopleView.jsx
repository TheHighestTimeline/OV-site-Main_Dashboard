// View 2: People.
//
// ONE CARD PER PERSON, not per participation. Someone in three workstreams is
// one card with three workstream chips. This is the "one place to see everything
// Greg said" view, and splitting him into three rows would defeat that.
//
// The Opportunities view groups the same data by participation because each row
// there needs a separate action. Both groupings are correct for their question.
// Do not unify them.
//
// EVERY CRM CONTACT APPEARS HERE, not only the ones with a participation. This
// view was originally derived purely from participations, which meant a base
// with none rendered "No people yet" over a CRM holding 114 of them — the tab
// looked broken and there was no path from a person to a tracked relationship.
// Untracked people now render as a roster below the tracked ones, each one click
// from being added to a workstream. Stage still lives only on the participation;
// an untracked row deliberately shows no stage, because it does not have one.

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { Modal } from '../../components/UI.jsx';
import {
  StageBadge, EntityChip, WorkstreamChip, UrgencyDot, urgencyOf, worstUrgency,
  Panel, Empty, fmtRel, relDays, sortKeyByLastName,
} from './shared.jsx';
import DetailPane from './DetailPane.jsx';
import AddParticipant from './AddParticipant.jsx';

const SORTS = [
  { id: 'due',  label: 'Due' },
  { id: 'last', label: 'Last interaction' },
  { id: 'az',   label: 'A to Z' },
];

const SCOPES = [
  { id: 'all',       label: 'Everyone' },
  { id: 'tracked',   label: 'In a workstream' },
  { id: 'untracked', label: 'Not tracked' },
];

const addBtn = {
  padding: '5px 11px', borderRadius: 999, border: `1px solid ${C.acc}`,
  background: 'transparent', color: C.acc, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function PeopleView({ data, selected, onSelect, onChanged, showToast, isMobile }) {
  const { participations = [], contacts = [], workstreams = [], stories = [] } = data || {};

  // Once sub-opportunities exist they are the right place to put a person: a
  // story is one thread, and that is the level paperwork and tasks live at.
  // Falls back to the flat list while nothing has been broken down yet.
  const placeableTargets = stories.length ? stories : workstreams;
  const [sort,   setSort]   = useState('due');
  const [scope,  setScope]  = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [addingFor, setAddingFor] = useState(null);   // contact being placed

  // ── Group participations by person, then fold in everyone else ─────────────
  const people = useMemo(() => {
    const byContact = new Map();
    for (const p of participations) {
      if (!p.contactId) continue;
      if (!byContact.has(p.contactId)) {
        byContact.set(p.contactId, {
          contactId: p.contactId,
          name:      p.contactName || p.name || '',
          company:   p.contactCompany || '',
          email:     p.contactEmail || '',
          participations: [],
        });
      }
      byContact.get(p.contactId).participations.push(p);
    }

    const tracked = [...byContact.values()].map(person => {
      const active = person.participations.filter(p => !p.terminal);
      const pool   = active.length ? active : person.participations;
      return {
        ...person,
        untracked: false,
        // The card shows the MOST urgent state across workstreams, never an
        // average. An average hides the one thing that needs attention today.
        urgency:        worstUrgency(person.participations),
        allTerminal:    active.length === 0,
        lastActivityAt: person.participations.map(p => p.lastActivityAt).filter(Boolean).sort().pop() || null,
        overdueTasks:   person.participations.reduce((n, p) => n + (p.overdueTaskCount || 0), 0),
        // Lead participation drives the stage badge on a collapsed card.
        lead: pool.slice().sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0))[0],
        entities: [...new Set(person.participations.map(p => p.entity).filter(Boolean))],
      };
    });

    // Last Contacted is the only activity signal an untracked person has: they
    // have no participation, so no timeline and no stage.
    const untracked = contacts
      .filter(c => c.id && !byContact.has(c.id))
      .map(c => ({
        contactId: c.id,
        name:      c.name || '',
        company:   c.company || '',
        email:     c.email || '',
        participations: [],
        untracked: true,
        urgency:   null,
        allTerminal: false,
        lastActivityAt: c.lastContacted || null,
        overdueTasks: 0,
        lead: null,
        entities: c.entity ? [c.entity] : [],
        status: c.status || '',
      }));

    return [...tracked, ...untracked];
  }, [participations, contacts]);

  const counts = useMemo(() => ({
    all:       people.length,
    tracked:   people.filter(p => !p.untracked).length,
    untracked: people.filter(p => p.untracked).length,
  }), [people]);

  const scoped = useMemo(() => {
    if (scope === 'tracked')   return people.filter(p => !p.untracked);
    if (scope === 'untracked') return people.filter(p => p.untracked);
    return people;
  }, [people, scope]);

  // ── Type-ahead on name AND company ─────────────────────────────────────────
  // Past roughly forty people this matters more than the sort controls do.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.company.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.participations.some(x => (x.workstreamName || '').toLowerCase().includes(q)),
    );
  }, [scoped, search]);

  const sorted = useMemo(() => sortPeople(filtered, sort), [filtered, sort]);

  const selectedP = selected ? participations.find(p => p.id === selected) : null;

  function openPerson(person) {
    // Nothing to open on someone with no participation — the only useful action
    // is to give them one, so opening the card goes straight to that.
    if (person.untracked) {
      setAddingFor(person);
      return;
    }
    // One participation opens straight to the detail. Several expands so the
    // user picks which relationship they meant, rather than guessing for them.
    if (person.participations.length === 1) {
      onSelect(person.participations[0].id);
      setExpanded(null);
    } else {
      setExpanded(prev => (prev === person.contactId ? null : person.contactId));
    }
  }

  const list = (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, company or workstream"
          style={{
            flex: 1, minWidth: 180, boxSizing: 'border-box', padding: '8px 11px',
            borderRadius: 7, border: `1px solid ${C.cr3}`, background: C.bg,
            color: C.ink9, fontFamily: SANS, fontSize: 12.5, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {SORTS.map(s => (
            <button key={s.id} onClick={() => setSort(s.id)} style={{
              padding: '6px 10px', borderRadius: 6,
              border: `1px solid ${sort === s.id ? C.acc : C.cr3}`,
              background: sort === s.id ? C.accS : 'transparent',
              color: sort === s.id ? C.ink9 : C.ink5,
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '.05em', cursor: 'pointer',
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {SCOPES.map(s => (
          <button key={s.id} onClick={() => setScope(s.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 11px', borderRadius: 999,
            border: `1px solid ${scope === s.id ? C.acc : C.cr3}`,
            background: scope === s.id ? C.accS : 'transparent',
            color: scope === s.id ? C.ink9 : C.ink5,
            fontFamily: SANS, fontSize: 12, cursor: 'pointer',
          }}>
            {s.label}
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{counts[s.id]}</span>
          </button>
        ))}
      </div>

      {!sorted.length && (
        <Empty
          icon="◉"
          title={search ? 'Nobody matches that' : scope === 'tracked' ? 'Nobody is in a workstream yet' : 'No people yet'}
          body={search
            ? 'Try a company name, or clear the search.'
            : scope === 'tracked'
              ? 'Switch to Everyone and add someone to a workstream. Stage, triage and the brief all hang off that.'
              : 'No CRM contacts loaded.'}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(person => (
          <PersonCard
            key={person.contactId}
            person={person}
            expanded={expanded === person.contactId}
            selected={selectedP?.contactId === person.contactId}
            onOpen={() => openPerson(person)}
            onAdd={() => setAddingFor(person)}
            onPick={pid => { onSelect(pid); setExpanded(null); }}
            selectedParticipationId={selected}
          />
        ))}
      </div>
    </div>
  );

  const addModal = addingFor && (
    <Modal title={`Add ${addingFor.name || 'this person'} to a workstream`} onClose={() => setAddingFor(null)}>
      <AddParticipant
        contact={addingFor}
        workstreams={placeableTargets}
        // Workstreams this person is already in cannot take them again, and the
        // server would refuse the duplicate anyway.
        takenIds={addingFor.participations.map(p => p.workstreamId).filter(Boolean)}
        onClose={() => setAddingFor(null)}
        onDone={onChanged}
        showToast={showToast}
      />
    </Modal>
  );

  // ── Mobile: drill down. People + Due is the most useful mobile surface. ────
  if (isMobile) {
    if (selectedP) {
      return (
        <DetailPane
          participation={selectedP} contacts={contacts} onChanged={onChanged}
          showToast={showToast} onClose={() => onSelect(null)} isMobile
        />
      );
    }
    return <>{list}{addModal}</>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.1fr)', gap: 16, alignItems: 'start' }}>
      <div>{list}</div>
      <div style={{ position: 'sticky', top: 0 }}>
        <Panel sx={{ height: 'calc(100vh - 170px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DetailPane
            participation={selectedP} contacts={contacts}
            onChanged={onChanged} showToast={showToast}
          />
        </Panel>
      </div>
      {addModal}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PersonCard({ person, expanded, selected, onOpen, onAdd, onPick, selectedParticipationId }) {
  const lead = person.lead;

  // Untracked: a roster row, not a relationship card. It deliberately shows no
  // stage and no urgency, because a person without a participation has neither.
  if (person.untracked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 9,
        padding: '10px 13px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink5 }}>
            {person.name || '(no name)'}
          </div>
          <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 1 }}>
            {[person.company, person.email].filter(Boolean).join(' · ') || 'No company or email on file'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 4 }}>
            not in a workstream · last contacted {fmtRel(person.lastActivityAt)}
          </div>
        </div>
        <button onClick={onAdd} style={addBtn}>＋ Add to workstream</button>
      </div>
    );
  }

  return (
    <div style={{
      background: selected ? C.accS : C.bg2,
      border: `1px solid ${selected ? C.acc : C.cr2}`,
      borderRadius: 9, overflow: 'hidden',
    }}>
      <button onClick={onOpen} style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'transparent', border: 'none', padding: '11px 13px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.2,
              color: person.allTerminal ? C.ink3 : C.ink9,
            }}>{person.name}</div>
            {person.company && (
              <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 1 }}>{person.company}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {person.overdueTasks > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.red }}>
                {person.overdueTasks} overdue
              </span>
            )}
            <UrgencyDot urgency={person.urgency} />
          </div>
        </div>

        {/* One chip per workstream. This is what makes the person the unit. */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
          {person.participations.map(p => (
            <WorkstreamChip key={p.id} name={p.workstreamName || 'Unassigned'} />
          ))}
          {person.entities.map(e => <EntityChip key={e} entity={e} />)}
        </div>

        {lead && (
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <StageBadge stageLabel={lead.stageLabel} daysInStage={lead.daysInStage} slaStatus={lead.slaStatus} compact />
            {person.participations.length > 1 && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
                +{person.participations.length - 1} more workstream{person.participations.length > 2 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 5 }}>
          last activity {fmtRel(person.lastActivityAt)}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.cr2}`, padding: '8px 13px 11px' }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
            color: C.ink3, marginBottom: 6,
          }}>Which relationship</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {person.participations.map(p => (
              <button key={p.id} onClick={() => onPick(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${selectedParticipationId === p.id ? C.acc : C.cr2}`,
                background: selectedParticipationId === p.id ? C.accS : C.bg,
              }}>
                <span style={{ flex: 1, fontFamily: SANS, fontSize: 12.5, color: C.ink8, minWidth: 0 }}>
                  {p.workstreamName || 'Unassigned workstream'}
                </span>
                <StageBadge stageLabel={p.stageLabel} daysInStage={p.daysInStage} slaStatus={p.slaStatus} compact />
                <UrgencyDot urgency={urgencyOf(p)} size={7} />
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={onAdd} style={addBtn}>＋ Add to another workstream</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sorting ──────────────────────────────────────────────────────────────────

// Live relationships first, then finished ones, then the untracked roster.
// Untracked sinks below even Closed and Archived: a person with no participation
// has no state to be behind on, so they must never displace one who does.
function tier(p) {
  if (p.untracked) return 2;
  return p.allTerminal ? 1 : 0;
}

function sortPeople(people, sort) {
  const list = people.slice();

  if (sort === 'az') {
    // Last name then first.
    return list.sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b);
      return sortKeyByLastName(a.name).localeCompare(sortKeyByLastName(b.name));
    });
  }

  if (sort === 'last') {
    return list.sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b);
      const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bt - at;
    });
  }

  // ── Due (default) ──────────────────────────────────────────────────────────
  // Ranked: overdue first by how overdue, then due today, then Waiting On = Us
  // by oldest inbound, then past-SLA stages by days over, then recent activity.
  // Closed and Archived always sink to the bottom regardless of anything else.
  return list.sort((a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    const sa = dueScore(a);
    const sb = dueScore(b);
    if (sa.band !== sb.band) return sa.band - sb.band;
    if (sa.magnitude !== sb.magnitude) return sb.magnitude - sa.magnitude;
    const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bt - at;
  });
}

function dueScore(person) {
  const today = new Date().toISOString().slice(0, 10);
  let band = 5;
  let magnitude = 0;

  for (const p of person.participations) {
    if (p.terminal) continue;

    // Band 1: overdue, ranked by how overdue.
    if (p.overdueTaskCount > 0) {
      band = Math.min(band, 1);
      magnitude = Math.max(magnitude, p.overdueTaskCount * 10);
    }
    if (p.nextActionDate) {
      const d = String(p.nextActionDate).slice(0, 10);
      if (d < today) {
        band = Math.min(band, 1);
        magnitude = Math.max(magnitude, Math.abs(relDays(p.nextActionDate) || 0));
      } else if (d === today) {
        band = Math.min(band, 2);   // Band 2: due today
      }
    }

    // Band 3: waiting on us, oldest inbound first.
    if (band > 3 && p.waitingOn === 'Us') {
      band = 3;
      magnitude = Math.max(magnitude, relDays(p.lastActivityAt) || 0);
    }

    // Band 4: past-SLA stage, by days over.
    if (band > 4 && (p.slaStatus === 'overdue' || p.slaStatus === 'escalate')) {
      band = 4;
      magnitude = Math.max(magnitude, p.daysInStage || 0);
    }
  }

  return { band, magnitude };
}
