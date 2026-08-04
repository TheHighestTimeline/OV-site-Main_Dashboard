// Put a person into a workstream.
//
// This is the entry point to the entire tab. A participation is the only record
// that carries a relationship stage, and until one exists every view here is an
// empty state: Opportunities has no cards, People has no rows, Triage has no
// buckets and the brief has nothing to summarise. The tab shipped without this
// form, which made it permanently empty and looked like a broken deploy.
//
// THE GOAL FIELD IS NOT DECORATION. The sprawl rule says a workstream exists
// only if it has its own goal and its own counterparties; anything else belongs
// on the board as a task. The server refuses a participation on a goal-less
// workstream. So rather than bounce the user to Airtable, the goal is collected
// here on the first participation and written in the same request.

import { useState, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { CAPITAL_STAGES, WAITING_ON } from '../../lib/stages.js';
import { upsertParticipation } from '../../api.js';

const label = {
  display: 'block', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
  textTransform: 'uppercase', color: C.ink3, marginBottom: 5,
};

const field = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 7,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 13, outline: 'none',
};

const row = { display: 'flex', gap: 10, flexWrap: 'wrap' };

export default function AddParticipant({
  workstream, contacts = [], takenContactIds = [], onClose, onDone, showToast,
}) {
  const [search,    setSearch]    = useState('');
  const [contactId, setContactId] = useState(null);
  const [goal,      setGoal]      = useState('');
  const [stage,     setStage]     = useState(CAPITAL_STAGES[0].label);
  const [waitingOn, setWaitingOn] = useState('Us');
  const [owner,     setOwner]     = useState('');
  const [nextAction,     setNextAction]     = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const needsGoal = !String(workstream?.goal || '').trim();
  const taken = useMemo(() => new Set(takenContactIds), [takenContactIds]);

  // Someone already in this workstream is filtered out rather than shown and
  // rejected: the server refuses the duplicate anyway, and offering a choice
  // that cannot succeed is worse than not offering it.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = contacts.filter(c => !taken.has(c.id));
    const hits = q
      ? pool.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q))
      : pool;
    return hits
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 60);
  }, [contacts, taken, search]);

  const picked = contactId ? contacts.find(c => c.id === contactId) : null;

  async function submit() {
    if (!contactId) { setError('Pick who is joining this workstream.'); return; }
    if (needsGoal && !goal.trim()) {
      setError('This workstream has no Goal yet. Give it one and it will be saved with the participation.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertParticipation({
        contactId,
        workstreamId:   workstream.id,
        stage,
        waitingOn,
        owner:          owner.trim(),
        nextAction:     nextAction.trim(),
        nextActionDate: nextActionDate || null,
        entity:         workstream.entity || '',
        ...(needsGoal ? { goal: goal.trim() } : {}),
      });
      showToast?.(`${picked?.name || 'Contact'} added to ${workstream.name}`);
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not add the participant.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.6, margin: '0 0 14px' }}>
        A participation is one person inside <strong style={{ color: C.ink9 }}>{workstream?.name}</strong>.
        It carries their stage, which is why the same person can be NCNDA Signed here and
        Initial Outreach somewhere else at the same time.
      </p>

      {needsGoal && (
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Goal for this workstream · required</span>
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            rows={2}
            placeholder="What this workstream is actually trying to achieve"
            style={{ ...field, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ fontSize: 11, color: C.ink3, marginTop: 5, lineHeight: 1.5 }}>
            A workstream needs its own goal and its own counterparties. Without one it is a
            task, not a workstream, and the board stops being scannable.
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <span style={label}>Who</span>
        {picked ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderRadius: 8, border: `1px solid ${C.acc}`, background: C.accS,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink9 }}>
                {picked.name || '(no name)'}
              </div>
              <div style={{ fontSize: 11.5, color: C.ink3 }}>
                {[picked.company, picked.email].filter(Boolean).join(' · ') || 'No company or email on file'}
              </div>
            </div>
            <button onClick={() => setContactId(null)} style={{
              border: 'none', background: 'none', color: C.ink3, cursor: 'pointer',
              fontFamily: MONO, fontSize: 10,
            }}>change</button>
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, company or email"
              style={field}
              autoFocus
            />
            <div style={{
              marginTop: 6, maxHeight: 190, overflowY: 'auto',
              border: `1px solid ${C.cr2}`, borderRadius: 8,
            }}>
              {!matches.length && (
                <div style={{ padding: '14px 12px', fontSize: 12, color: C.ink3 }}>
                  {contacts.length
                    ? 'No contacts match, or everyone matching is already in this workstream.'
                    : 'No contacts loaded.'}
                </div>
              )}
              {matches.map(c => (
                <button key={c.id} onClick={() => setContactId(c.id)} style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '8px 12px', border: 'none', borderBottom: `1px solid ${C.cr2}`,
                  background: 'transparent',
                }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink9 }}>{c.name || '(no name)'}</div>
                  {(c.company || c.email) && (
                    <div style={{ fontSize: 11, color: C.ink3 }}>
                      {[c.company, c.email].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ ...row, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <span style={label}>Opening stage</span>
          <select value={stage} onChange={e => setStage(e.target.value)} style={field}>
            {CAPITAL_STAGES.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <span style={label}>Waiting on</span>
          <select value={waitingOn} onChange={e => setWaitingOn(e.target.value)} style={field}>
            {WAITING_ON.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div style={{ ...row, marginBottom: 14 }}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <span style={label}>Next action</span>
          <input
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="The next move, in a few words"
            style={field}
          />
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <span style={label}>Due</span>
          <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} style={field} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <span style={label}>Owner at OVMG</span>
        <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Optional" style={field} />
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
        <button onClick={submit} disabled={saving || !contactId} style={{
          padding: '9px 18px', borderRadius: 8, border: 'none',
          background: contactId ? C.acc : C.cr3, color: '#fff',
          fontFamily: SANS, fontSize: 13, fontWeight: 600,
          cursor: saving || !contactId ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Adding…' : 'Add to workstream'}</button>
      </div>
    </div>
  );
}
