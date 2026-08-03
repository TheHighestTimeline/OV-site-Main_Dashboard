// The vertical dotted timeline (WP4).
//
// Every signal, message, call, stage change, task and note lands in coo_events
// and renders here, oldest at top. Inferred events render HOLLOW and tagged
// UNCONFIRMED so a guess never looks like a fact on the same surface.
//
// Notes work typed or spoken, and the voice path deliberately reuses the
// existing pipeline: useVoice records, voice-transcribe transcribes, and the
// transcript lands in the same editable box as typing. A transcript is never
// posted blind — mishearing a name and filing it as a note is how the record
// stops being trustworthy.

import { useState, useEffect, useRef, useCallback } from 'react';
import { C, SANS, MONO, SERIF } from '../constants.js';
import { useVoice, blobToBase64 } from '../hooks/useVoice.js';
import { getCooEvents, createCooNote, transcribeAudio } from '../api.js';

// ── Event presentation ───────────────────────────────────────────────────────
// Colour is read from the live palette at render so the timeline follows the
// theme toggle like everything else.
const EVENT_META = {
  message_in:       { c: () => C.blu, label: 'Received',         icon: '←' },
  message_out:      { c: () => C.ink3, label: 'Sent',            icon: '→' },
  call:             { c: () => C.pur || C.blu, label: 'Call',    icon: '☎' },
  meeting:          { c: () => C.pur || C.blu, label: 'Meeting', icon: '◎' },
  doc_sent:         { c: () => C.blu, label: 'Document sent',    icon: '⇧' },
  doc_signed:       { c: () => C.grn, label: 'Executed',         icon: '✓' },
  doc_received:     { c: () => C.blu, label: 'Document in',      icon: '⇩' },
  access_requested: { c: () => C.yel, label: 'Access requested', icon: '?' },
  access_granted:   { c: () => C.grn, label: 'Access granted',   icon: '✓' },
  access_revoked:   { c: () => C.red, label: 'Access removed',   icon: '×' },
  stage_change:     { c: () => C.acc, label: 'Stage',            icon: '▸' },
  task_created:     { c: () => C.ink3, label: 'Task',            icon: '○' },
  task_completed:   { c: () => C.grn, label: 'Task done',        icon: '✓' },
  note:             { c: () => C.ink5, label: 'Note',            icon: '✎' },
};
const FALLBACK = { c: () => C.ink3, label: 'Event', icon: '•' };

function fmtDate(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function Timeline({
  participationId, contactId, workstreamId,
  showComposer = true, onNoteAdded, maxHeight,
}) {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [note,    setNote]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [spoke,   setSpoke]   = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const bottomRef = useRef(null);

  const scope = participationId ? { participationId }
              : contactId       ? { contactId }
              : workstreamId    ? { workstreamId }
              : null;
  const scopeKey = JSON.stringify(scope);

  const load = useCallback(async () => {
    if (!scope) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getCooEvents({ ...scope, limit: 150 });
      setEvents(data.events || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const { phase, start, stop, audioBlob, audioMime, error: voiceErr, reset } = useVoice();

  useEffect(() => {
    if (!audioBlob) return;
    let alive = true;
    (async () => {
      setTranscribing(true);
      try {
        const b64 = await blobToBase64(audioBlob);
        const { transcript } = await transcribeAudio(b64, audioMime);
        if (!alive) return;
        if (transcript) {
          // Append into the SAME box the user types in, so it can be corrected
          // before it becomes a record.
          setNote(prev => (prev ? `${prev} ${transcript}` : transcript));
          setSpoke(true);
        }
      } catch (e) {
        if (alive) setError(`Transcription failed: ${e.message}`);
      } finally {
        if (alive) { setTranscribing(false); reset(); }
      }
    })();
    return () => { alive = false; };
  }, [audioBlob, audioMime, reset]);

  const recording = phase === 'recording';

  async function saveNote() {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createCooNote({ ...scope, text, source: spoke ? 'voice' : 'text' });
      setNote('');
      setSpoke(false);
      await load();
      onNoteAdded?.();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Group by day so the date is a header rather than repeating on every row.
  const byDay = events.reduce((acc, e) => {
    (acc[fmtDate(e.occurredAt)] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: SANS }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 2px 12px', minHeight: 0,
        ...(maxHeight ? { maxHeight } : {}),
      }}>
        {error && (
          <div style={{
            padding: '9px 12px', marginBottom: 12, borderRadius: 7,
            background: C.redS, color: C.red, fontSize: 12,
          }}>{error}</div>
        )}

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>
            Loading timeline…
          </div>
        )}

        {!loading && !events.length && !error && (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: C.ink3, fontSize: 12.5, lineHeight: 1.6 }}>
            Nothing recorded yet.{showComposer ? ' Add the first note below.' : ''}
          </div>
        )}

        {Object.entries(byDay).map(([day, dayEvents]) => (
          <div key={day}>
            <div style={{
              fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.12em',
              color: C.ink3, padding: '14px 0 6px 30px',
            }}>{day}</div>

            {dayEvents.map((e, i) => {
              const meta   = EVENT_META[e.type] || FALLBACK;
              const col    = meta.c();
              const isLast = i === dayEvents.length - 1;
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                  {/* rail */}
                  <div style={{ width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                      // Hollow = inferred. A guess must never render like a fact.
                      background: e.inferred ? 'transparent' : col,
                      border: `2px solid ${col}`,
                      boxShadow: e.inferred ? 'none' : `0 0 0 3px ${col}1f`,
                    }} />
                    {!isLast && (
                      <div style={{
                        flex: 1, width: 0, minHeight: 16, margin: '3px 0',
                        borderLeft: `2px dotted ${C.cr3}`,
                      }} />
                    )}
                  </div>

                  {/* body */}
                  <div style={{ flex: 1, paddingBottom: 13, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink9, wordBreak: 'break-word' }}>
                        {e.title}
                      </span>
                      {e.inferred && (
                        <span style={{
                          fontFamily: MONO, fontSize: 8.5, padding: '1px 6px', borderRadius: 3,
                          background: C.yelS, color: C.yel, letterSpacing: '.06em',
                        }}>UNCONFIRMED</span>
                      )}
                    </div>

                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 3 }}>
                      {meta.icon} {meta.label} · {fmtTime(e.occurredAt)}
                      {e.source && e.source !== 'manual' ? ` · ${e.source}` : ''}
                    </div>

                    {e.detail && e.detail !== e.title && (
                      <div style={{
                        fontSize: 12, color: C.ink5, marginTop: 5,
                        whiteSpace: 'pre-wrap', lineHeight: 1.5, wordBreak: 'break-word',
                      }}>{e.detail}</div>
                    )}

                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" style={{
                        fontSize: 11.5, color: C.acc, textDecoration: 'none',
                        marginTop: 5, display: 'inline-block', fontFamily: MONO,
                      }}>View →</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showComposer && scope && (
        <div style={{ borderTop: `1px solid ${C.cr2}`, paddingTop: 10, flexShrink: 0 }}>
          <textarea
            value={note}
            onChange={ev => setNote(ev.target.value)}
            placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Add a note. Type it, or tap the mic.'}
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              fontFamily: SANS, fontSize: 13, padding: '8px 10px', borderRadius: 7,
              border: `1px solid ${recording ? C.red : C.cr3}`,
              background: recording ? C.redS : C.bg, color: C.ink9, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 7, marginTop: 7, alignItems: 'center' }}>
            <button
              onClick={recording ? stop : start}
              disabled={transcribing}
              title={recording ? 'Stop recording' : 'Record a note'}
              style={{
                width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.cr3}`,
                background: recording ? C.red : C.bg2,
                color: recording ? '#fff' : C.ink5,
                cursor: transcribing ? 'default' : 'pointer', fontSize: 13,
                opacity: transcribing ? 0.5 : 1, flexShrink: 0,
              }}
            >{recording ? '◼' : transcribing ? '⟳' : '◉'}</button>

            <button
              onClick={saveNote}
              disabled={!note.trim() || saving}
              style={{
                padding: '7px 14px', borderRadius: 7, border: 'none',
                background: C.acc, color: '#fff', fontFamily: MONO, fontSize: 10.5,
                letterSpacing: '.05em', fontWeight: 600,
                cursor: !note.trim() || saving ? 'default' : 'pointer',
                opacity: !note.trim() || saving ? 0.45 : 1,
              }}
            >{saving ? 'Saving…' : 'Add note'}</button>

            {note.trim() && !saving && (
              <button onClick={() => { setNote(''); setSpoke(false); }} style={{
                padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent',
                color: C.ink3, fontFamily: MONO, fontSize: 10.5, cursor: 'pointer',
              }}>Clear</button>
            )}

            {spoke && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
                transcript — edit before saving
              </span>
            )}
          </div>
          {voiceErr && <p style={{ fontSize: 11, color: C.red, margin: '6px 0 0' }}>{voiceErr}</p>}
        </div>
      )}
    </div>
  );
}

/** Compact heading used above an embedded timeline. */
export function TimelineHeading({ children }) {
  return (
    <h4 style={{
      fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9,
      margin: '0 0 8px',
    }}>{children}</h4>
  );
}
