// src/views/AmplifyKanban.jsx
// Kanban board backed by the Airtable "Amplify Projects" table.
// New projects arrive automatically via Zapier → Airtable → dashboard on refresh.
import { useState, useEffect, useRef, useMemo } from 'react';
import { C, SERIF, SANS, MONO, fmtD } from '../constants.js';
import { Spinner, Tag, Btn, FR, Inp } from '../components/UI.jsx';
import { getAmplifyProjects, updateAmplifyProject, airtableRecordUrl, getAirtableSchema } from '../api.js';

// ── Kanban column order & colors ──────────────────────────────────────────────
const STAGES = [
  { id: 'Intake Needed',  color: '#e8a838' },
  { id: 'In Progress',    color: '#3b82f6' },
  { id: 'Quality Check',  color: '#8b5cf6' },
  { id: 'First Delivery', color: '#06b6d4' },
  { id: 'Revision',       color: '#f97316' },
  { id: 'Final Delivery', color: '#10b981' },
  { id: 'Hold',           color: '#6b7280' },
  { id: 'Closed',         color: '#1d4ed8' },
  { id: 'Cancelled',      color: '#ef4444' },
];

const PRIORITY_MAP = {
  'high':          { bg: '#fee2e2', fg: '#ef4444' },
  'high priority': { bg: '#fee2e2', fg: '#ef4444' },
  'medium':        { bg: '#fef9c3', fg: '#ca8a04' },
  'low':           { bg: '#f0fdf4', fg: '#16a34a' },
};

// ── Project detail drawer ─────────────────────────────────────────────────────
function ProjectDrawer({ project, onSave, onClose, showToast, tableId }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status:   project.status   || 'Intake Needed',
    notes:    project.notes    || '',
    priority: project.priority || '',
    dueDate:  project.dueDate  ? project.dueDate.slice(0, 10) : '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await updateAmplifyProject(project.id, form);
      showToast?.('Saved');
      onSave?.();
      onClose?.();
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Read-only meta tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {project.deliverableType  && <Tag bg={C.bluS} fg={C.blu}>{project.deliverableType}</Tag>}
        {project.productPurchased && <Tag bg={C.purS} fg={C.pur}>{project.productPurchased}</Tag>}
        {project.client           && <Tag bg={C.cr2}  fg={C.ink5}>{project.client}</Tag>}
        {project.amplifyNumber    && <Tag bg={C.cr2}  fg={C.ink4}>#{project.amplifyNumber}</Tag>}
      </div>

      {/* External links */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {project.driveFolder   && <a href={project.driveFolder}   target="_blank" rel="noreferrer" style={linkStyle}>◫ Drive ↗</a>}
        {project.tallyLink     && <a href={project.tallyLink}     target="_blank" rel="noreferrer" style={linkStyle}>◉ Brief ↗</a>}
        {project.googleDocLink && <a href={project.googleDocLink} target="_blank" rel="noreferrer" style={linkStyle}>◧ Doc ↗</a>}
        <a href={airtableRecordUrl(tableId, project.id)} target="_blank" rel="noreferrer" style={{ ...linkStyle, color: C.ink4 }}>
          ⊞ Airtable ↗
        </a>
      </div>

      {/* Editable fields */}
      <FR label="Status">
        <select value={form.status} onChange={e => set('status', e.target.value)}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.cr3}`,
            background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 13 }}>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
      </FR>

      <FR label="Priority">
        <Inp value={form.priority} onChange={e => set('priority', e.target.value)} placeholder="High / Medium / Low" />
      </FR>

      <FR label="Due Date">
        <Inp type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
      </FR>

      <FR label="Internal Notes">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={5}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.cr3}`,
            background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 13,
            resize: 'vertical', boxSizing: 'border-box' }} />
      </FR>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </div>
  );
}

const linkStyle = { fontSize: 12, color: C.blu, textDecoration: 'none', fontFamily: MONO };

// ── Project card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onDragStart, onDragEnd, onClick }) {
  const didDrag = useRef(false);
  const pc = PRIORITY_MAP[String(project.priority || '').toLowerCase()];

  return (
    <div
      draggable
      onDragStart={e => { didDrag.current = true; onDragStart?.(e, project); }}
      onDragEnd={() => { setTimeout(() => { didDrag.current = false; }, 0); onDragEnd?.(); }}
      onClick={() => { if (!didDrag.current) onClick?.(project); }}
      style={{
        background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 10,
        padding: '10px 12px', cursor: 'pointer', marginBottom: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)', transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)'}
    >
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: C.ink9, lineHeight: 1.3 }}>
        {project.name || '(untitled)'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
        {project.client          && <span style={{ fontSize: 11, color: C.ink4, fontFamily: MONO }}>{project.client}</span>}
        {project.deliverableType && <Tag bg={C.bluS} fg={C.blu} style={{ fontSize: 10 }}>{project.deliverableType}</Tag>}
        {pc && project.priority  && <Tag bg={pc.bg} fg={pc.fg} style={{ fontSize: 10 }}>{project.priority}</Tag>}
      </div>
      {project.dueDate && (
        <div style={{ fontSize: 11, color: C.ink4, fontFamily: MONO, marginTop: 5 }}>
          Due {fmtD(project.dueDate)}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AmplifyKanban({ showToast, openOv, closeOv }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('All');
  const [dragOverStage, setDragOverStage] = useState(null);
  const [tableId, setTableId]   = useState(null);
  const dragProject = useRef(null);

  const load = () => {
    setLoading(true); setError(null);
    getAmplifyProjects()
      .then(data => { setProjects(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    getAirtableSchema().then(schema => {
      const t = (schema.tables || []).find(t => /amplify projects/i.test(t.name));
      if (t) setTableId(t.id);
    }).catch(() => {});
  }, []);

  // Deliverable type filter options
  const deliverableTypes = useMemo(() => {
    const s = [...new Set(projects.map(p => p.deliverableType).filter(Boolean))].sort();
    return ['All', ...s];
  }, [projects]);

  // Filtered list
  const scoped = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.client || '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'All') list = list.filter(p => p.deliverableType === filterType);
    return list;
  }, [projects, search, filterType]);

  // Group by stage
  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map(s => [s.id, []]));
    scoped.forEach(p => {
      const key = STAGES.find(s => s.id === p.status) ? p.status : 'Intake Needed';
      m[key].push(p);
    });
    return m;
  }, [scoped]);

  // Drag handlers
  const handleDragStart = (e, project) => { dragProject.current = project; };
  const handleDragOver  = (e, stageId) => { e.preventDefault(); setDragOverStage(stageId); };
  const handleDragLeave = () => setDragOverStage(null);
  const handleDrop = async (e, stageId) => {
    e.preventDefault(); setDragOverStage(null);
    const p = dragProject.current;
    if (!p || p.status === stageId) return;
    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: stageId } : x));
    try {
      await updateAmplifyProject(p.id, { status: stageId });
    } catch {
      showToast?.('Failed to move project');
      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: p.status } : x));
    }
    dragProject.current = null;
  };

  const openProject = project => {
    openOv({
      kind: 'drawer',
      title: project.name || 'Untitled',
      sub: [project.client, project.deliverableType].filter(Boolean).join(' · '),
      body: <ProjectDrawer project={project} onSave={load} onClose={closeOv} showToast={showToast} tableId={tableId} />,
    });
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>;
  if (error)   return <div style={{ padding: 24, color: C.red || '#ef4444', fontFamily: MONO, fontSize: 13 }}>Error: {error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: C.ink9, letterSpacing: '-.02em' }}>
            Amplify Projects
          </div>
          <div style={{ fontSize: 12, color: C.ink4, fontFamily: SANS, marginTop: 2 }}>
            {scoped.length} project{scoped.length !== 1 ? 's' : ''}
            {filterType !== 'All' ? ` · ${filterType}` : ''}
            {' · synced from Airtable'}
          </div>
        </div>
        <Btn onClick={load} variant="ghost" style={{ fontSize: 12 }}>↺ Refresh</Btn>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects or clients…"
          style={{
            padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.cr3}`,
            background: C.bg, color: C.ink9, fontFamily: SANS, fontSize: 13,
            width: 220, outline: 'none',
          }}
        />
        {deliverableTypes.length > 1 && deliverableTypes.map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{
            padding: '5px 11px', borderRadius: 99, fontSize: 12, fontFamily: SANS, cursor: 'pointer',
            border: `1px solid ${filterType === t ? C.ink9 : C.cr3}`,
            background: filterType === t ? C.ink9 : C.bg,
            color: filterType === t ? C.bg : C.ink5,
            fontWeight: filterType === t ? 500 : 400,
          }}>{t}</button>
        ))}
      </div>

      {/* Kanban columns */}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 16, alignItems: 'flex-start' }}>
        {STAGES.map(stage => {
          const cards = byStage[stage.id] || [];
          const isOver = dragOverStage === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={e => handleDragOver(e, stage.id)}
              onDrop={e => handleDrop(e, stage.id)}
              onDragLeave={handleDragLeave}
              style={{
                flex: '0 0 230px', display: 'flex', flexDirection: 'column',
                background: isOver ? stage.color + '18' : C.bg2,
                border: `1.5px solid ${isOver ? stage.color : C.cr3}`,
                borderRadius: 12, padding: '12px 10px', minHeight: 200,
                transition: 'background .15s, border-color .15s',
              }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: stage.color,
                  textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>
                  {stage.id}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink4,
                  background: C.cr2, borderRadius: 99, padding: '1px 7px' }}>
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              {cards.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onDragStart={handleDragStart}
                  onDragEnd={() => { dragProject.current = null; }}
                  onClick={openProject}
                />
              ))}

              {cards.length === 0 && (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: C.ink4,
                  fontFamily: SANS, fontSize: 12, border: `1.5px dashed ${C.cr3}`, borderRadius: 8 }}>
                  Drop here
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
