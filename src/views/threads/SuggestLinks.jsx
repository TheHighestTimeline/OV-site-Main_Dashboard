// Review screen for proposed participations.
//
// The server matches a contact's COUNTERPARTY company against an opportunity's
// name and proposes the pairing. That is an inference, so nothing is written
// until it is ticked here — the same rule the rest of the evidence layer follows.
// Every row shows the reason it was proposed, because a proposal you cannot
// check is just a write with extra steps.
//
// Grouped by workstream rather than by person: the goal is a property of the
// workstream, the sprawl rule needs one before anybody can be added, and asking
// for it once per group is the difference between one screen and forty prompts.

import { useState, useEffect, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import { getParticipationSuggestions, applyParticipationSuggestions } from '../../api.js';
import { Loading, Empty, Panel, EntityChip } from './shared.jsx';

const primaryBtn = {
  padding: '9px 18px', borderRadius: 8, border: 'none', background: C.acc,
  color: '#fff', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const ghostBtn = {
  padding: '5px 11px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', cursor: 'pointer',
};

const goalField = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, outline: 'none',
};

export default function SuggestLinks({ onClose, onDone, showToast }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [picked,  setPicked]  = useState(() => new Set());
  const [goals,   setGoals]   = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await getParticipationSuggestions();
        if (!live) return;
        setData(res);
        // Everything on by default. These are proposals the user asked for, and
        // making them tick forty boxes to accept what they requested is worse
        // than making them untick the few that are wrong.
        setPicked(new Set(res.proposals.flatMap(g => g.people.map(p => key(g.workstreamId, p.contactId)))));
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const proposals = useMemo(() => data?.proposals || [], [data]);

  const chosenByWorkstream = useMemo(() => {
    const out = new Map();
    for (const g of proposals) {
      const ids = g.people.filter(p => picked.has(key(g.workstreamId, p.contactId))).map(p => p.contactId);
      if (ids.length) out.set(g.workstreamId, ids);
    }
    return out;
  }, [proposals, picked]);

  const chosenCount = [...chosenByWorkstream.values()].reduce((n, ids) => n + ids.length, 0);

  // A group with people ticked and no goal cannot be written, and the server
  // would refuse it. Surface that here rather than as an error after the fact.
  const missingGoals = proposals.filter(g =>
    g.needsGoal && chosenByWorkstream.has(g.workstreamId) && !String(goals[g.workstreamId] || '').trim());

  function toggle(wsId, contactId) {
    setPicked(prev => {
      const next = new Set(prev);
      const k = key(wsId, contactId);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function toggleGroup(g, on) {
    setPicked(prev => {
      const next = new Set(prev);
      for (const p of g.people) {
        const k = key(g.workstreamId, p.contactId);
        if (on) next.add(k); else next.delete(k);
      }
      return next;
    });
  }

  async function apply() {
    if (!chosenCount) return;
    if (missingGoals.length) {
      setError(`Give ${missingGoals.length === 1 ? 'this workstream' : 'these workstreams'} a goal first: ${missingGoals.map(g => g.workstreamName).join(', ')}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const groups = [...chosenByWorkstream.entries()].map(([workstreamId, contactIds]) => ({
        workstreamId,
        contactIds,
        goal: goals[workstreamId] || '',
      }));
      const res = await applyParticipationSuggestions(groups);
      showToast?.(`Linked ${res.createdCount} ${res.createdCount === 1 ? 'person' : 'people'}`);
      if (res.errors?.length) setError(res.errors.join(' · '));
      onDone?.();
      if (!res.errors?.length) onClose?.();
    } catch (e) {
      setError(e.message || 'Could not apply the links.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Matching contacts to workstreams…" />;

  if (error && !data) {
    return <Empty icon="◈" title="Could not build suggestions" body={error} />;
  }

  if (!proposals.length) {
    return (
      <Empty
        icon="◇"
        title="Nothing to suggest"
        body={
          `No contact's company name matches an opportunity name. ` +
          `${data?.skipped?.noCompany || 0} contacts have no company on file and ` +
          `${data?.skipped?.internalCompany || 0} are internal OneVibe staff, who are never ` +
          `counterparties to their own deals. Add people by hand from the Opportunities view.`
        }
      />
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.6, margin: '0 0 6px' }}>
        These are <strong style={{ color: C.ink9 }}>guesses</strong>, matched from the counterparty
        company on each contact against the name of the deal. Nothing is written until you press
        the button. Untick anything that is wrong.
      </p>
      <p style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.6, margin: '0 0 16px' }}>
        Internal OneVibe staff are excluded on purpose — their company link records who they work
        for, not who we are dealing with, so including them would put your own team on the other
        side of your own raises.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {proposals.map(g => {
          const chosen = chosenByWorkstream.get(g.workstreamId) || [];
          const allOn  = chosen.length === g.people.length;
          return (
            <Panel key={g.workstreamId} sx={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <h4 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15.5, color: C.ink9, margin: 0 }}>
                    {g.workstreamName}
                  </h4>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 3 }}>
                    {chosen.length} of {g.people.length} selected
                  </div>
                </div>
                <EntityChip entity={g.entity} />
                <button onClick={() => toggleGroup(g, !allOn)} style={ghostBtn}>
                  {allOn ? 'none' : 'all'}
                </button>
              </div>

              {g.needsGoal && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
                    textTransform: 'uppercase', color: chosen.length ? C.yel : C.ink3, marginBottom: 4,
                  }}>Goal · required before anyone can be added</div>
                  <input
                    value={goals[g.workstreamId] || ''}
                    onChange={e => setGoals(prev => ({ ...prev, [g.workstreamId]: e.target.value }))}
                    placeholder="What this workstream is trying to achieve"
                    style={goalField}
                  />
                </div>
              )}

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {g.people.map(p => {
                  const on = picked.has(key(g.workstreamId, p.contactId));
                  return (
                    <button
                      key={p.contactId}
                      onClick={() => toggle(g.workstreamId, p.contactId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                        textAlign: 'left', cursor: 'pointer', padding: '7px 9px', borderRadius: 6,
                        border: `1px solid ${on ? C.acc : C.cr2}`,
                        background: on ? C.accS : 'transparent',
                      }}
                    >
                      <span style={{
                        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                        border: `1px solid ${on ? C.acc : C.cr3}`,
                        background: on ? C.acc : 'transparent', color: '#fff',
                        fontSize: 10, lineHeight: '14px', textAlign: 'center',
                      }}>{on ? '✓' : ''}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: SANS, fontSize: 13, color: C.ink9, display: 'block' }}>
                          {p.name || '(no name)'}
                        </span>
                        <span style={{ fontSize: 11, color: C.ink3 }}>
                          {p.company} · {p.reason}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>

      {error && (
        <div style={{
          padding: '9px 12px', borderRadius: 7, marginTop: 12,
          background: `${C.red}18`, color: C.red, fontSize: 12, lineHeight: 1.5,
        }}>{error}</div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
        paddingTop: 14, borderTop: `1px solid ${C.cr2}`, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, fontSize: 11.5, color: C.ink3, lineHeight: 1.5, minWidth: 180 }}>
          {data.skipped.noCompany} contacts have no company on file and{' '}
          {data.skipped.internalCompany} are internal staff. Neither was matched.
        </div>
        <button onClick={onClose} disabled={saving} style={{
          padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.cr3}`,
          background: 'transparent', color: C.ink5, fontFamily: SANS, fontSize: 13,
          cursor: saving ? 'default' : 'pointer',
        }}>Cancel</button>
        <button onClick={apply} disabled={saving || !chosenCount} style={{
          ...primaryBtn,
          background: chosenCount ? C.acc : C.cr3,
          cursor: saving || !chosenCount ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Linking…' : `Link ${chosenCount} ${chosenCount === 1 ? 'person' : 'people'}`}
        </button>
      </div>
    </div>
  );
}

function key(wsId, contactId) { return `${wsId}::${contactId}`; }
