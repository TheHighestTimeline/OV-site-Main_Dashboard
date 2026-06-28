import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR } from '../components/UI.jsx';
import { listBookingPages, upsertBookingPage, deleteBookingPage } from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Booking — Phase 10 owner UI.
// Lists the user's booking pages with edit / delete / copy-link. Sub-view of
// the Calendar tab or its own tab depending on routing.
// ─────────────────────────────────────────────────────────────────────────────

const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Default availability: Mon–Fri, 9–11am and 2–4pm
const DEFAULT_AVAIL = [
  ...([1,2,3,4,5].map(dow => ({ dow, start: '09:00', end: '11:00' }))),
  ...([1,2,3,4,5].map(dow => ({ dow, start: '14:00', end: '16:00' }))),
].sort((a, b) => a.dow !== b.dow ? a.dow - b.dow : a.start.localeCompare(b.start));

export default function Booking({ user, showToast, openOv, closeOv }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const data = await listBookingPages(); setPages(data.pages || []); }
    catch (_e) { setPages([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEditor = (page = null) => openOv({
    kind: 'modal',
    title: page ? `Edit · ${page.label}` : 'New booking page',
    body: <Editor page={page} onSaved={() => { closeOv(); load(); }}
                  onClose={closeOv}
                  onDelete={page ? async () => {
                    if (!confirm(`Delete "${page.label}"?`)) return;
                    try { await deleteBookingPage(page.id); showToast?.('Deleted'); closeOv(); load(); }
                    catch (e) { showToast?.('Delete failed: ' + e.message); }
                  } : null}
                  showToast={showToast} />,
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const copyLink = (slug) => {
    const url = `${baseUrl}/book/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => showToast?.('Link copied ✓'),
      () => showToast?.('Copy failed — ' + url),
    );
  };

  return (
    <div>
      <Eyebrow>Schedule</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>Booking pages</h1>
          <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>
            Calendly-style public links. Share with anyone; they pick a slot, you get a Google Calendar event with a Meet link.
          </p>
        </div>
        <Btn v="acc" onClick={() => openEditor()}>+ New booking page</Btn>
      </div>

      {loading ? <div style={{ padding: 32, textAlign: 'center', color: C.ink3, fontSize: 13 }}>Loading…</div>
      : pages.length === 0 ? <EmptyState onCreate={() => openEditor()} />
      : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {pages.map(p => (
            <div key={p.id} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: C.ink9 }}>{p.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    /book/{p.slug}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 9, fontFamily: MONO,
                  letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 600,
                  background: p.active ? C.grnS : C.grS, color: p.active ? C.grn : C.ink5,
                }}>{p.active ? 'Active' : 'Paused'}</span>
              </div>
              {p.description && <p style={{ margin: '10px 0', fontSize: 13, color: C.ink5, lineHeight: 1.4 }}>{p.description}</p>}
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink5, marginTop: 6 }}>
                {p.duration_min}min · {p.with_meet ? 'Meet link' : 'no Meet'} · {(p.availability || []).length} slot rules
              </div>
              {/* Public URL */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '7px 10px', background: C.cr1, border: `1px solid ${C.cr2}`, borderRadius: 7 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {baseUrl}/book/{p.slug}
                </span>
                <button onClick={(e) => { e.stopPropagation(); copyLink(p.slug); }}
                  style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 8px', fontFamily: MONO, fontSize: 9, color: C.ink5, cursor: 'pointer', flexShrink: 0, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Copy
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Btn v="pri" onClick={() => copyLink(p.slug)} sx={{ flex: 1, justifyContent: 'center' }}>Copy link</Btn>
                <Btn v="gho" onClick={() => openEditor(p)}>Edit</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: C.ink3, fontSize: 13, background: C.bg2, borderRadius: 12, border: `1px dashed ${C.cr3}` }}>
      <div style={{ fontSize: 32, color: C.acc, marginBottom: 10 }}>◷</div>
      <div style={{ fontSize: 16, color: C.ink9, fontFamily: SERIF, fontWeight: 500, marginBottom: 8 }}>No booking pages yet</div>
      <div style={{ marginBottom: 18 }}>Create one to share a public booking URL.</div>
      <Btn v="acc" onClick={onCreate}>+ Create your first</Btn>
    </div>
  );
}

function Editor({ page, onSaved, onClose, onDelete, showToast }) {
  const [label, setLabel]             = useState(page?.label || '');
  const [description, setDescription] = useState(page?.description || '');
  const [durationMin, setDuration]    = useState(page?.duration_min || 30);
  const [bufferMin, setBuffer]        = useState(page?.buffer_min || 5);
  const [maxPerDay, setMaxPerDay]     = useState(page?.max_per_day || 8);
  const [minNoticeHrs, setMinNotice]  = useState(page?.min_notice_hours || 4);
  const [maxNoticeDays, setMaxNotice] = useState(page?.max_notice_days || 30);
  const [withMeet, setWithMeet]       = useState(page?.with_meet !== false);
  const [active, setActive]           = useState(page?.active !== false);
  const [availability, setAvail]      = useState(page?.availability?.length ? page.availability : DEFAULT_AVAIL);
  const [saving, setSaving]           = useState(false);

  // Toggle a day on/off: turning on adds one default slot; turning off removes all slots for that day
  const toggleDay = (dow) => {
    if (availability.some(a => a.dow === dow)) {
      setAvail(availability.filter(a => a.dow !== dow));
    } else {
      setAvail([...availability, { dow, start: '09:00', end: '17:00' }].sort((a, b) => a.dow !== b.dow ? a.dow - b.dow : a.start.localeCompare(b.start)));
    }
  };
  // Add another slot for the same day
  const addSlot = (dow) => {
    setAvail(prev => [...prev, { dow, start: '09:00', end: '17:00' }].sort((a, b) => a.dow !== b.dow ? a.dow - b.dow : a.start.localeCompare(b.start)));
  };
  // Remove one specific slot by index
  const removeSlot = (dow, idx) => {
    let count = 0;
    setAvail(prev => prev.filter(a => {
      if (a.dow !== dow) return true;
      return count++ !== idx;
    }));
  };
  const updateRange = (dow, idx, field, value) => {
    let count = 0;
    setAvail(prev => prev.map(a => {
      if (a.dow !== dow) return a;
      return count++ === idx ? { ...a, [field]: value } : a;
    }));
  };

  const save = async () => {
    if (!label.trim()) { showToast?.('Label required'); return; }
    // BOOK-1: ensure at least one day is selected
    if (availability.length === 0) {
      showToast?.('Pick at least one available day');
      return;
    }
    // BOOK-2: ensure end > start on every slot
    for (const rule of availability) {
      if (rule.start >= rule.end) {
        showToast?.(`${DOW_LABELS[rule.dow]}: ${rule.start}–${rule.end} — end must be after start`);
        return;
      }
    }
    setSaving(true);
    try {
      await upsertBookingPage({
        id: page?.id,
        label, description, with_meet: withMeet, active,
        duration_min: Number(durationMin),
        buffer_min:   Number(bufferMin),
        max_per_day:  Number(maxPerDay),
        min_notice_hours: Number(minNoticeHrs),
        max_notice_days:  Number(maxNoticeDays),
        availability,
      });
      onSaved();
    } catch (e) { showToast?.('Save failed: ' + e.message); setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FR label="Label *"><Inp value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Intro call (30 min)" /></FR>
      <FR label="Description"><Inp value={description} onChange={e => setDescription(e.target.value)} placeholder="What this call is for" /></FR>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <FR label="Duration (min)"><Inp type="number" value={durationMin} onChange={e => setDuration(e.target.value)} /></FR>
        <FR label="Buffer (min)"><Inp type="number" value={bufferMin} onChange={e => setBuffer(e.target.value)} /></FR>
        <FR label="Max / day"><Inp type="number" value={maxPerDay} onChange={e => setMaxPerDay(e.target.value)} /></FR>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FR label="Min notice (hours)"><Inp type="number" value={minNoticeHrs} onChange={e => setMinNotice(e.target.value)} /></FR>
        <FR label="Max notice (days)"><Inp type="number" value={maxNoticeDays} onChange={e => setMaxNotice(e.target.value)} /></FR>
      </div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink5, marginBottom: 8 }}>Availability</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {DOW_LABELS.map((label, dow) => {
            const enabled = availability.some(a => a.dow === dow);
            return (
              <button key={dow} onClick={() => toggleDay(dow)} style={{
                flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${enabled ? C.acc : C.cr3}`,
                background: enabled ? C.accS : 'transparent', color: enabled ? C.acc : C.ink5,
                fontFamily: MONO, fontSize: 10, cursor: 'pointer',
              }}>{label}</button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DOW_LABELS.map((label, dow) => {
            const slots = availability.filter(a => a.dow === dow);
            const enabled = slots.length > 0;
            if (!enabled) return null;
            return (
              <div key={dow} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, width: 36, paddingTop: 8, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  {slots.map((rule, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="time" value={rule.start} onChange={e => updateRange(dow, idx, 'start', e.target.value)} style={{ flex: 1, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '6px 8px', fontFamily: SANS, fontSize: 12 }} />
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>–</span>
                      <input type="time" value={rule.end}   onChange={e => updateRange(dow, idx, 'end',   e.target.value)} style={{ flex: 1, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '6px 8px', fontFamily: SANS, fontSize: 12 }} />
                      <button onClick={() => removeSlot(dow, idx)} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '4px 8px', fontFamily: MONO, fontSize: 11, color: C.red, cursor: 'pointer', flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => addSlot(dow)} style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 10px', fontFamily: MONO, fontSize: 9, color: C.ink3, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>+ Add slot</button>
                </div>
              </div>
            );
          }).filter(Boolean)}
          {availability.length === 0 && (
            <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic', padding: '4px 0' }}>No days selected above.</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
          <input type="checkbox" checked={withMeet} onChange={e => setWithMeet(e.target.checked)} style={{ accentColor: C.acc }} /> Auto-attach Google Meet to every booking
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
          <input type="checkbox" checked={active}   onChange={e => setActive(e.target.checked)}   style={{ accentColor: C.acc }} /> Active (uncheck to pause without deleting)
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <div>{onDelete && <Btn v="dan" onClick={onDelete}>Delete</Btn>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={onClose}>Cancel</Btn>
          <Btn v="acc" onClick={save} disabled={saving}>{saving ? 'Saving…' : (page ? 'Save' : 'Create')}</Btn>
        </div>
      </div>
    </div>
  );
}
