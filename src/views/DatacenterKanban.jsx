import { useState, useEffect, useRef } from 'react';
import { C, SERIF, SANS, MONO, fmtD, fmtC, prBg, prFg, uid } from '../constants.js';
import { Eyebrow, Btn, Tag, Inp, Sel, FR, PBar, useConfirm } from '../components/UI.jsx';
import { NotesList, LinksList, Collapsible } from '../components/CardExtras.jsx';
import useIsMobile, { useDevice } from '../hooks/useIsMobile.js';
import { getAppState, setAppState } from '../api.js';

const KV_KEY = 'kanban:datacenter';

// ── Lane config ────────────────────────────────────────────────────────────────
const LANES = ['Prospecting', 'Due Diligence', 'Under Contract', 'In Development', 'Operational'];

const LANE_STYLE = {
  'Prospecting':    { hBg: C.ink7,     hFg: C.ink2,  border: C.ink5  },
  'Due Diligence':  { hBg: C.yel,      hFg: '#fff',  border: C.yel   },
  'Under Contract': { hBg: C.acc,      hFg: '#fff',  border: C.acc   },
  'In Development': { hBg: C.blu,      hFg: '#fff',  border: C.blu   },
  'Operational':    { hBg: C.grn,      hFg: '#fff',  border: C.grn   },
};

const PRIORITY_OPTIONS = ['', 'High', 'Medium', 'Low'];

// ── Document checklist ─────────────────────────────────────────────────────────
const DOC_CHECKLIST_ITEMS = [
  'Will-serve letter',
  'Power study',
  'Gas cost analysis',
  'Fiber maps',
  'Water maps',
  'Electric maps',
  'Environmental assessment',
  'Title report',
  'Survey',
  'Zoning approval',
];

// ── Default folders ────────────────────────────────────────────────────────────
const DEFAULT_FOLDERS = [
  'Custom Assets',
  'Site Photos',
  'Signed Docs',
  'Permits & Approvals',
  'Financial Models',
  'Engineering Reports',
];

// ── Sample data ────────────────────────────────────────────────────────────────
const SAMPLE_CARDS = [
  {
    id: 'dc1',
    lane: 'Due Diligence',
    projectName: 'Solar ESS Kingsboro',
    location: 'Kingsboro, NY',
    priority: 'High',
    dueDate: '2026-08-15',
    description: 'Solar + Energy Storage System colocation project. 50MW capacity potential.',
    dealSize: 12500000,
    jvPartnerMix: 40,
    ovmgCorporateSplit: 35,
    notes: 'Initial site visit completed. Power study in progress. Strong municipal support. Need to coordinate with NYISO for grid interconnect.',
    contacts: [
      { id: 'ct1', name: 'James Whitfield', role: 'JV Partner',    phone: '+1 555 210 4400', email: 'james@whitfieldcap.com' },
      { id: 'ct2', name: 'Sara Chen',       role: 'Site Engineer', phone: '+1 555 390 2200', email: 'sara.chen@engworks.io' },
    ],
    tasks: [
      { id: 't1', text: 'Complete power study review',                done: true  },
      { id: 't2', text: 'Request will-serve letter from utility',     done: false },
      { id: 't3', text: 'Environmental assessment Phase I',           done: false },
      { id: 't4', text: 'Title search and report',                    done: false },
    ],
    docChecklist: Object.fromEntries(DOC_CHECKLIST_ITEMS.map((d, i) => [d, i < 2])),
    folders: [...DEFAULT_FOLDERS],
    dataRoomFiles: [
      { name: 'Site_Survey_Kingsboro_v1.pdf', url: '#' },
      { name: 'Power_Study_Draft.pdf',        url: '#' },
      { name: 'LOI_Signed.pdf',               url: '#' },
    ],
    calendarEvents: [
      { date: '2026-06-10', title: 'Utility meeting — grid interconnect' },
      { date: '2026-06-22', title: 'JV Partner call'                     },
      { date: '2026-07-05', title: 'Environmental assessment kickoff'     },
    ],
  },
  {
    id: 'dc2',
    lane: 'Prospecting',
    projectName: 'Nevada High Desert Hyperscale',
    location: 'Clark County, NV',
    priority: 'Medium',
    dueDate: '',
    description: 'Large-scale hyperscale data center site. Early-stage land acquisition opportunity.',
    dealSize: 45000000,
    jvPartnerMix: 50,
    ovmgCorporateSplit: 30,
    notes: 'Introduced through broker network. Low water cost, excellent power availability from NV Energy.',
    contacts: [],
    tasks: [
      { id: 't5', text: 'Initial NDA executed',     done: true  },
      { id: 't6', text: 'Request site data package', done: false },
    ],
    docChecklist: Object.fromEntries(DOC_CHECKLIST_ITEMS.map(d => [d, false])),
    folders: [...DEFAULT_FOLDERS],
    dataRoomFiles: [],
    calendarEvents: [],
  },
];

// ── Proforma calculator ────────────────────────────────────────────────────────
function ProformaCalculator({ dealSize, jvPartnerMix, ovmgCorporateSplit, onChange }) {
  const jvAmount   = dealSize * (jvPartnerMix / 100);
  const ovmgAmount = dealSize * (ovmgCorporateSplit / 100);
  const remaining  = dealSize - jvAmount - ovmgAmount;
  const otherPct   = Math.max(0, 100 - jvPartnerMix - ovmgCorporateSplit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <FR label="Deal Size ($)">
          <Inp
            type="number"
            value={dealSize || ''}
            onChange={e => onChange('dealSize', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </FR>
        <FR label="JV Partner %">
          <Inp
            type="number"
            value={jvPartnerMix ?? ''}
            onChange={e => onChange('jvPartnerMix', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </FR>
        <FR label="OVMG Split %">
          <Inp
            type="number"
            value={ovmgCorporateSplit ?? ''}
            onChange={e => onChange('ovmgCorporateSplit', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </FR>
      </div>

      <div style={{ padding: '12px 14px', background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>
          Calculated Profit Pool
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: `JV Partner (${jvPartnerMix}%)`,              value: jvAmount,   color: C.blu  },
            { label: `OVMG Corporate (${ovmgCorporateSplit}%)`,     value: ovmgAmount, color: C.acc  },
            { label: `Other / Remaining (${otherPct.toFixed(1)}%)`, value: remaining,  color: C.ink5 },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, color: row.color, fontFamily: SANS }}>{row.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: row.color }}>{fmtC(row.value)}</div>
            </div>
          ))}
          <div style={{ height: 1, background: C.cr3, margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink7, fontFamily: SANS }}>Total</div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.ink9 }}>{fmtC(dealSize)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project card ───────────────────────────────────────────────────────────────
function ProjectCard({ card, onClick, onDragStart, onDelete }) {
  const doneDocs  = Object.values(card.docChecklist || {}).filter(Boolean).length;
  const totalDocs = DOC_CHECKLIST_ITEMS.length;
  const doneTasks  = (card.tasks || []).filter(t => t.done).length;
  const totalTasks = (card.tasks || []).length;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: '#fff',
        border: `1px solid ${C.cr2}`,
        borderRadius: 8, padding: '10px 12px',
        cursor: 'grab', userSelect: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        transition: 'box-shadow .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9, lineHeight: 1.3, marginBottom: 2 }}>
          {card.projectName}
        </div>
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(card); }} title="Delete card"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
        )}
      </div>
      {card.location && (
        <div style={{ fontSize: 11, color: C.ink3, marginBottom: 6, fontFamily: MONO }}>
          {card.location}
        </div>
      )}
      {card.dealSize > 0 && (
        <div style={{ fontSize: 12, color: C.grn, fontFamily: MONO, fontWeight: 600, marginBottom: 6 }}>
          {fmtC(card.dealSize)}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {card.priority && <Tag bg={prBg(card.priority)} fg={prFg(card.priority)}>{card.priority}</Tag>}
        <Tag bg={C.bluS} fg={C.blu}>{doneDocs}/{totalDocs} docs</Tag>
        {totalTasks > 0 && <Tag bg={C.grnS} fg={C.grn}>{doneTasks}/{totalTasks} tasks</Tag>}
      </div>
      {card.dueDate && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>Due {fmtD(card.dueDate)}</div>
      )}
    </div>
  );
}

// ── Project detail drawer ──────────────────────────────────────────────────────
const DRAWER_TABS = ['Notes', 'Links & Assets', 'Calendar', 'Calculator', 'Docs', 'Folders', 'Tasks', 'Contacts'];

function ProjectDrawer({ card, onSave, onClose, showToast }) {
  const [form, setForm]           = useState({ ...card });
  const [activeTab, setActiveTab] = useState('Notes');
  const [saving, setSaving]       = useState(false);
  const [newTask, setNewTask]     = useState('');
  const [newContact, setNewContact] = useState({ name: '', role: '', phone: '', email: '' });
  const [newFolder, setNewFolder] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCalc = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDoc = item =>
    set('docChecklist', { ...form.docChecklist, [item]: !form.docChecklist[item] });

  const addTask    = () => {
    const text = newTask.trim();
    if (!text) return;
    set('tasks', [...(form.tasks || []), { id: uid(), text, done: false }]);
    setNewTask('');
  };
  const toggleTask = id => set('tasks', form.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = id => set('tasks', form.tasks.filter(t => t.id !== id));

  const addContact = () => {
    if (!newContact.name.trim()) return;
    set('contacts', [...(form.contacts || []), { id: uid(), ...newContact }]);
    setNewContact({ name: '', role: '', phone: '', email: '' });
    setShowAddContact(false);
  };
  const removeContact = id => set('contacts', form.contacts.filter(c => c.id !== id));

  const addFolder    = () => {
    const f = newFolder.trim();
    if (!f) return;
    set('folders', [...(form.folders || []), f]);
    setNewFolder('');
  };
  const removeFolder = idx => set('folders', form.folders.filter((_, i) => i !== idx));

  const save = () => {
    setSaving(true);
    setTimeout(() => { onSave(form); setSaving(false); onClose(); }, 300);
  };

  const LABEL = { fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 5 };
  const doneDocs = Object.values(form.docChecklist || {}).filter(Boolean).length;
  const totalDocs = DOC_CHECKLIST_ITEMS.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header meta */}
      <div style={{ padding: '12px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FR label="Project Name">
            <Inp value={form.projectName} onChange={e => set('projectName', e.target.value)} />
          </FR>
          <FR label="Location">
            <Inp value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="City, State" />
          </FR>
          <FR label="Priority">
            <Sel value={form.priority || ''} onChange={e => set('priority', e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p || '-- None --'}</option>)}
            </Sel>
          </FR>
          <FR label="Due Date">
            <Inp type="date" value={form.dueDate || ''} onChange={e => set('dueDate', e.target.value)} />
          </FR>
          <div style={{ gridColumn: '1/-1' }}>
            <FR label="Description">
              <Inp value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Brief project description" />
            </FR>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${C.cr2}`, paddingBottom: 8 }}>
        {DRAWER_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? C.ink9 : C.bg,
            color: activeTab === tab ? '#fff' : C.ink5,
            border: `1px solid ${activeTab === tab ? C.ink9 : C.cr3}`,
            borderRadius: 6, padding: '5px 10px',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.06em',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {tab === 'Docs' ? `Docs (${doneDocs}/${totalDocs})` : tab}
          </button>
        ))}
      </div>

      {/* Notes — multiple timestamped notes + a pinned summary field */}
      {activeTab === 'Notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
            <div style={{ ...LABEL, marginBottom: 10 }}>Notes Log</div>
            <NotesList notes={form.noteList || []} onChange={v => set('noteList', v)} />
          </div>
          <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
            <div style={{ ...LABEL, marginBottom: 8 }}>Pinned Summary</div>
            <textarea
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              rows={5}
              placeholder="Key project context, milestones, decisions… (always visible at top)"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                border: `1px solid ${C.cr3}`, borderRadius: 6,
                background: C.bg, color: C.ink9, fontFamily: SANS,
                fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Links & Assets — collapsible sections of name+URL links, all in one place */}
      {activeTab === 'Links & Assets' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <Collapsible title="Data Rooms" icon="🗄️" count={(form.linksDataRoom || []).length} defaultOpen>
            <LinksList links={form.linksDataRoom || []} onChange={v => set('linksDataRoom', v)} icon="🗄️" namePlaceholder="Data room" urlPlaceholder="https://drive.google.com/…" />
          </Collapsible>
          <Collapsible title="Decks" icon="📊" count={(form.linksDeck || []).length}>
            <LinksList links={form.linksDeck || []} onChange={v => set('linksDeck', v)} icon="📊" namePlaceholder="Deck" urlPlaceholder="https://…" />
          </Collapsible>
          <Collapsible title="Branding" icon="🎨" count={(form.linksBranding || []).length}>
            <LinksList links={form.linksBranding || []} onChange={v => set('linksBranding', v)} icon="🎨" namePlaceholder="Brand asset" urlPlaceholder="https://…" />
          </Collapsible>
          <Collapsible title="Logos" icon="🏷️" count={(form.linksLogo || []).length}>
            <LinksList links={form.linksLogo || []} onChange={v => set('linksLogo', v)} icon="🏷️" namePlaceholder="Logo" urlPlaceholder="https://…" />
          </Collapsible>
          <Collapsible title="Google Drive Folders" icon="📁" count={(form.linksDrive || []).length}>
            <LinksList links={form.linksDrive || []} onChange={v => set('linksDrive', v)} icon="📁" namePlaceholder="Folder" urlPlaceholder="https://drive.google.com/drive/folders/…" />
          </Collapsible>
        </div>
      )}

      {/* Calendar */}
      {activeTab === 'Calendar' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>Upcoming Events</div>
          {(form.calendarEvents || []).length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg, border: `1px dashed ${C.cr3}`, borderRadius: 6 }}>
              No calendar events linked to this project.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.calendarEvents.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.acc, flexShrink: 0 }}>{fmtD(ev.date)}</div>
                  <div style={{ fontSize: 13, color: C.ink8, fontFamily: SANS }}>{ev.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calculator */}
      {activeTab === 'Calculator' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>Proforma Simulator</div>
          <ProformaCalculator
            dealSize={form.dealSize || 0}
            jvPartnerMix={form.jvPartnerMix || 0}
            ovmgCorporateSplit={form.ovmgCorporateSplit || 0}
            onChange={(k, v) => setCalc(k, v)}
          />
        </div>
      )}

      {/* Document Checklist */}
      {activeTab === 'Docs' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>
            Document Checklist — {doneDocs} of {totalDocs} present
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DOC_CHECKLIST_ITEMS.map(item => {
              const checked = !!form.docChecklist[item];
              return (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: C.bg, border: `1px solid ${checked ? C.grn : C.cr3}`, borderRadius: 6, cursor: 'pointer' }}>
                  <span style={{ fontSize: checked ? 16 : 15, flexShrink: 0 }}>{checked ? '✅' : '❌'}</span>
                  <span style={{ fontSize: 13, color: checked ? C.ink8 : C.ink3, fontFamily: SANS, flex: 1 }}>{item}</span>
                  <input type="checkbox" checked={checked} onChange={() => toggleDoc(item)} style={{ display: 'none' }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: checked ? C.grn : C.ink2, letterSpacing: '.06em' }}>
                    {checked ? 'PRESENT' : 'MISSING'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Folders */}
      {activeTab === 'Folders' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>Project Folders (Admin-editable)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {(form.folders || []).map((folder, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
                <span style={{ fontSize: 15 }}>&#128193;</span>
                <span style={{ flex: 1, fontSize: 13, color: C.ink8, fontFamily: SANS }}>{folder}</span>
                <button onClick={() => removeFolder(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>&#x00D7;</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Inp value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="New folder name..." sx={{ flex: 1 }} />
            <Btn onClick={addFolder} disabled={!newFolder.trim()} sx={{ padding: '6px 12px', fontSize: 12 }}>+ Add</Btn>
          </div>
        </div>
      )}

      {/* Tasks */}
      {activeTab === 'Tasks' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>Project Tasks</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <Inp value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task..." sx={{ flex: 1 }} />
            <Btn onClick={addTask} disabled={!newTask.trim()} sx={{ padding: '6px 12px', fontSize: 12 }}>+ Add</Btn>
          </div>
          {(form.tasks || []).length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg, border: `1px dashed ${C.cr3}`, borderRadius: 6 }}>
              No tasks yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {form.tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6 }}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)}
                    style={{ accentColor: C.grn, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: t.done ? C.ink3 : C.ink8, textDecoration: t.done ? 'line-through' : 'none', fontFamily: SANS }}>{t.text}</span>
                  <button onClick={() => removeTask(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>&#x00D7;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contacts */}
      {activeTab === 'Contacts' && (
        <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={LABEL}>Key Contacts</div>
            <Btn v="gho" onClick={() => setShowAddContact(s => !s)} sx={{ fontSize: 11, padding: '4px 10px' }}>
              {showAddContact ? 'Cancel' : '+ Add Contact'}
            </Btn>
          </div>

          {showAddContact && (
            <div style={{ padding: '12px', background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FR label="Name">
                  <Inp value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} placeholder="Full name" />
                </FR>
                <FR label="Role">
                  <Inp value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))} placeholder="JV Partner, Engineer..." />
                </FR>
                <FR label="Phone">
                  <Inp value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} placeholder="+1 555..." />
                </FR>
                <FR label="Email">
                  <Inp value={newContact.email} onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))} type="email" placeholder="email@..." />
                </FR>
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={addContact} disabled={!newContact.name.trim()} sx={{ fontSize: 11 }}>Add Contact</Btn>
              </div>
            </div>
          )}

          {(form.contacts || []).length === 0 && !showAddContact ? (
            <div style={{ padding: '20px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg, border: `1px dashed ${C.cr3}`, borderRadius: 6 }}>
              No contacts yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(form.contacts || []).map(c => (
                <div key={c.id} style={{ padding: '10px 12px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9, fontFamily: SANS }}>{c.name}</div>
                    {c.role && <div style={{ fontSize: 11, color: C.ink3, fontFamily: MONO, marginTop: 1 }}>{c.role}</div>}
                    <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                      {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: C.blu, fontFamily: MONO, textDecoration: 'none' }}>{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: C.acc, fontFamily: MONO, textDecoration: 'none' }}>{c.email}</a>}
                    </div>
                  </div>
                  <button onClick={() => removeContact(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink2, fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>&#x00D7;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn v="gho" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Btn>
      </div>
    </div>
  );
}

// ── New project drawer ─────────────────────────────────────────────────────────
function NewProjectDrawer({ defaultLane, onSave, onClose, showToast }) {
  const [form, setForm] = useState({
    projectName: '', location: '', priority: '', dueDate: '', description: '',
    lane: defaultLane || LANES[0],
    dealSize: 0, jvPartnerMix: 0, ovmgCorporateSplit: 0,
    notes: '', contacts: [], tasks: [],
    docChecklist: Object.fromEntries(DOC_CHECKLIST_ITEMS.map(d => [d, false])),
    folders: [...DEFAULT_FOLDERS],
    dataRoomFiles: [], calendarEvents: [],
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = () => {
    if (!form.projectName.trim()) { showToast('Project name is required'); return; }
    setSaving(true);
    setTimeout(() => { onSave({ ...form, id: uid() }); setSaving(false); onClose(); }, 300);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '12px 16px', borderRadius: 8, background: C.accS, border: `1px solid ${C.acc}` }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: '.06em' }}>NEW DATACENTER PROJECT</div>
        <div style={{ fontSize: 12, color: C.ink5, marginTop: 3 }}>Only the project name is required.</div>
      </div>
      <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FR label="Project Name *">
          <Inp value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Project name" />
        </FR>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FR label="Location">
            <Inp value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, State" />
          </FR>
          <FR label="Lane">
            <Sel value={form.lane} onChange={e => set('lane', e.target.value)}>
              {LANES.map(l => <option key={l}>{l}</option>)}
            </Sel>
          </FR>
          <FR label="Priority">
            <Sel value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p || '-- None --'}</option>)}
            </Sel>
          </FR>
          <FR label="Due Date">
            <Inp type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FR>
        </div>
        <FR label="Description">
          <Inp value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief project description" />
        </FR>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn v="gho" onClick={onClose}>Cancel</Btn>
        <Btn onClick={create} disabled={saving}>{saving ? 'Creating...' : '+ Add Project'}</Btn>
      </div>
    </div>
  );
}

// ── Lane column ────────────────────────────────────────────────────────────────
function LaneColumn({ lane, cards, dragOverLane, onCardClick, onDragStart, onDragOver, onDrop, onDragLeave, isTablet, onAddCard, onDelete }) {
  const st     = LANE_STYLE[lane];
  const isOver = dragOverLane === lane;
  return (
    <div style={{ flex: isTablet ? '0 0 180px' : '0 0 230px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px', borderRadius: '8px 8px 0 0', background: st.hBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: st.hFg }}>{lane}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,255,255,.18)', color: st.hFg, padding: '1px 7px', borderRadius: 99 }}>{cards.length}</span>
          <button onClick={() => onAddCard(lane)} title="Add project" style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: st.hFg, borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0 }}>+</button>
        </div>
      </div>
      <div
        onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
        style={{
          flex: 1, overflowY: 'auto', padding: '7px 6px',
          background: isOver ? `${st.hBg}22` : C.bg2,
          border: `1px solid ${isOver ? st.border : C.cr2}`,
          borderTop: 'none', borderRadius: '0 0 8px 8px',
          display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 100, transition: 'background .15s, border-color .15s',
        }}
      >
        {cards.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: MONO, opacity: isOver ? .3 : .6 }}>Drop here</div>
        ) : cards.map(c => (
          <ProjectCard key={c.id} card={c} onClick={() => onCardClick(c)} onDragStart={e => onDragStart(e, c)} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ── Mobile board ───────────────────────────────────────────────────────────────
function MobileBoard({ byLane, onCardClick, onDelete }) {
  const firstWithCards = LANES.find(l => (byLane[l] || []).length > 0) || LANES[0];
  const [activeLane, setActiveLane] = useState(firstWithCards);
  const cards = byLane[activeLane] || [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10, scrollbarWidth: 'thin' }}>
        {LANES.map(l => {
          const active = l === activeLane;
          const cnt    = (byLane[l] || []).length;
          const sty    = LANE_STYLE[l];
          return (
            <button key={l} onClick={() => setActiveLane(l)} style={{
              flex: '0 0 auto', background: active ? sty.hBg : C.bg, color: active ? sty.hFg : C.ink5,
              border: `1px solid ${active ? sty.border : C.cr3}`, borderRadius: 999, padding: '6px 12px',
              fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {l}
              <span style={{ background: active ? 'rgba(255,255,255,.22)' : C.cr2, color: active ? sty.hFg : C.ink3, fontSize: 10, padding: '1px 6px', borderRadius: 99 }}>{cnt}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.ink3, fontFamily: MONO, fontSize: 11, background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 10 }}>
            No projects in {activeLane}
          </div>
        ) : cards.map(c => (
          <ProjectCard key={c.id} card={c} onClick={() => onCardClick(c)} onDragStart={() => {}} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ── Filter pill ────────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.ink9 : C.bg, color: active ? '#fff' : C.ink5,
      border: `1px solid ${active ? C.ink9 : C.cr3}`,
      borderRadius: 999, padding: '4px 11px', fontSize: 11,
      cursor: 'pointer', fontFamily: SANS, transition: 'all .12s', whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export default function DatacenterKanban({ user, showToast, openOv, closeOv }) {
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  const isAdmin  = user?.isAdmin || user?.roles?.includes('admin') || (user?.email || '').endsWith('@onevibemediagroup.com');
  const [cards, setCards]       = useState(SAMPLE_CARDS);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [tfLane, setTfLane]     = useState('All');
  const [dragOverLane, setDragOverLane] = useState(null);
  const [confirmNode, confirm] = useConfirm();
  const dragCard = useRef(null);

  // ── Persistence ─────────────────────────────────────────────────────────────
  const didLoad = useRef(false);
  useEffect(() => {
    getAppState(KV_KEY).then(({ data }) => {
      if (Array.isArray(data) && data.length) setCards(data);
    }).catch(() => {}).finally(() => { setLoading(false); didLoad.current = true; });
  }, []);
  useEffect(() => {
    if (didLoad.current) setAppState(KV_KEY, cards).catch(() => {});
  }, [cards]);

  const deleteCard = (card) => confirm({
    itemName: card.projectName,
    confirmLabel: 'Delete',
    onConfirm: () => setCards(prev => prev.filter(c => c.id !== card.id)),
  });

  const filtered = cards.filter(c => {
    if (tfLane !== 'All' && c.lane !== tfLane) return false;
    if (search) {
      const hay = [c.projectName, c.location, c.description].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const byLane = Object.fromEntries(LANES.map(l => [l, []]));
  filtered.forEach(c => { if (byLane[c.lane]) byLane[c.lane].push(c); else byLane[LANES[0]].push(c); });

  const totalDealValue  = cards.reduce((sum, c) => sum + (c.dealSize || 0), 0);
  const totalOperational = cards.filter(c => c.lane === 'Operational').length;

  const handleDragStart = (e, card)      => { dragCard.current = card; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e, lane)      => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverLane(lane); };
  const handleDrop      = (e, targetLane) => {
    e.preventDefault(); setDragOverLane(null);
    const card = dragCard.current;
    if (!card || card.lane === targetLane) return;
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, lane: targetLane } : c));
    dragCard.current = null;
  };
  const handleDragLeave = () => setDragOverLane(null);

  const openCard = card => {
    openOv({
      kind: 'drawer',
      title: card.projectName,
      sub: [card.location, card.lane].filter(Boolean).join(' — '),
      body: (
        <ProjectDrawer
          card={card}
          onSave={updated => setCards(prev => prev.map(c => c.id === updated.id ? updated : c))}
          onClose={closeOv}
          showToast={showToast}
        />
      ),
    });
  };

  const openNewCard = (defaultLane = LANES[0]) => {
    openOv({
      kind: 'drawer',
      title: 'New Datacenter Project',
      sub: 'Add a new project to the board',
      body: (
        <NewProjectDrawer
          defaultLane={defaultLane}
          onSave={newCard => setCards(prev => [...prev, newCard])}
          onClose={closeOv}
          showToast={showToast}
        />
      ),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {confirmNode}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <Eyebrow>OVMG Datacenter</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
            Project Pipeline
          </h1>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink3 }}>
              <span style={{ color: C.ink9, fontWeight: 600 }}>{cards.length}</span> projects
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.grn, fontWeight: 600 }}>
              {totalOperational} operational
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.acc, fontWeight: 600 }}>
              {fmtC(totalDealValue)} pipeline
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." sx={{ width: isMobile ? '100%' : 200 }} />
          <Btn onClick={() => openNewCard()}>+ New Project</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '8px 12px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.1em', marginRight: 2 }}>Filter</span>
        <FilterPill label="All" active={tfLane === 'All'} onClick={() => setTfLane('All')} />
        {LANES.map(l => <FilterPill key={l} label={l} active={tfLane === l} onClick={() => setTfLane(l)} />)}
      </div>

      {isMobile ? (
        <MobileBoard byLane={byLane} onCardClick={openCard} onDelete={deleteCard} />
      ) : (
        <div style={{ overflowX: 'auto', flex: 1, paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {LANES.map(lane => (
              <LaneColumn
                key={lane}
                lane={lane}
                cards={byLane[lane] || []}
                dragOverLane={dragOverLane}
                onCardClick={openCard}
                onDragStart={handleDragStart}
                onDragOver={e => handleDragOver(e, lane)}
                onDrop={e => handleDrop(e, lane)}
                onDragLeave={handleDragLeave}
                isTablet={isTablet}
                onAddCard={openNewCard}
                onDelete={deleteCard}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
