import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO, RELATES, stBg, stFg, fmtR } from '../constants.js';
import { Tag, Btn, Inp, Sel, FR, VoiceMic, Spinner } from '../components/UI.jsx';
import {
  getNotes, createNote, updateNote, deleteNote, updateContact, parseVoice,
  getDocumentsForContact, createDocument, getTasks, createTask, updateTask,
  airtableRecordUrl,
} from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

const COMPANIES = ['OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify Artists', 'CarbonSponge', 'OVD', 'OVV'];

// ── Staleness helpers (mirror Contacts.jsx) ───────────────────────────────────
function daysSince(c) {
  if (c.daysSinceContact != null) return c.daysSinceContact;
  if (!c.last_contacted_at) return null;
  return Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000);
}
function StaleBadge({ c }) {
  const days = daysSince(c);
  if (days == null) return <span style={{ color: C.red, fontWeight: 600, fontSize: 12 }}>Never contacted ⚑</span>;
  const stale = days >= 30 ? 'red' : days >= 14 ? 'amber' : 'ok';
  const color = stale === 'red' ? C.red : stale === 'amber' ? C.yel : C.ink5;
  const label = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return (
    <span style={{ color, fontWeight: stale === 'ok' ? 400 : 600, fontSize: 12 }}>
      {fmtR(c.last_contacted_at)} · {label}{stale === 'red' && ' ⚑'}
    </span>
  );
}

const PRIORITY_COLORS = { High: C.red, Medium: C.yel, Low: C.ink5 };
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < new Date().setHours(0, 0, 0, 0);
}
function isDone(status) {
  return status === 'Done' || status === 'Complete' || status === 'Canceled';
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ padding: 16, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 12, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}
function SectionLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>{children}</div>
      {right}
    </div>
  );
}

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 14, lineHeight: 1.55, resize: 'vertical', outline: 'none',
};

export default function ContactProfile({ contact, contactTableId, onClose, showToast, reloadContacts }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('overview');
  const [c, setC] = useState(contact);

  // shared data
  const [notes, setNotes] = useState(null);
  const [tasks, setTasks] = useState(null);

  const loadNotes = useCallback(() => {
    getNotes(c.id).then(setNotes).catch(() => setNotes([]));
  }, [c.id]);
  const loadTasks = useCallback(() => {
    getTasks()
      .then(all => setTasks(all.filter(t => (t.contactIds || []).includes(c.id))))
      .catch(() => setTasks([]));
  }, [c.id]);

  useEffect(() => { loadNotes(); loadTasks(); }, [loadNotes, loadTasks]);

  // Esc closes
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const openTaskCount = useMemo(() => (tasks || []).filter(t => !isDone(t.status)).length, [tasks]);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'notes',    label: `Notes${notes ? ` (${notes.length})` : ''}` },
    { id: 'tasks',    label: `Tasks${tasks ? ` (${openTaskCount})` : ''}` },
    { id: 'ai',       label: '✦ AI' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 160, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', background: C.bg,
        borderRadius: isMobile ? 0 : 18,
        width: '100%', maxWidth: isMobile ? '100%' : 1080,
        height: isMobile ? '100vh' : '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,.45)',
      }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '16px 16px 0' : '22px 26px 0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 'none', fontSize: 26, color: C.ink3, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.acc, color: '#fff', fontWeight: 600, display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
              {(c.name || 'U')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 22 : 30, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1.05 }}>{c.name}</h2>
              <div style={{ fontSize: 13, color: C.ink5, marginTop: 3 }}>{[c.role, c.company].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {c.status && <Tag bg={stBg(c.status)} fg={stFg(c.status)}>{c.status}</Tag>}
              <StaleBadge c={c} />
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: `1px solid ${C.cr2}`, overflowX: 'auto' }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 14px', fontFamily: SANS, fontSize: 13, whiteSpace: 'nowrap',
                    color: active ? C.ink9 : C.ink3, fontWeight: active ? 600 : 400,
                    borderBottom: active ? `2px solid ${C.acc}` : '2px solid transparent', marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 26px 40px' }}>
          {tab === 'overview' && <OverviewTab c={c} setC={setC} contactTableId={contactTableId} showToast={showToast} reloadContacts={reloadContacts} onLogged={loadNotes} />}
          {tab === 'notes'    && <NotesTab c={c} notes={notes} reload={loadNotes} reloadTasks={loadTasks} setC={setC} showToast={showToast} reloadContacts={reloadContacts} />}
          {tab === 'tasks'    && <TasksTab c={c} tasks={tasks} reload={loadTasks} showToast={showToast} />}
          {tab === 'ai'       && <AiTab c={c} notes={notes} setC={setC} showToast={showToast} reloadContacts={reloadContacts} reloadTasks={loadTasks} />}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ c, setC, contactTableId, showToast, reloadContacts, onLogged }) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  const [docs, setDocs] = useState(null);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docSaving, setDocSaving] = useState(false);

  useEffect(() => { getDocumentsForContact(c.id).then(setDocs).catch(() => setDocs([])); }, [c.id]);

  const handleLog = async () => {
    setLogSaving(true);
    const now = new Date().toISOString();
    try {
      await updateContact(c.id, { last_contacted_at: now });
      setC(prev => ({ ...prev, last_contacted_at: now, daysSinceContact: 0 }));
      if (logText.trim()) {
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        await createNote({ contactId: c.id, title: `Contact log · ${today}`, body: logText.trim(), type: 'Contact Log' });
        onLogged && onLogged();
      }
      showToast('Contact logged ✓');
      setLogText(''); setLogOpen(false);
      reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
    setLogSaving(false);
  };

  const saveDoc = async () => {
    if (!docName.trim() || !docUrl.trim()) { showToast('Name and link are both required'); return; }
    setDocSaving(true);
    try {
      await createDocument({ name: docName.trim(), driveLink: docUrl.trim(), contactIds: [c.id] });
      showToast('Document linked ✓');
      setDocName(''); setDocUrl(''); setShowDocForm(false);
      getDocumentsForContact(c.id).then(setDocs).catch(() => {});
    } catch (e) { showToast('Failed: ' + e.message); }
    setDocSaving(false);
  };

  if (editing) return <EditForm c={c} onDone={updated => { if (updated) setC(prev => ({ ...prev, ...updated })); setEditing(false); reloadContacts && reloadContacts(); }} showToast={showToast} />;

  const fields = [
    ['Email', c.email], ['Phone', c.phone], ['Website', c.website],
    ['Type', c.type], ['Owner', c.owner], ['Source', c.source],
  ];

  return (
    <div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <a href={airtableRecordUrl(contactTableId, c.id)} target="_blank" rel="noopener noreferrer"
          style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, textDecoration: 'none' }}>⊞ Airtable ↗</a>
        <Btn v="acc" onClick={() => setLogOpen(v => !v)}>✓ Log contact</Btn>
        <Btn v="gho" onClick={() => setEditing(true)}>Edit</Btn>
      </div>

      {logOpen && (
        <Card style={{ background: C.accS, border: '1px solid #ecd1bc' }}>
          <SectionLabel>Log a contact interaction</SectionLabel>
          <textarea value={logText} onChange={e => setLogText(e.target.value)} rows={3} placeholder="Optional — what was discussed, next steps…" style={textareaStyle} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Btn v="gho" onClick={() => { setLogOpen(false); setLogText(''); }}>Cancel</Btn>
            <Btn onClick={handleLog} disabled={logSaving}>{logSaving ? 'Logging…' : 'Log contact'}</Btn>
          </div>
        </Card>
      )}

      {/* Details grid */}
      <Card>
        <SectionLabel>Details</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          {fields.map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 14, color: C.ink8, wordBreak: 'break-word' }}>{v || '—'}</div>
            </div>
          ))}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Last contacted</div>
            <div style={{ fontSize: 14 }}><StaleBadge c={c} /></div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Next action</div>
            <div style={{ fontSize: 14, color: isOverdue(c.nextActionDate) ? C.red : C.ink8 }}>
              {c.nextAction ? `${c.nextAction}${c.nextActionDate ? ' · ' + fmtR(c.nextActionDate) : ''}${isOverdue(c.nextActionDate) ? ' ⚑' : ''}` : '—'}
            </div>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 5 }}>Related to</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(c.relatesTo || []).length ? (c.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>) : <span style={{ fontSize: 13, color: C.ink3 }}>—</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Documents */}
      <Card>
        <SectionLabel right={<button onClick={() => setShowDocForm(v => !v)} style={{ background: 'none', border: `1px solid ${C.acc}`, borderRadius: 6, padding: '3px 9px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.acc, cursor: 'pointer' }}>{showDocForm ? 'Cancel' : '+ Link doc'}</button>}>Documents</SectionLabel>
        {showDocForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <Inp value={docName} onChange={e => setDocName(e.target.value)} placeholder="Name this document…" />
            <Inp value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn onClick={saveDoc} disabled={docSaving}>{docSaving ? 'Saving…' : 'Save link'}</Btn></div>
          </div>
        )}
        {docs == null ? <div style={{ fontSize: 12, color: C.ink3 }}>Loading…</div>
          : docs.length === 0 ? (!showDocForm && <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No documents linked yet.</div>)
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.map(d => (
                <a key={d.id} href={d.driveLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '8px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 13 }}>⎘</span>
                  <span style={{ fontSize: 13, color: C.ink8, fontFamily: SERIF }}>{d.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.ink3 }}>↗</span>
                </a>
              ))}
            </div>}
      </Card>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────
function EditForm({ c, onDone, showToast }) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({
    email: c.email || '', phone: c.phone || '', website: c.website || '',
    role: c.role || '', status: c.status || 'Active', type: c.type || 'External',
    relatesTo: Array.isArray(c.relatesTo) ? c.relatesTo : [],
    owner: c.owner || '', nextAction: c.nextAction || '', nextActionDate: c.nextActionDate || '', source: c.source || '',
  });
  const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const toggleRel = v => setF(p => ({ ...p, relatesTo: p.relatesTo.includes(v) ? p.relatesTo.filter(x => x !== v) : [...p.relatesTo, v] }));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await updateContact(c.id, f); showToast('Contact updated ✓'); onDone(f); }
    catch (e) { showToast('Failed: ' + e.message); setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Email"><Inp value={f.email} onChange={fld('email')} /></FR>
        <FR label="Phone"><Inp value={f.phone} onChange={fld('phone')} /></FR>
      </div>
      <FR label="Role / Title"><Inp value={f.role} onChange={fld('role')} /></FR>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Status"><Sel value={f.status} onChange={fld('status')}><option>Active</option><option>Benched</option><option>Unknown</option></Sel></FR>
        <FR label="Type"><Sel value={f.type} onChange={fld('type')}><option>External</option><option>Internal</option></Sel></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} /></FR>
        <FR label="Source"><Inp value={f.source} onChange={fld('source')} /></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <FR label="Next action"><Inp value={f.nextAction} onChange={fld('nextAction')} /></FR>
        <FR label="Next action date"><Inp type="date" value={f.nextActionDate} onChange={fld('nextActionDate')} /></FR>
      </div>
      <FR label="Companies (deal category)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COMPANIES.map(x => {
            const on = f.relatesTo.includes(x);
            return <button key={x} type="button" onClick={() => toggleRel(x)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5, border: `1px solid ${on ? C.ink9 : C.cr3}` }}>{x}</button>;
          })}
        </div>
      </FR>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <Btn v="gho" onClick={() => onDone(null)}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
      </div>
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────
function NotesTab({ c, notes, reload, reloadTasks, setC, showToast, reloadContacts }) {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceRaw, setVoiceRaw] = useState('');
  const [voiceParsed, setVoiceParsed] = useState(null);   // { summary,title,tasks[],nextAction,nextActionDate }
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [acceptTasks, setAcceptTasks] = useState({});     // idx -> bool
  const [applyNext, setApplyNext] = useState(true);
  const [editingNote, setEditingNote] = useState(null);

  const saveTyped = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      await createNote({ contactId: c.id, title: `Note · ${today}`, body: noteText.trim(), type: 'Note' });
      showToast('Note saved ✓'); setNoteText(''); reload();
    } catch (e) { showToast('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleTranscript = async text => {
    setVoiceRaw(text); setVoiceBusy(true);
    try {
      const res = await parseVoice(text, { section: 'contact-note', contactId: c.id, contactName: c.name });
      setVoiceParsed(res);
      const acc = {}; (res.tasks || []).forEach((_, i) => { acc[i] = true; });
      setAcceptTasks(acc);
      setApplyNext(!!res.nextAction);
    } catch {
      setVoiceParsed({ summary: '', title: 'Voice note', tasks: [], nextAction: null });
    }
    setVoiceBusy(false);
  };

  const commitVoice = async () => {
    setVoiceBusy(true);
    try {
      await createNote({ contactId: c.id, title: voiceParsed.title || 'Voice note', body: voiceRaw, summary: voiceParsed.summary || '', type: 'Voice Note' });
      const chosen = (voiceParsed.tasks || []).filter((_, i) => acceptTasks[i]);
      for (const t of chosen) {
        await createTask({ task: t.task, dueDate: t.dueDate || undefined, priority: t.priority || 'Medium', taskType: t.taskType || 'Task', status: 'Not Started', contactIds: [c.id] });
      }
      if (applyNext && voiceParsed.nextAction) {
        await updateContact(c.id, { nextAction: voiceParsed.nextAction, nextActionDate: voiceParsed.nextActionDate || '' });
        setC(prev => ({ ...prev, nextAction: voiceParsed.nextAction, nextActionDate: voiceParsed.nextActionDate || '' }));
      }
      showToast(`Voice note saved${chosen.length ? ` · ${chosen.length} task${chosen.length > 1 ? 's' : ''} created` : ''} ✓`);
      setVoiceMode(false); setVoiceParsed(null); setVoiceRaw('');
      reload(); reloadTasks(); reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
    setVoiceBusy(false);
  };

  const removeNote = async n => {
    if (!window.confirm('Delete this note?')) return;
    try { await deleteNote(n.id); showToast('Deleted'); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };
  const saveEdit = async () => {
    try { await updateNote(editingNote.id, { title: editingNote.title, body: editingNote.body }); showToast('Saved ✓'); setEditingNote(null); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };

  return (
    <div>
      {/* Composer */}
      <Card>
        <SectionLabel right={<Btn v="gho" onClick={() => { setVoiceMode(v => !v); setVoiceParsed(null); setVoiceRaw(''); }}>◉ {voiceMode ? 'Close voice' : 'Voice note'}</Btn>}>Add a note</SectionLabel>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="Type a note… (⌘/Ctrl+Enter to save)"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveTyped(); } }} style={textareaStyle} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn onClick={saveTyped} disabled={saving || !noteText.trim()}>{saving ? 'Saving…' : 'Save note'}</Btn>
        </div>

        {voiceMode && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.cr2}` }}>
            {!voiceParsed && <VoiceMic label="Tap to record — I'll pull out tasks" size={64} onTranscript={handleTranscript} />}
            {voiceBusy && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 12, justifyContent: 'center', padding: 8 }}><Spinner size={16} /> Understanding…</div>}
            {voiceParsed && !voiceBusy && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' }}>Transcript</div>
                <p style={{ fontSize: 13, color: C.ink7, margin: '0 0 12px', lineHeight: 1.5 }}>{voiceRaw}</p>

                {(voiceParsed.tasks || []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 6, textTransform: 'uppercase' }}>Follow-ups detected — uncheck to skip</div>
                    {voiceParsed.tasks.map((t, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!acceptTasks[i]} onChange={e => setAcceptTasks(p => ({ ...p, [i]: e.target.checked }))} style={{ marginTop: 3 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, color: C.ink9 }}>{t.task}</span>
                          <span style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <Tag bg="transparent" fg={t.taskType === 'Reminder' ? C.yel : C.ink5}>{t.taskType || 'Task'}</Tag>
                            {t.dueDate && <Tag bg="transparent" fg={C.ink5}>{fmtR(t.dueDate)}</Tag>}
                            {t.priority && <Tag bg="transparent" fg={PRIORITY_COLORS[t.priority] || C.ink5}>{t.priority}</Tag>}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {voiceParsed.nextAction && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: C.ink7 }}>
                    <input type="checkbox" checked={applyNext} onChange={e => setApplyNext(e.target.checked)} />
                    Set next action: <b style={{ color: C.ink9 }}>{voiceParsed.nextAction}</b>{voiceParsed.nextActionDate ? ` (${fmtR(voiceParsed.nextActionDate)})` : ''}
                  </label>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn v="gho" onClick={() => { setVoiceParsed(null); setVoiceRaw(''); }}>Re-record</Btn>
                  <Btn onClick={commitVoice} disabled={voiceBusy}>Save note{(voiceParsed.tasks || []).some((_, i) => acceptTasks[i]) ? ' + tasks' : ''}</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Notes list */}
      {notes == null ? <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading notes…</div>
        : notes.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>No notes yet.</div>
        : notes.map(n => (
          <div key={n.id} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`, borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
            {editingNote?.id === n.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Inp value={editingNote.title} onChange={e => setEditingNote(p => ({ ...p, title: e.target.value }))} />
                <textarea value={editingNote.body} onChange={e => setEditingNote(p => ({ ...p, body: e.target.value }))} rows={4} style={textareaStyle} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn v="gho" onClick={() => setEditingNote(null)}>Cancel</Btn>
                  <Btn onClick={saveEdit}>Save</Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15 }}>{n.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, whiteSpace: 'nowrap' }}>{n.type} · <b style={{ color: C.ink5 }}>{fmtR(n.createdTime)}</b></span>
                </div>
                {n.summary && <div style={{ fontStyle: 'italic', color: C.ink5, fontSize: 12, marginBottom: 5 }}>{n.summary}</div>}
                <div style={{ fontSize: 14, color: C.ink7, lineHeight: 1.55, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingNote({ id: n.id, title: n.title, body: n.body })} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>Edit</button>
                  <button onClick={() => removeNote(n)} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────
function TasksTab({ c, tasks, reload, showToast }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ task: '', dueDate: '', priority: 'Medium', taskType: 'Task' });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!f.task.trim()) { showToast('Task description required'); return; }
    setSaving(true);
    try {
      await createTask({ task: f.task.trim(), dueDate: f.dueDate || undefined, priority: f.priority, taskType: f.taskType, status: 'Not Started', contactIds: [c.id] });
      showToast('Task created ✓');
      setF({ task: '', dueDate: '', priority: 'Medium', taskType: 'Task' }); setShowForm(false); reload();
    } catch (e) { showToast('Failed: ' + e.message); }
    setSaving(false);
  };
  const complete = async t => {
    try { await updateTask(t.id, { status: 'Done' }); showToast('Marked done ✓'); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };
  const reopen = async t => {
    try { await updateTask(t.id, { status: 'Not Started' }); reload(); }
    catch (e) { showToast('Failed: ' + e.message); }
  };

  const open = (tasks || []).filter(t => !isDone(t.status));
  const done = (tasks || []).filter(t => isDone(t.status));

  const Row = ({ t }) => {
    const overdue = isOverdue(t.dueDate) && !isDone(t.status);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', background: C.bg2, border: `1px solid ${overdue ? C.red : C.cr2}`, borderRadius: 9, marginBottom: 8 }}>
        <button onClick={() => isDone(t.status) ? reopen(t) : complete(t)} title={isDone(t.status) ? 'Reopen' : 'Mark done'}
          style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isDone(t.status) ? C.acc : C.cr3}`, background: isDone(t.status) ? C.acc : 'transparent', color: '#fff', cursor: 'pointer', flexShrink: 0, marginTop: 1, fontSize: 11, lineHeight: 1 }}>{isDone(t.status) ? '✓' : ''}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.ink9, textDecoration: isDone(t.status) ? 'line-through' : 'none', opacity: isDone(t.status) ? 0.6 : 1 }}>{t.task}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <Tag bg="transparent" fg={t.taskType === 'Reminder' ? C.yel : C.ink5}>{t.taskType || 'Task'}</Tag>
            {t.dueDate && <Tag bg="transparent" fg={overdue ? C.red : C.ink5}>{fmtR(t.dueDate)}{overdue ? ' ⚑' : ''}</Tag>}
            {t.priority && <Tag bg="transparent" fg={PRIORITY_COLORS[t.priority] || C.ink5}>{t.priority}</Tag>}
            {t.status && !isDone(t.status) && t.status !== 'Not Started' && <Tag bg="transparent" fg={C.ink5}>{t.status}</Tag>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New task'}</Btn>
      </div>
      {showForm && (
        <Card>
          <FR label="Task"><Inp value={f.task} onChange={e => setF(p => ({ ...p, task: e.target.value }))} placeholder="What needs to happen…" /></FR>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <FR label="Due date"><Inp type="date" value={f.dueDate} onChange={e => setF(p => ({ ...p, dueDate: e.target.value }))} /></FR>
            <FR label="Priority"><Sel value={f.priority} onChange={e => setF(p => ({ ...p, priority: e.target.value }))}><option>High</option><option>Medium</option><option>Low</option></Sel></FR>
            <FR label="Type"><Sel value={f.taskType} onChange={e => setF(p => ({ ...p, taskType: e.target.value }))}><option>Task</option><option>Reminder</option></Sel></FR>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Btn onClick={add} disabled={saving}>{saving ? 'Creating…' : 'Create task'}</Btn></div>
        </Card>
      )}

      {tasks == null ? <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading tasks…</div>
        : (tasks.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>No tasks for this contact yet.</div>
          : <>
              {open.length > 0 && <><div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, margin: '4px 0 8px' }}>Open ({open.length})</div>{open.map(t => <Row key={t.id} t={t} />)}</>}
              {done.length > 0 && <><div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, margin: '16px 0 8px' }}>Done ({done.length})</div>{done.map(t => <Row key={t.id} t={t} />)}</>}
            </>)}
    </div>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────
function AiTab({ c, notes, setC, showToast, reloadContacts, reloadTasks }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [channel, setChannel] = useState('email');
  const [draft, setDraft] = useState(null);
  const [drafting, setDrafting] = useState(false);

  const payload = () => JSON.stringify({
    contact: { name: c.name, role: c.role, company: c.company, status: c.status, type: c.type,
      lastContacted: c.last_contacted_at, daysSinceContact: daysSince(c), nextAction: c.nextAction, nextActionDate: c.nextActionDate, relatesTo: c.relatesTo },
    notes: (notes || []).slice(0, 12).map(n => ({ title: n.title, body: n.body, summary: n.summary, type: n.type, date: n.createdTime })),
  });

  const analyze = async () => {
    setAnalyzing(true);
    try { const res = await parseVoice(payload(), { section: 'contact-suggest', contactName: c.name }); setAnalysis(res); }
    catch (e) { showToast('AI failed: ' + e.message); }
    setAnalyzing(false);
  };
  const applyNext = async () => {
    if (!analysis?.nextAction) return;
    try {
      await updateContact(c.id, { nextAction: analysis.nextAction, nextActionDate: analysis.nextActionDate || '' });
      setC(prev => ({ ...prev, nextAction: analysis.nextAction, nextActionDate: analysis.nextActionDate || '' }));
      showToast('Next action set ✓'); reloadContacts && reloadContacts();
    } catch (e) { showToast('Failed: ' + e.message); }
  };
  const makeDraft = async () => {
    setDrafting(true); setDraft(null);
    try { const res = await parseVoice(payload(), { section: 'contact-draft', contactName: c.name, channel }); setDraft(res); }
    catch (e) { showToast('AI failed: ' + e.message); }
    setDrafting(false);
  };
  const copyDraft = () => {
    const text = (draft.subject && channel === 'email' ? `Subject: ${draft.subject}\n\n` : '') + (draft.message || '');
    navigator.clipboard?.writeText(text).then(() => showToast('Copied ✓')).catch(() => {});
  };

  return (
    <div>
      {/* Relationship analysis */}
      <Card>
        <SectionLabel right={<Btn onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing…' : (analysis ? 'Re-analyze' : '✦ Analyze')}</Btn>}>Relationship summary & next step</SectionLabel>
        {!analysis && !analyzing && <p style={{ fontSize: 13, color: C.ink5, margin: 0, lineHeight: 1.5 }}>Get an AI read on where this relationship stands and the best next move, based on notes and last contact.</p>}
        {analyzing && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 13 }}><Spinner size={16} /> Reading the history…</div>}
        {analysis && !analyzing && (
          <div>
            <p style={{ fontSize: 14, color: C.ink8, lineHeight: 1.6, margin: '0 0 14px' }}>{analysis.summary}</p>
            <div style={{ padding: '12px 14px', background: C.accS, border: '1px solid #ecd1bc', borderRadius: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.accD, marginBottom: 4 }}>Recommended next action</div>
              <div style={{ fontSize: 15, color: C.ink9, fontFamily: SERIF }}>{analysis.nextAction}{analysis.nextActionDate ? ` · ${fmtR(analysis.nextActionDate)}` : ''}</div>
              {analysis.reasoning && <div style={{ fontSize: 12, color: C.ink5, marginTop: 6, fontStyle: 'italic' }}>{analysis.reasoning}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Btn v="acc" onClick={applyNext}>Set as next action</Btn></div>
            </div>
          </div>
        )}
      </Card>

      {/* Draft message */}
      <Card>
        <SectionLabel right={
          <div style={{ display: 'flex', gap: 6 }}>
            {['email', 'text'].map(ch => (
              <button key={ch} onClick={() => setChannel(ch)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer', background: channel === ch ? C.ink9 : C.bg, color: channel === ch ? C.bg : C.ink5, border: `1px solid ${channel === ch ? C.ink9 : C.cr3}` }}>{ch === 'email' ? 'Email' : 'Text/DM'}</button>
            ))}
          </div>
        }>Draft a follow-up</SectionLabel>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: draft || drafting ? 12 : 0 }}>
          <Btn onClick={makeDraft} disabled={drafting}>{drafting ? 'Writing…' : (draft ? 'Regenerate' : '✦ Draft message')}</Btn>
        </div>
        {drafting && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink5, fontSize: 13 }}><Spinner size={16} /> Writing…</div>}
        {draft && !drafting && (
          <div style={{ padding: 14, background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
            {channel === 'email' && draft.subject && <div style={{ fontSize: 14, fontWeight: 600, color: C.ink9, marginBottom: 8 }}>Subject: {draft.subject}</div>}
            <div style={{ fontSize: 14, color: C.ink8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{draft.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Btn v="gho" onClick={copyDraft}>Copy</Btn></div>
          </div>
        )}
      </Card>
    </div>
  );
}
