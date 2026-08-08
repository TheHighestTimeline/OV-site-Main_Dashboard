// What has actually happened on this deal, in order.
//
// The shape Tanner asked for:
//   conversation started, Zurlia introduced
//   → NCNDA sent 12 Jun, signed 18 Jun
//   → Drive access granted
//   → waiting on a response since 2 Aug
//
// Assembled from what the base already knows — stage moves, documents with
// signed dates, tasks, activity rows written by the Granola/Gmail auto-logger —
// rather than from anything typed twice. The Airtable-derived half always
// renders; the message half needs the Supabase coo_* tables, so when those are
// missing the timeline degrades to "here is what we can prove from records"
// instead of erroring.

import { useState, useEffect, useMemo } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { getCooEvents, getDocumentsForContact, getActivitiesFor } from '../../api.js';

const KIND_COLOR = {
  message_in:   () => C.blu,
  message_out:  () => C.ink3,
  stage_change: () => C.acc,
  document:     () => C.grn,
  task_created: () => C.ink3,
  access:       () => C.grn,
  note:         () => C.ink3,
};

function fmt(d) {
  if (!d) return '';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d).slice(0, 10);
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export default function ThreadTab({ opp, stories = [], contacts = [], onOpenThreads }) {
  const [events, setEvents] = useState(null);
  const [docs,   setDocs]   = useState([]);
  const [acts,   setActs]   = useState([]);
  const [note,   setNote]   = useState(null);

  const contactIds = useMemo(() => {
    const ids = new Set(opp.contactIds || []);
    for (const s of stories) for (const id of (s.contactIds || [])) ids.add(id);
    return [...ids];
  }, [opp, stories]);

  const companyIds = useMemo(() => {
    const ids = new Set(opp.companyIds || []);
    for (const s of stories) for (const id of (s.companyIds || [])) ids.add(id);
    return [...ids];
  }, [opp, stories]);

  useEffect(() => {
    let live = true;
    setEvents(null);
    setNote(null);

    // Timeline rows are scoped to the opportunity; each story's roll up too, so
    // an epic reads as one conversation rather than N disconnected ones.
    const ids = [opp.id, ...stories.map(s => s.id)];
    Promise.allSettled(ids.map(id => getCooEvents({ workstreamId: id })))
      .then(results => {
        if (!live) return;
        const rows = [];
        let failed = 0;
        for (const r of results) {
          if (r.status === 'fulfilled') rows.push(...(r.value?.events || r.value || []));
          else failed++;
        }
        if (failed === results.length) {
          // Every read failed — almost always the unrun coo_* migration. Say so
          // rather than showing an empty timeline that implies nothing happened.
          setNote('Message-level history needs the Supabase coo_* tables, which have not been created yet. The timeline below is built from Airtable — logged calls and emails, documents, and dated work.');
        }
        setEvents(rows);
      });

    // The emails and Granola transcripts, as crm-autolog files them. This is the
    // half that works TODAY: those rows land in Airtable Activities regardless
    // of the Supabase migration, so the timeline tells the real story either way.
    getActivitiesFor({ contactIds, companyIds })
      .then(rows => { if (live) setActs(rows || []); })
      .catch(() => { if (live) setActs([]); });

    // Documents carry the paperwork half of the story: sent, signed, expiring.
    Promise.allSettled(contactIds.slice(0, 12).map(id => getDocumentsForContact(id)))
      .then(results => {
        if (!live) return;
        const out = [];
        for (const r of results) if (r.status === 'fulfilled') out.push(...(r.value || []));
        setDocs(out);
      });

    return () => { live = false; };
  }, [opp.id, stories, contactIds, companyIds]);

  const timeline = useMemo(() => {
    const rows = [];

    // Logged conversations — the emails and Granola calls crm-autolog files.
    // Direction matters: "waiting on a response" is a claim about the last time
    // THEY spoke, and an outbound email is not an answer.
    for (const a of acts) {
      if (!a.date) continue;
      const inbound = /received|inbound|reply|replied/i.test(`${a.type || ''} ${a.title || ''}`);
      rows.push({
        at:    a.date,
        kind:  inbound ? 'message_in' : a.source === 'Granola' ? 'note' : 'message_out',
        title: a.title || a.type || 'Conversation',
        // The AI summary is what was actually said, which is the whole reason
        // to show a conversation rather than just count it.
        body:  a.aiSummary || a.body || '',
        meta:  [a.type, a.source].filter(Boolean).join(' · '),
      });
    }

    for (const e of (events || [])) {
      rows.push({
        at:    e.occurred_at || e.occurredAt,
        kind:  e.event_type || e.eventType || 'note',
        title: e.title || '',
        body:  e.detail || '',
        inferred: (e.confidence || '') === 'inferred',
      });
    }

    // Paperwork, from Documents. A signed date is a fact; a document with none
    // is still worth showing, because "sent and never signed" is the state that
    // matters most and it is invisible if you only render what is signed.
    const seen = new Set();
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (d.signedDate) {
        rows.push({ at: d.signedDate, kind: 'document', title: `${d.type || 'Document'} signed`, body: d.name || '' });
      } else if (d.createdTime) {
        rows.push({ at: d.createdTime, kind: 'document', title: `${d.type || 'Document'} on file, not signed`, body: d.name || '' });
      }
    }

    // Tasks are commitments; when one was created is part of the story.
    for (const s of [opp, ...stories]) {
      for (const t of (s.tasks || [])) {
        if (!t.dueDate) continue;
        rows.push({
          at: t.dueDate,
          kind: 'task_created',
          title: t.name || t.task || 'Task',
          body: s.id === opp.id ? '' : s.name,
          future: new Date(t.dueDate).getTime() > Date.now(),
        });
      }
    }

    return rows
      .filter(r => r.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [events, docs, acts, opp, stories]);

  const lastInbound = useMemo(
    () => timeline.find(r => r.kind === 'message_in')?.at || null,
    [timeline],
  );
  const waitingDays = daysSince(lastInbound);

  // Where this stands, in a sentence. The timeline below is the evidence; this
  // is the read of it, and it is the line you actually open the tab for.
  const standing = useMemo(() => {
    const past = timeline.filter(r => !r.future);
    if (!past.length) return null;

    const latest = past[0];
    const started = past[past.length - 1];
    const opened = `Conversation opened ${fmt(started.at)}`;

    if (latest.kind === 'message_out') {
      const d = daysSince(latest.at);
      return `${opened}. Waiting on a response — last outbound ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}.`;
    }
    if (latest.kind === 'message_in') {
      const d = daysSince(latest.at);
      return `${opened}. They came back ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago` } — the ball is here.`;
    }
    if (latest.kind === 'document') {
      return `${opened}. Most recent movement is paperwork: ${latest.title.toLowerCase()}.`;
    }
    return `${opened}. Last recorded: ${latest.title}.`;
  }, [timeline]);

  if (events === null) {
    return <div style={{ fontSize: 12, color: C.ink3, padding: '10px 0' }}>Reading the history…</div>;
  }

  return (
    <div>
      {/* The headline: what is true right now, before the history. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 12px', marginBottom: 14, borderRadius: 9,
        background: C.bg2, border: `1px solid ${C.cr2}`,
      }}>
        <Stat label="Events" value={timeline.length} />
        <Stat label="People" value={contactIds.length} />
        <Stat label="Documents" value={docs.length} />
        <Stat
          label="Last inbound"
          value={lastInbound ? `${waitingDays}d ago` : '—'}
          alert={waitingDays != null && waitingDays > 10}
        />
        <span style={{ flex: 1 }} />
        {onOpenThreads && (
          <button onClick={onOpenThreads} style={{
            border: `1px solid ${C.cr3}`, borderRadius: 6, background: 'transparent',
            color: C.ink5, fontFamily: MONO, fontSize: 9.5, letterSpacing: '.05em',
            padding: '5px 10px', cursor: 'pointer',
          }}>Open in Threads ↗</button>
        )}
      </div>

      {standing && (
        <div style={{
          padding: '10px 13px', marginBottom: 12, borderRadius: 9,
          background: C.accS, border: `1px solid ${C.acc}44`,
          fontFamily: SANS, fontSize: 13, color: C.ink9, lineHeight: 1.55,
        }}>{standing}</div>
      )}

      {note && (
        <div style={{
          padding: '9px 12px', marginBottom: 12, borderRadius: 8,
          background: `${C.yel}14`, border: `1px solid ${C.yel}55`,
          fontSize: 11.5, color: C.ink5, lineHeight: 1.55,
        }}>{note}</div>
      )}

      {!timeline.length && (
        <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
          Nothing recorded yet. This fills in from Gmail and Granola once the auto-logger
          runs, and from documents and stage moves as they happen.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {timeline.map((r, i) => {
          const col = (KIND_COLOR[r.kind] || (() => C.ink3))();
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* Dotted rail. Hollow marks something inferred rather than
                  recorded, matching the Threads timeline. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 5 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: r.inferred ? 'transparent' : col,
                  border: `1px solid ${col}`,
                }} />
                {i < timeline.length - 1 && (
                  <span style={{ width: 1, flex: 1, minHeight: 22, background: C.cr2 }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink9 }}>{r.title}</span>
                  {r.inferred && (
                    <span style={{
                      fontFamily: MONO, fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase',
                      color: C.yel, border: `1px solid ${C.yel}55`, borderRadius: 999, padding: '0 5px',
                    }}>unconfirmed</span>
                  )}
                  {r.future && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: C.ink3 }}>due</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>{fmt(r.at)}</span>
                </div>
                {r.body && (
                  <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{r.body}</div>
                )}
                {r.meta && (
                  <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.ink2, marginTop: 3 }}>{r.meta}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div>
      <div style={{
        fontFamily: MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase',
        color: C.ink3, marginBottom: 2,
      }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: alert ? C.red : C.ink9 }}>
        {value}
      </div>
    </div>
  );
}
