// Create or edit a sub-opportunity (a "story").
//
// A story is ONE THREAD: one company, the people on that email, its own lane,
// its own paperwork stage. Contacts are a multi-select on purpose — a two-person
// email thread is still one thread, and splitting it into two cards would mean
// tracking the same conversation in two places and resolving it in neither.
//
// Naming convention, matching the base: "OVMG X <Company> — <what it is>".

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { createOpportunity, updateOpportunity } from '../../api.js';

const LANES = ['Future Plans', 'Submitted', 'In Work', 'Waiting On', 'Closing', 'Done', 'Archive'];
const PAPERWORK = [
  'Initial Outreach', 'NCNDA Sent', 'NCNDA Signed', 'Discovery Call',
  'Contract Negotiation', 'Deal Finalization', 'Closed', 'Stalled', 'Archived',
];

const label = {
  display: 'block', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
  textTransform: 'uppercase', color: C.ink3, marginBottom: 5,
};

const field = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 7,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 13, outline: 'none',
};

export default function StoryForm({ story, parent, contacts = [], onClose, onDone, showToast }) {
  const isEdit = Boolean(story);

  const [name,   setName]   = useState(story?.name || '');
  const [lane,   setLane]   = useState(story?.lane || 'Future Plans');
  const [pw,     setPw]     = useState(story?.paperworkStage || '');
  const [goal,   setGoal]   = useState(story?.goal || '');
  const [picked, setPicked] = useState(() => new Set(story?.contactIds || []));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  // A–Z, because this is a name lookup and any other order makes you hunt.
  const sorted = useMemo(
    () => contacts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [contacts],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted.slice(0, 40);
    return sorted.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)).slice(0, 40);
  }, [sorted, search]);

  const chosen = useMemo(
    () => sorted.filter(c => picked.has(c.id)),
    [sorted, picked],
  );

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) { setError('Give this thread a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name:           name.trim(),
        lane,
        paperworkStage: pw,
        goal:           goal.trim(),
        contactIds:     [...picked],
      };
      if (isEdit) {
        await updateOpportunity(story.id, payload);
      } else {
        await createOpportunity({
          ...payload,
          parentId: parent.id,
          // Inherited so the sub-opportunity lands under the same entity tab and
          // the same Deal/Workstream split as the deal it belongs to.
          entity: parent.entity || undefined,
          kind:   parent.kind   || undefined,
        });
      }
      showToast?.(isEdit ? 'Saved' : `${name.trim()} added`);
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!isEdit && (
        <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.6, margin: '0 0 14px' }}>
          One thread inside <strong style={{ color: C.ink9 }}>{parent?.name}</strong> — one company,
          the people on that email. Tasks, paperwork and the timeline all hang off this level.
        </p>
      )}

      <div style={{ marginBottom: 14 }}>
        <span style={label}>Name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="OVMG X Loan Solutions — Adam Shore"
          style={field}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <span style={label}>Lane</span>
          {/* Workflow order, not A–Z: sorting these would put Archive first. */}
          <select value={lane} onChange={e => setLane(e.target.value)} style={field}>
            {LANES.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <span style={label}>Paperwork · NCNDA</span>
          <select value={pw} onChange={e => setPw(e.target.value)} style={field}>
            <option value="">Not tracked</option>
            {PAPERWORK.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={label}>Who is on this thread</span>
        {chosen.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
            {chosen.map(c => (
              <button key={c.id} onClick={() => toggle(c.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${C.acc}`, background: C.accS,
                color: C.ink9, fontFamily: SANS, fontSize: 11.5,
              }}>
                {c.name || '(no name)'}
                <span style={{ color: C.ink3, fontSize: 10 }}>✕</span>
              </button>
            ))}
          </div>
        )}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, company or email"
          style={field}
        />
        <div style={{
          marginTop: 6, maxHeight: 170, overflowY: 'auto',
          border: `1px solid ${C.cr2}`, borderRadius: 8,
        }}>
          {!matches.length && (
            <div style={{ padding: '12px', fontSize: 12, color: C.ink3 }}>No contacts match.</div>
          )}
          {matches.map(c => {
            const on = picked.has(c.id);
            return (
              <button key={c.id} onClick={() => toggle(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                textAlign: 'left', cursor: 'pointer', padding: '7px 11px',
                border: 'none', borderBottom: `1px solid ${C.cr2}`,
                background: on ? C.accS : 'transparent',
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                  border: `1px solid ${on ? C.acc : C.cr3}`,
                  background: on ? C.acc : 'transparent', color: '#fff',
                  fontSize: 9, lineHeight: '13px', textAlign: 'center',
                }}>{on ? '✓' : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink9, display: 'block' }}>
                    {c.name || '(no name)'}
                  </span>
                  {(c.company || c.email) && (
                    <span style={{ fontSize: 10.5, color: C.ink3 }}>
                      {[c.company, c.email].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <span style={label}>What this thread is for</span>
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          rows={2}
          placeholder="Optional. What we want out of this specific conversation."
          style={{ ...field, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {error && (
        <div style={{
          padding: '9px 12px', borderRadius: 7, marginBottom: 12,
          background: `${C.red}18`, color: C.red, fontSize: 12, lineHeight: 1.5,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={saving} style={{
          padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.cr3}`,
          background: 'transparent', color: C.ink5, fontFamily: SANS, fontSize: 13,
          cursor: saving ? 'default' : 'pointer',
        }}>Cancel</button>
        <button onClick={submit} disabled={saving || !name.trim()} style={{
          padding: '9px 18px', borderRadius: 8, border: 'none',
          background: name.trim() ? C.acc : C.cr3, color: '#fff',
          fontFamily: SANS, fontSize: 13, fontWeight: 600,
          cursor: saving || !name.trim() ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Create sub-opportunity'}</button>
      </div>
    </div>
  );
}
