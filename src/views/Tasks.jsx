import { useState, useEffect, useCallback, useRef } from 'react';
import { C, SERIF, SANS, MONO, DB, STATUSES, prBg, prFg, stFg, dUntil, fmtD, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, VoiceMic, PBar, useConfirm } from '../components/UI.jsx';
import { getTasks, createTask, updateTask, deleteTask, getTaskNotes, parseVoice, uploadFile, getOpportunities,
         getProjects, getClients, getAirtableSchema, airtableRecordUrl } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { dealCategoryMatchesSlug, SLUG_TO_DEAL_CATEGORY } from '../constants/roles.js';

const DEFAULT_LANE_ORDER = [
  'OVMG', 'OneVibeMediaGroup', 'OneVibeGroup', 'OneVibe',
  'Carbon Sponge', 'OneVibeFest', 'Amplify', 'Amplify Artists',
];

// Maps a company slug (from CompanyView) to the company-name tokens that may
// appear on a task's companyNames[]. Used to pre-filter the per-company Tasks
// view (§6) so one company can never surface another company's tasks. Short
// abbreviations are matched exactly (so 'ovm' never matches 'ovmg'); longer
// phrases are matched as a substring.
const COMPANY_FILTER_TOKENS = {
  ovmg:         ['ovmg', 'onevibemediagroup'],
  ovm:          ['ovm'],
  ovtv:         ['ovtv', 'onevibetv'],
  ovf:          ['ovf', 'onevibefest'],
  amplify:      ['amplify'],
  carbonsponge: ['carbonsponge', 'carbon sponge'],
  ovd:          ['ovd'],
  ovv:          ['ovv'],
};

// Company tab label → slug, and slug → the canonical tag written onto new tasks
// so a task added under a company tab also shows on that company's page.
const TAB_TO_SLUG = {
  OVMG: 'ovmg', OVM: 'ovm', OVTV: 'ovtv', OVF: 'ovf',
  Amplify: 'amplify', CarbonSponge: 'carbonsponge', OVD: 'ovd', OVV: 'ovv',
};
const SLUG_TO_TAG = {
  ovmg: 'OVMG', ovm: 'OVM', ovtv: 'OVTV', ovf: 'OVF',
  amplify: 'Amplify', carbonsponge: 'Carbon Sponge', ovd: 'OVD', ovv: 'OVV',
};
const TAB_LABELS = {
  OVMG: 'OVMG', OVM: 'OVM', OVTV: 'OVTV', OVF: 'OVF',
  Amplify: 'Amplify Artists', CarbonSponge: 'Carbon Sponge', OVD: 'OVD', OVV: 'OVV',
};

// The 8 company lanes shown on the main Tasks board — always rendered, even when
// empty, so every company has its own black section bar (not just the companies
// that happen to already have tasks).
const COMPANY_LANES = [
  { slug: 'ovmg', label: 'OVMG' },         { slug: 'ovm',  label: 'OVM' },
  { slug: 'ovtv', label: 'OVTV' },         { slug: 'ovf',  label: 'OVF' },
  { slug: 'amplify', label: 'Amplify Artists' },   { slug: 'carbonsponge', label: 'Carbon Sponge' },
  { slug: 'ovd',  label: 'OVD' },          { slug: 'ovv',  label: 'OVV' },
];

// Sections = subgroups inside a company, backed by the Notion "Task Type" select.
// These standing subgroups always show on a company page; users can add custom
// ones (also stored as Task Type values) and remove their own.
const STANDARD_SECTIONS = ['Admin', 'Client', 'Team', 'External', 'Automation'];

// Canonical Notion "Deal Category" options — the tag picker, so a task can carry
// extra category tags on top of its primary company.
const DEAL_CATEGORIES = [
  'OVMG', 'ONEVIBEMEDIA', 'ONEVIBEDATA', 'ONEVIBEFEST', 'AMPLIFYARTISTS',
  'AMPLIFYBRANDS', 'CARBON SPONGE', 'DATA CENTERS', 'ONEVIBEPRODUCTIONS',
  'ONEVIBEGROUP', 'SOLR ESS', 'OTHER', 'LIFE',
];

// Exact for short abbreviations (so 'ovm' never matches 'ovmg'), substring for
// longer phrases — same rule as constants/roles.js companyNameMatchesSlug.
function nameMatchesSlug(name, slug) {
  if (!slug) return true;
  if (!name) return false;
  const n = String(name).toLowerCase().trim();
  const tokens = COMPANY_FILTER_TOKENS[slug] || [slug];
  return tokens.some(tok => (tok.length <= 4 ? n === tok : n.includes(tok)));
}

// Priority ordering for the unified board — High first, then Medium, Low, and
// anything unset last; ties broken by soonest due date.
const PR_RANK = { high: 0, medium: 1, low: 2 };
const prRank = p => (p && PR_RANK[String(p).toLowerCase()] != null ? PR_RANK[String(p).toLowerCase()] : 3);
function byPriority(a, b) {
  const d = prRank(a.priority) - prRank(b.priority);
  if (d) return d;
  const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  return ad - bd;
}

// Task Type → pill colors, so each task carries its category (Admin/Client/Team/…)
// as a little colored pill on the unified board. Keys are C token names.
const TYPE_PILL = {
  Admin:      ['bluS', 'blu'],
  Client:     ['grnS', 'grn'],
  Team:       ['yelS', 'yel'],
  External:   ['redS', 'red'],
  Automation: ['grS',  'ink5'],
  Tanner:     ['accS', 'acc'],
};

export default function Tasks({ user, showToast, openOv, closeOv, companyFilter = null, initialFilter = null }) {
  const isMobile = useIsMobile();
  const [tasks,     setTasks]     = useState([]);
  const [opps,      setOpps]      = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [clients,   setClients]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tfAs,      setTfAs]      = useState(initialFilter?.assignee || 'All');
  const [tfPr,      setTfPr]      = useState('All');
  const [tfDeal,    setTfDeal]    = useState('All');
  const [tfCo,      setTfCo]      = useState('All');
  const [tfWork,    setTfWork]    = useState('All'); // 'All' | 'internal' | 'external'
  const [tfSection, setTfSection] = useState('All'); // 'All' | section name | '__none__'
  const [tfDue,     setTfDue]     = useState(initialFilter?.due || 'All'); // 'All' | 'overdue'
  const [collapsed, setCollapsed] = useState(new Set());
  const didInitCollapse = useRef(false);
  const [confirmNode, confirm] = useConfirm();

  // §6: user-added sections (deal-category lanes). Persisted per company scope so
  // an empty section survives refresh until a task is dropped into it (at which
  // point it becomes a real, Notion-backed lane on its own).
  const SECTIONS_KEY = `ovmg.tasks.extraSections.${companyFilter || 'all'}`;
  const [extraLanes, setExtraLanes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '[]'); } catch { return []; }
  });
  const addSection = (name) => {
    const n = (name || '').trim();
    if (!n) return;
    setExtraLanes(prev => {
      const next = prev.includes(n) ? prev : [...prev, n];
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  // Remove a user-added section. Standard sections can't be removed. Tasks that
  // were filed under it keep their Task Type in Notion — they just fall back to
  // the "Unsectioned" lane until re-filed.
  const removeSection = (name) => {
    setExtraLanes(prev => {
      const next = prev.filter(s => s !== name);
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const TASK_COMPANIES = ['All', 'OVMG', 'OVM', 'OVTV', 'OVF', 'Amplify', 'CarbonSponge', 'OVD', 'OVV'];

  const myFirst = user.fullName.split(' ')[0].toLowerCase();

  const load = useCallback(() =>
    getTasks()
      .then(setTasks)
      .catch(e => showToast('Could not load tasks: ' + e.message))
      .finally(() => setLoading(false)),
  [showToast]);

  useEffect(() => { load(); }, [load]);

  // Airtable table ID for "Open in Airtable" deep-links
  const [taskTableId, setTaskTableId] = useState(null);
  useEffect(() => {
    getAirtableSchema().then(({ tables }) => {
      const t = tables.find(t => t.name === 'Master Action Board' || t.name === 'Tasks');
      if (t) setTaskTableId(t.id);
    }).catch(() => {});
  }, []);

  // Opportunities power the internal/external view: a task inherits its work type
  // from its related Opportunity's "Work Type" (Internal/External). Best-effort —
  // if this fails the TYPE toggle simply stays hidden.
  useEffect(() => { getOpportunities().then(setOpps).catch(() => {}); }, []);
  useEffect(() => { getProjects().then(setProjects).catch(() => {}); }, []);
  useEffect(() => { getClients().then(setClients).catch(() => {}); }, []);
  const oppMap = (() => { const m = {}; opps.forEach(o => { m[o.id] = o; }); return m; })();
  const taskWorkType = (t) => {
    // Prefer the task's own Internal/External tag; fall back to its opportunity.
    if (t.type) return String(t.type).toLowerCase();
    for (const id of (t.relatedOpportunities || [])) {
      const o = oppMap[id];
      if (o && o.kanbanType) return o.kanbanType;
    }
    return null;
  };

  // Move a card to another status column (drag-and-drop). Optimistic, with a
  // background Notion write; reverts via reload on failure.
  const moveTask = async (taskId, newStatus) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t || (t.status || '') === newStatus) return;
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: newStatus } : x));
    try { await updateTask(taskId, { status: newStatus }); showToast(`→ ${newStatus}`); }
    catch (e) { showToast('Move failed: ' + e.message); load(); }
  };

  const owners = Array.from(new Set(tasks.map(t => t.owner).filter(Boolean))).sort();

  const allDealCats = (() => {
    const cats = Array.from(new Set(tasks.flatMap(t => t.dealCategory || []).filter(Boolean)));
    return cats.sort((a, b) => {
      const ai = DEFAULT_LANE_ORDER.indexOf(a), bi = DEFAULT_LANE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
  })();

  // §6 per-company pre-filter — locks this view to its company's tasks. A task
  // belongs to a company via its Deal Category (Tanner's canonical mapping),
  // falling back to legacy companyNames tags.
  const matchesCompany = (t) => {
    if (!companyFilter) return true;
    return dealCategoryMatchesSlug(t.dealCategory, companyFilter, t.companyNames);
  };

  // Active company scope: a company page (companyFilter) or the selected tab.
  const activeCompanySlug = companyFilter || (tfCo !== 'All' ? TAB_TO_SLUG[tfCo] : null);
  const activeCompanyTag  = activeCompanySlug ? SLUG_TO_TAG[activeCompanySlug] : null;
  // The canonical Notion Deal Category value for the active company — this is
  // what a new task must be tagged with so it surfaces on that company's page.
  const activeCompanyCategory = activeCompanySlug ? (SLUG_TO_DEAL_CATEGORY[activeCompanySlug] || [])[0] || null : null;

  const filtered = tasks.filter(t => {
    if (companyFilter && !matchesCompany(t)) return false;
    if (tfAs === '__me__' && !(t.owner || '').toLowerCase().startsWith(myFirst)) return false;
    if (tfAs !== 'All' && tfAs !== '__me__' && t.owner !== tfAs) return false;
    if (tfPr !== 'All' && t.priority !== tfPr) return false;
    if (tfDue === 'overdue') { const d = dUntil(t.dueDate); if (!(d !== null && d < 0)) return false; }
    // Company tab: match by Deal Category (the canonical company link), with a
    // legacy companyNames fallback.
    if (tfCo !== 'All') {
      const slug = TAB_TO_SLUG[tfCo];
      if (slug && !dealCategoryMatchesSlug(t.dealCategory, slug, t.companyNames)) return false;
    }
    return true;
  });
  const dealFiltered = filtered.filter(t => {
    if (tfDeal === 'All') return true;
    if (tfDeal === '__unassigned__') return !t.dealCategory || t.dealCategory.length === 0;
    return (t.dealCategory || []).includes(tfDeal);
  });
  // Internal/external view (like the Kanban tab) — driven by the related
  // Opportunity's Work Type.
  const workFiltered = dealFiltered.filter(t => tfWork === 'All' || taskWorkType(t) === tfWork);

  // ── Section filter + final list ────────────────────────────────────────────
  // Sections (the Task Type subgroups: Admin/Client/Team/External/Automation +
  // custom) used to be separate black lanes. They're now a pill on each card and
  // a filter up top, so the whole board is visible at once.
  const sectionList = [...STANDARD_SECTIONS, ...extraLanes.filter(s => !STANDARD_SECTIONS.includes(s))];
  const sectionFiltered = workFiltered.filter(t => {
    if (tfSection === 'All') return true;
    if (tfSection === '__none__') return !sectionList.includes(t.taskType || '');
    return (t.taskType || '') === tfSection;
  });

  // ── Task edit drawer ────────────────────────────────────────────────────────
  function TEdit({ task: initialTask }) {
    const [taskTitle, setTaskTitle] = useState(initialTask.task);
    const [st,        setSt]        = useState(initialTask.status   || '');
    const [pr,        setPr]        = useState(initialTask.priority  || '');
    const [ow,        setOw]        = useState(initialTask.owner     || '');
    const [dd,        setDd]        = useState(initialTask.dueDate   || '');
    // Company assignment — derive the current slug from the task's Deal Category.
    const initialCoSlug = (() => {
      const dc = (initialTask.dealCategory || []).map(s => String(s).toLowerCase().replace(/\s+/g, ''));
      for (const [slug, cats] of Object.entries(SLUG_TO_DEAL_CATEGORY)) {
        if (cats.some(c => dc.includes(c.toLowerCase().replace(/\s+/g, '')))) return slug;
      }
      return '';
    })();
    const [co,        setCo]        = useState(initialCoSlug);
    const [sec,       setSec]       = useState(initialTask.taskType || '');
    const [oppId,     setOppId]     = useState((initialTask.opportunityIds || [])[0] || '');
    const [projId,    setProjId]    = useState((initialTask.relatedProjectIds || [])[0] || '');
    const [cliId,     setCliId]     = useState((initialTask.clientIds || [])[0] || '');
    const [wtype,     setWtype]     = useState(initialTask.type || '');
    const [saving,    setSaving]    = useState(false);
    const sectionOpts = [...STANDARD_SECTIONS, ...extraLanes.filter(s => !STANDARD_SECTIONS.includes(s))];
    const [deleting,  setDeleting]  = useState(false);
    const [confirmNode, confirm]    = useConfirm();

    // Typed note
    const [noteText,  setNoteText]  = useState('');
    const [savingNote,setSavingNote]= useState(false);
    const [notes,     setNotes]     = useState([]);
    const [notesLoad, setNotesLoad] = useState(true);

    // File upload
    const [files,       setFiles]       = useState([]);
    const [uploading,   setUploading]   = useState(false);
    const [dragOver,    setDragOver]    = useState(false);
    const fileInputRef = useRef(null);

    // Voice
    const [voiceMode,   setVoiceMode]   = useState(false);
    const [voiceResult, setVoiceResult] = useState(null);

    // Detect changes
    const changed =
      taskTitle !== initialTask.task          ||
      st        !== (initialTask.status   || '') ||
      pr        !== (initialTask.priority  || '') ||
      ow        !== (initialTask.owner     || '') ||
      dd        !== (initialTask.dueDate   || '') ||
      co        !== initialCoSlug             ||
      sec       !== (initialTask.taskType || '') ||
      wtype     !== (initialTask.type || '')     ||
      oppId     !== ((initialTask.opportunityIds   || [])[0] || '') ||
      projId    !== ((initialTask.relatedProjectIds || [])[0] || '') ||
      cliId     !== ((initialTask.clientIds        || [])[0] || '');

    // Load notes on mount
    useEffect(() => {
      getTaskNotes(initialTask.id)
        .then(setNotes)
        .catch(() => {})
        .finally(() => setNotesLoad(false));
    }, [initialTask.id]);

    // Keyboard shortcuts
    useEffect(() => {
      const handler = e => {
        if (e.key === 'Escape') { closeOv(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          if (changed && !saving) saveChanges();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    });

    const saveChanges = async () => {
      setSaving(true);
      // Deal Category = the company (same Notion column). The single Deal
      // Category dropdown maps to the company's canonical category.
      const companyCat = co ? (SLUG_TO_DEAL_CATEGORY[co] || [])[0] : null;
      const nextCats   = [companyCat].filter(Boolean);
      setTasks(prev => prev.map(t =>
        t.id === initialTask.id
          ? { ...t, task: taskTitle, status: st, priority: pr, owner: ow, dueDate: dd, dealCategory: nextCats, taskType: sec }
          : t
      ));
      try {
        await updateTask(initialTask.id, {
          task: taskTitle, status: st, priority: pr, owner: ow, dueDate: dd || null,
          dealCategory: nextCats, taskType: sec || null, type: wtype || null,
          opportunityIds:    oppId  ? [oppId]  : [],
          relatedProjectIds: projId ? [projId] : [],
          clientIds:         cliId  ? [cliId]  : [],
        });
        showToast('Saved ✓');
        closeOv();
        load(); // background refetch
      } catch (e) {
        showToast('Failed: ' + e.message);
        load(); // revert optimistic update
      }
      setSaving(false);
    };

    const saveNote = async () => {
      if (!noteText.trim()) return;
      setSavingNote(true);
      try {
        await updateTask(initialTask.id, { updateNote: noteText.trim() });
        showToast('Note added ✓');
        setNoteText('');
        // Reload notes
        const fresh = await getTaskNotes(initialTask.id);
        setNotes(fresh);
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setSavingNote(false);
    };

    const handleDelete = () => confirm({
      itemName: initialTask.task,
      confirmLabel: 'Delete task',
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteTask(initialTask.id);
          showToast('Deleted');
          closeOv();
          setTasks(prev => prev.filter(t => t.id !== initialTask.id));
          load();
        } catch (e) {
          showToast('Failed: ' + e.message);
          setDeleting(false);
          throw e; // keep the confirm dialog open on failure
        }
      },
    });

    const handleVoiceUpdate = async text => {
      try {
        const res = await parseVoice(text, { section: 'task-update', task: initialTask });
        setVoiceResult({ note: text, newStatus: res.newStatus || null, summary: res.summary });
      } catch {
        setVoiceResult({ note: text });
      }
    };

    const applyVoiceUpdate = async () => {
      if (!voiceResult) return;
      try {
        await updateTask(initialTask.id, {
          ...(voiceResult.newStatus ? { status: voiceResult.newStatus } : {}),
          updateNote: voiceResult.note,
        });
        showToast('Voice update saved ✓');
        setVoiceMode(false);
        setVoiceResult(null);
        closeOv();
        load();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
    };

    // File upload helpers
    const handleFiles = async (fileList) => {
      const arr = Array.from(fileList);
      if (!arr.length) return;
      setUploading(true);
      try {
        for (const file of arr) {
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onload = async () => {
              try {
                const base64 = reader.result.split(',')[1];
                const res = await uploadFile({
                  taskId: initialTask.id,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  base64,
                });
                setFiles(prev => [...prev, { name: file.name, type: file.type, url: res.url, size: file.size }]);
                resolve();
              } catch (e) {
                showToast('Upload failed: ' + e.message);
                resolve();
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
        showToast('File(s) attached ✓');
      } catch (e) {
        showToast('Upload error: ' + e.message);
      }
      setUploading(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {confirmNode}

        {/* ── Core fields ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <FR label="Task title">
            <Inp value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="What needs to be done?" />
          </FR>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <FR label="Status">
              <Sel value={st} onChange={e => setSt(e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </Sel>
            </FR>
            <FR label="Priority">
              <Sel value={pr} onChange={e => setPr(e.target.value)}>
                <option value="">—</option><option>High</option><option>Medium</option><option>Low</option>
              </Sel>
            </FR>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <FR label="Owner">
              <Inp value={ow} onChange={e => setOw(e.target.value)} placeholder="Name" />
            </FR>
            <FR label="Due date">
              <Inp type="date" value={dd} onChange={e => setDd(e.target.value)} />
            </FR>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            {/* Deal Category IS the company (same Notion column) — one dropdown,
                with Section right next to it. */}
            <FR label="Deal Category">
              <Sel value={co} onChange={e => setCo(e.target.value)}>
                <option value="">— Unassigned</option>
                {COMPANY_LANES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </Sel>
            </FR>
            {/* Section = the subgroup (Task Type) inside the company. */}
            <FR label="Section">
              <Sel value={sec} onChange={e => setSec(e.target.value)}>
                <option value="">— None</option>
                {sectionOpts.map(s => <option key={s} value={s}>{s}</option>)}
              </Sel>
            </FR>
          </div>
          {/* Internal/External + cross-table connections (editable). */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <FR label="Type">
              <Sel value={wtype} onChange={e => setWtype(e.target.value)}>
                <option value="">— Unset</option>
                <option value="Internal">Internal</option>
                <option value="External">External</option>
              </Sel>
            </FR>
            <FR label="Opportunity">
              <Sel value={oppId} onChange={e => setOppId(e.target.value)}>
                <option value="">— None</option>
                {opps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Sel>
            </FR>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <FR label="Project">
              <Sel value={projId} onChange={e => setProjId(e.target.value)}>
                <option value="">— None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Sel>
            </FR>
            <FR label="Client">
              <Sel value={cliId} onChange={e => setCliId(e.target.value)}>
                <option value="">— None</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel>
            </FR>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Btn v="dan" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete task'}
            </Btn>
            <a href={airtableRecordUrl(taskTableId, initialTask.id)} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ⊞ Airtable ↗
            </a>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn v="gho" onClick={closeOv}>Cancel</Btn>
            <Btn onClick={saveChanges} disabled={saving || !changed}>
              {saving ? 'Saving…' : 'Save changes'}
            </Btn>
          </div>
        </div>

        {/* ── Notes section ────────────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${C.cr2}`, paddingTop: 16 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, margin: '0 0 12px' }}>Notes</h3>

          {/* Typed note input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveNote(); } }}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg,
                color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5,
                resize: 'vertical', outline: 'none', transition: 'border-color .15s',
              }}
              onFocus={e => { e.target.style.borderColor = C.acc; }}
              onBlur={e => { e.target.style.borderColor = C.cr3; }}
              disabled={savingNote}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn onClick={saveNote} disabled={savingNote || !noteText.trim()}>
                {savingNote ? 'Saving…' : 'Add note'}
              </Btn>
            </div>
          </div>

          {/* Notes list */}
          {notesLoad ? (
            <div style={{ fontSize: 12, color: C.ink3, padding: '8px 0' }}>Loading notes…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.ink3, padding: '8px 0', fontStyle: 'italic' }}>No notes yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map(n => (
                <div key={n.id} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`, borderRadius: 6, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    {n.author && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                        {n.author}
                      </span>
                    )}
                    {n.timestamp && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                        {n.emoji} {n.timestamp}
                      </span>
                    )}
                    {n.createdTime && !n.timestamp && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.06em' }}>
                        {fmtR(n.createdTime)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink7, lineHeight: 1.5 }}>{n.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── File uploads ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${C.cr2}`, paddingTop: 16 }}>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, margin: '0 0 12px' }}>Attachments</h3>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? C.acc : C.cr3}`,
              borderRadius: 10, padding: '16px', textAlign: 'center',
              cursor: 'pointer', background: dragOver ? C.accS : C.bg2,
              transition: 'all .15s', marginBottom: 12,
            }}>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)} />
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {uploading ? 'Uploading…' : 'Drop images / PDFs here, or click to browse'}
            </div>
          </div>
          {files.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {files.map((f, i) => {
                const isImage = f.type.startsWith('image/');
                return (
                  <div key={i} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 200 }}>
                    {isImage && f.url
                      ? <img src={f.url} alt={f.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, background: C.cr2, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>PDF</div>
                    }
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{(f.size / 1024).toFixed(0)} KB</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Voice update ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${C.cr2}`, paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17, margin: 0 }}>Voice update</h3>
            <Btn v="gho" onClick={() => setVoiceMode(v => !v)}>◉ {voiceMode ? 'Cancel' : 'Record'}</Btn>
          </div>
          {!voiceMode && <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>Record a quick update — appended as a timestamped note.</p>}
          {voiceMode && (
            <div>
              <VoiceMic label="What did you get done?" size={60} onTranscript={handleVoiceUpdate} />
              {voiceResult && (
                <div style={{ background: C.bg2, borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                  <p style={{ fontSize: 13, color: C.ink7, margin: '0 0 8px', lineHeight: 1.5 }}>{voiceResult.note}</p>
                  {voiceResult.newStatus && <Tag bg={C.bluS} fg={C.blu}>Status: {voiceResult.newStatus}</Tag>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                    <Btn v="gho" onClick={() => setVoiceResult(null)}>Re-record</Btn>
                    <Btn onClick={applyVoiceUpdate}>Apply update</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── New task form ───────────────────────────────────────────────────────────
  // Robust intake: company (all 8), section (Task Type subgroup), extra category
  // tags, owner, notes — everything captured up front and written to Notion.
  function TForm({ presetCompanySlug = '', presetSection = '' }) {
    // Default company: explicit preset → the page/tab's active company → none.
    const [f, setF] = useState({
      task: '', owner: '', priority: '', status: 'Not Started', dueDate: '',
      company: presetCompanySlug || activeCompanySlug || '',
      section: presetSection || '',
      type: '',
      opportunityId: '',
      projectId: '',
      clientId: '',
      note: '',
    });
    // Extra category tags beyond the primary company tag.
    const [tags, setTags] = useState([]);
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const toggleTag = t => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const [saving, setSaving] = useState(false);

    // Section options: standing subgroups + any custom sections in this scope.
    const sectionOpts = [...STANDARD_SECTIONS, ...extraLanes.filter(s => !STANDARD_SECTIONS.includes(s))];
    // The primary Deal Category written for the chosen company.
    const companyCat = f.company ? (SLUG_TO_DEAL_CATEGORY[f.company] || [])[0] : null;

    const save = async () => {
      if (!f.task.trim()) { showToast('Task name required'); return; }
      setSaving(true);
      try {
        const cats = [...new Set([companyCat, activeCompanyCategory, ...tags].filter(Boolean))];
        // Entity (single-select) is the company tab driver. Use the chosen
        // company's canonical category, falling back to the active company page.
        const entity = companyCat || activeCompanyCategory || undefined;
        await createTask({
          task: f.task, owner: f.owner, priority: f.priority, status: f.status,
          dueDate: f.dueDate, entity, type: f.type || undefined,
          dealCategory: cats, taskType: f.section || undefined,
          opportunityIds:    f.opportunityId ? [f.opportunityId] : undefined,
          relatedProjectIds: f.projectId     ? [f.projectId]     : undefined,
          clientIds:         f.clientId      ? [f.clientId]      : undefined,
          note: f.note || undefined,
        });
        showToast('Task created ✓');
        closeOv();
        load();
      } catch (e) {
        showToast('Failed to create: ' + e.message);
      }
      setSaving(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Task *"><Inp value={f.task} onChange={fld('task')} placeholder="What needs to be done?" /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} placeholder="Name" /></FR>
          <FR label="Priority">
            <Sel value={f.priority} onChange={fld('priority')}>
              <option value="">—</option><option>High</option><option>Medium</option><option>Low</option>
            </Sel>
          </FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Status">
            <Sel value={f.status} onChange={fld('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</Sel>
          </FR>
          <FR label="Due date"><Inp type="date" value={f.dueDate} onChange={fld('dueDate')} /></FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          {/* Company = Deal Category. All 8 are always available. Locked when the
              form is opened from inside a company page. */}
          <FR label="Deal Category">
            <Sel value={f.company} onChange={fld('company')} sx={{ opacity: companyFilter ? 0.6 : 1 }}>
              <option value="">— Unassigned</option>
              {COMPANY_LANES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </Sel>
          </FR>
          {/* Section appears once a company is in scope (matches Tanner's flow). */}
          <FR label="Section">
            <Sel value={f.section} onChange={fld('section')}>
              <option value="">— None</option>
              {sectionOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </FR>
        </div>
        <FR label="Type">
          <Sel value={f.type} onChange={fld('type')}>
            <option value="">— Unset</option>
            <option value="Internal">Internal</option>
            <option value="External">External</option>
          </Sel>
        </FR>
        {/* Cross-table connections — link this task to an opportunity, project, or client. */}
        <FR label="Opportunity">
          <Sel value={f.opportunityId} onChange={fld('opportunityId')}>
            <option value="">— None</option>
            {opps.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Sel>
        </FR>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Project">
            <Sel value={f.projectId} onChange={fld('projectId')}>
              <option value="">— None</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Sel>
          </FR>
          <FR label="Client">
            <Sel value={f.clientId} onChange={fld('clientId')}>
              <option value="">— None</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel>
          </FR>
        </div>
        <FR label="Tags (extra categories)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEAL_CATEGORIES.filter(d => d !== companyCat).map(d => {
              const on = tags.includes(d);
              return (
                <button key={d} type="button" onClick={() => toggleTag(d)}
                  style={{ padding: '3px 9px', borderRadius: 999, fontFamily: MONO, fontSize: 10, cursor: 'pointer',
                    background: on ? C.ink9 : C.bg2, color: on ? C.bg : C.ink5,
                    border: `1px solid ${on ? C.ink9 : C.cr3}` }}>
                  {d}
                </button>
              );
            })}
          </div>
        </FR>
        <FR label="Notes">
          <textarea value={f.note} onChange={fld('note')} placeholder="Anything you already know about this task…" rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1px solid ${C.cr3}`,
              borderRadius: 8, background: C.bg2, color: C.ink8, fontFamily: SANS, fontSize: 13, lineHeight: 1.5,
              resize: 'vertical', outline: 'none' }} />
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create task'}</Btn>
        </div>
      </div>
    );
  }

  // ── Add Section form ──────────────────────────────────────────────────────────
  function AddSectionForm() {
    const [name, setName] = useState('');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>
          Add a subgroup inside this company (e.g. a workflow, client group, or
          phase). It appears as its own black section bar with the full status
          board; assign tasks to it via their Section field.
        </p>
        <FR label="Section name *">
          <Inp value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Onboarding, Legal, Q3 Outreach" autoFocus />
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={() => { if (name.trim()) { addSection(name); closeOv(); } }} disabled={!name.trim()}>Add section</Btn>
        </div>
      </div>
    );
  }

  // ── Voice create ────────────────────────────────────────────────────────────
  // The review form is its own component so VoiceTaskForm can early-return the
  // record step WITHOUT calling hooks conditionally (Rules of Hooks).
  function VoiceTaskForm() {
    const [step,    setStep]    = useState('record');
    const [prefill, setPrefill] = useState(null);
    const handleTranscript = async text => {
      try {
        const res = await parseVoice(text, { section: 'new-task', tasks });
        setPrefill(res.task || { task: text, priority: 'Medium', status: 'Not Started' });
      } catch {
        setPrefill({ task: text, priority: 'Medium', status: 'Not Started' });
      }
      setStep('review');
    };
    if (step === 'record') return (
      <div>
        <p style={{ color: C.ink5, fontSize: 13, margin: '0 0 4px' }}>Describe what needs to be done, who should do it, and when.</p>
        <VoiceMic label="Tap to capture task" size={72} onTranscript={handleTranscript} />
      </div>
    );
    return <VoiceReviewForm prefill={prefill} />;
  }

  function VoiceReviewForm({ prefill }) {
    const [f, setF] = useState({ task: '', owner: '', priority: 'Medium', status: 'Not Started', dueDate: '', dealCategory: '', ...prefill });
    const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    const [saving, setSaving] = useState(false);
    const save = async () => {
      if (!f.task.trim()) { showToast('Task name required'); return; }
      setSaving(true);
      try {
        const cats = [...new Set([activeCompanyCategory, f.dealCategory].filter(Boolean))];
        const entity = f.dealCategory || activeCompanyCategory || undefined;
        await createTask({ ...f, entity, dealCategory: cats });
        showToast('Task created ✓'); closeOv(); load();
      } catch (e) { showToast('Failed: ' + e.message); }
      setSaving(false);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Task *"><Inp value={f.task} onChange={fld('task')} /></FR>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Owner"><Inp value={f.owner} onChange={fld('owner')} /></FR>
          <FR label="Priority">
            <Sel value={f.priority} onChange={fld('priority')}>
              <option value="">—</option><option>High</option><option>Medium</option><option>Low</option>
            </Sel>
          </FR>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <FR label="Status"><Sel value={f.status} onChange={fld('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</Sel></FR>
          <FR label="Due date"><Inp type="date" value={f.dueDate} onChange={fld('dueDate')} /></FR>
        </div>
        <FR label="Deal Category">
          <Sel value={f.dealCategory} onChange={fld('dealCategory')}>
            <option value="">— Unassigned</option>
            {allDealCats.map(d => <option key={d} value={d}>{d}</option>)}
          </Sel>
        </FR>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create task'}</Btn>
        </div>
      </div>
    );
  }

  // ── Task card ───────────────────────────────────────────────────────────────
  // The section (Task Type) pill always shows now that sections aren't lanes.
  // showDealPill adds the deal-category pill — on the all-companies board, off on
  // a single-company page (where every card is that same company → redundant).
  // draggable/onDragStart/onDragEnd: wired by StatusColumns for drag-and-drop.
  function TaskCard({ t, showDealPill = false, draggable = false, onDragStart, onDragEnd }) {
    const due = dUntil(t.dueDate);
    const dl  = due === null ? '' : due < 0 ? `${-due}d overdue` : due === 0 ? 'today' : `in ${due}d`;
    const dueBg = due === null ? C.grS : due < 0 ? C.redS : due <= 2 ? C.yelS : C.grS;
    const dueFg = due === null ? C.ink5 : due < 0 ? C.red  : due <= 2 ? C.yel  : C.ink5;
    const [tpB, tpF] = TYPE_PILL[t.taskType] || ['grS', 'ink5'];
    // Track whether an actual drag occurred so clicks aren't swallowed by the
    // browser's drag-detection (even a 1-pixel mouse move triggers dragstart).
    const didDrag = useRef(false);
    const taskName = t.task || '';

    const handleDragStart = e => { didDrag.current = true; onDragStart?.(e); };
    const handleDragEnd   = e => { setTimeout(() => { didDrag.current = false; }, 0); onDragEnd?.(e); };

    return (
      <div
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (didDrag.current) return;
          openOv({
            kind: 'drawer',
            title: taskName.length > 40 ? taskName.slice(0, 40) + '…' : taskName || 'Untitled',
            sub: (t.owner || 'Unassigned') + (t.dueDate ? ` · due ${fmtD(t.dueDate)}` : ''),
            body: <TEdit task={t} />,
          });
        }}
        style={{ background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6, padding: '10px 13px', cursor: draggable ? 'grab' : 'pointer', transition: 'transform .15s ease' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={e => e.currentTarget.style.transform = ''}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: C.ink9, marginBottom: 7, lineHeight: 1.3 }}>{t.task}</div>
        {/* Front-face pills, in priority of importance: section · deal category ·
            priority · owner · due. The deal-category pill is hidden on a
            single-company page (showDealPill=false) since it'd repeat on every
            card. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {t.taskType && <Tag bg={C[tpB]} fg={C[tpF]}>{t.taskType}</Tag>}
          {(t.relatedProjectNames || []).map((pn, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 999, fontSize: 10, color: C.ink7, fontFamily: MONO }}>
              <span style={{ color: C.acc }}>▸</span>{pn}
            </span>
          ))}
          {t.priority && <Tag bg={prBg(t.priority)} fg={prFg(t.priority)}>{t.priority}</Tag>}
          {t.owner
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 999, fontSize: 10, color: C.ink7, fontFamily: MONO }}>◉ {t.owner}</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10, color: C.accD, fontWeight: 600, fontFamily: MONO }}>◌ unassigned</span>
          }
          {t.dueDate && <Tag bg={dueBg} fg={dueFg}>{dl}</Tag>}
        </div>
        {t.progress_pct != null && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.cr2}` }}>
            <PBar pct={t.progress_pct} />
          </div>
        )}
      </div>
    );
  }

  // ── Status board (the Kanban itself) ─────────────────────────────────────────
  // The single board for BOTH the all-companies view and a company page. Renders
  // every status as a column (even empty), sorts each column High→Low priority,
  // and supports click-and-hold drag of a card to another column — which moves
  // the task through the workflow (updates its status).
  function StatusColumns({ tasks, showDealPill = false }) {
    const [dragId,  setDragId]  = useState(null);
    const [overCol, setOverCol] = useState(null);
    const byStatus = {};
    tasks.forEach(t => { const s = t.status || 'No status'; (byStatus[s] = byStatus[s] || []).push(t); });
    Object.values(byStatus).forEach(arr => arr.sort(byPriority));
    const activeCols = [...STATUSES, ...Object.keys(byStatus).filter(s => !STATUSES.includes(s))];

    const handleDrop = status => e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      setOverCol(null); setDragId(null);
      if (id) moveTask(id, status);
    };

    if (isMobile) {
      // Touch drag is unreliable; mobile stays a tap-to-open stacked list.
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeCols.map(status => {
            const col = byStatus[status] || [];
            return (
              <div key={status}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px 5px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: stFg(status), flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, flexShrink: 0 }}>{status}</span>
                  <span style={{ flex: 1, borderTop: `1px dashed ${C.cr2}` }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{col.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.map(t => <TaskCard key={t.id} t={t} showDealPill={showDealPill} />)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {activeCols.map(status => {
          const col = byStatus[status] || [];
          const isOver = overCol === status;
          return (
            <div key={status}
              onDragOver={e => { e.preventDefault(); if (overCol !== status) setOverCol(status); }}
              onDragLeave={e => { if (e.currentTarget === e.target) setOverCol(null); }}
              onDrop={handleDrop(status)}
              style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: stFg(status) }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>{status}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{col.length}</span>
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60, flex: 1,
                background: isOver ? C.accS : (col.length ? 'transparent' : C.bg2),
                border: isOver ? `1px dashed ${C.acc}` : '1px solid transparent',
                borderRadius: 6, padding: isOver ? 4 : 0, transition: 'background .12s',
              }}>
                {col.map(t => (
                  <TaskCard key={t.id} t={t} showDealPill={showDealPill}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function FilterRow({ label, value, onChange, options }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8, overflowX: 'auto', maxWidth: '100%' }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>{label}</span>
        {options.map(({ v, l }) => (
          <button key={v} onClick={() => onChange(v)} style={{ background: value === v ? C.ink9 : C.bg, color: value === v ? C.bg : C.ink5, border: `1px solid ${value === v ? C.ink9 : C.cr3}`, borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>
            {l}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      {confirmNode}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>Execution</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 28 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Tasks</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {activeCompanyCategory && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.acc, background: C.accS, border: `1px solid ${C.acc}30`, borderRadius: 999, padding: '3px 10px' }}>
              ◉ new tasks tag → {activeCompanyCategory}
            </span>
          )}
          <Btn v="gho" onClick={() => openOv({ kind: 'modal', title: 'Voice create task', body: <VoiceTaskForm /> })}>◉ Voice</Btn>
          {companyFilter && (
            <Btn v="gho" onClick={() => openOv({ kind: 'modal', title: 'Add section', body: <AddSectionForm /> })}>+ Section</Btn>
          )}
          <Btn onClick={() => openOv({ kind: 'modal', title: 'New task', body: <TForm presetSection={(tfSection !== 'All' && tfSection !== '__none__') ? tfSection : ''} /> })}>+ New</Btn>
        </div>
      </div>

      {/* Company tabs — main Tasks view only. Selecting a company filters to its
          tasks and tags any task you add here so it also appears on that
          company's page (§ task↔company linkage). */}
      {!companyFilter && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: `1px solid ${C.cr2}` }}>
          {TASK_COMPANIES.map(c => {
            const active = tfCo === c;
            return (
              <button
                key={c}
                onClick={() => setTfCo(c)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${active ? C.ink9 : 'transparent'}`,
                  color: active ? C.ink9 : C.ink5, fontFamily: MONO, fontSize: 11,
                  letterSpacing: '.06em', textTransform: 'uppercase',
                  padding: '8px 11px', cursor: 'pointer', fontWeight: active ? 700 : 500,
                  marginBottom: -1, whiteSpace: 'nowrap',
                }}
              >
                {TAB_LABELS[c] || c}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <FilterRow label="ASSIGNEE" value={tfAs} onChange={setTfAs} options={[{ v: 'All', l: 'All' }, { v: '__me__', l: 'My tasks' }, ...owners.slice(0, 4).map(o => ({ v: o, l: o }))]} />
        <FilterRow label="PRIORITY" value={tfPr} onChange={setTfPr} options={['All', 'High', 'Medium', 'Low'].map(p => ({ v: p, l: p }))} />
        <FilterRow label="DUE" value={tfDue} onChange={setTfDue} options={[{ v: 'All', l: 'All' }, { v: 'overdue', l: 'Overdue' }]} />
        {allDealCats.length > 0 && (
          <FilterRow label="DEAL" value={tfDeal} onChange={setTfDeal} options={[{ v: 'All', l: 'All' }, ...allDealCats.map(d => ({ v: d, l: d })), { v: '__unassigned__', l: 'Unassigned' }]} />
        )}
        {opps.length > 0 && (
          <FilterRow label="TYPE" value={tfWork} onChange={setTfWork} options={[{ v: 'All', l: 'All' }, { v: 'internal', l: 'Internal' }, { v: 'external', l: 'External' }]} />
        )}
        <FilterRow label="SECTION" value={tfSection} onChange={setTfSection}
          options={[{ v: 'All', l: 'All' }, ...sectionList.map(s => ({ v: s, l: s })), { v: '__none__', l: 'None' }]} />
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading tasks…</div>
      ) : (
        // One unified Kanban for both the all-companies view and a company page.
        // Every task lives here, sorted High→Low priority inside each status
        // column, with its section (and, on the all-companies board, its deal
        // category) shown as a pill. Drag a card between columns to move it
        // through the workflow.
        <div style={{ border: `1px solid ${C.cr2}`, borderRadius: 12, background: C.bg, padding: isMobile ? '10px' : '14px' }}>
          <StatusColumns tasks={sectionFiltered} showDealPill={!companyFilter} />
        </div>
      )}
    </div>
  );
}
