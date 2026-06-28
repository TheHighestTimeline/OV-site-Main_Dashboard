import { useState, useEffect, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, Modal, Spinner } from '../components/UI.jsx';
import { listCalendarEvents, createCalendarEvent, listTeamCalendarEvents } from '../api.js';
import Booking from './Booking.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Calendar — Phase 9 + Phase 1.2 enhancements.
//
// Month / Week / Day views. Sub-tabs: Calendar | Booking.
// ─────────────────────────────────────────────────────────────────────────────

// ── Date helpers ────────────────────────────────────────────────────────────
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0–23

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function startOfWeek(d)  {
  const s = new Date(d); s.setDate(d.getDate() - d.getDay()); s.setHours(0,0,0,0); return s;
}
function addDays(d, n)   { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}
function fmtDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtTimeInput(d) {
  return d.toTimeString().slice(0, 5);
}
function fmtShortDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Calendar({ user, showToast, openOv, closeOv }) {
  const [cursor, setCursor]   = useState(() => new Date());
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [activeAccount, setActiveAccount] = useState(null);
  const [calViewMode, setCalViewMode]     = useState('my');    // 'my' | 'team'
  const [calDisplay, setCalDisplay]       = useState('month'); // 'month' | 'week' | 'day'
  const [members, setMembers]   = useState([]);
  const [hiddenMembers, setHiddenMembers] = useState(new Set());
  const [subTab, setSubTab]     = useState('calendar'); // 'calendar' | 'booking'

  // User-editable quick links to specific Google Calendars — a one-tap way into
  // whatever calendar you need, and a fallback if the embedded calendar misbehaves.
  const QL_KEY = 'ovmg.calendar.quicklinks';
  const [quickLinks, setQuickLinks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QL_KEY) || '[]'); } catch { return []; }
  });
  const saveQuickLinks = (next) => {
    setQuickLinks(next);
    try { localStorage.setItem(QL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (subTab !== 'calendar') return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Determine range from display mode
    let timeMin, timeMax;
    if (calDisplay === 'month') {
      timeMin = startOfMonth(cursor);
      timeMax = endOfMonth(cursor);
    } else if (calDisplay === 'week') {
      timeMin = startOfWeek(cursor);
      timeMax = addDays(timeMin, 6);
      timeMax.setHours(23, 59, 59);
    } else {
      // day
      timeMin = new Date(cursor); timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(cursor); timeMax.setHours(23, 59, 59);
    }
    const params = { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };

    const fetcher = calViewMode === 'team' ? listTeamCalendarEvents : listCalendarEvents;
    fetcher(params).then(data => {
      if (cancelled) return;
      setEvents(data.events || []);
      setActiveAccount(data.activeAccount || null);
      if (data.members) setMembers(data.members);
    }).catch(e => {
      if (cancelled) return;
      setError(e.message || 'Failed to load calendar');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [cursor, calViewMode, calDisplay, subTab]);

  const toggleMember = (email) => {
    setHiddenMembers(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const visibleEvents = calViewMode === 'team'
    ? events.filter(ev => ev.isTeamEvent || !hiddenMembers.has(ev.ownerEmail))
    : events;

  // ── Month grid ────────────────────────────────────────────────────────────
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last  = endOfMonth(cursor);
    const cells = [];
    for (let i = first.getDay(); i > 0; i--) {
      const d = new Date(first); d.setDate(first.getDate() - i);
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= last.getDate(); day++) {
      cells.push({ date: new Date(first.getFullYear(), first.getMonth(), day), inMonth: true });
    }
    while (cells.length < 42) {
      const lastCell = cells[cells.length - 1].date;
      const d = new Date(lastCell); d.setDate(lastCell.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [cursor]);

  // ── Week days ─────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const sw = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(sw, i));
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of visibleEvents) {
      let d;
      if (ev.allDay && /^\d{4}-\d{2}-\d{2}$/.test(ev.start)) {
        const [y, m, day] = ev.start.split('-').map(Number);
        d = new Date(y, m - 1, day);
      } else {
        d = new Date(ev.start);
      }
      const key = fmtDateInput(d);
      (map[key] = map[key] || []).push(ev);
    }
    return map;
  }, [visibleEvents]);

  const today = new Date();

  const openEventDetail = (event) => {
    openOv({
      kind: 'modal',
      title: event.title,
      body: <EventDetail event={event} onClose={closeOv} />,
    });
  };

  const openNewEvent = (presetDate = null) => {
    openOv({
      kind: 'modal',
      title: 'New event',
      body: <NewEventForm
        presetDate={presetDate}
        activeAccount={activeAccount}
        onCreated={() => {
          closeOv();
          setCursor(new Date(cursor));
          showToast?.('Event created ✓');
        }}
        onClose={closeOv}
        showToast={showToast}
      />,
    });
  };

  // Navigation helpers per display mode
  const navPrev = () => {
    if (calDisplay === 'month') setCursor(addMonths(cursor, -1));
    else if (calDisplay === 'week') setCursor(addDays(cursor, -7));
    else setCursor(addDays(cursor, -1));
  };
  const navNext = () => {
    if (calDisplay === 'month') setCursor(addMonths(cursor, 1));
    else if (calDisplay === 'week') setCursor(addDays(cursor, 7));
    else setCursor(addDays(cursor, 1));
  };
  const navToday = () => setCursor(new Date());

  const headerLabel = () => {
    if (calDisplay === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (calDisplay === 'week') {
      const sw = startOfWeek(cursor);
      const ew = addDays(sw, 6);
      if (sw.getMonth() === ew.getMonth()) {
        return `${MONTHS[sw.getMonth()]} ${sw.getDate()}–${ew.getDate()}, ${sw.getFullYear()}`;
      }
      return `${MONTHS[sw.getMonth()]} ${sw.getDate()} – ${MONTHS[ew.getMonth()]} ${ew.getDate()}, ${sw.getFullYear()}`;
    }
    return fmtShortDate(cursor);
  };

  // Add/edit/remove the calendar quick links (label + URL each).
  function QuickLinksEditor() {
    const [draft, setDraft] = useState(quickLinks.length ? quickLinks : [{ label: '', url: '' }]);
    const set = (i, k, v) => setDraft(d => d.map((row, j) => j === i ? { ...row, [k]: v } : row));
    const inp = { background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 11px', fontFamily: SANS, fontSize: 13, color: C.ink9, width: '100%', boxSizing: 'border-box', outline: 'none' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>
          One-tap buttons to specific Google Calendars. Paste the calendar's URL (open the calendar in Google, copy the address bar).
        </p>
        {draft.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Inp value={row.label} onChange={e => set(i, 'label', e.target.value)} placeholder="Label (e.g. Team)" sx={{ flex: '0 0 130px' }} />
            <input value={row.url} onChange={e => set(i, 'url', e.target.value)} placeholder="https://calendar.google.com/…" style={{ ...inp, flex: 1 }} />
            <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
          </div>
        ))}
        <div>
          <Btn v="gho" onClick={() => setDraft(d => [...d, { label: '', url: '' }])}>+ Add another</Btn>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={() => { saveQuickLinks(draft.filter(r => r.label.trim() && r.url.trim())); closeOv(); showToast?.('Calendar links saved'); }}>Save links</Btn>
        </div>
      </div>
    );
  }

  const quickLinkBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
    borderRadius: 8, fontFamily: SANS, fontSize: 12, textDecoration: 'none',
    background: C.bg2, color: C.ink7, border: `1px solid ${C.cr3}`, whiteSpace: 'nowrap',
  };

  return (
    <div>
      <Eyebrow>Schedule</Eyebrow>

      {/* Sub-tab bar */}
      <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.cr3}`, marginBottom: 18 }}>
        {['calendar', 'booking'].map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            padding: '7px 18px', border: 'none', fontFamily: SANS, fontSize: 12, cursor: 'pointer',
            background: subTab === t ? C.ink9 : C.bg2, color: subTab === t ? C.bg : C.ink7,
            fontWeight: subTab === t ? 600 : 400,
            borderLeft: t === 'booking' ? `1px solid ${C.cr3}` : 'none',
            textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {subTab === 'booking' ? (
        <Booking user={user} showToast={showToast} openOv={openOv} closeOv={closeOv} />
      ) : (
        <>
          {/* Quick links — always-available jump-outs to Google Calendar, plus
              any custom calendar links you add. Works even if the embedded
              calendar can't load. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={quickLinkBtn}>
              ◷ Go to Google Calendar ↗
            </a>
            {quickLinks.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={quickLinkBtn}>
                {l.label} ↗
              </a>
            ))}
            <button
              onClick={() => openOv({ kind: 'modal', title: 'Calendar quick links', body: <QuickLinksEditor /> })}
              style={{ ...quickLinkBtn, background: 'transparent', cursor: 'pointer', color: C.ink5, borderStyle: 'dashed' }}>
              ✎ {quickLinks.length ? 'Edit links' : 'Add calendar link'}
            </button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 16,
          }}>
            <div>
              <h1 style={{
                fontFamily: SERIF, fontWeight: 500, fontSize: 38,
                letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1,
              }}>
                {headerLabel()}
              </h1>
              <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>
                {calViewMode === 'team'
                  ? `Showing all team members' calendars`
                  : activeAccount
                    ? <>Showing events from <span style={{ fontFamily: MONO, color: C.ink8 }}>{activeAccount.email}</span> + OVMG team calendar</>
                    : 'Connect a Google account to see events.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Display mode toggle */}
              <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.cr3}` }}>
                {['month', 'week', 'day'].map((m, i) => (
                  <button key={m} onClick={() => setCalDisplay(m)} style={{
                    padding: '7px 12px', border: 'none', fontFamily: SANS, fontSize: 12, cursor: 'pointer',
                    background: calDisplay === m ? C.ink9 : C.bg2, color: calDisplay === m ? C.bg : C.ink7,
                    fontWeight: calDisplay === m ? 600 : 400,
                    borderLeft: i > 0 ? `1px solid ${C.cr3}` : 'none',
                    textTransform: 'capitalize',
                  }}>{m}</button>
                ))}
              </div>
              {/* My / Team toggle */}
              <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.cr3}` }}>
                <button onClick={() => setCalViewMode('my')} style={{
                  padding: '7px 14px', border: 'none', fontSize: 12, fontFamily: SANS, cursor: 'pointer',
                  background: calViewMode === 'my' ? C.ink9 : C.bg2, color: calViewMode === 'my' ? C.bg : C.ink7,
                  fontWeight: calViewMode === 'my' ? 600 : 400,
                }}>My Calendar</button>
                <button onClick={() => setCalViewMode('team')} style={{
                  padding: '7px 14px', border: 'none', fontSize: 12, fontFamily: SANS, cursor: 'pointer',
                  background: calViewMode === 'team' ? C.ink9 : C.bg2, color: calViewMode === 'team' ? C.bg : C.ink7,
                  fontWeight: calViewMode === 'team' ? 600 : 400,
                  borderLeft: `1px solid ${C.cr3}`,
                }}>Team</button>
              </div>
              <Btn v="gho" onClick={navPrev}>‹ Prev</Btn>
              <Btn v="gho" onClick={navToday}>Today</Btn>
              <Btn v="gho" onClick={navNext}>Next ›</Btn>
              <Btn v="acc" onClick={() => openNewEvent()}>+ New event</Btn>
            </div>
          </div>

          {calViewMode === 'team' && members.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14,
              padding: '10px 14px', background: C.bg2, borderRadius: 8,
            }}>
              {members.map(m => {
                const hidden = hiddenMembers.has(m.email);
                return (
                  <button key={m.email} onClick={() => toggleMember(m.email)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 6, border: `1px solid ${m.color}40`,
                      background: hidden ? 'transparent' : m.color + '18',
                      opacity: hidden ? 0.4 : 1,
                      fontFamily: SANS, fontSize: 12, color: C.ink8,
                      cursor: 'pointer', transition: 'opacity 0.15s',
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: C.redS, color: C.red, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {calDisplay === 'month' && (
            <MonthGrid
              grid={grid}
              eventsByDay={eventsByDay}
              today={today}
              calViewMode={calViewMode}
              openNewEvent={openNewEvent}
              openEventDetail={openEventDetail}
            />
          )}
          {calDisplay === 'week' && (
            <WeekView
              weekDays={weekDays}
              eventsByDay={eventsByDay}
              today={today}
              calViewMode={calViewMode}
              openNewEvent={openNewEvent}
              openEventDetail={openEventDetail}
            />
          )}
          {calDisplay === 'day' && (
            <DayView
              date={cursor}
              events={eventsByDay[fmtDateInput(cursor)] || []}
              today={today}
              openNewEvent={openNewEvent}
              openEventDetail={openEventDetail}
            />
          )}

          {loading && (
            <div style={{ marginTop: 10, fontSize: 11, color: C.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={12} /> Loading events…
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Month grid ────────────────────────────────────────────────────────────────
function MonthGrid({ grid, eventsByDay, today, calViewMode, openNewEvent, openEventDetail }) {
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
        background: C.cr3, border: `1px solid ${C.cr3}`,
        borderRadius: '8px 8px 0 0', overflow: 'hidden',
      }}>
        {DOW.map(d => (
          <div key={d} style={{
            background: C.bg2, padding: '8px 10px',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.1em',
            textTransform: 'uppercase', color: C.ink5,
          }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
        background: C.cr3, border: `1px solid ${C.cr3}`, borderTop: 'none',
        borderRadius: '0 0 8px 8px', overflow: 'hidden', minHeight: 480,
      }}>
        {grid.map((cell, idx) => {
          const key = fmtDateInput(cell.date);
          const dayEvents = eventsByDay[key] || [];
          const isToday = sameDay(cell.date, today);
          return (
            <div key={idx} style={{
              background: cell.inMonth ? C.bg : C.bg2,
              padding: 6, minHeight: 80,
              opacity: cell.inMonth ? 1 : 0.45,
              cursor: cell.inMonth ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
            onClick={(e) => {
              if (e.target.closest('[data-event]')) return;
              if (cell.inMonth) openNewEvent(cell.date);
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{
                  fontFamily: MONO, fontSize: 11,
                  color: isToday ? C.bg : cell.inMonth ? C.ink8 : C.ink3,
                  fontWeight: isToday ? 700 : 500,
                  background: isToday ? C.acc : 'transparent',
                  borderRadius: 4, padding: isToday ? '1px 6px' : '1px 2px',
                  display: 'inline-block', minWidth: 16, textAlign: 'center',
                }}>
                  {cell.date.getDate()}
                </span>
                {dayEvents.length > 3 && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>+{dayEvents.length - 3}</span>
                )}
              </div>
              {dayEvents.slice(0, 3).map(ev => (
                <button key={ev.id + ev.calendarId} data-event="1"
                  onClick={(e) => { e.stopPropagation(); openEventDetail(ev); }}
                  style={{
                    background: ev.color + '22', borderLeft: `3px solid ${ev.color}`,
                    borderRadius: 3, padding: '2px 5px',
                    fontFamily: SANS, fontSize: 10, color: C.ink9,
                    textAlign: 'left', cursor: 'pointer', border: 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {!ev.allDay && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink5, flexShrink: 0 }}>
                      {fmtTime(ev.start)}
                    </span>
                  )}
                  {calViewMode === 'team' && ev.ownerName && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: ev.color, flexShrink: 0, fontWeight: 600 }}>
                      {ev.ownerName.split(' ')[0]}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────
function WeekView({ weekDays, eventsByDay, today, calViewMode, openNewEvent, openEventDetail }) {
  return (
    <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: `1px solid ${C.cr3}` }}>
        <div style={{ background: C.bg2, borderRight: `1px solid ${C.cr3}` }} />
        {weekDays.map(d => {
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} style={{
              background: C.bg2, padding: '8px 6px', textAlign: 'center',
              borderLeft: `1px solid ${C.cr3}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
                {DOW[d.getDay()]}
              </div>
              <div style={{
                fontFamily: SERIF, fontWeight: 500, fontSize: 18, marginTop: 2,
                color: isToday ? C.bg : C.ink9,
                background: isToday ? C.acc : 'transparent',
                borderRadius: isToday ? 6 : 0, padding: isToday ? '0 4px' : 0,
                display: 'inline-block',
              }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      {/* All-day row */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: `1px solid ${C.cr3}` }}>
        <div style={{ background: C.bg2, padding: '4px 4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderRight: `1px solid ${C.cr3}` }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em' }}>all day</span>
        </div>
        {weekDays.map(d => {
          const key = fmtDateInput(d);
          const allDayEvs = (eventsByDay[key] || []).filter(ev => ev.allDay);
          return (
            <div key={key} style={{ borderLeft: `1px solid ${C.cr3}`, padding: '3px 4px', minHeight: 26, background: C.bg }}>
              {allDayEvs.map(ev => (
                <button key={ev.id} data-event="1"
                  onClick={() => openEventDetail(ev)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: ev.color + '22', borderLeft: `3px solid ${ev.color}`,
                    borderRadius: 3, padding: '1px 4px', marginBottom: 2,
                    fontFamily: SANS, fontSize: 10, color: C.ink9, border: 'none', cursor: 'pointer',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {ev.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {/* Hourly rows */}
      <div style={{ overflowY: 'auto', maxHeight: 560 }}>
        {HOURS.map(h => (
          <div key={h} style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', minHeight: 48, borderBottom: `1px solid ${C.cr3}`, position: 'relative' }}>
            <div style={{
              background: C.bg2, padding: '2px 6px 0', textAlign: 'right',
              fontFamily: MONO, fontSize: 9, color: C.ink3, borderRight: `1px solid ${C.cr3}`,
            }}>
              {h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
            </div>
            {weekDays.map(d => {
              const key = fmtDateInput(d);
              const hourEvs = (eventsByDay[key] || []).filter(ev => {
                if (ev.allDay) return false;
                const evH = new Date(ev.start).getHours();
                return evH === h;
              });
              return (
                <div key={key}
                  onClick={() => {
                    const dt = new Date(d); dt.setHours(h, 0, 0, 0);
                    openNewEvent(dt);
                  }}
                  style={{ borderLeft: `1px solid ${C.cr3}`, padding: '2px 3px', background: C.bg, cursor: 'pointer', position: 'relative' }}>
                  {hourEvs.map(ev => (
                    <button key={ev.id} data-event="1"
                      onClick={(e) => { e.stopPropagation(); openEventDetail(ev); }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', width: '100%',
                        background: ev.color + '22', borderLeft: `3px solid ${ev.color}`,
                        borderRadius: 3, padding: '2px 5px', marginBottom: 2,
                        fontFamily: SANS, fontSize: 10, color: C.ink9, border: 'none', cursor: 'pointer',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gap: 4,
                      }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink5, flexShrink: 0 }}>{fmtTime(ev.start)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────
function DayView({ date, events, today, openNewEvent, openEventDetail }) {
  const isToday = sameDay(date, today);
  const allDayEvs = events.filter(ev => ev.allDay);
  const timedEvs  = events.filter(ev => !ev.allDay);

  return (
    <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: C.bg2, padding: '10px 16px', borderBottom: `1px solid ${C.cr3}` }}>
        <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, color: isToday ? C.acc : C.ink9 }}>
          {fmtShortDate(date)}
        </span>
        {allDayEvs.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {allDayEvs.map(ev => (
              <button key={ev.id} onClick={() => openEventDetail(ev)}
                style={{
                  background: ev.color + '22', borderLeft: `3px solid ${ev.color}`,
                  borderRadius: 3, padding: '2px 8px', fontFamily: SANS, fontSize: 11,
                  color: C.ink9, border: 'none', cursor: 'pointer',
                }}>
                {ev.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Hourly slots */}
      <div style={{ overflowY: 'auto', maxHeight: 600 }}>
        {HOURS.map(h => {
          const hourEvs = timedEvs.filter(ev => new Date(ev.start).getHours() === h);
          return (
            <div key={h}
              onClick={() => { const dt = new Date(date); dt.setHours(h, 0, 0, 0); openNewEvent(dt); }}
              style={{
                display: 'grid', gridTemplateColumns: '56px 1fr',
                minHeight: 52, borderBottom: `1px solid ${C.cr3}`, cursor: 'pointer',
                background: C.bg,
              }}>
              <div style={{
                background: C.bg2, padding: '4px 8px 0', textAlign: 'right',
                fontFamily: MONO, fontSize: 10, color: C.ink3, borderRight: `1px solid ${C.cr3}`,
              }}>
                {h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
              </div>
              <div style={{ padding: '3px 6px' }}>
                {hourEvs.map(ev => (
                  <button key={ev.id} data-event="1"
                    onClick={(e) => { e.stopPropagation(); openEventDetail(ev); }}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
                      background: ev.color + '22', borderLeft: `3px solid ${ev.color}`,
                      borderRadius: 4, padding: '4px 8px', marginBottom: 3,
                      fontFamily: SANS, fontSize: 12, color: C.ink9, border: 'none', cursor: 'pointer',
                    }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink5, flexShrink: 0 }}>
                      {fmtTime(ev.start)} – {fmtTime(ev.end)}
                    </span>
                    <span style={{ fontWeight: 500 }}>{ev.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function EventDetail({ event, onClose }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '12px 14px', background: event.color + '14',
        borderLeft: `3px solid ${event.color}`, borderRadius: 6,
      }}>
        <div style={{ fontSize: 12, color: C.ink5, fontFamily: MONO, letterSpacing: '.06em', marginBottom: 4 }}>
          {event.calendarLabel}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink8 }}>
          {event.allDay
            ? `All day · ${new Date(event.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
            : `${fmtTime(event.start)} – ${fmtTime(event.end)} · ${new Date(event.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        </div>
      </div>

      {event.location && <Field label="Location">{event.location}</Field>}

      {event.meetLink && (
        <Field label="Google Meet">
          <a href={event.meetLink} target="_blank" rel="noopener noreferrer"
            style={{ color: C.acc, fontFamily: MONO, fontSize: 12, textDecoration: 'none' }}>
            {event.meetLink}
          </a>
        </Field>
      )}

      {event.description && (
        <Field label="Description">
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: C.ink8 }}>{event.description}</div>
        </Field>
      )}

      {event.attendees?.length > 0 && (
        <Field label={`Attendees (${event.attendees.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {event.attendees.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: C.ink8, fontFamily: MONO }}>
                {a.email}
                {a.responseStatus && a.responseStatus !== 'needsAction' && (
                  <span style={{ marginLeft: 8, color: C.ink3, fontSize: 10, textTransform: 'uppercase' }}>
                    {a.responseStatus}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Field>
      )}

      <div style={{ padding: 10, background: C.bg2, borderRadius: 8, fontSize: 11, color: C.ink5, lineHeight: 1.5 }}>
        Editing events is not supported in the dashboard — this is intentional. To edit, open in Google Calendar.
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn v="gho" onClick={onClose}>Close</Btn>
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, background: C.ink9,
              color: C.bg, fontSize: 12, fontFamily: SANS, fontWeight: 500,
              textDecoration: 'none',
            }}>
            Open in Google Calendar ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
        textTransform: 'uppercase', color: C.ink3, marginBottom: 4,
      }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Event Form — enhanced with recurrence, reminders, color, all-day, conference
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_COLORS = [
  { label: 'Default', value: '#d96b3a' },
  { label: 'Tomato',  value: '#d93025' },
  { label: 'Flamingo',value: '#f6b26b' },
  { label: 'Tangerine', value: '#e67e22' },
  { label: 'Sage',    value: '#6aaa64' },
  { label: 'Basil',   value: '#2f7d5f' },
  { label: 'Peacock', value: '#2c5d8a' },
  { label: 'Blueberry', value: '#1a237e' },
  { label: 'Lavender', value: '#7c4dff' },
  { label: 'Grape',   value: '#8e24aa' },
  { label: 'Graphite', value: '#616161' },
];

const REMINDER_OPTIONS = [
  { v: 0,    l: 'At time of event' },
  { v: 5,    l: '5 min before' },
  { v: 10,   l: '10 min before' },
  { v: 15,   l: '15 min before' },
  { v: 30,   l: '30 min before' },
  { v: 60,   l: '1 hour before' },
  { v: 120,  l: '2 hours before' },
  { v: 1440, l: '1 day before' },
];

function NewEventForm({ presetDate, activeAccount, onCreated, onClose, showToast }) {
  const initialDate = presetDate ? new Date(presetDate) : new Date();
  initialDate.setMinutes(0, 0, 0);
  if (!presetDate || sameDay(initialDate, new Date())) {
    initialDate.setHours(new Date().getHours() + 1);
  } else {
    initialDate.setHours(9);
  }

  const [title,       setTitle]       = useState('');
  const [allDay,      setAllDay]      = useState(false);
  const [date,        setDate]        = useState(fmtDateInput(initialDate));
  const [startTime,   setStartTime]   = useState(fmtTimeInput(initialDate));
  const [duration,    setDuration]    = useState(30);
  const [description, setDescription] = useState('');
  const [location,    setLocation]    = useState('');
  const [attendees,   setAttendees]   = useState('');
  const [withMeet,    setWithMeet]    = useState(true);
  const [recurrence,  setRecurrence]  = useState('none');
  const [eventColor,  setEventColor]  = useState(EVENT_COLORS[0].value);
  const [reminders,   setReminders]   = useState([15, 60]); // minutes
  const [creating,    setCreating]    = useState(false);

  const addReminder = () => {
    setReminders(prev => [...prev, 15]);
  };
  const removeReminder = (idx) => {
    setReminders(prev => prev.filter((_, i) => i !== idx));
  };
  const updateReminder = (idx, val) => {
    setReminders(prev => prev.map((r, i) => i === idx ? Number(val) : r));
  };

  const submit = async () => {
    if (!title.trim()) { showToast?.('Title is required'); return; }
    setCreating(true);
    try {
      const [y, mo, d]   = date.split('-').map(Number);
      const [hh, mm]     = allDay ? [0, 0] : startTime.split(':').map(Number);
      const startDt      = new Date(y, mo - 1, d, hh, mm);
      const endDt        = allDay ? new Date(y, mo - 1, d, 23, 59) : new Date(startDt.getTime() + duration * 60_000);
      const attendeeList = attendees.split(',').map(s => s.trim()).filter(s => s.includes('@'));

      await createCalendarEvent({
        title:      title.trim(),
        start:      allDay ? date : startDt.toISOString(),
        end:        allDay ? date : endDt.toISOString(),
        allDay,
        description: description.trim() || undefined,
        location:   location.trim()    || undefined,
        attendees:  attendeeList,
        withMeet:   allDay ? false : withMeet,
        recurrence: recurrence !== 'none' ? recurrence : undefined,
        color:      eventColor,
        reminders,
      });
      onCreated();
    } catch (e) {
      showToast?.('Create failed: ' + e.message);
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FR label="Title *">
        <Inp value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Strategy call with Acme Coffee" />
      </FR>

      {/* All-day toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
        <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} style={{ accentColor: C.acc }} />
        All-day event
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: allDay ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
        <FR label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle()} />
        </FR>
        {!allDay && (
          <>
            <FR label="Start time">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle()} />
            </FR>
            <FR label="Duration">
              <select value={duration} onChange={e => setDuration(Number(e.target.value))} style={inputStyle()}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
              </select>
            </FR>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FR label="Recurrence">
          <select value={recurrence} onChange={e => setRecurrence(e.target.value)} style={inputStyle()}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </FR>
        <FR label="Event color">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
            {EVENT_COLORS.map(c => (
              <button key={c.value} title={c.label} onClick={() => setEventColor(c.value)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c.value, border: 'none',
                  cursor: 'pointer', outline: eventColor === c.value ? `2px solid ${C.ink9}` : 'none',
                  outlineOffset: 2, flexShrink: 0,
                }} />
            ))}
          </div>
        </FR>
      </div>

      <FR label="Attendees (comma-separated emails)">
        <Inp value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="alice@example.com, bob@example.com" />
      </FR>
      <FR label="Location (optional)">
        <Inp value={location} onChange={e => setLocation(e.target.value)} placeholder="Conference room A or address" />
      </FR>
      <FR label="Description (optional)">
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.5 }} />
      </FR>

      {/* Conference link */}
      {!allDay && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
          <input type="checkbox" checked={withMeet} onChange={e => setWithMeet(e.target.checked)} style={{ accentColor: C.acc }} />
          Auto-attach Google Meet link
        </label>
      )}

      {/* Reminders */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink5 }}>Reminders</span>
          <button onClick={addReminder} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '3px 10px', fontFamily: MONO, fontSize: 9, color: C.ink5, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>+ Add</button>
        </div>
        {reminders.length === 0
          ? <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No reminders</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reminders.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={r} onChange={e => updateReminder(i, e.target.value)} style={{ ...inputStyle(), flex: 1 }}>
                    {REMINDER_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <button onClick={() => removeReminder(i)} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '4px 10px', fontFamily: MONO, fontSize: 11, color: C.red, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )
        }
      </div>

      <div style={{ padding: 10, background: C.bg2, borderRadius: 8, fontSize: 11, color: C.ink5, lineHeight: 1.5 }}>
        Event lands on {activeAccount ? <span style={{ fontFamily: MONO, color: C.ink8 }}>{activeAccount.email}</span> : 'your active calendar'}
        {' '}or the shared OVMG team calendar if configured.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Btn v="gho" onClick={onClose}>Cancel</Btn>
        <Btn v="acc" onClick={submit} disabled={creating}>{creating ? 'Creating…' : 'Create event'}</Btn>
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px',
    border: `1px solid ${C.cr3}`, borderRadius: 8,
    background: C.bg2, fontFamily: SANS, fontSize: 13, color: C.ink8,
    outline: 'none',
  };
}
