// The Threads tab: a cross-channel relationship command center.
//
// It exists to answer four questions in under ten seconds each:
//   1. Who owes me something, and how long have they owed it
//   2. Who do I owe something, and what
//   3. Where is each relationship in its lifecycle, and what is the next step
//   4. What can I delegate right now, with enough context that the assignee can
//      act without asking
//
// ONE tab, three views behind a switcher, plus the queues that keep the other
// three honest. There is deliberately no separate COO tab: splitting the same
// data across two nav items is how the second one stops being opened.

import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Modal } from '../components/UI.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { getThreadsData, getSignals, getIdentities } from '../api.js';
import { Loading, Empty, Panel } from './threads/shared.jsx';
import OpportunitiesView from './threads/OpportunitiesView.jsx';
import PeopleView        from './threads/PeopleView.jsx';
import TriageView        from './threads/TriageView.jsx';
import QueuesView        from './threads/QueuesView.jsx';
import PipelineView      from './threads/PipelineView.jsx';
import AccountabilityView from './threads/AccountabilityView.jsx';
import VoiceCapture      from './threads/VoiceCapture.jsx';
import SuggestLinks      from './threads/SuggestLinks.jsx';

const retryBtn = {
  padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 10,
  letterSpacing: '.05em', cursor: 'pointer',
};

const VIEWS = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'people',        label: 'People' },
  { id: 'triage',        label: 'Triage' },
  { id: 'pipeline',      label: 'Pipeline' },
  { id: 'accountability', label: 'Accountability' },
  { id: 'queues',        label: 'Queues' },
];

const VIEW_KEY = 'ovmg.threads.view';

export default function Threads({ user, showToast }) {
  const isMobile = useIsMobile();

  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'opportunities'; }
    catch { return 'opportunities'; }
  });
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [badges,   setBadges]   = useState({ signals: 0, identities: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getThreadsData());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBadges = useCallback(async () => {
    // Badge counts are nice-to-have. A failure here must never take out the tab,
    // so both are settled independently and errors are swallowed.
    const [s, i] = await Promise.allSettled([getSignals('pending'), getIdentities('unmatched')]);
    setBadges({
      signals:    s.status === 'fulfilled' ? (s.value.pendingCount ?? s.value.signals?.length ?? 0) : 0,
      identities: i.status === 'fulfilled' ? (i.value.unmatchedCount ?? i.value.identities?.length ?? 0) : 0,
    });
  }, []);

  useEffect(() => { load(); loadBadges(); }, [load, loadBadges]);

  function pickView(id) {
    setView(id);
    try { localStorage.setItem(VIEW_KEY, id); } catch { /* private mode */ }
  }

  const refresh = useCallback(() => { load(); loadBadges(); }, [load, loadBadges]);

  function openParticipation(pid) {
    setSelected(pid);
    // Triage rows are participations, so opening one lands in the view built to
    // work a single relationship rather than a list.
    if (view !== 'opportunities' && view !== 'people') pickView('people');
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
            color: C.ink3, marginBottom: 5,
          }}>Relationships</div>
          <h1 style={{
            fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 25 : 34,
            letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1,
          }}>Threads</h1>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Only useful while the board is still being populated, so it stays
              out of the way once most relationships are already tracked. */}
          {data?.configured && (data.participations?.length || 0) < 25 && (
            <button onClick={() => setSuggestOpen(true)} style={{
              padding: '7px 13px', borderRadius: 999, border: `1px solid ${C.acc}`,
              background: 'transparent', color: C.acc, fontFamily: MONO, fontSize: 10,
              letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer',
            }}>⌁ Suggest links</button>
          )}
          <button onClick={() => setVoiceOpen(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 999, border: 'none',
            background: C.acc, color: '#fff', fontFamily: MONO, fontSize: 10,
            letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer',
          }}>◉ Capture</button>
          <button onClick={refresh} disabled={loading} style={{
            padding: '7px 12px', borderRadius: 999, border: `1px solid ${C.cr3}`,
            background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 10,
            letterSpacing: '.05em', cursor: loading ? 'default' : 'pointer',
          }}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 4, marginTop: 14, flexWrap: 'wrap',
        borderBottom: `1px solid ${C.cr2}`, paddingBottom: 0,
      }}>
        {VIEWS.map(v => {
          const active = view === v.id;
          const badge = v.id === 'queues' ? badges.signals + badges.identities : 0;
          return (
            <button key={v.id} onClick={() => pickView(v.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 13px', border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? C.acc : 'transparent'}`,
              color: active ? C.ink9 : C.ink3,
              fontFamily: SANS, fontSize: 13, fontWeight: active ? 600 : 400,
              cursor: 'pointer', marginBottom: -1,
            }}>
              {v.label}
              {badge > 0 && (
                <span style={{
                  fontFamily: MONO, fontSize: 9, fontWeight: 700, background: C.acc,
                  color: '#fff', borderRadius: 999, padding: '1px 6px',
                }}>{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Body ───────────────────────────────────────────────────────────────────
  let body;

  if (loading && !data) {
    body = <Loading label="Loading relationships…" />;
  } else if (error) {
    body = (
      <Empty
        icon="◈"
        title="Threads could not load"
        body={error}
        action={<button onClick={refresh} style={retryBtn}>Try again</button>}
      />
    );
  } else if (view === 'triage') {
    body = <TriageView onOpenParticipation={openParticipation} showToast={showToast} isMobile={isMobile} />;
  } else if (view === 'queues') {
    body = <QueuesView showToast={showToast} onChanged={refresh} />;
  } else if (view === 'accountability') {
    body = <AccountabilityView showToast={showToast} isMobile={isMobile} />;
  } else if (view === 'pipeline' && data?.configured) {
    body = (
      <PipelineView
        data={data} onOpenParticipation={openParticipation}
        onChanged={refresh} showToast={showToast} isMobile={isMobile}
      />
    );
  } else if (data && !data.configured) {
    // Half-provisioned environments degrade to an explanation, not a 500.
    body = (
      <Panel>
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, color: C.ink9, margin: '0 0 8px' }}>
          Participations table is not connected yet
        </h3>
        <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.65, margin: '0 0 10px' }}>
          A participation is one contact inside one workstream, and it is what carries the
          relationship stage. Stage cannot live on the contact: the same person can be
          NCNDA Signed on one workstream and Initial Outreach on another at the same moment,
          and both are true.
        </p>
        <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.65, margin: 0 }}>
          Create the <strong>Participations</strong> table in the OV Dashboard base
          (the field list is in <code>docs/THREADS_TAB.md</code>), then set{' '}
          <code style={{ fontFamily: MONO, fontSize: 11 }}>AIRTABLE_TB_PARTICIPATIONS</code>{' '}
          in the Netlify environment. Triage and the queues work without it.
        </p>
      </Panel>
    );
  } else if (view === 'people') {
    body = (
      <PeopleView
        data={data} selected={selected} onSelect={setSelected}
        onChanged={refresh} showToast={showToast} isMobile={isMobile}
      />
    );
  } else {
    body = (
      <OpportunitiesView
        data={data} selected={selected} onSelect={setSelected}
        onChanged={refresh} showToast={showToast} isMobile={isMobile}
      />
    );
  }

  return (
    <div>
      {header}
      {body}

      {suggestOpen && (
        <Modal title="Suggested links" onClose={() => setSuggestOpen(false)}>
          <SuggestLinks
            onClose={() => setSuggestOpen(false)}
            onDone={refresh}
            showToast={showToast}
          />
        </Modal>
      )}

      {voiceOpen && (
        <Modal title="Capture" onClose={() => setVoiceOpen(false)}>
          <VoiceCapture
            data={data}
            onClose={() => setVoiceOpen(false)}
            onApplied={refresh}
            showToast={showToast}
          />
        </Modal>
      )}
    </div>
  );
}

