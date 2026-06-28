import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO, prBg, prFg, stBg, stFg } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, PBar } from '../components/UI.jsx';
import { getGoals, createGoal } from '../api.js';

export default function TeamGoals({ showToast, openOv, closeOv }) {
  const [goals,   setGoals]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    getGoals()
      .then(setGoals)
      .catch(e => showToast('Could not load goals: ' + e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  function GForm() {
    const [f, setF] = useState({ goal: '', owner: '', quarter: 'Q2 2026', status: 'Not Started', priority: '', progress: 0, notes: '' });
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (!f.goal.trim()) { showToast('Goal is required'); return; }
      setSaving(true);
      try {
        await createGoal({ ...f, progress: Number(f.progress) || 0, category: [] });
        showToast('Goal added ✓'); closeOv(); load();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setSaving(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Goal *"><Inp value={f.goal} onChange={fld('goal')} placeholder="What are we aiming for?" /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} /></FR>
          <FR label="Quarter">
            <Sel value={f.quarter} onChange={fld('quarter')}>
              {['Q1 2026','Q2 2026','Q3 2026','Q4 2026','Q1 2027'].map(q => <option key={q}>{q}</option>)}
            </Sel>
          </FR>
          <FR label="Status">
            <Sel value={f.status} onChange={fld('status')}>
              {['Not Started','In Progress','On Track','At Risk','Blocked','Done'].map(s => <option key={s}>{s}</option>)}
            </Sel>
          </FR>
          <FR label="Priority">
            <Sel value={f.priority} onChange={fld('priority')}><option value="">—</option><option>High</option><option>Medium</option><option>Low</option></Sel>
          </FR>
        </div>
        <FR label="Progress %"><Inp type="number" value={f.progress} onChange={fld('progress')} /></FR>
        <FR label="Notes">
          <textarea value={f.notes} onChange={fld('notes')} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, resize: 'vertical', minHeight: 60, width: '100%', color: C.ink8 }} />
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create goal'}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>Strategy</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Team Goals</h1>
        </div>
        <Btn onClick={() => openOv({ kind: 'modal', title: 'New team goal', body: <GForm /> })}>+ New</Btn>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading goals…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {goals.length ? goals.map(g => (
            <div key={g.id} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, lineHeight: 1.2, color: C.ink9, margin: 0 }}>{g.goal}</h3>
                {g.status && <Tag bg={stBg(g.status)} fg={stFg(g.status)}>{g.status}</Tag>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink5 }}>{g.owner} · {g.quarter}</div>
              {g.notes && <div style={{ fontSize: 13, color: C.ink5, lineHeight: 1.5 }}>{g.notes}</div>}
              <PBar pct={g.progress} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.priority && <Tag bg={prBg(g.priority)} fg={prFg(g.priority)}>{g.priority}</Tag>}
                {(g.category || []).map(cat => <Tag key={cat} bg="transparent" fg={C.ink5}>{cat}</Tag>)}
              </div>
            </div>
          )) : (
            <div style={{ padding: 32, color: C.ink3, fontSize: 13 }}>No goals yet. Create one to get started.</div>
          )}
        </div>
      )}
    </div>
  );
}
