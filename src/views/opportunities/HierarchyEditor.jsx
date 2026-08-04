// Level + parent/child linking for an opportunity.
//
//   EPIC   top-level deal        Parent Opportunity empty
//   STORY  one thread inside it  Parent Opportunity set
//
// Level is DERIVED, not stored: an opportunity is a story exactly when it has a
// parent. So switching the dropdown does not set a flag, it sets or clears the
// link — which is why picking "Story" immediately asks which epic, and picking
// "Epic" clears the parent. There is no third state where the label and the link
// disagree.
//
// Linking an existing opportunity as a child converts it from an epic into a
// story by the same rule: it now has a parent, so it is one.

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';

const SIGNED = new Set(['NCNDA Signed', 'Closed']);

const LEVELS = [
  { id: 'epic',  label: 'Epic',  hint: 'A top-level deal. Sub-opportunities hang off it.' },
  { id: 'story', label: 'Story', hint: 'One thread inside a deal — one company, its own paperwork.' },
];

const lbl = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, display: 'block', marginBottom: 3,
};

const inp = {
  background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8,
  padding: '6px 10px', fontFamily: SANS, fontSize: 12.5, color: C.ink9,
  width: '100%', boxSizing: 'border-box', outline: 'none',
};

const btn = {
  padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.acc}`,
  background: 'transparent', color: C.acc, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const linkBtn = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  color: C.acc, fontFamily: SANS, fontSize: 11.5, textAlign: 'left',
};

export default function HierarchyEditor({
  opp, allOpps = [], onSave, onOpen, onCreateChild, busy,
}) {
  const [pending, setPending] = useState(null);   // level chosen, parent not picked yet
  const [linkId,  setLinkId]  = useState('');

  const level = opp.parentId ? 'story' : 'epic';
  const shown = pending || level;

  const byId = useMemo(
    () => Object.fromEntries(allOpps.map(o => [o.id, o])),
    [allOpps],
  );

  const children = useMemo(
    () => allOpps.filter(o => o.parentId === opp.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [allOpps, opp.id],
  );

  // Candidate parents: any other top-level opportunity. Excluding this record's
  // own descendants would need a full tree walk; one level is enough to stop the
  // obvious self-link, and Airtable rejects a true cycle anyway.
  const epicOptions = useMemo(
    () => allOpps
      .filter(o => o.id !== opp.id && !o.parentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [allOpps, opp.id],
  );

  // Candidate children: anything not already under this one, and not this one.
  const childOptions = useMemo(
    () => allOpps
      .filter(o => o.id !== opp.id && o.parentId !== opp.id && o.id !== opp.parentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [allOpps, opp.id, opp.parentId],
  );

  function pickLevel(next) {
    if (next === level) { setPending(null); return; }
    if (next === 'epic') {
      // Promote: clear the parent. Its own children are untouched.
      onSave({ parentId: null });
      setPending(null);
      return;
    }
    // Demote: needs a parent before it means anything, so hold the choice until
    // one is picked rather than writing a half-state.
    setPending('story');
  }

  function attachParent(id) {
    if (!id) return;
    onSave({ parentId: id });
    setPending(null);
    setLinkId('');
  }

  function attachChild(id) {
    if (!id) return;
    // Linking is a write on the CHILD: it is the one gaining a parent, and that
    // is what converts it from an epic into a story.
    onSave({ parentId: opp.id }, id);
    setLinkId('');
  }

  return (
    <div style={{
      border: `1px solid ${C.cr2}`, borderRadius: 9, padding: '10px 12px',
      background: C.bg2, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 110 }}>
          <span style={lbl}>Level</span>
          <select value={shown} disabled={busy} onChange={e => pickLevel(e.target.value)} style={inp}>
            {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 190 }}>
          {shown === 'story' ? (
            <>
              <span style={lbl}>Parent epic · one only</span>
              <select
                value={opp.parentId || ''}
                disabled={busy}
                onChange={e => attachParent(e.target.value)}
                style={{
                  ...inp,
                  borderColor: pending && !opp.parentId ? C.yel : C.cr3,
                }}
              >
                <option value="">Pick the deal this sits inside…</option>
                {epicOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <span style={lbl}>Link a sub-opportunity · adds one at a time</span>
              <select value={linkId} disabled={busy} onChange={e => attachChild(e.target.value)} style={inp}>
                <option value="">Link an existing opportunity as a child…</option>
                {childOptions.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.parentId ? ` (currently under ${byId[o.parentId]?.name || 'another deal'})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {shown === 'epic' && onCreateChild && (
          <button onClick={onCreateChild} disabled={busy} style={btn}>＋ New sub</button>
        )}
      </div>

      {pending === 'story' && !opp.parentId && (
        <div style={{ fontSize: 11, color: C.yel, marginTop: 7, lineHeight: 1.5 }}>
          Pick the parent deal. A story with no epic is still shown at the top level,
          so nothing gets lost — but it is not nested until you choose one.
        </div>
      )}

      {shown === 'story' && opp.parentId && (
        <div style={{ fontSize: 11, color: C.ink3, marginTop: 7 }}>
          Inside{' '}
          <button onClick={() => onOpen?.(opp.parentId)} style={linkBtn}>
            {byId[opp.parentId]?.name || 'its parent'}
          </button>
        </div>
      )}

      {shown === 'epic' && children.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={lbl}>Sub-opportunities · {children.length}</span>
          {/* Rows, not chips: each carries the lane, the paperwork tag and the
              open-task count, so the epic answers "where does this deal stand"
              without opening every thread. Clicking one opens it. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px',
                borderRadius: 7, background: C.bg, border: `1px solid ${C.cr2}`,
              }}>
                <button
                  onClick={() => onOpen?.(c.id)}
                  title="Open this sub-opportunity"
                  style={{ ...linkBtn, flex: 1, minWidth: 0, fontSize: 12 }}
                >{c.name}</button>

                {c.lane && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8.5, letterSpacing: '.05em',
                    textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                    background: C.grS, color: C.ink5, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{c.lane}</span>
                )}

                {c.paperworkStage && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8.5, letterSpacing: '.05em',
                    textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
                    whiteSpace: 'nowrap', flexShrink: 0,
                    background: SIGNED.has(c.paperworkStage) ? `${C.grn}1f` : C.grS,
                    color: SIGNED.has(c.paperworkStage) ? C.grn : C.ink5,
                  }}>{c.paperworkStage}</span>
                )}

                {(c.tasks || []).length > 0 && (
                  <span style={{
                    fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0,
                  }}>▤ {c.tasks.length}</span>
                )}

                <button
                  title="Unlink — promotes it back to a top-level deal"
                  onClick={() => onSave({ parentId: null }, c.id)}
                  disabled={busy}
                  style={{
                    border: 'none', background: 'none', color: C.ink3,
                    cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0,
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

