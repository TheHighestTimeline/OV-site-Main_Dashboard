// The two queues that keep the rest of the tab honest.
//
// RESOLVED? — detected evidence awaiting a decision. Inferred signals propose,
// they never dispose. Every row carries a link to the evidence, because a queue
// you cannot check is a queue you rubber-stamp.
//
// UNMATCHED IDENTITIES — addresses the ingest could not tie to a contact.
// Identity matching is wrong often enough that this queue is permanent
// infrastructure, not a migration artifact. Both queues get cleared in the
// evening SOP.

import { useState, useEffect, useCallback } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { Panel, SectionTitle, Loading, fmtRel } from './shared.jsx';
import { getSignals, resolveSignal, getIdentities, linkIdentity, scanDrive, scanGmailSignals, ingestGmail } from '../../api.js';

const SIGNAL_LABELS = {
  access_granted:   'Drive access granted',
  access_requested: 'Drive access requested',
  doc_signed:       'Document appears executed',
  doc_sent:         'Document sent',
  ncnda_signed:     'NCNDA appears signed',
  meeting_held:     'Meeting took place',
  reply_received:   'Reply received',
};

const rowStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 9,
  padding: '9px 11px', borderRadius: 7, border: `1px solid ${C.cr2}`, background: C.bg,
};

const btn = {
  padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function QueuesView({ showToast, onChanged }) {
  const [signals,    setSignals]    = useState(null);
  const [identities, setIdentities] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, i] = await Promise.allSettled([getSignals('pending'), getIdentities('unmatched')]);
    setSignals(s.status === 'fulfilled' ? s.value : { signals: [], error: s.reason?.message });
    setIdentities(i.status === 'fulfilled' ? i.value : { identities: [], candidates: [], error: i.reason?.message });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id, decision) {
    setBusy(id);
    try {
      const res = await resolveSignal(id, decision);
      showToast?.(decision === 'confirm'
        ? `Confirmed${res.tasksClosed ? `, ${res.tasksClosed} task(s) closed` : ''}.`
        : 'Rejected. It will not be proposed again.');
      await load();
      onChanged?.();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function link(identityId, contactId) {
    setBusy(identityId);
    try {
      const res = await linkIdentity({ id: identityId, contactId });
      showToast?.(`Linked. ${res.backfilled?.threads || 0} thread(s) and ${res.backfilled?.events || 0} event(s) attached.`);
      await load();
      onChanged?.();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function runScan(fn, label) {
    setBusy(label);
    try {
      const res = await fn();
      showToast?.(`${label}: ${JSON.stringify(res).slice(0, 140)}`);
      await load();
    } catch (e) {
      showToast?.(`${label} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !signals) return <Loading label="Loading the queues…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>

      {/* Manual scans. These also run on a schedule; the buttons are for when
          you have just done something and want to see it land. */}
      <Panel>
        <SectionTitle>Run a scan now</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => runScan(scanDrive, 'Drive permissions')} disabled={Boolean(busy)} style={btn}>
            {busy === 'Drive permissions' ? 'Scanning…' : 'Drive permissions'}
          </button>
          <button onClick={() => runScan(scanGmailSignals, 'Mail signals')} disabled={Boolean(busy)} style={btn}>
            {busy === 'Mail signals' ? 'Scanning…' : 'Mail signals'}
          </button>
          <button onClick={() => runScan(ingestGmail, 'Gmail ingest')} disabled={Boolean(busy)} style={btn}>
            {busy === 'Gmail ingest' ? 'Ingesting…' : 'Gmail ingest'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: C.ink3, margin: '9px 0 0', lineHeight: 1.55 }}>
          The first Drive scan on a folder seeds a baseline and fires nothing, so the
          existing access list does not arrive as a wave of false grants. Expect it to
          look like it did nothing.
        </p>
      </Panel>

      {/* ── Resolved? ── */}
      <Panel>
        <SectionTitle count={signals?.signals?.length || 0}>Resolved?</SectionTitle>
        <p style={{ fontSize: 11.5, color: C.ink3, margin: '0 0 10px', lineHeight: 1.55 }}>
          Detected evidence waiting on you. Deterministic signals (a Drive permission either
          exists or it does not) have already applied and appear here so they can be reversed.
          Inferred ones (a filename, a subject line) have changed nothing yet.
        </p>

        {signals?.error && <ErrorNote msg={signals.error} />}

        {!signals?.signals?.length && !signals?.error && (
          <div style={{ fontSize: 12, color: C.ink2, padding: '6px 0' }}>Queue is clear.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(signals?.signals || []).map(s => (
            <div key={s.id} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink9 }}>
                    {SIGNAL_LABELS[s.type] || s.type}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 8.5, padding: '1px 6px', borderRadius: 3,
                    background: s.inferred ? C.yelS : C.grnS,
                    color: s.inferred ? C.yel : C.grn, letterSpacing: '.06em',
                  }}>{s.inferred ? 'INFERRED' : 'DETERMINISTIC'}</span>
                  {s.confidence != null && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
                      {Math.round(s.confidence * 100)}% confident
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 3 }}>
                  {s.participationName || (s.contactId ? 'Contact matched, no participation' : 'Unmatched — assign an identity first')}
                  {' · '}{s.source}{' · '}{fmtRel(s.detectedAt)}
                </div>

                {s.evidenceUrl && (
                  <a href={s.evidenceUrl} target="_blank" rel="noreferrer" style={{
                    fontFamily: MONO, fontSize: 10, color: C.acc, textDecoration: 'none',
                    marginTop: 4, display: 'inline-block',
                  }}>View the evidence →</a>
                )}
              </div>

              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button onClick={() => decide(s.id, 'confirm')} disabled={busy === s.id}
                  style={{ ...btn, borderColor: C.grn, color: C.grn }}>Confirm</button>
                <button onClick={() => decide(s.id, 'reject')} disabled={busy === s.id}
                  style={{ ...btn, borderColor: C.red, color: C.red }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Unmatched identities ── */}
      <Panel>
        <SectionTitle count={identities?.identities?.length || 0}>Unmatched identities</SectionTitle>
        <p style={{ fontSize: 11.5, color: C.ink3, margin: '0 0 10px', lineHeight: 1.55 }}>
          Addresses the ingest could not tie to a CRM contact. Assigning one attaches all of
          that address's history to the person, so their timeline stops being empty.
        </p>

        {identities?.error && <ErrorNote msg={identities.error} />}

        {!identities?.identities?.length && !identities?.error && (
          <div style={{ fontSize: 12, color: C.ink2, padding: '6px 0' }}>Nothing unmatched.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(identities?.identities || []).map(i => (
            <IdentityRow key={i.id} identity={i} candidates={identities.candidates || []}
              busy={busy === i.id} onLink={link} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function IdentityRow({ identity, candidates, busy, onLink }) {
  const [pick, setPick] = useState('');

  // Suggest by local-part similarity so the obvious ones are one click. The
  // suggestion is never auto-applied: a plausible guess is still a guess.
  const local = identity.handle.split('@')[0].replace(/[._-]+/g, ' ').toLowerCase();
  const suggestion = candidates.find(c => {
    const n = c.name.toLowerCase();
    return local && (n.includes(local) || local.includes(n.split(' ')[0]));
  });

  return (
    <div style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink9, wordBreak: 'break-all' }}>
          {identity.handle}
        </div>
        <div style={{ fontSize: 11, color: C.ink3, marginTop: 3 }}>
          {identity.displayName && `${identity.displayName} · `}
          {identity.messageCount} message{identity.messageCount === 1 ? '' : 's'} · first seen {fmtRel(identity.createdAt)}
        </div>
        {suggestion && !pick && (
          <button onClick={() => setPick(suggestion.id)} style={{
            ...btn, marginTop: 5, borderColor: C.acc, color: C.acc,
          }}>Looks like {suggestion.name}?</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
        <select value={pick} onChange={e => setPick(e.target.value)} style={{
          padding: '5px 7px', borderRadius: 6, border: `1px solid ${C.cr3}`,
          background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 11.5,
          maxWidth: 190, outline: 'none',
        }}>
          <option value="">Pick a contact…</option>
          {candidates.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>
          ))}
        </select>
        <button onClick={() => onLink(identity.id, pick)} disabled={!pick || busy}
          style={{ ...btn, opacity: !pick || busy ? 0.45 : 1 }}>
          {busy ? '…' : 'Link'}
        </button>
      </div>
    </div>
  );
}

function ErrorNote({ msg }) {
  return (
    <div style={{
      padding: '8px 11px', borderRadius: 6, background: C.redS, color: C.red,
      fontSize: 11.5, marginBottom: 9, lineHeight: 1.5,
    }}>{msg}</div>
  );
}


