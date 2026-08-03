// Voice capture into the Threads ecosystem (WP10).
//
// THE CONFIRM SCREEN IS MANDATORY. The flow is record → transcribe → parse →
// REVIEW AND EDIT → apply. Nothing is written from voice without a human seeing
// it first. Entity and owner get guessed wrong often enough that writing blind
// poisons the board, and a board people stop trusting is a board they stop using.
//
// Tasks missing entity, owner or due date are applied to an Inbox lane (Status
// Submitted) rather than the board, which is the lane the evening SOP empties.

import { useState, useEffect } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { useVoice, blobToBase64 } from '../../hooks/useVoice.js';
import { transcribeAudio, parseVoice, applyVoiceActions, getTasks } from '../../api.js';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '6px 9px', borderRadius: 6,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, outline: 'none',
};

const ghost = {
  padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 10,
  letterSpacing: '.05em', cursor: 'pointer', marginTop: 6,
};

export default function VoiceCapture({ data, onClose, onApplied, showToast }) {
  const [step,       setStep]       = useState('record'); // record | thinking | review
  const [transcript, setTranscript] = useState('');
  const [parsed,     setParsed]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const { phase, start, stop, audioBlob, audioMime, error: voiceErr, reset } = useVoice();

  useEffect(() => {
    if (!audioBlob) return;
    let alive = true;
    (async () => {
      setStep('thinking');
      setError(null);
      try {
        const b64 = await blobToBase64(audioBlob);
        const { transcript: text } = await transcribeAudio(b64, audioMime);
        if (!alive) return;
        setTranscript(text || '');
        if (!text?.trim()) { setStep('record'); setError('Nothing was picked up. Try again.'); return; }
        await runParse(text);
      } catch (e) {
        if (alive) { setError(e.message); setStep('record'); }
      } finally {
        if (alive) reset();
      }
    })();
    return () => { alive = false; };
  }, [audioBlob, audioMime]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runParse(text) {
    try {
      const tasks = await getTasks().catch(() => []);
      const res = await parseVoice(text, {
        section: 'threads',
        tasks,
        contacts: data?.contacts || [],
        participations: data?.participations || [],
        workstreams: data?.workstreams || [],
      });
      setParsed(normalize(res));
      setStep('review');
    } catch (e) {
      setError(`Could not read that: ${e.message}`);
      setStep('review');
      setParsed(normalize({}));
    }
  }

  async function apply() {
    if (!parsed) return;
    setSaving(true);
    try {
      const res = await applyVoiceActions({
        newTasks:      parsed.newTasks.filter(t => t._keep && t.actionName?.trim()),
        taskUpdates:   parsed.taskUpdates.filter(t => t._keep),
        focusRequests: parsed.focusRequests.filter(t => t._keep),
        notes:         parsed.notes.filter(n => n._keep),
        transcript,
      });
      const bits = [];
      if (res.created.length) bits.push(`${res.created.length} task(s) created`);
      if (res.inbox)          bits.push(`${res.inbox} to the Inbox lane`);
      if (res.updated.length) bits.push(`${res.updated.length} updated`);
      if (res.focused.length) bits.push(`${res.focused.length} on Today`);
      if (res.notes.length)   bits.push(`${res.notes.length} note(s)`);
      showToast?.(bits.join(', ') || 'Nothing applied.');
      if (res.errors?.length) showToast?.(res.errors[0]);
      onApplied?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function patch(list, i, changes) {
    setParsed(prev => ({
      ...prev,
      [list]: prev[list].map((row, idx) => (idx === i ? { ...row, ...changes } : row)),
    }));
  }

  const recording = phase === 'recording';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 700 }}>
      {error && (
        <div style={{ padding: '9px 12px', borderRadius: 7, background: C.redS, color: C.red, fontSize: 12 }}>
          {error}
        </div>
      )}

      {step === 'record' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <button
            onClick={recording ? stop : start}
            style={{
              width: 80, height: 80, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: recording ? C.red : C.acc, color: '#fff', fontSize: 28,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            }}
          >{recording ? '◼' : '◉'}</button>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
            color: C.ink3, marginTop: 12,
          }}>
            {recording ? 'Recording… tap to stop' : 'Tap and talk'}
          </div>
          <p style={{ fontSize: 12, color: C.ink3, maxWidth: 380, margin: '12px auto 0', lineHeight: 1.6 }}>
            Say what happened and what needs doing. Everything comes back as an editable list
            before anything is written.
          </p>
          {voiceErr && <p style={{ fontSize: 11.5, color: C.red, marginTop: 10 }}>{voiceErr}</p>}
        </div>
      )}

      {step === 'thinking' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 28, color: C.acc, marginBottom: 10 }}>◐</div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
            Working it out…
          </div>
        </div>
      )}

      {step === 'review' && parsed && (
        <>
          <div>
            <Label>What you said</Label>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: SANS }}
            />
            <button onClick={() => { setStep('thinking'); runParse(transcript); }} style={ghost}>
              Re-read it
            </button>
          </div>

          {parsed.summary && (
            <div style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.55, fontStyle: 'italic' }}>
              {parsed.summary}
            </div>
          )}

          {/* New tasks */}
          {parsed.newTasks.length > 0 && (
            <div>
              <Label>New tasks</Label>
              {parsed.newTasks.map((t, i) => {
                const inbox = !t.entity || !t.owner || !t.dueDate;
                return (
                  <div key={i} style={cardStyle(t._keep)}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={t._keep}
                        onChange={e => patch('newTasks', i, { _keep: e.target.checked })}
                        style={{ marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={t.actionName} onChange={e => patch('newTasks', i, { actionName: e.target.value })}
                          style={inputStyle} placeholder="What needs doing" />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <input value={t.entity || ''} onChange={e => patch('newTasks', i, { entity: e.target.value })}
                            placeholder="Entity" style={{ ...inputStyle, width: 130 }} />
                          <input value={t.owner || ''} onChange={e => patch('newTasks', i, { owner: e.target.value })}
                            placeholder="Owner" style={{ ...inputStyle, width: 130 }} />
                          <input type="date" value={t.dueDate || ''} onChange={e => patch('newTasks', i, { dueDate: e.target.value })}
                            style={{ ...inputStyle, width: 140 }} />
                        </div>
                        {inbox && (
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.yel, marginTop: 5 }}>
                            → Inbox lane: needs entity, owner and a due date before it reaches the board
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Updates */}
          {parsed.taskUpdates.length > 0 && (
            <div>
              <Label>Task updates</Label>
              {parsed.taskUpdates.map((t, i) => (
                <div key={i} style={cardStyle(t._keep)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={t._keep}
                      onChange={e => patch('taskUpdates', i, { _keep: e.target.checked })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: C.ink9, fontWeight: 600 }}>{t.taskTitle || t.taskId}</div>
                      {t.note && <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{t.note}</div>}
                    </div>
                    {t.newStatus && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 999,
                        background: C.grS, color: C.ink5,
                      }}>{t.newStatus}</span>
                    )}
                  </div>
                  {!t.taskId && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, marginTop: 5 }}>
                      No task matched. Uncheck this, or add it as a new task instead.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Focus */}
          {parsed.focusRequests.length > 0 && (
            <div>
              <Label>Today's list</Label>
              {parsed.focusRequests.map((t, i) => (
                <div key={i} style={cardStyle(t._keep)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={t._keep}
                      onChange={e => patch('focusRequests', i, { _keep: e.target.checked })} />
                    <span style={{ flex: 1, fontSize: 12.5, color: C.ink9 }}>{t.taskTitle || t.taskId}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.acc }}>{t.focus}</span>
                  </div>
                </div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 4 }}>
                Today caps at five. Anything past the cap is reported back rather than added.
              </div>
            </div>
          )}

          {/* Notes */}
          {parsed.notes.length > 0 && (
            <div>
              <Label>Notes</Label>
              {parsed.notes.map((n, i) => (
                <div key={i} style={cardStyle(n._keep)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={n._keep}
                      onChange={e => patch('notes', i, { _keep: e.target.checked })} style={{ marginTop: 4 }} />
                    <textarea value={n.text} onChange={e => patch('notes', i, { text: e.target.value })}
                      rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!parsed.newTasks.length && !parsed.taskUpdates.length && !parsed.focusRequests.length && !parsed.notes.length && (
            <div style={{ fontSize: 12.5, color: C.ink3, padding: '12px 0', lineHeight: 1.6 }}>
              Nothing actionable was found in that. Edit the transcript above and re-read it,
              or record again.
            </div>
          )}

          <div style={{ display: 'flex', gap: 7, borderTop: `1px solid ${C.cr2}`, paddingTop: 12 }}>
            <button onClick={apply} disabled={saving} style={{
              padding: '8px 16px', borderRadius: 7, border: 'none', background: C.acc, color: '#fff',
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '.05em', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1,
            }}>{saving ? 'Applying…' : 'Apply'}</button>
            <button onClick={() => { setStep('record'); setParsed(null); setTranscript(''); }} style={ghost}>
              Start over
            </button>
            <button onClick={onClose} style={ghost}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

// Everything arrives checked, because the common case is that the parse is
// right. What matters is that unchecking is possible before the write, not that
// the user has to opt in row by row.
function normalize(res) {
  const keep = row => ({ ...row, _keep: true });
  return {
    summary:       res?.summary || '',
    newTasks:      (res?.newTasks      || []).map(keep),
    taskUpdates:   (res?.taskUpdates   || []).map(keep),
    focusRequests: (res?.focusRequests || []).map(keep),
    notes:         (res?.notes         || []).map(n => keep({ ...n, text: n.text || '' })),
  };
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
      color: C.ink3, marginBottom: 6,
    }}>{children}</div>
  );
}

function cardStyle(active) {
  return {
    padding: '9px 11px', borderRadius: 7, marginBottom: 6,
    border: `1px solid ${active ? C.cr3 : C.cr2}`,
    background: active ? C.bg : 'transparent',
    opacity: active ? 1 : 0.55,
  };
}


