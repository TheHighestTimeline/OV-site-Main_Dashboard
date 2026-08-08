// One task, full page.
//
// A task row tells you what it is. This tells you what happened to it — which is
// the part that was living in someone's head, or in a Slack thread, or nowhere.
//
// THE WORK LOG IS APPEND-ONLY. Newest first, each entry stamped with a date and
// who wrote it. It is deliberately not a free-text box you rewrite: the value of
// a log is that yesterday's entry still says what it said yesterday. Correcting
// a typo is what Airtable is for.
//
// Description is what the task IS. The log is what has HAPPENED. Collapsing the
// two loses whichever one you write over.

import { useState, useMemo, useEffect } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { updateTask, deleteTask } from '../../api.js';
import DriveSuggestions from '../../components/DriveSuggestions.jsx';

const STATUSES = ['Not Started', 'Submitted', 'In Progress', 'Waiting On Response', 'On Hold', 'Needs Attention', 'Done', 'Complete', 'Canceled', 'Archive'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const TERMINAL = new Set(['done', 'complete', 'canceled', 'archive', 'archived']);

const lbl = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, display: 'block', marginBottom: 4,
};

const inp = {
  background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8,
  padding: '7px 10px', fontFamily: SANS, fontSize: 13, color: C.ink9,
  width: '100%', boxSizing: 'border-box', outline: 'none',
};

const btn = {
  padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.cr3}`,
  background: 'transparent', color: C.ink5, fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function TaskPage({
  task, opportunities = [], contacts = [], onChanged, onClose, showToast, confirm,
}) {
  const [name,  setName]  = useState(task.name || task.task || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [entry, setEntry] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [adding, setAdding] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl,   setLinkUrl]   = useState('');

  useEffect(() => {
    setName(task.name || task.task || '');
    setNotes(task.notes || '');
  }, [task.id, task.name, task.task, task.notes]);

  const links = Array.isArray(task.links) ? task.links : [];

  // Newest first, exactly as stored. Split on the stamp so a multi-line entry
  // stays one entry rather than becoming several.
  const logEntries = useMemo(() => {
    const raw = String(task.workLog || '').trim();
    if (!raw) return [];
    return raw.split(/\n{2,}/).map(block => {
      const m = block.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
      return m ? { meta: m[1], body: m[2].trim() } : { meta: null, body: block.trim() };
    }).filter(e => e.body);
  }, [task.workLog]);

  const done    = TERMINAL.has(String(task.status || '').trim().toLowerCase());
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = !done && task.dueDate && String(task.dueDate).slice(0, 10) < today;

  async function save(patch) {
    setBusy(true);
    try {
      await updateTask(task.id, patch);
      onChanged?.();
    } catch (e) {
      showToast?.('Could not save: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addEntry() {
    const text = entry.trim();
    if (!text) return;
    setBusy(true);
    try {
      // The server stamps and prepends. Doing it here would let two people
      // logging minutes apart overwrite each other.
      await updateTask(task.id, { appendLog: text });
      setEntry('');
      onChanged?.();
    } catch (e) {
      showToast?.('Could not add that entry: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function addLink() {
    const u = linkUrl.trim();
    if (!u) return;
    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    let host = 'link';
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { /* keep fallback */ }
    save({ links: [...links, { label: linkLabel.trim() || host, url: href }] });
    setLinkLabel('');
    setLinkUrl('');
    setAdding(false);
  }

  function removeLink(i) {
    save({ links: links.filter((_, idx) => idx !== i) });
  }

  function remove() {
    confirm?.({
      itemName: task.name || task.task,
      confirmLabel: 'Delete task',
      onConfirm: async () => {
        await deleteTask(task.id);
        showToast?.('Task deleted');
        onClose?.();
        onChanged?.();
      },
    });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
      {/* ══ LEFT: the task itself ═════════════════════════════════════════ */}
      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Task</span>
          <input
            value={name}
            disabled={busy}
            onChange={e => setName(e.target.value)}
            onBlur={() => {
              const v = name.trim();
              if (v && v !== (task.name || task.task)) save({ task: v });
              else if (!v) setName(task.name || task.task || '');
            }}
            style={{ ...inp, fontSize: 15 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <span style={lbl}>Status</span>
            <select value={task.status || ''} disabled={busy} onChange={e => save({ status: e.target.value })} style={inp}>
              <option value="">—</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
              {task.status && !STATUSES.includes(task.status) && <option>{task.status}</option>}
            </select>
          </div>
          <div>
            <span style={lbl}>Priority</span>
            <select value={normPriority(task.priority)} disabled={busy} onChange={e => save({ priority: e.target.value })} style={inp}>
              <option value="">—</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Due{overdue ? ' · overdue' : ''}</span>
            <input
              type="date"
              value={task.dueDate ? String(task.dueDate).slice(0, 10) : ''}
              disabled={busy}
              onChange={e => save({ dueDate: e.target.value || null })}
              style={{ ...inp, borderColor: overdue ? C.red : C.cr3 }}
            />
          </div>
          <div>
            <span style={lbl}>Opportunity</span>
            <select
              value={(task.opportunityIds || [])[0] || ''}
              disabled={busy}
              onChange={e => save({ opportunityIds: e.target.value ? [e.target.value] : [] })}
              style={inp}
            >
              <option value="">Unlinked</option>
              {opportunities.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Who it is for</span>
          <select
            value={(task.contactIds || [])[0] || ''}
            disabled={busy}
            onChange={e => save({ contactIds: e.target.value ? [e.target.value] : [] })}
            style={inp}
          >
            <option value="">Nobody linked</option>
            {contacts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>What this task is</span>
          <textarea
            value={notes}
            disabled={busy}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes || '') && save({ notes })}
            rows={5}
            placeholder="Scope, acceptance, anything the assignee needs before starting."
            style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
          />
        </div>

        {/* ── Links ───────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Documents and links</span>
          {/* Drive files named after this task or its deal, offered as a count
              rather than a list — accepting one appends it to the links below. */}
          <DriveSuggestions kind="task" id={task.id} onLinked={onChanged} showToast={showToast} />
          {links.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
              {links.map((l, i) => (
                <span key={`${l.url}-${i}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 6px 3px 10px', borderRadius: 999,
                  background: C.bg2, border: `1px solid ${C.cr2}`,
                }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
                    style={{ color: C.acc, fontFamily: SANS, fontSize: 11.5, textDecoration: 'none' }}>
                    {l.label} ↗
                  </a>
                  <button onClick={() => removeLink(i)} disabled={busy} title="Remove"
                    style={{ border: 'none', background: 'none', color: C.ink3, cursor: 'pointer', fontSize: 11 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {adding ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Name, e.g. Spec"
                style={{ ...inp, flex: '0 1 150px' }} autoFocus />
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="https://…"
                style={{ ...inp, flex: '1 1 200px' }} />
              <button onClick={addLink} disabled={busy || !linkUrl.trim()}
                style={{ ...btn, borderColor: linkUrl.trim() ? C.acc : C.cr3, color: linkUrl.trim() ? C.acc : C.ink3 }}>Save</button>
              <button onClick={() => { setAdding(false); setLinkLabel(''); setLinkUrl(''); }} style={btn}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={btn}>＋ Add a link</button>
          )}
        </div>

        <button onClick={remove} disabled={busy} style={{ ...btn, borderColor: `${C.red}55`, color: C.red }}>
          Delete task
        </button>
      </div>

      {/* ══ RIGHT: the work log ═══════════════════════════════════════════ */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
          color: C.ink3, borderBottom: `1px solid ${C.cr2}`, paddingBottom: 6, marginBottom: 12,
        }}>Work log · {logEntries.length}</div>

        <div style={{ marginBottom: 14 }}>
          <textarea
            value={entry}
            disabled={busy}
            onChange={e => setEntry(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addEntry();
            }}
            rows={3}
            placeholder="What did you just do on this? ⌘↵ to log it."
            style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button onClick={addEntry} disabled={busy || !entry.trim()} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: entry.trim() ? C.acc : C.cr3, color: '#fff',
              fontFamily: MONO, fontSize: 10, letterSpacing: '.05em',
              fontWeight: 600, cursor: entry.trim() ? 'pointer' : 'default',
            }}>{busy ? '…' : 'Log it'}</button>
            <span style={{ fontSize: 11, color: C.ink3 }}>
              Entries are stamped and never overwritten.
            </span>
          </div>
        </div>

        {!logEntries.length && (
          <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
            Nothing logged yet. This is where the history of the work lives — what you
            tried, who you chased, what came back.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {logEntries.map((e, i) => (
            <div key={i} style={{
              borderLeft: `2px solid ${i === 0 ? C.acc : C.cr3}`,
              paddingLeft: 11,
            }}>
              {e.meta && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginBottom: 3 }}>{e.meta}</div>
              )}
              <div style={{
                fontFamily: SANS, fontSize: 12.5, color: C.ink8,
                lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}>{e.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The base holds both "High" and "High Priority"; the page offers the short one. */
function normPriority(p) {
  const k = String(p || '').replace(/\s*Priority\s*/i, '').trim();
  return PRIORITIES.includes(k) ? k : '';
}
