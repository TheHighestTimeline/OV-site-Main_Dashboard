// What we talked about with this company, week by week.
//
// The ask: "each company we talk about during the week needs to be updated
// with the threads tab about what was talked about or accomplished, so that it
// automatically has a history and updates constantly to keep the information up
// to date on the last known contact."
//
// So this is not a place to type a weekly summary — it is a read of everything
// the base already recorded about the company, bucketed into the week it
// happened in. Activities (the rows the Gmail/Granola logger writes), documents
// with signed dates, and task due dates all land on the same rail. Nothing is
// entered twice, which is the only way a history like this stays current.
//
// The header answers the one question you actually open this for: when did we
// last hear from them, and is that too long ago.

import { useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';

const KIND_COLOR = {
  activity: () => C.acc,
  document: () => C.grn,
  task:     () => C.ink3,
  deal:     () => C.blu,
};

/** Monday of the week a date falls in, as YYYY-MM-DD. Weeks are the unit here. */
function weekStart(d) {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  const day = (t.getDay() + 6) % 7;              // Monday = 0
  t.setDate(t.getDate() - day);
  return t.toISOString().slice(0, 10);
}

function weekLabel(iso) {
  const start = new Date(iso);
  const end   = new Date(iso);
  end.setDate(end.getDate() + 6);

  const thisWeek = weekStart(new Date());
  if (iso === thisWeek) return 'This week';

  const last = new Date(thisWeek);
  last.setDate(last.getDate() - 7);
  if (iso === last.toISOString().slice(0, 10)) return 'Last week';

  const f = (x, withYear) => x.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
  });
  const sameYear = start.getFullYear() === new Date().getFullYear();
  return `${f(start, false)} – ${f(end, !sameYear)}`;
}

function daysSince(d) {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export default function CompanyThread({ data, onOpenOpp = null }) {
  const rows = useMemo(() => {
    const out = [];

    for (const a of (data?.activities || [])) {
      if (!a.date) continue;
      out.push({
        at:   a.date,
        kind: 'activity',
        // The AI summary is the point of an activity row — it is what was said,
        // as opposed to the fact that something happened.
        title: a.title || a.type || 'Activity',
        body:  a.aiSummary || a.body || '',
        meta:  [a.type, a.source].filter(Boolean).join(' · '),
        contact: true,   // an activity is contact; a signed doc is not
      });
    }

    for (const d of (data?.documents || [])) {
      if (d.signedDate) {
        out.push({ at: d.signedDate, kind: 'document', title: `${d.type || 'Document'} signed`, body: d.name || '', meta: '' });
      }
    }

    for (const t of (data?.openTasks || [])) {
      if (!t.dueDate) continue;
      out.push({
        at: t.dueDate,
        kind: 'task',
        title: t.task || 'Task',
        body: '',
        meta: [t.status, t.priority].filter(Boolean).join(' · '),
        future: new Date(t.dueDate).getTime() > Date.now(),
      });
    }

    for (const o of (data?.opportunities || [])) {
      if (!o.closeDate) continue;
      out.push({
        at: o.closeDate,
        kind: 'deal',
        title: o.name || 'Opportunity',
        body: o.nextStep || '',
        meta: o.stage || '',
        future: new Date(o.closeDate).getTime() > Date.now(),
        oppId: o.id,
      });
    }

    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [data]);

  const weeks = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const w = weekStart(r.at);
      if (!w) continue;
      if (!m.has(w)) m.set(w, []);
      m.get(w).push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  // Last known contact — the header line. Only rows that represent someone
  // actually talking count: a task due date is our own calendar, not theirs.
  const lastContact = useMemo(
    () => rows.find(r => r.contact && new Date(r.at).getTime() <= Date.now())?.at || null,
    [rows],
  );
  const since = lastContact ? daysSince(lastContact) : null;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '11px 13px', marginBottom: 16, borderRadius: 10,
        background: C.bg2, border: `1px solid ${C.cr2}`,
      }}>
        <Stat label="Last contact" value={since == null ? '—' : since === 0 ? 'today' : `${since}d ago`} alert={since != null && since > 21} />
        <Stat label="Weeks with activity" value={weeks.length} />
        <Stat label="Recorded" value={rows.length} />
      </div>

      {!weeks.length && (
        <div style={{ fontSize: 12.5, color: C.ink3, lineHeight: 1.6 }}>
          Nothing recorded yet. This fills itself in: every logged call, email and
          meeting about this company lands here in the week it happened, alongside
          signed documents and dated work. Nothing has to be typed twice.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {weeks.map(([w, items]) => (
          <div key={w}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8,
              position: 'sticky', top: 0, background: C.bg, paddingBottom: 4, zIndex: 1,
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em',
                textTransform: 'uppercase', color: C.ink5,
              }}>{weekLabel(w)}</span>
              <span style={{ flex: 1, height: 1, background: C.cr2 }} />
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.ink3 }}>{items.length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((r, i) => {
                const col = (KIND_COLOR[r.kind] || (() => C.ink3))();
                const clickable = r.oppId && onOpenOpp;
                return (
                  <div
                    key={`${w}-${i}`}
                    onClick={clickable ? () => onOpenOpp({ id: r.oppId, name: r.title }) : undefined}
                    style={{
                      display: 'flex', gap: 10, padding: '9px 11px', borderRadius: 8,
                      background: C.bg2, border: `1px solid ${C.cr2}`,
                      borderLeft: `3px solid ${col}`,
                      cursor: clickable ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: SERIF, fontSize: 13.5, color: C.ink9 }}>{r.title}</span>
                        {r.future && <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.ink3 }}>upcoming</span>}
                        <span style={{ flex: 1 }} />
                        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>
                          {String(r.at).slice(5, 10)}
                        </span>
                      </div>
                      {r.body && (
                        <div style={{ fontFamily: SANS, fontSize: 12, color: C.ink7, marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {r.body}
                        </div>
                      )}
                      {r.meta && (
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 4 }}>{r.meta}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em',
        textTransform: 'uppercase', color: C.ink3, marginBottom: 2,
      }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: alert ? C.red : C.ink9 }}>
        {value}
      </div>
    </div>
  );
}
