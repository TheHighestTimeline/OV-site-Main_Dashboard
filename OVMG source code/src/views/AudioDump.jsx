import { useState, useEffect, useRef, useCallback } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Spinner, Modal } from '../components/UI.jsx';
import { transcribeAudio, parseVoice, createTask, updateTask, createContact, updateContact, createAudioLog, listAudioLogs, updateAudioLog } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ── Waveform (same pattern as MyDay) ─────────────────────────────────────────
function Waveform({ analyser, active }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!active || !analyser) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const cv = canvasRef.current;
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const cv  = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W   = cv.width;
    const H   = cv.height;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(buf);
      ctx.clearRect(0, 0, W, H);
      const bars = 44;
      const bw   = W / bars - 1;
      const step = Math.floor(buf.length / bars);
      for (let i = 0; i < bars; i++) {
        const val = buf[i * step] / 128 - 1;
        const bh  = Math.max(4, Math.abs(val) * H * 0.92);
        const x   = i * (bw + 1);
        const y   = (H - bh) / 2;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.35 + Math.abs(val) * 0.65;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active, analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={56}
      style={{ display: 'block', opacity: active ? 1 : 0.15, transition: 'opacity .3s' }}
    />
  );
}

// ── Format seconds as m:ss ────────────────────────────────────────────────────
function fmtDur(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_review: { bg: C.yelS, fg: C.yel, label: 'Pending review' },
    reviewed:       { bg: C.bluS, fg: C.blu, label: 'Reviewed'       },
    imported:       { bg: C.grnS, fg: C.grn, label: 'Imported'       },
  };
  const m = map[status] || { bg: C.grS, fg: C.ink5, label: status };
  return <Tag bg={m.bg} fg={m.fg}>{m.label}</Tag>;
}

// ── Proposed action card (shared review UI) ───────────────────────────────────
const TYPE_META = {
  newTask:       { label: 'New Task',       bg: C.grnS, fg: C.grn  },
  updateTask:    { label: 'Update Task',    bg: C.bluS, fg: C.blu  },
  newContact:    { label: 'New Contact',    bg: C.yelS, fg: C.yel  },
  updateContact: { label: 'Update Contact', bg: C.accS, fg: C.acc  },
  note:          { label: 'Note',           bg: C.grS,  fg: C.ink5 },
};

function ActionCard({ item, checked, onCheck, edits, onEdit, index }) {
  const meta        = TYPE_META[item._type] || TYPE_META.note;
  const [open, setOpen] = useState(false);
  const get = (field, def = '') => edits[`${index}_${field}`] !== undefined ? edits[`${index}_${field}`] : (item[field] ?? def);
  const set = (field, val)      => onEdit(`${index}_${field}`, val);

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.cr2}`, background: C.bg, overflow: 'hidden', opacity: checked ? 1 : 0.45, transition: 'opacity .15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px' }}>
        <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0, cursor: 'pointer' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <Tag bg={meta.bg} fg={meta.fg}>{meta.label}</Tag>
            {item.confidence != null && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>match {Math.round(item.confidence * 100)}%</span>
            )}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: C.ink9 }}>
            {item.taskTitle || item.contactName || item.task || item.title || '—'}
          </div>
          {item.note && <div style={{ fontSize: 12, color: C.ink5, fontStyle: 'italic', marginTop: 3 }}>"{item.note}"</div>}
        </div>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}>{open ? '▲' : '▼'}</button>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${C.cr2}`, padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9, background: C.bg2 }}>
          {(item._type === 'newTask' || item._type === 'updateTask') && (
            <>
              <ERow label="Task"     value={get('task',      item.task || item.taskTitle || '')} onChange={v => set('task', v)} />
              <ERow label="Status"   value={get('newStatus', item.newStatus || '')}              onChange={v => set('newStatus', v)} />
              <ERow label="Due date" value={get('dueDate',   item.dueDate || '')}                onChange={v => set('dueDate', v)} placeholder="YYYY-MM-DD" />
              <ERow label="Priority" value={get('priority',  item.priority || 'Medium')}         onChange={v => set('priority', v)} />
              <ERow label="Assignee" value={get('owner',     item.owner || '')}                  onChange={v => set('owner', v)} />
            </>
          )}
          {(item._type === 'newContact' || item._type === 'updateContact') && (
            <>
              <ERow label="Name"    value={get('name',    item.contactName || item.name || '')} onChange={v => set('name', v)} />
              <ERow label="Company" value={get('company', item.company || '')}                  onChange={v => set('company', v)} />
              <ERow label="Note"    value={get('note',    item.note || '')}                     onChange={v => set('note', v)} />
            </>
          )}
          {item._type === 'note' && (
            <>
              <ERow label="Title" value={get('title', item.title || '')} onChange={v => set('title', v)} />
              <ERow label="Body"  value={get('body',  item.body  || '')} onChange={v => set('body', v)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ERow({ label, value, onChange, placeholder = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '6px 10px', fontFamily: SANS, fontSize: 12, color: C.ink8, outline: 'none' }} />
    </div>
  );
}

// ── Flatten AI result ─────────────────────────────────────────────────────────
function flattenResult(result) {
  const items = [];
  (result.taskUpdates    || []).forEach(u => items.push({ ...u, _type: 'updateTask'    }));
  (result.newTasks       || []).forEach(t => items.push({ ...t, _type: 'newTask'       }));
  (result.newContacts    || []).forEach(c => items.push({ ...c, _type: 'newContact'    }));
  (result.contactUpdates || []).forEach(c => items.push({ ...c, _type: 'updateContact' }));
  (result.notes          || []).forEach(n => items.push({ ...n, _type: 'note'          }));
  return items;
}

// ── Review modal (admin: review a senior partner log) ─────────────────────────
function ReviewModal({ log, onClose, showToast, onRefresh }) {
  const [items,    setItems]    = useState([]);
  const [checked,  setChecked]  = useState({});
  const [edits,    setEdits]    = useState({});
  const [parsing,  setParsing]  = useState(false);
  const [applying, setApplying] = useState(false);
  const [transcript, setTranscript] = useState(log.transcript || '');
  const [summary,  setSummary]  = useState('');

  const runParse = async (text) => {
    setParsing(true);
    try {
      const res  = await parseVoice(text, { section: 'audio-dump' });
      const flat = flattenResult(res);
      setItems(flat);
      setChecked(Object.fromEntries(flat.map((_, i) => [i, true])));
      setEdits({});
      setSummary(res.summary || '');
    } catch (e) {
      showToast('Parse failed: ' + e.message);
    }
    setParsing(false);
  };

  useEffect(() => {
    if (transcript) runParse(transcript);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySelected = async () => {
    setApplying(true);
    let n = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        if (!checked[i]) continue;
        const item = items[i];
        const e    = k => edits[`${i}_${k}`];

        if (item._type === 'updateTask' && item.taskId) {
          await updateTask(item.taskId, { status: e('newStatus') || item.newStatus, updateNote: e('note') || item.note });
          n++;
        } else if (item._type === 'newTask') {
          await createTask({ task: e('task') || item.task || item.taskTitle || 'Untitled', owner: e('owner') || item.owner || '', priority: e('priority') || item.priority || 'Medium', status: e('newStatus') || 'Not Started', dueDate: e('dueDate') || item.dueDate || '' });
          n++;
        } else if (item._type === 'newContact') {
          await createContact({ name: e('name') || item.name || item.contactName || '', company: e('company') || item.company || '', notes: e('note') || item.note || '' });
          n++;
        } else if (item._type === 'updateContact' && item.contactId) {
          await updateContact(item.contactId, { notes: e('note') || item.note });
          n++;
        }
      }
      await updateAudioLog(log.id, { status: 'imported', review_notes: `${n} items imported` });
      showToast(`Imported ${n} item${n === 1 ? '' : 's'} ✓`);
      onRefresh();
      onClose();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
    setApplying(false);
  };

  const markReviewed = async () => {
    try {
      await updateAudioLog(log.id, { status: 'reviewed' });
      showToast('Marked as reviewed');
      onRefresh();
      onClose();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  };

  return (
    <Modal title="Review recording" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Meta */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={log.status} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{fmtR(log.created_at)}</span>
          {log.duration_s && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{fmtDur(log.duration_s)}</span>}
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink5 }}>{log.user_name || 'Unknown'}</span>
        </div>

        {/* Transcript */}
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase', color: C.ink5 }}>Transcript</span>
            <button onClick={() => runParse(transcript)} disabled={parsing} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.blu, background: 'none', border: 'none', cursor: 'pointer' }}>
              {parsing ? 'Parsing…' : 'Re-parse'}
            </button>
          </div>
          {transcript ? (
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={5}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '12px 14px', fontFamily: SANS, fontSize: 13, color: C.ink7, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          ) : (
            <p style={{ padding: '12px 14px', fontFamily: SANS, fontSize: 13, color: C.ink3, margin: 0 }}>No transcript available yet.</p>
          )}
        </div>

        {/* Summary */}
        {summary && (
          <div style={{ background: C.accS, border: '1px solid #ecd1bc', borderRadius: 8, padding: '11px 14px', fontFamily: SERIF, fontSize: 14, lineHeight: 1.5, color: C.ink8 }}>
            {summary}
          </div>
        )}

        {/* Actions */}
        {parsing && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner size={28} color={C.acc} /></div>
        )}
        {!parsing && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15, color: C.ink9 }}>Proposed actions</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setChecked(Object.fromEntries(items.map((_, i) => [i, true])))} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.blu, background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                <button onClick={() => setChecked({})} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
              </div>
            </div>
            {items.map((item, i) => (
              <ActionCard key={i} index={i} item={item} checked={!!checked[i]}
                onCheck={v => setChecked(c => ({ ...c, [i]: v }))}
                edits={edits} onEdit={(k, v) => setEdits(ed => ({ ...ed, [k]: v }))} />
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: `1px solid ${C.cr2}`, flexWrap: 'wrap' }}>
          <Btn v="gho" onClick={markReviewed} disabled={applying}>Mark reviewed</Btn>
          <Btn onClick={applySelected} disabled={applying || items.every((_, i) => !checked[i])}>
            {applying ? <><Spinner size={13} color="#fff" /> Importing…</> : `Import selected (${Object.values(checked).filter(Boolean).length})`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Review Queue (admin) ──────────────────────────────────────────────────────
function ReviewQueue({ showToast }) {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);

  const load = () => {
    setLoading(true);
    listAudioLogs({ kind: 'senior_partner', limit: 100 })
      .then(r => setLogs(r.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={32} color={C.acc} /></div>;

  if (logs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: C.ink3, fontFamily: SANS, fontSize: 14 }}>
      No recordings in queue.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map(log => (
        <div
          key={log.id}
          onClick={() => setSelected(log)}
          style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: '13px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, transition: 'border-color .15s' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={log.status} />
              <span style={{ fontFamily: SANS, fontSize: 13, color: C.ink7, fontWeight: 500 }}>{log.user_name || 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{fmtR(log.created_at)}</span>
              {log.duration_s && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{fmtDur(log.duration_s)}</span>}
              {log.transcript && <span style={{ fontFamily: SANS, fontSize: 12, color: C.ink5 }}>{log.transcript.slice(0, 60)}{log.transcript.length > 60 ? '…' : ''}</span>}
            </div>
          </div>
          <Btn v="gho" sx={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); setSelected(log); }}>Review</Btn>
        </div>
      ))}

      {selected && (
        <ReviewModal
          log={selected}
          onClose={() => setSelected(null)}
          showToast={showToast}
          onRefresh={load}
        />
      )}
    </div>
  );
}

// ── Record interface ──────────────────────────────────────────────────────────
function RecordView({ user, showToast }) {
  const [phase,    setPhase]   = useState('idle'); // idle | recording | processing | done
  const [analyser, setAnalyser] = useState(null);
  const [duration, setDuration] = useState(0);
  const [recTime,  setRecTime]  = useState(0);
  const [doneTs,   setDoneTs]   = useState(null);
  const [error,    setError]    = useState(null);

  const recRef    = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const ctxRef    = useRef(null);
  const timerRef  = useRef(null);

  // Tick timer while recording
  useEffect(() => {
    if (phase === 'recording') {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setRecTime(Math.round((Date.now() - start) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const startRecording = useCallback(async () => {
    if (phase !== 'idle') return;
    setError(null);
    setRecTime(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const anl = ctx.createAnalyser();
      anl.fftSize = 256;
      src.connect(anl);
      setAnalyser(anl);

      const mimes = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'];
      const mime  = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      chunksRef.current = [];

      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      recRef.current = rec;

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        ctx.close();
        setAnalyser(null);
        setPhase('processing');
        const dur = recTime;

        try {
          const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
          const b64  = await new Promise(res => {
            const r = new FileReader();
            r.onloadend = () => res(r.result.split(',')[1]);
            r.readAsDataURL(blob);
          });
          // Transcribe silently
          let transcript = '';
          try {
            const { transcript: tr } = await transcribeAudio(b64, mime || 'audio/webm');
            transcript = tr;
          } catch { /* transcription failure is non-fatal */ }

          // Save to audio_logs
          await createAudioLog({ kind: 'senior_partner', transcript, status: 'pending_review', audio_url: null });
          setDuration(dur);
          setDoneTs(new Date());
          setPhase('done');
        } catch (e) {
          setError('Could not save recording: ' + e.message);
          setPhase('idle');
        }
      };

      rec.start(250);
      setPhase('recording');
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Mic access denied. Allow microphone in browser settings.' : e.message);
      setPhase('idle');
    }
  }, [phase, recTime]);

  const stopRecording = useCallback(() => {
    if (recRef.current && recRef.current.state === 'recording') recRef.current.stop();
  }, []);

  const reset = () => {
    setPhase('idle');
    setRecTime(0);
    setDuration(0);
    setDoneTs(null);
    setError(null);
  };

  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '28px 0' }}>

      {/* Error */}
      {error && (
        <div style={{ background: C.redS, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, color: C.red, maxWidth: 400, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Dark record panel */}
      {phase !== 'done' && (
        <div style={{ background: C.chromeBg, borderRadius: 20, padding: '36px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 440 }}>
          <p style={{ fontFamily: SERIF, fontSize: 18, color: C.chromeFg, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            {isRecording ? 'Recording in progress…' : isProcessing ? 'Saving your recording…' : 'Tap to start recording. Nothing will be transcribed while you record.'}
          </p>

          {/* Waveform */}
          <Waveform analyser={analyser} active={isRecording} />

          {/* Timer */}
          {(isRecording || isProcessing) && (
            <div style={{ fontFamily: MONO, fontSize: 28, color: '#fff', letterSpacing: '.06em' }}>
              {fmtDur(recTime)}
            </div>
          )}

          {/* Big button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            style={{
              width: 110, height: 110, borderRadius: '50%',
              background: isRecording ? C.red : isProcessing ? C.ink5 : C.acc,
              border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 44, color: '#fff',
              boxShadow: isRecording ? `0 0 0 8px ${C.red}40, 0 12px 40px rgba(0,0,0,.5)` : '0 12px 40px rgba(0,0,0,.4)',
              transition: 'background .2s, box-shadow .2s',
            }}
          >
            {isProcessing ? <Spinner size={40} color="#fff" /> : isRecording ? '■' : '◉'}
          </button>

          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>
            {isRecording ? 'Recording — tap to stop' : isProcessing ? 'Saving…' : 'Tap to record'}
          </span>
        </div>
      )}

      {/* Done confirmation */}
      {phase === 'done' && (
        <div style={{ background: C.grnS, border: `1px solid ${C.grn}`, borderRadius: 16, padding: '30px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>✓</div>
          <p style={{ fontFamily: SERIF, fontSize: 20, color: C.grn, margin: 0 }}>Recording submitted for review</p>
          <div style={{ display: 'flex', gap: 14, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.grn }}>
            <span>Duration: {fmtDur(duration)}</span>
            {doneTs && <span>{doneTs.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          <Btn v="gho" onClick={reset} sx={{ marginTop: 4 }}>Record another</Btn>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AudioDump({ user, showToast }) {
  const isMobile = useIsMobile();
  const isAdmin  = !!(user?.isAdmin || user?.roles?.includes('admin') || user?.role === 'admin' || user?.email?.endsWith('@onevibemediagroup.com'));

  const [activeTab, setActiveTab] = useState('record'); // record | queue

  return (
    <div>
      <Eyebrow>Voice capture</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: '0 0 20px', color: C.ink9, lineHeight: 1 }}>
        Audio Log
      </h1>

      {/* Tab switcher — only shown to admins */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 0, background: C.bg2, borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content', border: `1px solid ${C.cr2}` }}>
          {['record', 'queue'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: SANS, fontWeight: 500, fontSize: 13,
                background: activeTab === tab ? C.ink9 : 'transparent',
                color:      activeTab === tab ? C.bg   : C.ink5,
                transition: 'all .15s',
              }}
            >
              {tab === 'record' ? 'Record' : 'Review Queue'}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'record' && <RecordView user={user} showToast={showToast} />}
      {activeTab === 'queue'  && <ReviewQueue showToast={showToast} />}
    </div>
  );
}
