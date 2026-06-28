import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import SecondarySidebar from '../components/SecondarySidebar.jsx';
import useIsMobile from '../hooks/useIsMobile.js';

import Ncnda     from './Ncnda.jsx';
import Signature from './Signature.jsx';
import Email     from './Email.jsx';
import Outreach  from './Outreach.jsx';
import OvmHtml   from './OvmHtml.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tools tab — Phase 4 shell + Phase 5/6 wiring + Phase 7 state-preservation fix.
//
// AUDIT FIX C-2: render ALL tools at once; toggle visibility with CSS.
// Each tool stays mounted across switches, so drafts/recordings survive.
// ─────────────────────────────────────────────────────────────────────────────

// `companies` tags which company tool pages a tool belongs on. The top-level
// Tools tab (no companyFilter) always shows everything; a company's Tools tab
// shows only the tools tagged for that company. OVMG: NCNDA + Signature.
// OVM's tools live in its own combined hub (see COMPANY_TOOLSETS in CompanyView).
const TOOLS = [
  { id: 'ncnda',     icon: '✎', label: 'NCNDA Sender',         component: Ncnda,     companies: ['ovmg'] },
  { id: 'signature', icon: '✦', label: 'Signature Generator',  component: Signature, companies: ['ovmg'] },
  { id: 'outreach',  icon: '◈', label: 'OVM Kanban',           component: Outreach,  companies: ['ovm']  },
  { id: 'ovm-html',  icon: '◫', label: 'OVM HTML',             component: OvmHtml,   companies: ['ovm']  },
  { id: 'email',     icon: '✉', label: 'Email Composer',       component: Email,     companies: ['ovm']  },
];

const LS_KEY = 'ovmg_tool_info';

function loadToolInfo() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

function saveToolInfo(all) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch {}
}

// Lightweight formatter for the "About this tool" description so admins can make
// it readable: preserves line breaks, supports **bold**, and turns lines that
// start with "- " or "• " into a bullet list. No raw HTML — everything is built
// as React nodes, so it's injection-safe.
function renderInline(text, keyBase) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={`${keyBase}-b${i}`} style={{ color: C.ink9, fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : part
  );
}

function RichText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let bullets = null;
  const flush = () => { if (bullets) { blocks.push({ type: 'ul', items: bullets }); bullets = null; } };
  lines.forEach(line => {
    const m = line.match(/^\s*[-•]\s+(.*)$/);
    if (m) { (bullets = bullets || []).push(m[1]); }
    else { flush(); blocks.push({ type: 'p', text: line }); }
  });
  flush();
  return (
    <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink7, lineHeight: 1.6 }}>
      {blocks.map((b, i) => b.type === 'ul' ? (
        <ul key={i} style={{ margin: '4px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}`)}</li>)}
        </ul>
      ) : (
        <div key={i} style={{ whiteSpace: 'pre-wrap', minHeight: b.text.trim() ? undefined : 8 }}>
          {renderInline(b.text, String(i))}
        </div>
      ))}
    </div>
  );
}

// ── Per-tool "About this tool" info panel (admin-editable, localStorage-backed)
function ToolInfo({ toolId, user }) {
  const isAdmin = !!(user?.isAdmin || (user?.roles || []).includes('admin') || (user?.email || '').endsWith('@onevibemediagroup.com'));

  const [allInfo, setAllInfo] = useState(loadToolInfo);
  const info = allInfo[toolId] || {};

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState({ description: '', sopUrl: '', automationUrl: '' });

  const startEdit = () => {
    setDraft({ description: info.description || '', sopUrl: info.sopUrl || '', automationUrl: info.automationUrl || '' });
    setEditing(true);
  };

  const save = () => {
    const next = { ...allInfo, [toolId]: draft };
    setAllInfo(next);
    saveToolInfo(next);
    setEditing(false);
  };

  const hasContent = info.description || info.sopUrl || info.automationUrl;
  if (!isAdmin && !hasContent) return null;

  const inp = {
    width: '100%', boxSizing: 'border-box', padding: '7px 10px',
    border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
    fontFamily: SANS, fontSize: 12, color: C.ink9, outline: 'none',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>
          About this tool
        </span>
        {isAdmin && !editing && (
          <button onClick={startEdit} style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, padding: '3px 10px', fontFamily: MONO, fontSize: 9, color: C.ink5, cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {hasContent ? 'Edit' : '+ Add info'}
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Description / How to use</div>
            <textarea
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              rows={12}
              placeholder={'Brief description of what this tool does and how to use it…\n\nStep 1: …\nStep 2: …'}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.6, minHeight: 240, fontSize: 13 }}
            />
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginTop: 5, lineHeight: 1.5 }}>
              Formatting: wrap text in <strong style={{ color: C.ink7 }}>**double asterisks**</strong> for bold,
              start a line with <strong style={{ color: C.ink7 }}>-</strong> for a bullet, and blank lines make
              paragraphs. Line breaks are kept.
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>SOP URL</div>
            <input value={draft.sopUrl} onChange={e => setDraft(d => ({ ...d, sopUrl: e.target.value }))} placeholder="https://notion.so/…" style={inp} />
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Automation URL</div>
            <input value={draft.automationUrl} onChange={e => setDraft(d => ({ ...d, automationUrl: e.target.value }))} placeholder="https://make.com/… or zapier.com/…" style={inp} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={{ padding: '7px 18px', background: C.acc, color: '#fff', border: 'none', borderRadius: 6, fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ padding: '7px 14px', background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6, fontFamily: SANS, fontSize: 12, color: C.ink5, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {info.description ? (
            <RichText text={info.description} />
          ) : isAdmin ? (
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>No description yet — click "Add info" to add one.</p>
          ) : null}

          {(info.sopUrl || info.automationUrl) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {info.sopUrl && (
                <a href={info.sopUrl} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 7,
                  background: C.bg2, border: `1px solid ${C.cr3}`,
                  fontFamily: SANS, fontSize: 12, color: C.ink7, textDecoration: 'none',
                  transition: 'border-color .12s',
                }}>
                  <span style={{ fontFamily: SERIF }}>⊟</span> View SOP
                </a>
              )}
              {info.automationUrl && (
                <a href={info.automationUrl} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 7,
                  background: C.bg2, border: `1px solid ${C.cr3}`,
                  fontFamily: SANS, fontSize: 12, color: C.ink7, textDecoration: 'none',
                  transition: 'border-color .12s',
                }}>
                  <span style={{ fontFamily: SERIF }}>⚙</span> View Automation
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Tools(props) {
  const isMobile = useIsMobile();
  // When scoped to a company, show only that company's tools; otherwise (the
  // top-level Tools tab) show the full set.
  const companyFilter = props.companyFilter || null;
  const visibleTools = companyFilter
    ? TOOLS.filter(t => (t.companies || []).includes(companyFilter))
    : TOOLS;

  const [activeId, setActiveId] = useState(() => {
    try {
      // Accept both `#/tools/<id>` and the legacy `#tools/<id>` form.
      const m = (window.location.hash || '').match(/tools\/([\w-]+)/);
      if (m && visibleTools.some(t => t.id === m[1])) return m[1];
    } catch { /* ignore */ }
    return visibleTools[0]?.id || null;
  });

  const onSelect = (id) => {
    setActiveId(id);
    // Write `#/tools/<id>` so it matches Dashboard's `#/<view>` scheme: a refresh
    // keeps you on Tools (top segment) AND on this sub-tool (rest of the path).
    try { window.history.replaceState(null, '', `#/tools/${id}`); } catch { /* ignore */ }
  };

  // Right "About this tool" panel — collapsible, preference persisted.
  const INFO_KEY = 'ovmg.dashboard.v1.sidebar.toolinfo.collapsed';
  const [infoCollapsed, setInfoCollapsed] = useState(() => {
    // On phones the info panel starts collapsed so it never squeezes the tool.
    try { if (window.innerWidth <= 640) return true; return localStorage.getItem(INFO_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(INFO_KEY, infoCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [infoCollapsed]);

  // Empty state — a company with no tools assigned yet. MUST come after every
  // hook above (Rules of Hooks): a company with tools and one without have to
  // run the same hooks or React errors when you switch between them.
  if (visibleTools.length === 0) {
    return (
      <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 14, padding: 48, textAlign: 'center', background: C.bg }}>
        <div style={{ fontSize: 30, color: C.ink3, marginBottom: 12 }}>⚒</div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, color: C.ink9, margin: '0 0 6px' }}>No tools yet</h2>
        <p style={{ fontFamily: SANS, fontSize: 13, color: C.ink3, margin: 0 }}>
          No tools are assigned to this company. Tools can be tagged per company so each tab only shows what it needs.
        </p>
      </div>
    );
  }

  // Keep the active tool valid for the current (possibly filtered) set.
  const safeActiveId = visibleTools.some(t => t.id === activeId) ? activeId : visibleTools[0].id;

  return (
    <div style={{
      display: 'flex', height: '100%', width: '100%',
      margin: 0, padding: 0,
      position: 'absolute', inset: 0,
    }}>
      <SecondarySidebar
        title="Tools"
        items={visibleTools.map(({ id, icon, label }) => ({ id, icon, label }))}
        activeId={safeActiveId}
        onSelect={onSelect}
        storageKey="sidebar.tools.collapsed"
      />

      <main style={{
        flex: 1,
        overflowY: 'auto',
        background: C.bg,
        padding: '24px 30px',
        position: 'relative',
        minWidth: 0,
      }}>
        {/* AUDIT FIX C-2: mount every tool once; only show the active one. */}
        {visibleTools.map(tool => (
          <div
            key={tool.id}
            style={{
              display: tool.id === safeActiveId ? 'block' : 'none',
              height: '100%',
            }}
          >
            <tool.component {...props} />
          </div>
        ))}
      </main>

      {/* Right collapsible "About this tool" sidebar — easier to reach than the
          old bottom panel; stays open across tool switches. */}
      <aside style={{
        width: infoCollapsed ? 44 : (isMobile ? 220 : 300),
        flexShrink: 0,
        borderLeft: `1px solid ${C.cr3}`,
        background: C.bg2,
        overflowY: 'auto',
        transition: 'width .18s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: infoCollapsed ? 'center' : 'space-between',
          padding: infoCollapsed ? '12px 8px' : '12px 14px', borderBottom: `1px solid ${C.cr3}`, gap: 6,
        }}>
          {!infoCollapsed && (
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
              About this tool
            </span>
          )}
          <button
            onClick={() => setInfoCollapsed(v => !v)}
            title={infoCollapsed ? 'Show tool info' : 'Hide tool info'}
            aria-label={infoCollapsed ? 'Expand tool info' : 'Collapse tool info'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink5, fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          >
            {infoCollapsed ? '⇤' : '⇥'}
          </button>
        </div>
        {!infoCollapsed && (
          <div style={{ padding: '16px 14px' }}>
            {/* Keyed by active tool so it shows the current tool's info. */}
            <ToolInfo key={safeActiveId} toolId={safeActiveId} user={props.user} />
          </div>
        )}
      </aside>
    </div>
  );
}
