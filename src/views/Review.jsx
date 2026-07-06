import { useState, useEffect, useCallback } from 'react';
import { C, SERIF, SANS, MONO, fmtD } from '../constants.js';
import { Eyebrow, Btn, Tag, Spinner } from '../components/UI.jsx';
import { listReviews, applyReview, updateReview } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ── Review queue (2026-07 audit §4) ──────────────────────────────────────────
// Every Granola call, webhook ingest, and Audio Dump lands here as PENDING
// with AI-proposed actions. The reviewer checks/unchecks/edits items, then
// Approve writes ONLY the checked items to Airtable via reviews-apply.
// Nothing enters the CRM without passing through this page.

// Flatten the parse result into a checkable action list.
function toActionItems(pa = {}) {
  const items = [];
  (pa.taskUpdates || []).forEach((u, i) => items.push({
    key: `tu-${i}`, kind: 'taskUpdate', checked: !!u.taskId,
    taskId: u.taskId, newStatus: u.newStatus, note: u.note,
    label: `Update task: ${u.taskTitle || u.taskId || '(unmatched)'}${u.newStatus ? ` → ${u.newStatus}` : ''}`,
    detail: u.note || '', confidence: u.confidence,
    disabled: !u.taskId, disabledReason: 'No confident task match — convert to a new task below if needed',
  }));
  (pa.newTasks || []).forEach((t, i) => items.push({
    key: `nt-${i}`, kind: 'newTask', checked: true,
    task: t.task, priority: t.priority, dueDate: t.dueDate, owner: t.owner,
    label: `New task: ${t.task}`,
    detail: [t.priority, t.dueDate ? `due ${t.dueDate}` : null, t.owner].filter(Boolean).join(' · '),
  }));
  (pa.newContacts || []).forEach((c, i) => items.push({
    key: `nc-${i}`, kind: 'newContact', checked: true,
    name: c.name, company: c.company, role: c.role, email: c.email, phone: c.phone, type: c.type,
    label: `New contact: ${c.name}`,
    detail: [c.company, c.role, c.email].filter(Boolean).join(' · '),
  }));
  (pa.contactUpdates || []).forEach((u, i) => items.push({
    key: `cu-${i}`, kind: u.contactId ? 'contactNote' : 'note', checked: !!u.contactId,
    contactId: u.contactId, title: `Note — ${u.name || 'contact'}`, note: u.note, body: u.note,
    label: u.contactId ? `Log note on ${u.name}` : `Note about ${u.name || 'unknown contact'} (no CRM match)`,
    detail: u.note || '',
  }));
  (pa.notes || []).forEach((n, i) => items.push({
    key: `n-${i}`, kind: 'note', checked: false,
    title: n.title, body: n.body,
    label: `Note: ${n.title}`,
    detail: n.body || '',
  }));
  return items;
}

function toApplyPayload(item) {
  const { key: _k, checked: _c, label: _l, detail: _d, disabled: _x, disabledReason: _r, confidence: _cf, ...rest } = item;
  return rest;
}

const SOURCE_TAGS = {
  granola:      { label: 'Granola call', fg: '#7c3d8f' },
  webhook:      { label: 'Call (webhook)', fg: '#2c5d8a' },
  'audio-dump': { label: 'Audio dump', fg: '#d96b3a' },
};

function ReviewCard({ review, onDone, showToast }) {
  const [items, setItems]     = useState(() => toActionItems(review.proposed_actions));
  const [expanded, setExpand] = useState(false);
  const [showTx, setShowTx]   = useState(false);
  const [busy, setBusy]       = useState(false);
  const isMobile = useIsMobile();

  const checkedCount = items.filter(i => i.checked && !i.disabled).length;
  const src = SOURCE_TAGS[review.source] || SOURCE_TAGS.webhook;

  const toggle = key => setItems(prev => prev.map(i => i.key === key ? { ...i, checked: !i.checked } : i));
  const editDetail = (key, value) => setItems(prev => prev.map(i => {
    if (i.key !== key) return i;
    const next = { ...i, detail: value };
    if (i.kind === 'newTask') next.task = value;
    if (i.kind === 'note') next.body = value;
    if (i.kind === 'contactNote' || i.kind === 'taskUpdate') { next.note = value; next.body = value; }
    return next;
  }));

  const approve = async () => {
    if (busy || checkedCount === 0) return;
    setBusy(true);
    try {
      const actions = items.filter(i => i.checked && !i.disabled).map(toApplyPayload);
      const res = await applyReview(review.id, actions);
      showToast?.(res.status === 'approved'
        ? `Applied ${res.appliedCount} item${res.appliedCount === 1 ? '' : 's'} ✓`
        : `Applied ${res.appliedCount}, ${res.failures?.length || 0} failed — check the card`);
      onDone();
    } catch (e) { showToast?.('Apply failed: ' + e.message); }
    setBusy(false);
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    try { await updateReview(review.id, { status: 'dismissed' }); showToast?.('Dismissed'); onDone(); }
    catch (e) { showToast?.('Failed: ' + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ border: `1px solid ${C.cr2}`, borderRadius: 14, background: C.bg, overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={() => setExpand(e => !e)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{review.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
            <Tag bg={src.fg + '18'} fg={src.fg}>{src.label}</Tag>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{review.call_date ? fmtD(review.call_date) : ''}</span>
            {(review.attendees || []).length > 0 && !isMobile && (
              <span style={{ fontSize: 11, color: C.ink5 }}>· {(review.attendees || []).slice(0, 4).join(', ')}</span>
            )}
          </div>
        </div>
        <Tag bg={C.accS} fg={C.acc}>{items.length} proposed</Tag>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.cr2}`, padding: '14px 16px', background: C.bg2 }}>
          {review.summary && <p style={{ fontSize: 13, color: C.ink7, lineHeight: 1.55, margin: '0 0 12px' }}>{review.summary}</p>}

          {items.length === 0 && <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>The AI found nothing actionable — dismiss, or read the transcript.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <div key={item.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', background: C.bg, border: `1px solid ${item.checked && !item.disabled ? C.acc + '50' : C.cr2}`, borderRadius: 8, opacity: item.disabled ? .55 : 1 }}>
                <input
                  type="checkbox"
                  checked={item.checked && !item.disabled}
                  disabled={item.disabled}
                  onChange={() => toggle(item.key)}
                  style={{ marginTop: 3, width: 15, height: 15, accentColor: C.acc, cursor: item.disabled ? 'not-allowed' : 'pointer' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink9, lineHeight: 1.35 }}>
                    {item.label}
                    {typeof item.confidence === 'number' && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: item.confidence > 0.7 ? C.grn : C.yel, marginLeft: 6 }}>
                        {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  {item.disabled && <div style={{ fontSize: 10.5, color: C.yel, marginTop: 2 }}>{item.disabledReason}</div>}
                  {!item.disabled && (
                    <textarea
                      value={item.detail}
                      onChange={e => editDetail(item.key, e.target.value)}
                      rows={Math.min(3, Math.max(1, Math.ceil((item.detail || '').length / 70)))}
                      style={{ width: '100%', marginTop: 4, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: SANS, fontSize: 12, color: C.ink5, lineHeight: 1.45, padding: 0 }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Transcript */}
          {review.transcript && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowTx(s => !s)} style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, cursor: 'pointer', padding: 0 }}>
                {showTx ? '▾ Hide transcript' : '▸ Show transcript'}
              </button>
              {showTx && (
                <pre style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: SANS, fontSize: 12, color: C.ink5, lineHeight: 1.5, background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, padding: 12 }}>
                  {review.transcript.slice(0, 20000)}
                </pre>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
            <Btn v="gho" onClick={dismiss} disabled={busy}>Dismiss</Btn>
            <Btn onClick={approve} disabled={busy || checkedCount === 0}>
              {busy ? <><Spinner size={12} color={C.bg} /> Applying…</> : `Approve ${checkedCount} item${checkedCount === 1 ? '' : 's'}`}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Review({ showToast }) {
  const [tab, setTab]         = useState('pending'); // pending | approved | dismissed
  const [reviews, setReviews] = useState(null);
  const isMobile = useIsMobile();

  const load = useCallback(() => {
    setReviews(null);
    listReviews(tab).then(setReviews).catch(e => { showToast?.('Load failed: ' + e.message); setReviews([]); });
  }, [tab, showToast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Eyebrow>Approve before it hits the CRM</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 28 : 36, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>
        Review
      </h1>
      <p style={{ fontSize: 13, color: C.ink5, marginBottom: 18, maxWidth: 620 }}>
        Calls from Granola and audio dumps land here with AI-proposed actions. Check what's right, edit anything, then approve — only approved items are written to contacts, tasks, and activities.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['pending', 'approved', 'dismissed'].map(s => (
          <button key={s} onClick={() => setTab(s)} style={{
            background: tab === s ? C.ink9 : C.bg, color: tab === s ? C.bg : C.ink5,
            border: `1px solid ${tab === s ? C.ink9 : C.cr3}`, borderRadius: 999,
            padding: '5px 13px', fontSize: 11, fontFamily: SANS, cursor: 'pointer', textTransform: 'capitalize',
          }}>{s}</button>
        ))}
      </div>

      {reviews === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={28} /></div>
      ) : reviews.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontSize: 13, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 12 }}>
          {tab === 'pending' ? 'Nothing waiting for review. New Granola calls appear here within ~15 minutes of ending.' : `No ${tab} reviews.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reviews.map(r => <ReviewCard key={r.id} review={r} onDone={load} showToast={showToast} />)}
        </div>
      )}
    </div>
  );
}
