// A task, editable in place from inside the opportunity popup.
//
// Collapsed it is one line: status dot, name, due date. Expanded it is the whole
// record — name, status, priority, due date, and which opportunity it belongs to.
// Re-pointing the Opportunity link from here is deliberate: a task filed against
// the wrong deal is the most common thing you notice while looking at that deal,
// and making you leave for the Tasks tab to fix it is why it never gets fixed.
//
// Writes go straight to Airtable on change. The parent reloads afterwards so a
// task moved to another opportunity actually leaves this list.

import { useState } from 'react';
import { C, SANS, MONO } from '../../constants.js';
import { updateTask } from '../../api.js';

const STATUSES  = ['Not Started', 'Submitted', 'In Progress', 'Waiting', 'Done', 'Archive'];
const PRIORITIES = ['High Priority', 'Medium Priority', 'Low Priority'];
const TERMINAL  = new Set(['done', 'complete', 'canceled', 'archive', 'archived']);

const lbl = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, display: 'block', marginBottom: 3,
};

const inp = {
  background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8,
  padding: '6px 10px', fontFamily: SANS, fontSize: 12.5, color: C.ink9,
  width: '100%', boxSizing: 'border-box', outline: 'none',
};

export default function TaskRowEditor({ task, opportunities = [], onChanged, showToast }) {
  const [open,  setOpen]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [name,  setName]  = useState(task.name || task.task || '');

  const done    = TERMINAL.has(String(task.status || '').trim().toLowerCase());
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = !done && task.dueDate && String(task.dueDate).slice(0, 10) < today;

  async function save(patch) {
    setBusy(true);
    try {
      await updateTask(task.id, patch);
      onChanged?.();
    } catch (e) {
      showToast?.(`Could not save: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      border: `1px solid ${open ? C.acc : C.cr2}`, borderRadius: 8,
      background: open ? C.bg2 : 'transparent', marginBottom: 5,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: done ? C.grn : overdue ? C.red : C.ink3,
        }} />
        <span style={{
          flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12.5,
          color: done ? C.ink3 : C.ink9,
          textDecoration: done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.name || task.task || '(untitled)'}</span>
        {task.dueDate && (
          <span style={{
            fontFamily: MONO, fontSize: 9, flexShrink: 0,
            color: overdue ? C.red : C.ink3, fontWeight: overdue ? 700 : 400,
          }}>{String(task.dueDate).slice(5, 10)}</span>
        )}
        <span style={{ color: C.ink2, fontSize: 9, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 10px 10px', display: 'grid', gap: 8 }}>
          <div>
            <span style={lbl}>Name</span>
            <input
              value={name}
              disabled={busy}
              onChange={e => setName(e.target.value)}
              onBlur={() => name.trim() && name !== (task.name || task.task) && save({ task: name.trim() })}
              style={inp}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <span style={lbl}>Status</span>
              <select
                value={task.status || ''}
                disabled={busy}
                onChange={e => save({ status: e.target.value })}
                style={inp}
              >
                <option value="">—</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
                {task.status && !STATUSES.includes(task.status) && <option>{task.status}</option>}
              </select>
            </div>
            <div>
              <span style={lbl}>Priority</span>
              <select
                value={task.priority || ''}
                disabled={busy}
                onChange={e => save({ priority: e.target.value })}
                style={inp}
              >
                <option value="">—</option>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <span style={lbl}>Due</span>
              <input
                type="date"
                value={task.dueDate ? String(task.dueDate).slice(0, 10) : ''}
                disabled={busy}
                onChange={e => save({ dueDate: e.target.value || null })}
                style={inp}
              />
            </div>
            <div>
              <span style={lbl}>Opportunity</span>
              {/* A–Z: this is a name lookup, and any other order makes you hunt. */}
              <select
                value={(task.opportunityIds || [])[0] || ''}
                disabled={busy}
                onChange={e => save({ opportunityIds: e.target.value ? [e.target.value] : [] })}
                style={inp}
              >
                <option value="">Unlinked</option>
                {opportunities
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

