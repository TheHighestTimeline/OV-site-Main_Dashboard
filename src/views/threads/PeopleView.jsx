// View 2: People.
//
// ONE CARD PER PERSON, not per participation. Someone in three workstreams is
// one card with three workstream chips. This is the "one place to see everything
// Greg said" view, and splitting him into three rows would defeat that.
//
// The Opportunities view groups the same data by participation because each row
// there needs a separate action. Both groupings are correct for their question.
// Do not unify them.

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import {
  StageBadge, EntityChip, WorkstreamChip, UrgencyDot, urgencyOf, worstUrgency,
  Panel, Empty, fmtRel, relDays, sortKeyByLastName,
} from './shared.jsx';
import DetailPane from './DetailPane.jsx';

const SORTS = [
  { id: 'due',  label: 'Due' },
  { id: 'last', label: 'Last interaction' },
  { id: 'az',   label: 'A to Z' },
];

export default function PeopleView({ data, selected, onSelect, onChanged, showToast, isMobile }) {
  const { participations = [], contacts = [] } = data || {};
  const [sort,   setSort]   = useState('due');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  // ── Group participations by person ─────────────────────────────────────────
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

    return [...byContact.values()].map(person => {
      const active = person.participations.filter(p => !p.terminal);
      const pool   = active.length ? active : person.participations;
      return {
        ...person,
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
  }, [participations]);

  // ── Type-ahead on name AND company ─────────────────────────────────────────
  // Past roughly forty people this matters more than the sort controls do.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.company.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.participations.some(x => (x.workstreamName || '').toLowerCase().includes(q)),
    );
  }, [people, search]);

  const sorted = useMemo(() => sortPeople(filtered, sort), [filtered, sort]);

  const selectedP = selected ? participations.find(p => p.id === selected) : null;

  function openPerson(person) {
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

      {!sorted.length && (
        <Empty
          icon="◉"
          title={search ? 'Nobody matches that' : 'No people yet'}
          body={search
            ? 'Try a company name, or clear the search.'
            : 'People appear here once they have a participation in a workstream.'}
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
            onPick={pid => { onSelect(pid); setExpanded(null); }}
            selectedParticipationId={selected}
          />
        ))}
      </div>
    </div>
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
    return list;
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
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PersonCard({ person, expanded, selected, onOpen, onPick, selectedParticipationId }) {
  const lead = person.lead;
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
        </div>
      )}
    </div>
  );
}

// ── Sorting ──────────────────────────────────────────────────────────────────

function sortPeople(people, sort) {
  const list = people.slice();

  if (sort === 'az') {
    // Last name then first.
    return list.sort((a, b) => {
      if (a.allTerminal !== b.allTerminal) return a.allTerminal ? 1 : -1;
      return sortKeyByLastName(a.name).localeCompare(sortKeyByLastName(b.name));
    });
  }

  if (sort === 'last') {
    return list.sort((a, b) => {
      if (a.allTerminal !== b.allTerminal) return a.allTerminal ? 1 : -1;
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
    if (a.allTerminal !== b.allTerminal) return a.allTerminal ? 1 : -1;
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
