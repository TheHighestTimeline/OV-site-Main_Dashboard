import { useState, useEffect, useRef } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, useConfirm } from '../components/UI.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { getAppState, setAppState, getOpportunities } from '../api.js';
import { dealCategoryMatchesSlug } from '../constants/roles.js';

// ── Placeholder data ───────────────────────────────────────────────────────────
const PLACEHOLDER_DATA = {
  ovmg: {
    name: 'OneVibe Media Group',
    sections: [
      {
        id: 's1',
        title: 'Admin',
        adminOnly: true,
        open: true,
        items: [
          { id: 'f1', type: 'folder', name: 'Corporate Documents',  url: '#' },
          { id: 'f2', type: 'folder', name: 'HR & Contracts',       url: '#' },
          { id: 'f3', type: 'doc',    name: 'Operating Agreement',  url: '#' },
          { id: 'f4', type: 'sheet',  name: 'Cap Table',            url: '#' },
        ],
      },
      {
        id: 's2',
        title: 'Legal',
        adminOnly: false,
        open: true,
        items: [
          { id: 'f5', type: 'folder', name: 'NDAs',                 url: '#' },
          { id: 'f6', type: 'folder', name: 'Client Agreements',    url: '#' },
          { id: 'f7', type: 'pdf',    name: 'Standard NDA Template', url: '#' },
        ],
      },
      {
        id: 's3',
        title: 'Operations',
        adminOnly: false,
        open: true,
        items: [
          { id: 'f8',  type: 'folder', name: 'SOPs',                url: '#' },
          { id: 'f9',  type: 'doc',    name: 'Team Handbook',       url: '#' },
          { id: 'f10', type: 'sheet',  name: 'Master Project Tracker', url: '#' },
        ],
      },
    ],
    templates: [
      { id: 't1', name: 'Client Proposal Template',   type: 'doc',   url: '#' },
      { id: 't2', name: 'Invoice Template',            type: 'sheet', url: '#' },
      { id: 't3', name: 'Project Brief Template',      type: 'doc',   url: '#' },
      { id: 't4', name: 'Creative Brief Template',     type: 'doc',   url: '#' },
    ],
  },
  amplify: {
    name: 'Amplify Artists',
    sections: [
      {
        id: 's1',
        title: 'Admin',
        adminOnly: true,
        open: true,
        items: [
          { id: 'f1', type: 'folder', name: 'Finance',              url: '#' },
          { id: 'f2', type: 'folder', name: 'Contracts',            url: '#' },
          { id: 'f3', type: 'sheet',  name: 'Revenue Tracker',      url: '#' },
        ],
      },
      {
        id: 's2',
        title: 'Clients',
        adminOnly: false,
        open: true,
        items: [
          { id: 'f4', type: 'folder', name: 'Nova Sound Collective', url: '#' },
          { id: 'f5', type: 'folder', name: 'Meridian Arts',         url: '#' },
          { id: 'f6', type: 'folder', name: 'Blackline Studios',     url: '#' },
        ],
      },
      {
        id: 's3',
        title: 'Marketing',
        adminOnly: false,
        open: false,
        items: [
          { id: 'f7', type: 'folder', name: 'Brand Assets',         url: '#' },
          { id: 'f8', type: 'folder', name: 'Social Media',         url: '#' },
          { id: 'f9', type: 'slides', name: 'Pitch Deck',           url: '#' },
        ],
      },
    ],
    templates: [
      { id: 't1', name: 'Artist Onboarding Checklist', type: 'doc',   url: '#' },
      { id: 't2', name: 'Content Calendar Template',   type: 'sheet', url: '#' },
      { id: 't3', name: 'Social Strategy Template',    type: 'doc',   url: '#' },
    ],
  },
  datacenter: {
    name: 'OVMG Datacenter',
    sections: [
      {
        id: 's1',
        title: 'Admin',
        adminOnly: true,
        open: true,
        items: [
          { id: 'f1', type: 'folder', name: 'Financial Models',      url: '#' },
          { id: 'f2', type: 'folder', name: 'JV Agreements',         url: '#' },
          { id: 'f3', type: 'sheet',  name: 'Deal Tracker',          url: '#' },
        ],
      },
      {
        id: 's2',
        title: 'Projects',
        adminOnly: false,
        open: true,
        items: [
          { id: 'f4', type: 'folder', name: 'Solar ESS Kingsboro',  url: '#' },
          { id: 'f5', type: 'folder', name: 'Nevada Hyperscale',    url: '#' },
        ],
      },
      {
        id: 's3',
        title: 'Due Diligence',
        adminOnly: false,
        open: false,
        items: [
          { id: 'f6', type: 'folder', name: 'Site Surveys',         url: '#' },
          { id: 'f7', type: 'folder', name: 'Power Studies',        url: '#' },
          { id: 'f8', type: 'folder', name: 'Environmental Reports', url: '#' },
        ],
      },
    ],
    templates: [
      { id: 't1', name: 'Project Due Diligence Checklist', type: 'doc',   url: '#' },
      { id: 't2', name: 'Proforma Model Template',         type: 'sheet', url: '#' },
      { id: 't3', name: 'LOI Template',                    type: 'doc',   url: '#' },
    ],
  },
};

const DEFAULT_DATA = {
  name: 'Company Drive',
  sections: [
    {
      id: 's1', title: 'General', adminOnly: false, open: true,
      items: [
        { id: 'f1', type: 'folder', name: 'Documents', url: '#' },
        { id: 'f2', type: 'folder', name: 'Assets',    url: '#' },
      ],
    },
  ],
  templates: [],
};

// ── File type icon ─────────────────────────────────────────────────────────────
function FileIcon({ type }) {
  const icons = {
    folder: '&#128193;',
    doc:    '&#128196;',
    sheet:  '&#128202;',
    slides: '&#127968;',
    pdf:    '&#128209;',
    image:  '&#128444;',
    video:  '&#127916;',
  };
  const html = icons[type] || icons.doc;
  return <span dangerouslySetInnerHTML={{ __html: html }} style={{ fontSize: 15, flexShrink: 0 }} />;
}

// ── Template row — §2: Name + URL inline-editable; icon is auto-derived from
// the file type and is NOT editable. Clicking the row opens the URL.
function TemplateRow({ t, isAdmin, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [url,  setUrl]  = useState(t.url);

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 8, background: C.cr1, border: `1px solid ${C.acc}40` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileIcon type={t.type} />
          <Inp value={name} onChange={e => setName(e.target.value)} placeholder="Template name" sx={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
        </div>
        <Inp value={url} onChange={e => setUrl(e.target.value)} placeholder="URL (https://…)" sx={{ fontSize: 12, padding: '5px 8px' }} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Btn v="gho" onClick={() => { setEditing(false); setName(t.name); setUrl(t.url); }} sx={{ fontSize: 10, padding: '3px 8px' }}>Cancel</Btn>
          <Btn onClick={() => { onSave({ name: name.trim() || t.name, url: url.trim() }); setEditing(false); }} sx={{ fontSize: 10, padding: '3px 8px' }}>Save</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: C.bg, border: `1px solid ${C.cr2}` }}>
      <a href={t.url || '#'} target="_blank" rel="noopener noreferrer" onClick={e => { if (!t.url || t.url === '#') e.preventDefault(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
        <FileIcon type={t.type} />
        <span style={{ fontSize: 13, color: C.ink8, fontFamily: SANS, flex: 1 }}>{t.name}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink2, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t.type}</span>
      </a>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', fontSize: 11, color: C.ink3, cursor: 'pointer', padding: '2px 6px' }}>edit</button>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', fontSize: 11, color: C.red, cursor: 'pointer', padding: '2px 6px' }}>remove</button>
        </div>
      )}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────
function DriveSection({ section, isAdmin, visibility, onSetVisibility, onToggleOpen, onRenameSection, onRemoveSection, onUpdateItem, onRemoveItem, onOpenLinkModal, showToast }) {
  const [editing, setEditing]   = useState(false);
  const [titleVal, setTitleVal] = useState(section.title);
  const [editItemId, setEditItemId] = useState(null);
  const [editItem, setEditItem]     = useState({});

  const saveTitle = () => {
    if (titleVal.trim()) onRenameSection(section.id, titleVal.trim());
    setEditing(false);
  };

  return (
    <div style={{ border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>

      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', background: C.bg2, cursor: 'pointer',
        userSelect: 'none',
      }}>
        <button
          onClick={() => onToggleOpen(section.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: C.ink3, flexShrink: 0 }}
        >
          {section.open ? '▾' : '▸'}
        </button>

        {editing && isAdmin ? (
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            <Inp value={titleVal} onChange={e => setTitleVal(e.target.value)} sx={{ padding: '4px 8px', fontSize: 13 }} />
            <Btn onClick={saveTitle} sx={{ padding: '4px 10px', fontSize: 11 }}>Save</Btn>
            <Btn v="gho" onClick={() => { setEditing(false); setTitleVal(section.title); }} sx={{ padding: '4px 10px', fontSize: 11 }}>Cancel</Btn>
            <button
              onClick={() => { setEditing(false); onRemoveSection(section); }}
              style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.red}40`, borderRadius: 6, padding: '4px 10px', fontFamily: SANS, fontSize: 11, color: C.red, cursor: 'pointer' }}
              title="Delete this section and all its files"
            >
              Delete Section
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onToggleOpen(section.id)}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink8, fontFamily: SANS }}>{section.title}</span>
            {section.adminOnly && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.acc, background: C.accS, border: `1px solid ${C.acc}30`, borderRadius: 4, padding: '1px 6px', letterSpacing: '.06em' }}>
                ADMIN
              </span>
            )}
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>({section.items.length})</span>
          </div>
        )}

        {isAdmin && !editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* §2 folder gating — who can see this folder */}
            <select
              value={visibility}
              onChange={e => { e.stopPropagation(); onSetVisibility(section.id, e.target.value); }}
              onClick={e => e.stopPropagation()}
              title="Folder visibility"
              style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '2px 6px', fontFamily: MONO, fontSize: 10, color: C.ink5, cursor: 'pointer' }}
            >
              <option value="everyone">Everyone</option>
              <option value="pm">Me + PM</option>
              <option value="admins">Admins</option>
              <option value="onlyme">Only me</option>
            </select>
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 11, fontFamily: MONO, padding: '2px 6px', borderRadius: 4 }}
              title="Rename section"
            >
              edit
            </button>
          </div>
        )}
      </div>

      {/* Section items */}
      {section.open && (
        <div style={{ padding: '6px 10px 10px' }}>
          {section.items.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11 }}>
              No files in this section
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...section.items].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(item => editItemId === item.id ? (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 6, background: C.cr1, border: `1px solid ${C.acc}40` }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Inp value={editItem.name || ''} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} placeholder="File name" sx={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                    <select value={editItem.type || 'doc'} onChange={e => setEditItem(p => ({ ...p, type: e.target.value }))} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 6, padding: '4px 8px', fontFamily: SANS, fontSize: 11, color: C.ink8 }}>
                      {['folder', 'doc', 'sheet', 'slides', 'pdf', 'image', 'video'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <Inp value={editItem.url || ''} onChange={e => setEditItem(p => ({ ...p, url: e.target.value }))} placeholder="URL (https://...)" sx={{ fontSize: 12, padding: '5px 8px' }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn v="gho" onClick={() => setEditItemId(null)} sx={{ fontSize: 10, padding: '3px 8px' }}>Cancel</Btn>
                    <Btn onClick={() => { onUpdateItem(section.id, item.id, editItem); setEditItemId(null); }} sx={{ fontSize: 10, padding: '3px 8px' }}>Save</Btn>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 6,
                    background: C.bg, border: `1px solid ${C.cr2}`,
                    transition: 'background .1s',
                  }}
                >
                  <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" onClick={e => { if (!item.url || item.url === '#') e.preventDefault(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
                    <FileIcon type={item.type} />
                    <span style={{ fontSize: 13, color: C.ink8, fontFamily: SANS, flex: 1 }}>{item.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink2, letterSpacing: '.06em', textTransform: 'uppercase' }}>{item.type}</span>
                  </a>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => { setEditItemId(item.id); setEditItem({ name: item.name, url: item.url, type: item.type }); }} style={{ background: 'none', border: 'none', fontSize: 11, color: C.ink3, cursor: 'pointer', padding: '2px 6px' }}>
                        edit
                      </button>
                      <button onClick={() => onRemoveItem(section.id, item)} style={{ background: 'none', border: 'none', fontSize: 11, color: C.red, cursor: 'pointer', padding: '2px 6px' }}>
                        remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div style={{ marginTop: 8 }}>
              <Btn
                v="gho"
                onClick={() => onOpenLinkModal(section.id)}
                sx={{ fontSize: 11, padding: '5px 10px' }}
              >
                + Link File
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Defensively normalize any sections array (placeholder OR server-saved) so a
// missing/old shape can never crash the render (white screen). Guarantees an
// array of sections, each with a stable id, title and an items[] array.
function normSections(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(Boolean).map((s, i) => ({
    id: s.id || `s${i}`,
    title: s.title || 'Untitled',
    adminOnly: !!s.adminOnly,
    open: s.open !== false,
    visibility: s.visibility,
    items: Array.isArray(s.items) ? s.items.filter(Boolean) : [],
  }));
}

// ── Server-side persistence (app_state KV store, auth'd via api.js) ────────────
async function loadDriveSectionsFromServer(company) {
  try {
    const { data } = await getAppState(`drive:${company}`);
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.error('Failed to load drive sections:', e);
    return null;
  }
}

async function saveDriveSectionsToServer(company, sections) {
  try {
    await setAppState(`drive:${company}`, sections);
  } catch (e) {
    console.error('Failed to save drive sections:', e);
  }
}

async function loadTemplateSectionsFromServer(company) {
  try {
    const { data } = await getAppState(`drive_templates:${company}`);
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.error('Failed to load template sections:', e);
    return null;
  }
}

async function saveTemplateSectionsToServer(company, templateSections) {
  try {
    await setAppState(`drive_templates:${company}`, templateSections);
  } catch (e) {
    console.error('Failed to save template sections:', e);
  }
}

// ── Main DriveView ─────────────────────────────────────────────────────────────
export default function DriveView({ company, user, showToast }) {
  const isMobile = useIsMobile();
  const isAdmin  = user?.isAdmin || user?.roles?.includes('admin') || (user?.email || '').endsWith('@onevibemediagroup.com');

  const raw        = PLACEHOLDER_DATA[company] || DEFAULT_DATA;
  const [sections, setSections] = useState(() => normSections(raw.sections));
  // Templates now use the same sectioned model as Files. Seed from the flat
  // placeholder list, wrapped in one default "Templates" section.
  const [templateSections, setTemplateSections] = useState(() => [
    { id: 'ts1', title: 'Templates', adminOnly: false, open: true, items: raw.templates || [] },
  ]);
  const [activeTab, setActiveTab] = useState('files');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [showAddSection, setShowAddSection]   = useState(false);
  const [confirmNode, confirm]  = useConfirm();
  // target: which set the link modal adds to — 'files' | 'templates'
  const [linkModal, setLinkModal] = useState({ open: false, sectionId: null, name: '', url: '', type: 'doc', target: 'files' });
  const [loading, setLoading] = useState(true);

  // Opportunities for this company that have a drive folder link
  const [linkedOpps, setLinkedOpps] = useState([]);
  useEffect(() => {
    getOpportunities()
      .then(opps => {
        const linked = (opps || []).filter(o =>
          o.driveLink && dealCategoryMatchesSlug(o.dealCategory, company)
        );
        setLinkedOpps(linked);
      })
      .catch(() => {});
  }, [company]);

  const driveLoaded = useRef(false);

  // ── Load sections + template sections from server on mount ────────────────────
  useEffect(() => {
    driveLoaded.current = false;
    const load = async () => {
      const [serverSections, serverTemplates] = await Promise.all([
        loadDriveSectionsFromServer(company),
        loadTemplateSectionsFromServer(company),
      ]);
      if (serverSections) setSections(normSections(serverSections));
      if (serverTemplates) setTemplateSections(normSections(serverTemplates));
      setLoading(false);
      driveLoaded.current = true;
    };
    load();
  }, [company]);

  // ── Auto-save to server on any change (never fires before initial load) ─────────
  useEffect(() => {
    if (driveLoaded.current) saveDriveSectionsToServer(company, sections);
  }, [company, sections]);

  useEffect(() => {
    if (driveLoaded.current) saveTemplateSectionsToServer(company, templateSections);
  }, [company, templateSections]);

  // ── Generic section-handler factory (shared by Files + Templates) ───────────────
  const makeHandlers = (setState) => ({
    setSectionVisibility: (id, visibility) =>
      setState(prev => prev.map(s => s.id === id ? { ...s, visibility } : s)),
    toggleOpen: id =>
      setState(prev => prev.map(s => s.id === id ? { ...s, open: !s.open } : s)),
    renameSection: (id, title) =>
      setState(prev => prev.map(s => s.id === id ? { ...s, title } : s)),
    removeSection: (section) => confirm({
      itemName: `section "${section.title}"`,
      confirmLabel: 'Delete Section',
      onConfirm: () => setState(prev => prev.filter(s => s.id !== section.id)),
    }),
    updateItem: (sectionId, itemId, updates) =>
      setState(prev => prev.map(s => s.id === sectionId
        ? { ...s, items: s.items.map(it => it.id === itemId ? { ...it, ...updates } : it) }
        : s)),
    addItem: (sectionId, name, url, type) =>
      setState(prev => prev.map(s => s.id === sectionId
        ? { ...s, items: [...s.items, { id: `f${Date.now()}`, type, name, url }] }
        : s)),
    removeItem: (sectionId, item) => confirm({
      itemName: item.name,
      confirmLabel: 'Remove',
      onConfirm: () => setState(prev => prev.map(s => s.id === sectionId
        ? { ...s, items: s.items.filter(it => it.id !== item.id) }
        : s)),
    }),
  });
  const fileH = makeHandlers(setSections);
  const tplH  = makeHandlers(setTemplateSections);

  // §2 gated folders — owner/admins choose who can see each folder; non-admins
  // only see folders shared to Everyone (or to a role they hold).
  const sectionVisibility = (s) => s.visibility || (s.adminOnly ? 'admins' : 'everyone');
  const canSeeSection = (s) => {
    if (isAdmin) return true;
    const v = sectionVisibility(s);
    if (v === 'everyone') return true;
    if (v === 'pm') return (user?.roles || []).includes('pm');
    return false; // 'admins' / 'onlyme'
  };
  const visibleSections = sections.filter(canSeeSection);
  const visibleTemplateSections = templateSections.filter(canSeeSection);

  const addSection = () => {
    const title = newSectionTitle.trim();
    if (!title) return;
    const newSec = { id: `s${Date.now()}`, title, adminOnly: false, open: true, items: [] };
    if (activeTab === 'templates') setTemplateSections(prev => [...prev, newSec]);
    else setSections(prev => [
      ...prev,
      newSec,
    ]);
    setNewSectionTitle('');
    setShowAddSection(false);
  };

  const companyLabel = raw.name;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {confirmNode}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <Eyebrow>{companyLabel}</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 24 : 34, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
            Drive Files
          </h1>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 4, fontFamily: MONO }}>
            {loading ? ' ' : `${sections.reduce((n, s) => n + s.items.length, 0)} files across ${sections.length} sections`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <Btn v="gho" onClick={() => setShowAddSection(s => !s)} sx={{ fontSize: 12 }}>
              {showAddSection ? 'Cancel' : `+ Section`}
            </Btn>
          )}
        </div>
      </div>

      {/* Linked Opportunities — opportunities for this company with a drive folder */}
      {linkedOpps.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: C.bluS, border: `1px solid ${C.blu}30`, borderRadius: 10, flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.blu, marginBottom: 8 }}>
            Linked from Opportunities ({linkedOpps.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {linkedOpps.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: C.ink8, flex: 1 }}>{o.name}</span>
                <a href={o.driveLink} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: MONO, fontSize: 10, color: C.blu, textDecoration: 'none' }}>
                  ◫ Open folder ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add section form — targets whichever tab is active (Files or Templates) */}
      {showAddSection && isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: '12px 14px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, flexShrink: 0 }}>
          <Inp
            value={newSectionTitle}
            onChange={e => setNewSectionTitle(e.target.value)}
            placeholder={activeTab === 'templates' ? 'New template section name...' : 'New section name...'}
            sx={{ flex: 1 }}
          />
          <Btn onClick={addSection} disabled={!newSectionTitle.trim()}>
            Create Section in {activeTab === 'templates' ? 'Templates' : 'Files'}
          </Btn>
        </div>
      )}

      {/* While loading, show nothing (not the placeholder seed) so the real
          files pop in once — no default-then-swap flash. */}
      {loading && (
        <div style={{ padding: '48px 0', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, border: `2px solid ${C.cr3}`, borderTopColor: C.acc, borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Tab bar: Files | Templates */}
      {!loading && (
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexShrink: 0 }}>
        {['files', 'templates'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? C.ink9 : C.bg,
            color: activeTab === tab ? '#fff' : C.ink5,
            border: `1px solid ${activeTab === tab ? C.ink9 : C.cr3}`,
            borderRadius: 8, padding: '6px 14px',
            fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            {tab === 'files' ? 'Files' : 'Templates'}
          </button>
        ))}
      </div>
      )}

      {/* Files tab */}
      {!loading && activeTab === 'files' && (
        <div style={{ paddingBottom: 16 }}>
          {sections.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 10 }}>
              No sections yet. {isAdmin ? 'Use "+ Section" to create one.' : ''}
            </div>
          ) : visibleSections.map(section => (
            <DriveSection
              key={section.id}
              section={section}
              isAdmin={isAdmin}
              visibility={sectionVisibility(section)}
              onSetVisibility={fileH.setSectionVisibility}
              onToggleOpen={fileH.toggleOpen}
              onRenameSection={fileH.renameSection}
              onRemoveSection={fileH.removeSection}
              onUpdateItem={fileH.updateItem}
              onRemoveItem={fileH.removeItem}
              onOpenLinkModal={sectionId => setLinkModal({ open: true, sectionId, name: '', url: '', type: 'doc', target: 'files' })}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* Templates tab — now uses the same sectioned model as Files */}
      {!loading && activeTab === 'templates' && (
        <div style={{ paddingBottom: 16 }}>
          {visibleTemplateSections.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 10 }}>
              No template sections yet. {isAdmin ? 'Use "+ Section" to create one.' : ''}
            </div>
          ) : visibleTemplateSections.map(section => (
            <DriveSection
              key={section.id}
              section={section}
              isAdmin={isAdmin}
              visibility={sectionVisibility(section)}
              onSetVisibility={tplH.setSectionVisibility}
              onToggleOpen={tplH.toggleOpen}
              onRenameSection={tplH.renameSection}
              onRemoveSection={tplH.removeSection}
              onUpdateItem={tplH.updateItem}
              onRemoveItem={tplH.removeItem}
              onOpenLinkModal={sectionId => setLinkModal({ open: true, sectionId, name: '', url: '', type: 'doc', target: 'templates' })}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* Link File Modal */}
      {linkModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(14,16,20,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: C.bg, borderRadius: 12, padding: 24, maxWidth: 420, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9, marginBottom: 16 }}>
              Link a File
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <FR label="File Name *">
                <Inp
                  value={linkModal.name}
                  onChange={e => setLinkModal(m => ({ ...m, name: e.target.value }))}
                  placeholder="e.g. Brand Guidelines"
                />
              </FR>
              <FR label="URL *">
                <Inp
                  value={linkModal.url}
                  onChange={e => setLinkModal(m => ({ ...m, url: e.target.value }))}
                  placeholder="https://…"
                />
              </FR>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Type
                  <span style={{ fontFamily: SERIF, fontSize: 18, marginLeft: 'auto' }}>
                    <FileIcon type={linkModal.type} />
                  </span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[
                    { type: 'folder', label: 'Folder' },
                    { type: 'doc', label: 'Document' },
                    { type: 'sheet', label: 'Sheet' },
                    { type: 'slides', label: 'Slides' },
                    { type: 'pdf', label: 'PDF' },
                    { type: 'image', label: 'Image' },
                    { type: 'video', label: 'Video' },
                  ].map(opt => (
                    <button
                      key={opt.type}
                      onClick={() => setLinkModal(m => ({ ...m, type: opt.type }))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: linkModal.type === opt.type ? `2px solid ${C.acc}` : `1px solid ${C.cr3}`,
                        background: linkModal.type === opt.type ? C.accS : 'transparent',
                        fontFamily: SANS,
                        fontSize: 11,
                        color: linkModal.type === opt.type ? C.acc : C.ink5,
                        cursor: 'pointer',
                        fontWeight: linkModal.type === opt.type ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setLinkModal(m => ({ ...m, open: false }))}
                style={{ padding: '8px 14px', background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: C.ink5, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => {
                if (linkModal.name.trim() && linkModal.url.trim()) {
                  const h = linkModal.target === 'templates' ? tplH : fileH;
                  h.addItem(linkModal.sectionId, linkModal.name.trim(), linkModal.url.trim(), linkModal.type);
                  setLinkModal(m => ({ ...m, open: false, name: '', url: '', type: 'doc' }));
                } else {
                  showToast('Please fill in both name and URL');
                }
              }}
                style={{ padding: '8px 14px', background: C.acc, border: 'none', borderRadius: 7, fontFamily: SANS, fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
