// One detail component, shared by the Opportunities view and the People view.
//
// Deliberately ONE component and not two: the two views group differently (by
// participation and by person), but what you need to see once you have opened a
// relationship is identical. Two copies would drift, and the drift would show up
// as the two halves of the tab disagreeing about the same record.

import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../../constants.js';
import Timeline from '../../components/Timeline.jsx';
import {
  StageBadge, EntityChip, WorkstreamChip, WaitingPill, Panel, SectionTitle, fmtRel,
} from './shared.jsx';
import { CAPITAL_STAGES, UNIVERSAL_STAGES } from '../../lib/stages.js';

const labelStyle = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, marginBottom: 4,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6,
  border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, outline: 'none',
};
import {
  getBrief, regenerateBrief, advanceStage, upsertParticipation, delegateTask,
} from '../../api.js';

const STAGE_CHOICES = [...CAPITAL_STAGES, ...UNIVERSAL_STAGES];

export default function DetailPane({
  participation, contacts = [], onChanged, showToast, onClose, isMobile,
}) {
  const [brief,   setBrief]   = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [gate,    setGate]    = useState(null);   // evidence refusal awaiting a decision
  const [delegating, setDelegating] = useState(false);

  const pid = participation?.id;

  const loadBrief = useCallback(async (force = false) => {
    if (!pid) return;
    setBriefLoading(true);
    try {
      const data = force ? await regenerateBrief(pid) : await getBrief(pid);
      setBrief(data.brief);
    } catch (e) {
      showToast?.(`Brief unavailable: ${e.message}`);
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, [pid, showToast]);

  useEffect(() => { setBrief(null); setGate(null); if (pid) loadBrief(false); }, [pid, loadBrief]);

  if (!participation) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: C.ink3, fontSize: 12.5 }}>
        Select someone to see where things stand.
      </div>
    );
  }

  const p = participation;

  // ── Stage change ───────────────────────────────────────────────────────────
  async function moveStage(toStage, { override = false, overrideReason = '', note = '' } = {}) {
    setBusy(true);
    try {
      const res = await advanceStage({ participationId: p.id, toStage, override, overrideReason, note });
      setGate(null);
      showToast?.(res.task ? `Moved to ${toStage}. Task created: ${res.task.name}` : `Moved to ${toStage}.`);
      onChanged?.();
      loadBrief(true);
    } catch (e) {
      // A 409 EVIDENCE_REQUIRED is a designed refusal, not a failure. Surface it
      // as a decision the user makes, with the reason spelled out.
      if (e.code === 'EVIDENCE_REQUIRED') {
        setGate({ toStage, message: e.message, required: e.body?.required, stage: e.body?.stage });
      } else {
        showToast?.(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setWaiting(waitingOn) {
    setBusy(true);
    try {
      await upsertParticipation({ id: p.id, waitingOn });
      onChanged?.();
    } catch (e) {
      showToast?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  const mailtoHref = p.contactEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(p.contactEmail)}` +
      `&su=${encodeURIComponent(p.workstreamName || '')}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, paddingBottom: 12, borderBottom: `1px solid ${C.cr2}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 19 : 22,
              color: C.ink9, margin: 0, lineHeight: 1.15,
            }}>{p.contactName || p.name}</h2>
            {p.contactCompany && (
              <div style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>{p.contactCompany}</div>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: C.ink3, fontSize: 20,
              cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}>×</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <WorkstreamChip name={p.workstreamName} />
          <EntityChip entity={p.entity} />
          <WaitingPill waitingOn={p.waitingOn} />
        </div>

        <div style={{ marginTop: 8 }}>
          <StageBadge stageLabel={p.stageLabel} daysInStage={p.daysInStage} slaStatus={p.slaStatus} />
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 12 }}>

        {/* Brief */}
        <Panel sx={{ marginBottom: 12 }}>
          <SectionTitle
            count={null}
            action={
              <button
                onClick={() => loadBrief(true)}
                disabled={briefLoading}
                style={ghostBtn(briefLoading)}
              >{briefLoading ? 'Writing…' : brief?.stale ? 'Refresh (stale)' : 'Refresh'}</button>
            }
          >Where this stands</SectionTitle>

          {briefLoading && !brief && <div style={{ fontSize: 12, color: C.ink3 }}>Reading the history…</div>}

          {brief && (
            <>
              <p style={{ fontSize: 13, color: C.ink8, lineHeight: 1.6, margin: 0 }}>
                {brief.summary || 'No summary yet.'}
              </p>

              {brief.openAsks?.length > 0 && (
                <div style={{ marginTop: 11 }}>
                  <div style={labelStyle}>Open asks</div>
                  {brief.openAsks.map((a, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.5, marginBottom: 3 }}>
                      <strong style={{ color: C.ink8 }}>{a.who}:</strong> {a.what}
                      {a.when && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}> ({a.when})</span>}
                    </div>
                  ))}
                </div>
              )}

              {brief.lastCommitment && (
                <div style={{ marginTop: 11 }}>
                  <div style={labelStyle}>Last commitment</div>
                  <div style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.5 }}>{brief.lastCommitment}</div>
                </div>
              )}

              {brief.suggestedNext && (
                <div style={{ marginTop: 11 }}>
                  <div style={labelStyle}>Suggested next</div>
                  <div style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.5 }}>{brief.suggestedNext}</div>
                </div>
              )}

              {brief.generatedAt && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink2, marginTop: 10 }}>
                  {/* Provenance is shown on purpose: a brief you cannot trace is
                      a brief you should not act on. */}
                  {brief.sourceMessageIds?.length || 0} source message(s) · {fmtRel(brief.generatedAt)}
                  {brief.stale ? ' · stale' : ''}
                </div>
              )}
            </>
          )}
        </Panel>

        {/* Facts */}
        <Panel sx={{ marginBottom: 12 }}>
          <SectionTitle>Record</SectionTitle>
          <Row label="Owner"        value={p.owner || '—'} />
          <Row label="Next action"  value={p.nextAction || '—'} />
          <Row label="Next action date" value={p.nextActionDate ? String(p.nextActionDate).slice(0, 10) : '—'} />
          {p.blockingItem && <Row label="Blocked by" value={p.blockingItem} highlight />}
          <Row label="Open tasks"   value={`${p.openTaskCount || 0}${p.overdueTaskCount ? ` (${p.overdueTaskCount} overdue)` : ''}`}
               highlight={Boolean(p.overdueTaskCount)} />
          <Row label="Last activity" value={fmtRel(p.lastActivityAt)} />
          {p.contactEmail && <Row label="Email" value={p.contactEmail} />}
        </Panel>

        {/* Actions */}
        <Panel sx={{ marginBottom: 12 }}>
          <SectionTitle>Move it forward</SectionTitle>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {mailtoHref && (
              // Draft and hand off. Sending from inside the app is a counsel
              // question first (templated outbound to capital sources starts to
              // look like solicitation conduct), so v1 keeps a human on every send.
              <a href={mailtoHref} target="_blank" rel="noreferrer" style={{ ...primaryBtn(false), textDecoration: 'none' }}>
                Draft reply in Gmail
              </a>
            )}
            <button onClick={() => setDelegating(v => !v)} style={ghostBtn(false)}>
              {delegating ? 'Cancel' : 'Delegate with context'}
            </button>
          </div>

          {delegating && (
            <DelegateForm
              participation={p}
              contacts={contacts}
              onDone={(msg) => { setDelegating(false); showToast?.(msg); onChanged?.(); }}
              onError={(msg) => showToast?.(msg)}
            />
          )}

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Waiting on</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Us', 'Them', 'Nobody'].map(w => (
                <button key={w} onClick={() => setWaiting(w)} disabled={busy}
                  style={p.waitingOn === w ? primaryBtn(busy) : ghostBtn(busy)}>{w}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Stage</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {STAGE_CHOICES.map(s => (
                <button
                  key={s.id}
                  onClick={() => moveStage(s.label)}
                  disabled={busy || s.label === p.stageLabel}
                  style={s.label === p.stageLabel ? primaryBtn(true) : ghostBtn(busy)}
                >{s.label}</button>
              ))}
            </div>
          </div>

          {gate && <EvidenceGate gate={gate} onCancel={() => setGate(null)} onOverride={moveStage} busy={busy} />}
        </Panel>

        {/* Timeline */}
        <Panel sx={{ marginBottom: 12 }}>
          <SectionTitle>Timeline</SectionTitle>
          <div style={{ height: 420 }}>
            <Timeline
              participationId={p.id}
              onNoteAdded={() => { onChanged?.(); loadBrief(false); }}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Evidence refusal ─────────────────────────────────────────────────────────
// Shown when the stage machine refuses a transition. The override exists
// because refusing forever is its own failure mode, but it demands a written
// reason and is recorded as an override, so the history never claims evidence
// that was not there.

function EvidenceGate({ gate, onCancel, onOverride, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      marginTop: 12, padding: '11px 13px', borderRadius: 8,
      background: C.redS, border: `1px solid ${C.red}44`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.red, marginBottom: 6 }}>
        Evidence required · {gate.stage}
      </div>
      <p style={{ fontSize: 12.5, color: C.ink8, lineHeight: 1.55, margin: '0 0 9px' }}>{gate.message}</p>
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="If you override, say where the evidence actually is"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6,
          border: `1px solid ${C.cr3}`, background: C.bg, color: C.ink9,
          fontFamily: SANS, fontSize: 12, outline: 'none', marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={ghostBtn(false)}>Cancel</button>
        <button
          onClick={() => onOverride(gate.toStage, { override: true, overrideReason: reason })}
          disabled={busy || !reason.trim()}
          style={{ ...primaryBtn(busy || !reason.trim()), background: C.red }}
        >Override anyway</button>
      </div>
    </div>
  );
}

// ── Delegation ───────────────────────────────────────────────────────────────

function DelegateForm({ participation, contacts, onDone, onError }) {
  const [actionName, setActionName] = useState(participation.nextAction || '');
  const [assignee,   setAssignee]   = useState('');
  const [dueDate,    setDueDate]    = useState('');
  const [extra,      setExtra]      = useState('');
  const [saving,     setSaving]     = useState(false);

  async function submit() {
    if (!actionName.trim()) return;
    setSaving(true);
    try {
      await delegateTask({
        participationId: participation.id,
        actionName: actionName.trim(),
        assigneeContactId: assignee || null,
        dueDate: dueDate || null,
        extraContext: extra.trim(),
      });
      onDone('Delegated with the relationship context attached.');
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <input value={actionName} onChange={e => setActionName(e.target.value)}
        placeholder="What needs doing" style={inputStyle} />
      <div style={{ display: 'flex', gap: 7 }}>
        <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
          <option value="">Unassigned</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          style={{ ...inputStyle, width: 145 }} />
      </div>
      <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2}
        placeholder="Anything the brief will not already say"
        style={{ ...inputStyle, resize: 'vertical' }} />
      <div style={{ fontSize: 11, color: C.ink3, lineHeight: 1.5 }}>
        The current stage, waiting-on, open asks, last commitment and documents on file are
        attached automatically, so the assignee can act without asking.
      </div>
      <button onClick={submit} disabled={saving || !actionName.trim()}
        style={primaryBtn(saving || !actionName.trim())}>
        {saving ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Row({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'baseline' }}>
      <span style={{ ...labelStyle, marginBottom: 0, minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12.5, color: highlight ? C.red : C.ink8, lineHeight: 1.45,
        fontWeight: highlight ? 600 : 400, wordBreak: 'break-word',
      }}>{value}</span>
    </div>
  );
}


function primaryBtn(disabled) {
  return {
    padding: '6px 12px', borderRadius: 6, border: 'none', background: C.acc, color: '#fff',
    fontFamily: MONO, fontSize: 10, letterSpacing: '.05em', fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  };
}

function ghostBtn(disabled) {
  return {
    padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.cr3}`,
    background: 'transparent', color: C.ink5,
    fontFamily: MONO, fontSize: 10, letterSpacing: '.05em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  };
}
