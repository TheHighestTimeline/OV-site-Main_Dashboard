// The right-hand pane: one sub-opportunity, opened.
//
// This is the level the work actually happens at. One thread, one company, the
// people on that email — and everything about it in one place: where the
// paperwork stands, who is on it, what is outstanding, and what has happened.
//
// Lane and paperwork stage save on change rather than behind a Save button. The
// whole point of opening this pane is to move something, and a second click to
// confirm a dropdown is the kind of friction that stops people updating status
// at all.

import { useState, useEffect, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import { updateOpportunity, getTasks } from '../../api.js';
import Timeline from '../../components/Timeline.jsx';
import { Empty, EntityChip } from './shared.jsx';

const LANES = ['Future Plans', 'Submitted', 'In Work', 'Waiting On', 'Closing', 'Done', 'Archive'];
const PAPERWORK = [
  'Initial Outreach', 'NCNDA Sent', 'NCNDA Signed', 'Discovery Call',
  'Contract Negotiation', 'Deal Finalization', 'Closed', 'Stalled', 'Archived',
];

const TERMINAL = new Set(['done', 'complete', 'canceled', 'archive', 'archived']);

const label = {
  display: 'block', fontFamily: MONO, fontSize: 8.5, letterSpacing: '.12em',
  textTransform: 'uppercase', color: C.ink3, marginBottom: 4,
};

const select = {
  width: '100%', boxSizing: 'border-box', padding: '6px 9px', borderRadius: 6,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, outline: 'none',
};

export default function StoryDetail({ story, contacts = [], onChanged, showToast, onClose, onEdit, isMobile }) {
  const [lane,  setLane]  = useState(story?.lane || '');
  const [pw,    setPw]    = useState(story?.paperworkStage || '');
  const [tasks, setTasks] = useState([]);
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    setLane(story?.lane || '');
    setPw(story?.paperworkStage || '');
  }, [story?.id, story?.lane, story?.paperworkStage]);

  useEffect(() => {
    let live = true;
    if (!story?.id) { setTasks([]); return undefined; }
    getTasks()
      .then(rows => { if (live) setTasks(rows || []); })
      .catch(() => { if (live) setTasks([]); });
    return () => { live = false; };
  }, [story?.id]);

  const mine = useMemo(() => {
    if (!story?.id) return [];
    return (tasks || [])
      .filter(t => (t.opportunityIds || []).includes(story.id))
      .filter(t => !TERMINAL.has(String(t.status || '').trim().toLowerCase()))
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  }, [tasks, story?.id]);

  const people = useMemo(() => {
    if (story?.contacts?.length) return story.contacts;
    const byId = Object.fromEntries(contacts.map(c => [c.id, c]));
    return (story?.contactIds || []).map(id => byId[id]).filter(Boolean);
  }, [story, contacts]);

  if (!story) {
    return (
      <Empty
        icon="◈"
        title="Pick a sub-opportunity"
        body="Each one is a single thread. Opening it shows the paperwork, the people, the outstanding work and the history."
      />
    );
  }

  async function save(patch, revert) {
    setBusy(true);
    try {
      await updateOpportunity(story.id, patch);
      onChanged?.();
    } catch (e) {
      revert?.();
      showToast?.(`Could not save: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingBottom: 10, borderBottom: `1px solid ${C.cr2}` }}>
        {isMobile && onClose && (
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            background: 'none', border: 'none', color: C.ink5, cursor: 'pointer',
            fontFamily: SANS, fontSize: 12.5, padding: 0,
          }}><span style={{ fontSize: 14 }}>‹</span> Back</button>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{
            flex: 1, fontFamily: SERIF, fontWeight: 500, fontSize: 16.5,
            color: C.ink9, margin: 0, lineHeight: 1.25, minWidth: 0,
          }}>{story.name}</h3>
          {onEdit && (
            <button onClick={onEdit} style={{
              border: `1px solid ${C.cr3}`, borderRadius: 6, background: 'transparent',
              color: C.ink5, fontFamily: MONO, fontSize: 9, letterSpacing: '.05em',
              padding: '4px 9px', cursor: 'pointer', flexShrink: 0,
            }}>edit</button>
          )}
        </div>

        {story.goal && (
          <p style={{ fontSize: 12, color: C.ink3, margin: '5px 0 0', lineHeight: 1.5 }}>{story.goal}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <span style={label}>Lane</span>
            <select
              value={lane}
              disabled={busy}
              onChange={e => {
                const prev = lane;
                setLane(e.target.value);
                save({ lane: e.target.value }, () => setLane(prev));
              }}
              style={select}
            >
              <option value="">No lane</option>
              {LANES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <span style={label}>Paperwork</span>
            <select
              value={pw}
              disabled={busy}
              onChange={e => {
                const prev = pw;
                setPw(e.target.value);
                save({ paperworkStage: e.target.value }, () => setPw(prev));
              }}
              style={select}
            >
              <option value="">Not tracked</option>
              {PAPERWORK.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {people.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <span style={label}>On this thread</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {people.map(p => (
                <span key={p.id} title={p.email || ''} style={{
                  display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
                  borderRadius: 999, background: C.bg2, border: `1px solid ${C.cr2}`,
                  color: C.ink5, fontFamily: SANS, fontSize: 11.5,
                }}>{p.name || '(no name)'}</span>
              ))}
              <EntityChip entity={story.entity} />
            </div>
          </div>
        )}
      </div>

      {/* ── Open work ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '10px 0', borderBottom: `1px solid ${C.cr2}` }}>
        <span style={label}>Open tasks · {mine.length}</span>
        {!mine.length && (
          <div style={{ fontSize: 11.5, color: C.ink3 }}>
            Nothing outstanding. Add a task from the board and link it to this sub-opportunity.
          </div>
        )}
        {mine.slice(0, 6).map(t => {
          const overdue = t.dueDate && String(t.dueDate).slice(0, 10) < today;
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0',
            }}>
              <span style={{ flex: 1, fontFamily: SANS, fontSize: 12, color: C.ink8, minWidth: 0 }}>
                {t.name}
              </span>
              {t.dueDate && (
                <span style={{
                  fontFamily: MONO, fontSize: 9, flexShrink: 0,
                  color: overdue ? C.red : C.ink3,
                  fontWeight: overdue ? 700 : 400,
                }}>{String(t.dueDate).slice(5, 10)}</span>
              )}
            </div>
          );
        })}
        {mine.length > 6 && (
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 3 }}>
            +{mine.length - 6} more
          </div>
        )}
      </div>

      {/* ── History ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 10 }}>
        <Timeline workstreamId={story.id} onNoteAdded={onChanged} />
      </div>
    </div>
  );
}
