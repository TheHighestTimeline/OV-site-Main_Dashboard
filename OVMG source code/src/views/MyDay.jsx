import { useState, useEffect, useRef, useCallback } from 'react';
import { C, SERIF, SANS, MONO, prBg, prFg } from '../constants.js';
import { Tag, Eyebrow, Btn, Spinner } from '../components/UI.jsx';
import { getTasks, getContacts, parseVoice, updateTask, createTask, createContact, updateContact, transcribeAudio, createAudioLog } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ── Waveform canvas drawn from AnalyserNode data ──────────────────────────────
function Waveform({ analyser, active, color = C.acc }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!active || !analyser) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const cv = canvasRef.current;
      if (cv) {
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
      }
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
      const bars  = 40;
      const bw    = W / bars - 1;
      const step  = Math.floor(buf.length / bars);
      for (let i = 0; i < bars; i++) {
        const val   = buf[i * step] / 128 - 1; // -1..1
        const bh    = Math.max(3, Math.abs(val) * H * 0.9);
        const x     = i * (bw + 1);
        const y     = (H - bh) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4 + Math.abs(val) * 0.6;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active, analyser, color]);

  return (
    <canvas
      ref={canvasRef}
      width={260}
      height={48}
      style={{ display: 'block', opacity: active ? 1 : 0, transition: 'opacity .3s' }}
    />
  );
}

// ── Device picker ─────────────────────────────────────────────────────────────
const LS_DEV_KEY = 'myday_audio_device';

function DevicePicker({ deviceId, onChange }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(list => {
      setDevices(list.filter(d => d.kind === 'audioinput'));
    }).catch(() => {});
  }, []);

  if (devices.length < 2) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, whiteSpace: 'nowrap' }}>Mic</span>
      <select
        value={deviceId}
        onChange={e => onChange(e.target.value)}
        style={{ background: 'transparent', border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '4px 8px', fontFamily: SANS, fontSize: 11, color: C.ink5, cursor: 'pointer', flex: 1, maxWidth: 220 }}
      >
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>
        ))}
      </select>
    </div>
  );
}

// ── Big record button with waveform ───────────────────────────────────────────
function RecordBlock({ phase, onStartRecording, onStopRecording, analyser, deviceId, onDeviceChange, textValue, onTextChange, onSubmitText }) {
  const isRecording = phase === 'recording';
  const isProcessing = phase === 'transcribing' || phase === 'parsing';

  return (
    <div style={{ background: C.chromeBg, borderRadius: 16, padding: '28px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 20 }}>
      {/* Instruction */}
      <p style={{ fontFamily: SERIF, fontSize: 17, color: C.chromeFg, textAlign: 'center', lineHeight: 1.55, margin: 0, maxWidth: 360 }}>
        {isRecording ? 'Listening... tap to stop when done.' : isProcessing ? 'Processing your recording...' : "Tap the mic and walk me through your day. I'll match it against your tasks."}
      </p>

      {/* Waveform */}
      <Waveform analyser={analyser} active={isRecording} color={C.acc} />

      {/* Record button */}
      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        disabled={isProcessing}
        style={{
          width: 96, height: 96, borderRadius: '50%',
          background: isRecording ? C.red : isProcessing ? C.ink5 : C.acc,
          border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, color: '#fff',
          boxShadow: isRecording ? `0 0 0 6px ${C.red}40, 0 8px 32px rgba(0,0,0,.4)` : '0 8px 32px rgba(0,0,0,.3)',
          transition: 'all .2s',
        }}
      >
        {isProcessing ? <Spinner size={32} color="#fff" /> : isRecording ? '■' : '◉'}
      </button>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>
        {isRecording ? 'Recording — tap to stop' : isProcessing ? phase === 'transcribing' ? 'Transcribing...' : 'Parsing with AI...' : 'Tap to start'}
      </span>

      {/* Device picker */}
      <DevicePicker deviceId={deviceId} onChange={onDeviceChange} />

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 340 }}>
        <div style={{ flex: 1, height: 1, background: C.ink7 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink5, letterSpacing: '.1em' }}>OR TYPE</span>
        <div style={{ flex: 1, height: 1, background: C.ink7 }} />
      </div>

      {/* Text input */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <textarea
          value={textValue}
          onChange={e => onTextChange(e.target.value)}
          placeholder="Finished the deck for Elena. Need to call Sarah by Friday..."
          rows={3}
          disabled={isRecording || isProcessing}
          style={{
            width: '100%', background: C.chromeBg2, border: `1px solid ${C.ink5}`, borderRadius: 10,
            padding: '10px 13px', fontFamily: SANS, fontSize: 13, color: C.chromeFg,
            lineHeight: 1.55, resize: 'vertical', outline: 'none',
            opacity: (isRecording || isProcessing) ? 0.4 : 1,
            boxSizing: 'border-box',
          }}
        />
        {textValue.trim() && !isRecording && !isProcessing && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={onSubmitText}>Parse text</Btn>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-red {
          0%,100% { box-shadow: 0 0 0 6px rgba(176,58,58,.4), 0 8px 32px rgba(0,0,0,.4); }
          50%      { box-shadow: 0 0 0 14px rgba(176,58,58,0), 0 8px 32px rgba(0,0,0,.4); }
        }
      `}</style>
    </div>
  );
}

// ── Proposed action card ──────────────────────────────────────────────────────
const TYPE_META = {
  newTask:       { label: 'New Task',       bg: C.grnS,  fg: C.grn  },
  updateTask:    { label: 'Update Task',    bg: C.bluS,  fg: C.blu  },
  newContact:    { label: 'New Contact',    bg: C.yelS,  fg: C.yel  },
  updateContact: { label: 'Update Contact', bg: C.accS,  fg: C.acc  },
  note:          { label: 'Note',           bg: C.grS,   fg: C.ink5 },
};

function ActionCard({ item, checked, onCheck, edits, onEdit, index }) {
  const meta    = TYPE_META[item._type] || TYPE_META.note;
  const [open, setOpen] = useState(false);

  const get  = (field, def = '') => edits[`${index}_${field}`] !== undefined ? edits[`${index}_${field}`] : (item[field] ?? def);
  const set  = (field, val)      => onEdit(`${index}_${field}`, val);

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.cr2}`, background: C.bg, overflow: 'hidden', opacity: checked ? 1 : 0.45, transition: 'opacity .15s' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onCheck(e.target.checked)}
          style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <Tag bg={meta.bg} fg={meta.fg}>{meta.label}</Tag>
            {item.confidence != null && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>match {Math.round(item.confidence * 100)}%</span>
            )}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: C.ink9, lineHeight: 1.4 }}>
            {item.taskTitle || item.contactName || item.task || item.title || '—'}
          </div>
          {item.note && <div style={{ fontSize: 12, color: C.ink5, fontStyle: 'italic', marginTop: 3 }}>"{item.note}"</div>}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {/* Inline edit panel */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.cr2}`, padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9, background: C.bg2 }}>
          {(item._type === 'newTask' || item._type === 'updateTask') && (
            <>
              <EditRow label="Task" value={get('task', item.task || item.taskTitle || '')} onChange={v => set('task', v)} />
              <EditRow label="Status" value={get('newStatus', item.newStatus || '')} onChange={v => set('newStatus', v)} />
              <EditRow label="Due date" value={get('dueDate', item.dueDate || '')} onChange={v => set('dueDate', v)} placeholder="YYYY-MM-DD" />
              <EditRow label="Priority" value={get('priority', item.priority || 'Medium')} onChange={v => set('priority', v)} />
              <EditRow label="Assignee" value={get('owner', item.owner || '')} onChange={v => set('owner', v)} />
            </>
          )}
          {(item._type === 'newContact' || item._type === 'updateContact') && (
            <>
              <EditRow label="Name" value={get('name', item.contactName || item.name || '')} onChange={v => set('name', v)} />
              <EditRow label="Company" value={get('company', item.company || '')} onChange={v => set('company', v)} />
              <EditRow label="Note" value={get('note', item.note || '')} onChange={v => set('note', v)} />
            </>
          )}
          {item._type === 'note' && (
            <>
              <EditRow label="Title" value={get('title', item.title || '')} onChange={v => set('title', v)} />
              <EditRow label="Body" value={get('body', item.body || '')} onChange={v => set('body', v)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EditRow({ label, value, onChange, placeholder = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '6px 10px', fontFamily: SANS, fontSize: 12, color: C.ink8, outline: 'none' }}
      />
    </div>
  );
}

// ── Flatten AI result into a flat list of action items ────────────────────────
function flattenResult(result) {
  const items = [];
  (result.taskUpdates || []).forEach(u => items.push({ ...u, _type: 'updateTask' }));
  (result.newTasks    || []).forEach(t => items.push({ ...t, _type: 'newTask'    }));
  (result.newContacts || []).forEach(c => items.push({ ...c, _type: 'newContact' }));
  (result.contactUpdates || []).forEach(c => items.push({ ...c, _type: 'updateContact' }));
  (result.notes       || []).forEach(n => items.push({ ...n, _type: 'note'       }));
  return items;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MyDay({ user, showToast }) {
  const isMobile = useIsMobile();

  // Data
  const [tasks,    setTasks]    = useState([]);
  const [contacts, setContacts] = useState([]);

  // Phase: idle | recording | transcribing | parsing | reviewing | importing | done
  const [phase,    setPhase]    = useState('idle');

  // Voice state
  const [deviceId, setDeviceId]   = useState(() => localStorage.getItem(LS_DEV_KEY) || '');
  const [analyser, setAnalyser]   = useState(null);
  const recRef                    = useRef(null);
  const streamRef                 = useRef(null);
  const chunksRef                 = useRef([]);
  const audioCtxRef               = useRef(null);

  // Text input
  const [textInput, setTextInput] = useState('');

  // Review state
  const [transcript, setTranscript] = useState('');
  const [items,      setItems]      = useState([]);
  const [checked,    setChecked]    = useState({});
  const [edits,      setEdits]      = useState({});
  const [summary,    setSummary]    = useState('');
  const [error,      setError]      = useState(null);

  useEffect(() => {
    getTasks().then(setTasks).catch(() => {});
    getContacts().then(setContacts).catch(() => {});
  }, []);

  // ── Device selection ────────────────────────────────────────────────────────
  const handleDeviceChange = id => {
    setDeviceId(id);
    localStorage.setItem(LS_DEV_KEY, id);
  };

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (phase !== 'idle') return;
    setError(null);
    try {
      const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Web Audio AnalyserNode for waveform
      const ctx  = new AudioContext();
      audioCtxRef.current = ctx;
      const src  = ctx.createMediaStreamSource(stream);
      const anl  = ctx.createAnalyser();
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
        setPhase('transcribing');
        try {
          const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
          const b64  = await new Promise(res => {
            const r = new FileReader();
            r.onloadend = () => res(r.result.split(',')[1]);
            r.readAsDataURL(blob);
          });
          const { transcript: tr } = await transcribeAudio(b64, mime || 'audio/webm');
          await runParse(tr);
        } catch (e) {
          setError('Transcription failed: ' + e.message);
          setPhase('idle');
        }
      };

      rec.start(250);
      setPhase('recording');
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Mic access denied. Allow microphone in browser settings.' : e.message);
      setPhase('idle');
    }
  }, [phase, deviceId, tasks, contacts, user]);

  const stopRecording = useCallback(() => {
    if (recRef.current && recRef.current.state === 'recording') {
      recRef.current.stop();
    }
  }, []);

  // ── Parse (voice or text) ───────────────────────────────────────────────────
  const runParse = async (text) => {
    setTranscript(text);
    setPhase('parsing');
    try {
      const res = await parseVoice(text, {
        section:   'my-day',
        tasks:     tasks.filter(t => t.status !== 'Done'),
        contacts:  contacts.slice(0, 60),
        userName:  user.fullName,
      });
      const flat = flattenResult(res);
      const ck   = {};
      flat.forEach((_, i) => { ck[i] = true; });
      setItems(flat);
      setChecked(ck);
      setEdits({});
      setSummary(res.summary || '');
      setPhase('reviewing');

      // Persist to audio_logs
      createAudioLog({ kind: 'employee', transcript: text, status: 'reviewed' }).catch(() => {});
    } catch (e) {
      setError('AI parse failed: ' + e.message);
      setPhase('idle');
    }
  };

  const handleSubmitText = () => {
    if (!textInput.trim()) return;
    runParse(textInput.trim());
  };

  // ── Apply selected items ────────────────────────────────────────────────────
  const applySelected = async () => {
    setPhase('importing');
    let n = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        if (!checked[i]) continue;
        const item = items[i];
        const e    = k => edits[`${i}_${k}`];

        if (item._type === 'updateTask' && item.taskId) {
          await updateTask(item.taskId, {
            status:     e('newStatus') || item.newStatus,
            updateNote: e('note')      || item.note,
          });
          n++;
        } else if (item._type === 'newTask') {
          await createTask({
            task:     e('task')     || item.task     || item.taskTitle || 'Untitled',
            owner:    e('owner')    || item.owner    || user.fullName.split(' ')[0],
            priority: e('priority') || item.priority || 'Medium',
            status:   e('newStatus') || 'Not Started',
            dueDate:  e('dueDate')  || item.dueDate  || '',
          });
          n++;
        } else if (item._type === 'newContact') {
          await createContact({
            name:    e('name')    || item.name    || item.contactName || '',
            company: e('company') || item.company || '',
            notes:   e('note')    || item.note    || '',
          });
          n++;
        } else if (item._type === 'updateContact' && item.contactId) {
          await updateContact(item.contactId, {
            notes: e('note') || item.note,
          });
          n++;
        }
      }
      showToast(`Applied ${n} item${n === 1 ? '' : 's'} ✓`);
      setPhase('done');
      // Refresh
      getTasks().then(setTasks).catch(() => {});
      getContacts().then(setContacts).catch(() => {});
    } catch (e) {
      showToast('Failed to apply: ' + e.message);
      setPhase('reviewing');
    }
  };

  const resetToIdle = () => {
    setPhase('idle');
    setTranscript('');
    setTextInput('');
    setItems([]);
    setChecked({});
    setEdits({});
    setSummary('');
    setError(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <Eyebrow>End of day</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: '0 0 20px', color: C.ink9, lineHeight: 1 }}>
        My Day
      </h1>

      {error && (
        <div style={{ background: C.redS, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* ── Idle / recording / transcribing / parsing ── */}
      {(phase === 'idle' || phase === 'recording' || phase === 'transcribing' || phase === 'parsing') && (
        <RecordBlock
          phase={phase}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          analyser={analyser}
          deviceId={deviceId}
          onDeviceChange={handleDeviceChange}
          textValue={textInput}
          onTextChange={setTextInput}
          onSubmitText={handleSubmitText}
        />
      )}

      {/* ── Done confirmation ── */}
      {phase === 'done' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✓</div>
          <p style={{ fontFamily: SERIF, fontSize: 20, color: C.grn, marginBottom: 20 }}>All done! Items saved.</p>
          <Btn onClick={resetToIdle}>Record another update</Btn>
        </div>
      )}

      {/* ── Review screen ── */}
      {(phase === 'reviewing' || phase === 'importing') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Summary */}
          {summary && (
            <div style={{ background: C.accS, border: '1px solid #ecd1bc', borderRadius: 10, padding: '14px 18px', fontFamily: SERIF, fontSize: 16, lineHeight: 1.55, color: C.ink8 }}>
              {summary}
            </div>
          )}

          {/* Editable transcript */}
          <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.cr2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase', color: C.ink5 }}>Transcript</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>Editable</span>
            </div>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={4}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '12px 16px', fontFamily: SANS, fontSize: 13, color: C.ink7, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
              <Btn v="gho" sx={{ fontSize: 11 }} onClick={() => runParse(transcript)} disabled={phase === 'importing'}>Re-parse</Btn>
            </div>
          </div>

          {/* Proposed actions */}
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: C.ink3, fontFamily: SANS, fontSize: 13 }}>
              No actions detected. Try re-phrasing the transcript above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, color: C.ink9 }}>Proposed actions</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setChecked(Object.fromEntries(items.map((_, i) => [i, true])))} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.blu, background: 'none', border: 'none', cursor: 'pointer' }}>Select all</button>
                  <button onClick={() => setChecked({})} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
                </div>
              </div>
              {items.map((item, i) => (
                <ActionCard
                  key={i}
                  index={i}
                  item={item}
                  checked={!!checked[i]}
                  onCheck={v => setChecked(c => ({ ...c, [i]: v }))}
                  edits={edits}
                  onEdit={(k, v) => setEdits(ed => ({ ...ed, [k]: v }))}
                />
              ))}
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${C.cr2}`, gap: 10 }}>
            <Btn v="gho" onClick={resetToIdle} disabled={phase === 'importing'}>Discard all</Btn>
            <Btn
              onClick={applySelected}
              disabled={phase === 'importing' || Object.values(checked).every(v => !v)}
            >
              {phase === 'importing' ? <><Spinner size={14} color="#fff" /> Importing...</> : `Import selected (${Object.values(checked).filter(Boolean).length})`}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
