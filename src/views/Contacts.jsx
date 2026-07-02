import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO, DB, RELATES, stBg, stFg, fmtR, notionUrl } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, VoiceMic } from '../components/UI.jsx';
import { getContacts, createContact, updateContact, getNotes, createNote, updateNote, deleteNote, parseVoice,
         getAirtableSchema, airtableRecordUrl, getDocumentsForContact, createDocument } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { companyNameMatchesSlug } from '../constants/roles.js';

const COMPANIES = ['All', 'OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify Artists', 'CarbonSponge', 'OVD', 'OVV'];
// Map chip label → slug so companyNameMatchesSlug handles abbreviation exact-match
const COMPANY_CHIP_SLUG = {
  OVMG: 'ovmg', OVM: 'ovm', OVTV: 'ovtv', OVF: 'ovf',
  'Amplify Artists': 'amplify', CarbonSponge: 'carbonsponge', OVD: 'ovd', OVV: 'ovv',
};
// Canonical display names to pre-fill on new contacts from a company page
const SLUG_TO_COMPANY_NAME = {
  ovmg: 'OVMG', ovm: 'OVM', ovtv: 'OVTV', ovf: 'OVF',
  amplify: 'Amplify Artists', carbonsponge: 'Carbon Sponge', ovd: 'OVD', ovv: 'OVV',
};

// Graduated "days since contact" badge — per COO Operating Manual Part 3:
// "'Never' is banned for Active relationships" / amber past 14 days, red
// past 30. daysSinceContact is computed server-side in contacts-list.js;
// this falls back to computing it client-side if that's missing.
function daysSince(c) {
  if (c.daysSinceContact != null) return c.daysSinceContact;
  if (!c.last_contacted_at) return null;
  return Math.floor((Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000);
}
function ContactBadge({ c, compact = false }) {
  const days = daysSince(c);
  if (days == null) {
    return <span style={{ color: C.red, fontWeight: 600, fontSize: compact ? 11 : 13 }}>Never ⚑</span>;
  }
  const stale = days >= 30 ? 'red' : days >= 14 ? 'amber' : 'ok';
  const color = stale === 'red' ? C.red : stale === 'amber' ? C.yel : C.ink5;
  const label = days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return (
    <span style={{ color, fontWeight: stale === 'ok' ? 400 : 600, fontSize: compact ? 11 : 13, whiteSpace: 'nowrap' }}>
      {fmtR(c.last_contacted_at)} {stale !== 'ok' && `· ${label}`}{stale === 'red' && ' ⚑'}
    </span>
  );
}

export default function Contacts({ user, showToast, openOv, closeOv, companyFilter = null }) {
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState([]);
  const [notes,    setNotes]    = useState({});
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [cfSt,     setCfSt]     = useState('All');
  const [cfTy,     setCfTy]     = useState('All');
  const [cfRe,     setCfRe]     = useState('All');
  const [cfCo,     setCfCo]     = useState('All');
  const [sortCol,  setSortCol]  = useState('name');  // column key
  const [sortDir,  setSortDir]  = useState('asc');   // 'asc' | 'desc'

  const loadContacts = useCallback(() =>
    getContacts()
      .then(setContacts)
      .catch(e => showToast('Could not load contacts: ' + e.message))
      .finally(() => setLoading(false)),
  [showToast]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Airtable table ID for "Open in Airtable" deep-links
  const [contactTableId, setContactTableId] = useState(null);
  useEffect(() => {
    getAirtableSchema().then(({ tables }) => {
      const t = tables.find(t => t.name === 'CRM Contacts' || t.name === 'Contacts');
      if (t) setContactTableId(t.id);
    }).catch(() => {});
  }, []);

  const loadNotes = cid =>
    getNotes(cid)
      .then(ns => setNotes(prev => ({ ...prev, [cid]: ns })))
      .catch(() => {});

  const toggleSort = col => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const filtered = contacts.filter(c => {
    // §6: lock the per-company Contacts view to that company's contacts.
    if (companyFilter && !(companyNameMatchesSlug(c.company, companyFilter)
        || (c.relatesTo || []).some(r => companyNameMatchesSlug(r, companyFilter)))) return false;
    if (cfSt !== 'All' && c.status !== cfSt) return false;
    if (cfTy !== 'All' && c.type   !== cfTy) return false;
    if (cfRe !== 'All' && !(c.relatesTo || []).includes(cfRe)) return false;
    if (cfCo !== 'All') {
      const slug = COMPANY_CHIP_SLUG[cfCo];
      const coMatch = slug
        ? companyNameMatchesSlug(c.company, slug) || (c.relatesTo || []).some(r => companyNameMatchesSlug(r, slug))
        : (c.company || '').toLowerCase() === cfCo.toLowerCase();
      if (!coMatch) return false;
    }
    if (search) {
      const hay = [c.name, c.company, c.email, c.role, c.phone, ...(c.relatesTo || [])].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'last_contacted') {
      const ta = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
      const tb = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
      cmp = ta - tb;
    } else if (sortCol === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '');
    } else if (sortCol === 'company') {
      cmp = (a.company || '').localeCompare(b.company || '');
    } else if (sortCol === 'role') {
      cmp = (a.role || '').localeCompare(b.role || '');
    } else if (sortCol === 'email') {
      cmp = (a.email || '').localeCompare(b.email || '');
    } else if (sortCol === 'status') {
      cmp = (a.status || '').localeCompare(b.status || '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const openDrawer = c => {
    loadNotes(c.id);
    openOv({
      kind: 'drawer', title: c.name,
      sub: [c.role, c.company].filter(Boolean).join(' · '),
      body: <ContactDetail c={c} />,
    });
  };

  // ── Contact detail drawer ───────────────────────────────────────────────────
  function ContactDetail({ c }) {
    const [editing,     setEditing]     = useState(false);
    const [cNotes,      setCNotes]      = useState(notes[c.id] || []);
    const [notesLoading,setNotesLoading]= useState(!notes[c.id]);
    const [noteText,    setNoteText]    = useState('');
    const [savingNote,  setSavingNote]  = useState(false);
    const [editingNote, setEditingNote] = useState(null); // { id, title, body }
    const [voiceMode,   setVoiceMode]   = useState(false);
    const [voiceResult, setVoiceResult] = useState(null);

    // Load notes if not cached
    useEffect(() => {
      if (!notes[c.id]) {
        getNotes(c.id)
          .then(ns => { setCNotes(ns); setNotes(prev => ({ ...prev, [c.id]: ns })); })
          .catch(() => {})
          .finally(() => setNotesLoading(false));
      } else {
        setCNotes(notes[c.id]);
        setNotesLoading(false);
      }
    }, [c.id]);

    const refreshNotes = async () => {
      const ns = await getNotes(c.id).catch(() => cNotes);
      setCNotes(ns);
      setNotes(prev => ({ ...prev, [c.id]: ns }));
    };

    // Typed note
    const saveTypedNote = async () => {
      if (!noteText.trim()) return;
      setSavingNote(true);
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      try {
        await createNote({ contactId: c.id, title: `Note · ${today}`, body: noteText.trim(), type: 'Note' });
        showToast('Note saved ✓');
        setNoteText('');
        await refreshNotes();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setSavingNote(false);
    };

    // Voice note
    const handleVoiceNote = async text => {
      try {
        const res = await parseVoice(text, { section: 'contact-note', contactId: c.id, contactName: c.name });
        setVoiceResult({ title: res.summary || 'Voice note', body: text });
      } catch {
        setVoiceResult({ title: 'Voice note', body: text });
      }
    };

    const saveVoiceNote = async () => {
      if (!voiceResult) return;
      try {
        await createNote({ contactId: c.id, title: voiceResult.title, body: voiceResult.body, type: 'Voice Note' });
        showToast('Voice note saved ✓');
        setVoiceMode(false);
        setVoiceResult(null);
        await refreshNotes();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
    };

    // Delete note
    const handleDeleteNote = async (n) => {
      if (!window.confirm(`Delete this note?`)) return;
      try {
        await deleteNote(n.id);
        showToast('Deleted');
        setCNotes(prev => prev.filter(x => x.id !== n.id));
        setNotes(prev => ({ ...prev, [c.id]: (prev[c.id] || []).filter(x => x.id !== n.id) }));
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
    };

    // Edit note
    const handleSaveEditNote = async () => {
      if (!editingNote) return;
      try {
        await updateNote(editingNote.id, { title: editingNote.title, body: editingNote.body });
        showToast('Saved ✓');
        setEditingNote(null);
        await refreshNotes();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
    };

    const [logOpen,     setLogOpen]     = useState(false);
    const [logText,     setLogText]     = useState('');
    const [logSaving,   setLogSaving]   = useState(false);
    const [localC,      setLocalC]      = useState(c);

    // Documents linked to this contact — per-contact links, not just the
    // company-level Documents tab. Backed by the same Documents table.
    const [docs,        setDocs]        = useState([]);
    const [docsLoading, setDocsLoading] = useState(true);
    const [showDocForm, setShowDocForm] = useState(false);
    const [docName,     setDocName]     = useState('');
    const [docUrl,      setDocUrl]      = useState('');
    const [docSaving,   setDocSaving]   = useState(false);

    const loadDocs = useCallback(() => {
      setDocsLoading(true);
      getDocumentsForContact(localC.id)
        .then(setDocs)
        .catch(() => {})
        .finally(() => setDocsLoading(false));
    }, [localC.id]);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const saveDoc = async () => {
      if (!docName.trim() || !docUrl.trim()) { showToast('Name and link are both required'); return; }
      setDocSaving(true);
      try {
        await createDocument({ name: docName.trim(), driveLink: docUrl.trim(), contactIds: [localC.id] });
        showToast('Document linked ✓');
        setDocName(''); setDocUrl(''); setShowDocForm(false);
        await loadDocs();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setDocSaving(false);
    };

    const handleLogContact = async () => {
      setLogSaving(true);
      const now = new Date().toISOString();
      const noteBody = logText.trim();
      try {
        // Bump last_contacted_at via updateContact
        await updateContact(localC.id, { last_contacted_at: now });
        setLocalC(prev => ({ ...prev, last_contacted_at: now }));
        if (noteBody) {
          const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          await createNote({ contactId: localC.id, title: `Contact log · ${today}`, body: noteBody, type: 'Contact Log' });
          showToast('Contact logged ✓');
          setLogText('');
          await refreshNotes();
        } else {
          showToast('Contact logged ✓');
        }
        setLogOpen(false);
        loadContacts();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setLogSaving(false);
    };

    if (editing) return <CEditForm c={localC} onDone={() => { setEditing(false); loadContacts(); }} />;

    return (
      <div>
        {/* Contact info + edit button */}
        <div style={{ padding: 14, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <a href={airtableRecordUrl(contactTableId, localC.id)} target="_blank" rel="noopener noreferrer"
              style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '4px 10px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, cursor: 'pointer', textDecoration: 'none' }}>
              ⊞ Airtable ↗
            </a>
            <button
              onClick={() => setLogOpen(v => !v)}
              style={{ background: 'none', border: `1px solid ${C.acc}`, borderRadius: 6, padding: '4px 10px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.acc, cursor: 'pointer', transition: 'all .15s' }}
              onMouseOver={e => { e.currentTarget.style.background = C.accS; }}
              onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
            >
              Log Contact
            </button>
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '4px 10px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, cursor: 'pointer', transition: 'all .15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.color = C.acc; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = C.cr3; e.currentTarget.style.color = C.ink3; }}
            >
              Edit
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 12 }}>
            {[['Email', localC.email], ['Phone', localC.phone], ['Website', localC.website], ['Status', localC.status], ['Type', localC.type], ['Owner', localC.owner], ['Source', localC.source]].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, color: C.ink8 }}>{v || '—'}</div>
              </div>
            ))}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Last contacted</div>
              <div style={{ fontSize: 13 }}><ContactBadge c={localC} /></div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Next action</div>
              <div style={{ fontSize: 13, color: C.ink8 }}>
                {localC.nextAction ? `${localC.nextAction}${localC.nextActionDate ? ' · ' + fmtR(localC.nextActionDate) : ''}` : '—'}
              </div>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 5 }}>Related to</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(localC.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>)}
              </div>
            </div>
          </div>
        </div>

        {/* Documents linked to this contact */}
        <div style={{ padding: 14, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: docsLoading || docs.length || showDocForm ? 10 : 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>Documents</div>
            <button
              onClick={() => setShowDocForm(v => !v)}
              style={{ background: 'none', border: `1px solid ${C.acc}`, borderRadius: 6, padding: '3px 9px', fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: C.acc, cursor: 'pointer' }}
            >
              {showDocForm ? 'Cancel' : '+ Link doc'}
            </button>
          </div>

          {showDocForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: docs.length ? 10 : 0 }}>
              <Inp value={docName} onChange={setDocName} placeholder="Name this document…" />
              <Inp value={docUrl} onChange={setDocUrl} placeholder="https://drive.google.com/…" />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={saveDoc} disabled={docSaving}>{docSaving ? 'Saving…' : 'Save link'}</Btn>
              </div>
            </div>
          )}

          {docsLoading ? (
            <div style={{ fontSize: 12, color: C.ink3 }}>Loading…</div>
          ) : docs.length === 0 ? (
            !showDocForm && <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No documents linked yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.map(d => (
                <a key={d.id} href={d.driveLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 7 }}>
                  <span style={{ fontSize: 13 }}>⎘</span>
                  <span style={{ fontSize: 13, color: C.ink8, fontFamily: SERIF }}>{d.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.ink3 }}>↗</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Log Contact form */}
        {logOpen && (
          <div style={{ background: C.accS, border: `1px solid #ecd1bc`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.accD, marginBottom: 8 }}>Log a contact interaction</div>
            <textarea
              value={logText}
              onChange={e => setLogText(e.target.value)}
              placeholder="Optional note — what was discussed, next steps…"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${C.cr3}`, borderRadius: 7, background: C.bg2, color: C.ink8, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn v="gho" onClick={() => { setLogOpen(false); setLogText(''); }}>Cancel</Btn>
              <Btn onClick={handleLogContact} disabled={logSaving}>
                {logSaving ? 'Logging…' : 'Log contact'}
              </Btn>
            </div>
          </div>
        )}

        {/* Notes header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, margin: 0 }}>Notes</h3>
          <Btn v="gho" onClick={() => setVoiceMode(v => !v)}>◉ {voiceMode ? 'Cancel' : 'Voice note'}</Btn>
        </div>

        {/* Typed note input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, padding: 12, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Type a note…"
            rows={3}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveTypedNote(); } }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: `1px solid ${C.cr3}`, borderRadius: 7, background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none', transition: 'border-color .15s' }}
            onFocus={e => { e.target.style.borderColor = C.acc; }}
            onBlur={e => { e.target.style.borderColor = C.cr3; }}
            disabled={savingNote}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={saveTypedNote} disabled={savingNote || !noteText.trim()}>
              {savingNote ? 'Saving…' : 'Save note'}
            </Btn>
          </div>
        </div>

        {/* Voice note recorder */}
        {voiceMode && (
          <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <VoiceMic label="Tap to record a note" size={60} onTranscript={handleVoiceNote} />
            {voiceResult && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' }}>Preview</div>
                <p style={{ fontSize: 13, color: C.ink7, margin: '0 0 10px', lineHeight: 1.5 }}>{voiceResult.body}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn v="gho" onClick={() => setVoiceResult(null)}>Re-record</Btn>
                  <Btn onClick={saveVoiceNote}>Save note</Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notes list */}
        {notesLoading ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>Loading notes…</div>
        ) : cNotes.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>No notes yet.</div>
        ) : (
          cNotes.map(n => (
            <div key={n.id} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`, borderRadius: 6, padding: '10px 14px', marginBottom: 10, position: 'relative' }}>
              {editingNote?.id === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Inp value={editingNote.title} onChange={e => setEditingNote(prev => ({ ...prev, title: e.target.value }))} placeholder="Note title" />
                  <textarea
                    value={editingNote.body}
                    onChange={e => setEditingNote(prev => ({ ...prev, body: e.target.value }))}
                    rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Btn v="gho" onClick={() => setEditingNote(null)}>Cancel</Btn>
                    <Btn onClick={handleSaveEditNote}>Save</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 14 }}>{n.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, whiteSpace: 'nowrap' }}>{n.type} · <b style={{ color: C.ink5 }}>{fmtR(n.createdTime)}</b></span>
                  </div>
                  {n.summary && <div style={{ fontStyle: 'italic', color: C.ink5, fontSize: 12, marginBottom: 5 }}>{n.summary}</div>}
                  <div style={{ fontSize: 13, color: C.ink7, lineHeight: 1.5, marginBottom: 8 }}>{n.body}</div>
                  {/* Hover actions */}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setEditingNote({ id: n.id, title: n.title, body: n.body })}
                      style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', transition: 'all .15s' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = C.acc; e.currentTarget.style.color = C.acc; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = C.cr3; e.currentTarget.style.color = C.ink3; }}
                    >Edit</button>
                    <button
                      onClick={() => handleDeleteNote(n)}
                      style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 9px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase', transition: 'all .15s' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = C.cr3; e.currentTarget.style.color = C.ink3; }}
                    >Delete</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // ── Contact edit form (within drawer) ──────────────────────────────────────
  function CEditForm({ c, onDone }) {
    const [f, setF] = useState({
      email: c.email || '', phone: c.phone || '', website: c.website || '',
      role: c.role || '', status: c.status || 'Active', type: c.type || 'External',
      relatesTo: Array.isArray(c.relatesTo) ? c.relatesTo : [],
      owner: c.owner || '', nextAction: c.nextAction || '', nextActionDate: c.nextActionDate || '',
      source: c.source || '',
    });
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const toggleRel = v => setF(p => ({ ...p, relatesTo: p.relatesTo.includes(v) ? p.relatesTo.filter(x => x !== v) : [...p.relatesTo, v] }));
    const [saving, setSaving] = useState(false);

    const save = async () => {
      setSaving(true);
      try {
        await updateContact(c.id, f);
        showToast('Contact updated ✓');
        onDone();
      } catch (e) {
        showToast('Failed: ' + e.message);
        setSaving(false);
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '10px 14px', background: C.bg2, borderRadius: 8, marginBottom: 4 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 16 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: C.ink3 }}>Editing contact info</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Email"><Inp value={f.email} onChange={fld('email')} placeholder="email@domain.com" /></FR>
          <FR label="Phone"><Inp value={f.phone} onChange={fld('phone')} placeholder="+1 555 000 0000" /></FR>
        </div>
        <FR label="Role / Title"><Inp value={f.role} onChange={fld('role')} placeholder="CEO, Advisor…" /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Status">
            <Sel value={f.status} onChange={fld('status')}>
              <option>Active</option><option>Benched</option><option>Unknown</option>
            </Sel>
          </FR>
          <FR label="Type">
            <Sel value={f.type} onChange={fld('type')}>
              <option>External</option><option>Internal</option>
            </Sel>
          </FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} placeholder="Who owns this relationship" /></FR>
          <FR label="Source"><Inp value={f.source} onChange={fld('source')} placeholder="How this contact came in" /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Next action"><Inp value={f.nextAction} onChange={fld('nextAction')} placeholder="What happens next" /></FR>
          <FR label="Next action date"><Inp type="date" value={f.nextActionDate} onChange={fld('nextActionDate')} /></FR>
        </div>
        {/* Companies — ties this contact to one or more deal categories.
            This is what surfaces the contact on a company page. */}
        <FR label="Companies (deal category)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COMPANIES.filter(x => x !== 'All').map(x => {
              const on = f.relatesTo.includes(x);
              return (
                <button key={x} type="button" onClick={() => toggleRel(x)}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer',
                    background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5, border: `1px solid ${on ? C.ink9 : C.cr3}` }}>
                  {x}
                </button>
              );
            })}
          </div>
        </FR>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <Btn v="gho" onClick={onDone}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </div>
      </div>
    );
  }

  // ── Voice / manual add forms ────────────────────────────────────────────────
  function VoiceAddForm({ onSave }) {
    const [step, setStep] = useState('record');
    const [prefill, setPrefill] = useState(null);
    const handleTranscript = async text => {
      try {
        const res = await parseVoice(text, { section: 'new-contact' });
        setPrefill(res.contact || { name: '', email: '', type: 'External', status: 'Active' });
      } catch {
        setPrefill({ name: '', email: '', type: 'External', status: 'Active' });
      }
      setStep('review');
    };
    if (step === 'record') return (
      <div>
        <p style={{ color: C.ink5, fontSize: 13, margin: '0 0 4px', lineHeight: 1.5 }}>
          Say who you're adding — name, company, role, email, how you met.
        </p>
        <VoiceMic label="Tap to start" size={72} onTranscript={handleTranscript} />
      </div>
    );
    return <CAddForm prefill={prefill} onSave={onSave} />;
  }

  function CAddForm({ prefill = {}, onSave }) {
    const [f, setF] = useState({ name: '', email: '', phone: '', company: '', role: '', website: '', type: 'External', status: 'Active', relatesTo: [], ...prefill });
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const toggleRel = v => setF(p => ({ ...p, relatesTo: p.relatesTo.includes(v) ? p.relatesTo.filter(x => x !== v) : [...p.relatesTo, v] }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Name *"><Inp value={f.name} onChange={fld('name')} placeholder="Full name" /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Email"><Inp value={f.email} onChange={fld('email')} /></FR>
          <FR label="Phone"><Inp value={f.phone} onChange={fld('phone')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Company"><Inp value={f.company} onChange={fld('company')} /></FR>
          <FR label="Role"><Inp value={f.role} onChange={fld('role')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Type"><Sel value={f.type} onChange={fld('type')}><option>External</option><option>Internal</option></Sel></FR>
          <FR label="Status"><Sel value={f.status} onChange={fld('status')}><option>Active</option><option>Benched</option><option>Unknown</option></Sel></FR>
        </div>
        <FR label="Companies (deal category)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COMPANIES.filter(x => x !== 'All').map(x => {
              const on = f.relatesTo.includes(x);
              return (
                <button key={x} type="button" onClick={() => toggleRel(x)}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: SANS, cursor: 'pointer',
                    background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5, border: `1px solid ${on ? C.ink9 : C.cr3}` }}>
                  {x}
                </button>
              );
            })}
          </div>
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={() => { if (!f.name.trim()) { showToast('Name is required'); return; } onSave(f); }}>Add contact</Btn>
        </div>
      </div>
    );
  }

  const addContact = async data => {
    try {
      await createContact(data);
      showToast(`Added ${data.name} to CRM ✓`);
      closeOv();
      loadContacts();
    } catch (e) {
      showToast('Failed to add contact: ' + e.message);
    }
  };

  const chip = (opts, cur, set) => (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {opts.map(o => (
        <button key={o} onClick={() => set(o)} style={{ background: o === cur ? C.ink9 : C.bg2, color: o === cur ? C.bg : C.ink5, border: `1px solid ${o === cur ? C.ink9 : C.cr3}`, borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: SANS }}>
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>CRM</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Contacts</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" sx={{ width: 180 }} />
          <Btn v="gho" onClick={() => openOv({ kind: 'modal', title: 'Voice add contact', body: <VoiceAddForm onSave={addContact} /> })}>◉ Voice</Btn>
          <Btn onClick={() => openOv({ kind: 'modal', title: 'New contact', body: <CAddForm onSave={addContact} prefill={companyFilter ? { relatesTo: [SLUG_TO_COMPANY_NAME[companyFilter] || companyFilter] } : {}} /> })}>+ New</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { l: 'Status',     o: ['All', 'Active', 'Benched', 'Unknown'], c: cfSt, s: setCfSt },
          { l: 'Type',       o: ['All', 'Internal', 'External'],         c: cfTy, s: setCfTy },
          { l: 'Relates to', o: ['All', ...RELATES],                     c: cfRe, s: setCfRe },
          { l: 'Company',    o: COMPANIES,                                c: cfCo, s: setCfCo },
        ].map(f => (
          <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>{f.l}</span>
            {chip(f.o, f.c, f.s)}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading contacts…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.ink3, background: C.bg2, borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: .3 }}>◉</div>
          <p style={{ margin: 0, fontSize: 13 }}>{search ? 'No contacts match your search.' : 'No contacts yet. Add your first contact above.'}</p>
        </div>
      ) : (
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr>
                {[
                  { label: 'Name',           col: 'name'           },
                  { label: 'Company',        col: 'company'        },
                  { label: 'Role',           col: 'role'           },
                  { label: 'Related to',     col: null             },
                  { label: 'Email',          col: 'email'          },
                  { label: 'Phone',          col: null             },
                  { label: 'Last contacted', col: 'last_contacted' },
                  { label: 'Status',         col: 'status'         },
                  { label: 'Type',           col: null             },
                ].map(({ label, col }) => {
                  const active = col && sortCol === col;
                  const arrow  = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : (col ? ' ▲▼' : '');
                  return (
                    <th
                      key={label}
                      onClick={col ? () => toggleSort(col) : undefined}
                      style={{
                        textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
                        textTransform: 'uppercase', color: active ? C.ink8 : C.ink3,
                        padding: '9px 14px', borderBottom: `1px solid ${C.cr2}`, whiteSpace: 'nowrap',
                        cursor: col ? 'pointer' : 'default', userSelect: 'none',
                      }}
                    >
                      {label}<span style={{ opacity: active ? 1 : 0.4 }}>{arrow}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                return (
                  <tr key={c.id} onClick={() => openDrawer(c)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.cr1}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>{c.name}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>
                      {(c.companyNames || []).length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{c.companyNames.map(n => <Tag key={n} bg={C.accS} fg={C.accD}>{n}</Tag>)}</div>
                        : (c.company || '—')}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 13, color: C.ink7 }}>{c.role || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{(c.relatesTo || []).map(r => <Tag key={r} bg="transparent" fg={C.ink5}>{r}</Tag>)}</div></td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{c.email || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{c.phone || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, whiteSpace: 'nowrap' }}>
                      <ContactBadge c={c} compact />
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>{c.status && <Tag bg={stBg(c.status)} fg={stFg(c.status)}>{c.status}</Tag>}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>{c.type && <Tag bg="transparent" fg={C.ink5}>{c.type}</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

