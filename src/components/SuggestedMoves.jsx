import { useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Btn, Spinner } from './UI.jsx';
import { parseVoice, createTask, logContactTouched } from '../api.js';

// ── Suggested next moves (2026-07 audit §7) ──────────────────────────────────
// Uses the existing 'contact-prioritize' AI section: ranks who to reach out to
// today from CRM staleness / status / overdue next actions, with one-click
// "make it a task". Mounted on My Day so it's the first thing seen each day.

export default function SuggestedMoves({ contacts, showToast }) {
  const [state, setState]   = useState('idle'); // idle | loading | done | error
  const [ranked, setRanked] = useState([]);
  const [made, setMade]     = useState({});     // contactId → true once task created

  const run = async () => {
    setState('loading');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const compact = (contacts || []).slice(0, 200).map(c => ({
        id: c.id, name: c.name, status: c.status,
        lastContactedAt: c.lastContactedAt || c.last_contacted_at || null,
        nextAction: c.nextAction || null, nextActionDate: c.nextActionDate || null,
        note: (c.currentSummary || c.notes || '').slice(0, 140),
      }));
      const res = await parseVoice(JSON.stringify({ today, contacts: compact }), { section: 'contact-prioritize' });
      setRanked(res?.ranked || []);
      setState('done');
    } catch (e) {
      showToast?.('Suggestions failed: ' + e.message);
      setState('error');
    }
  };

  const makeTask = async (r) => {
    try {
      await createTask({
        task: `${r.suggestedAction} — ${r.name}`,
        status: 'Not Started',
        priority: 'High',
        taskType: 'Task',
        contactIds: r.contactId ? [r.contactId] : [],
      });
      setMade(m => ({ ...m, [r.contactId || r.name]: true }));
      showToast?.('Task created ✓');
      if (r.contactId) logContactTouched(r.contactId).catch(() => {});
    } catch (e) { showToast?.('Failed: ' + e.message); }
  };

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 14, padding: '18px 20px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 3 }}>AI chief of staff</div>
          <div style={{ fontFamily: SERIF, fontSize: 17, color: C.ink9 }}>Who should you reach out to today?</div>
        </div>
        <Btn v={state === 'done' ? 'gho' : 'pri'} onClick={run} disabled={state === 'loading' || !(contacts || []).length}>
          {state === 'loading' ? <><Spinner size={12} color={state === 'done' ? C.acc : C.bg} /> Thinking…</> : state === 'done' ? 'Refresh' : 'Get suggestions'}
        </Btn>
      </div>

      {state === 'done' && ranked.length === 0 && (
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 12 }}>Nothing urgent — the pipeline looks current.</div>
      )}

      {ranked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {ranked.map((r, i) => (
            <div key={r.contactId || i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.acc, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: C.ink5, lineHeight: 1.45, marginTop: 2 }}>{r.reason}</div>
                <div style={{ fontSize: 11.5, color: C.acc, marginTop: 3 }}>→ {r.suggestedAction}</div>
              </div>
              <button
                onClick={() => makeTask(r)}
                disabled={made[r.contactId || r.name]}
                style={{
                  flexShrink: 0, padding: '5px 11px', borderRadius: 7, fontFamily: SANS, fontSize: 11,
                  cursor: made[r.contactId || r.name] ? 'default' : 'pointer',
                  background: made[r.contactId || r.name] ? C.grnS : C.ink9,
                  color: made[r.contactId || r.name] ? C.grn : C.bg, border: 'none',
                }}
              >
                {made[r.contactId || r.name] ? '✓ Task made' : '+ Task'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
