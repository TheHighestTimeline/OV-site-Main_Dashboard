import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Btn, Inp, Sel, FR, Eyebrow, Spinner } from '../components/UI.jsx';
import {
  listResources, upsertResource, deleteResource,
  upsertCategory, deleteCategory,
  submitReferenceNote,
  pinReference, unpinReference,
  listBookmarkFolders, createBookmarkFolder, updateBookmarkFolder,
  deleteBookmarkFolder, addBookmark, removeBookmark,
  listResourceComments, createResourceComment,
  updateResourceComment, deleteResourceComment,
} from '../api.js';
import { companyNameMatchesSlug, dealCategoryMatchesSlug, SLUG_TO_DEAL_CATEGORY, COMPANY_META } from '../constants/roles.js';

// ─────────────────────────────────────────────────────────────────────────────
// References — Phase 4 enhanced.
//
// Reads from Supabase (`resources` + `resource_categories` tables) via the
// resources-list Netlify function. Admins get full create / edit / delete UI
// inline, no deploy required for content changes.
//
// Phase 4 additions:
//   • Filter chips for Type, Category, Company
//   • Per-user pin/unpin (stored in resource_pins table)
//   • Collapsible bookmarks sidebar with folders
//   • Comments on expanded cards
//   • Prominent "Add Reference" modal
//   • Manage Tags / Categories dialog
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  'url':            'Link',
  'drive-doc':      'Google Doc',
  'drive-folder':   'Drive Folder',
  'drive-sheet':    'Google Sheet',
  'drive-slides':   'Google Slides',
  'dashboard-tool': 'Dashboard Tool',
  'automation':     'Automation',
  'tally-form':     'Tally Form',
  'pdf':            'PDF',
  'video':          'Video',
};

const TYPE_ICONS = {
  'url':            '◎',
  'drive-doc':      '◻',
  'drive-folder':   '◫',
  'drive-sheet':    '◼',
  'drive-slides':   '◈',
  'dashboard-tool': '⚒',
  'automation':     '⚙',
  'tally-form':     '▤',
  'pdf':            '▥',
  'video':          '▶',
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

// Canonical Deal Category values — must match Notion exactly so per-company
// filtering in companyNameMatchesSlug lines up.
const COMPANY_OPTIONS = [
  'All',
  'OVMG', 'ONEVIBEMEDIA', 'ONEVIBEDATA', 'ONEVIBEFEST',
  'AMPLIFYARTISTS', 'AMPLIFYBRANDS', 'CARBON SPONGE',
  'DATA CENTERS', 'ONEVIBEGROUP', 'ONEVIBEPRODUCTIONS',
  'SOLR ESS', 'LIFE', 'OTHER',
];

// ─────────────────────────────────────────────────────────────────────────────
function categoryStyle(category) {
  const palette = [
    { bg: C.grnS, fg: C.grn },
    { bg: C.bluS, fg: C.blu },
    { bg: C.accS, fg: C.acc },
    { bg: C.yelS, fg: C.yel },
    { bg: C.redS, fg: C.red },
  ];
  if (!category) return { bg: C.grS, fg: C.ink5 };
  const hash = [...category.id].reduce((h, c) => h + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function Pill({ label, bg, fg }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 99,
      background: bg, color: fg, fontSize: 10, fontFamily: MONO,
      letterSpacing: '.07em', textTransform: 'uppercase', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function References({ user, showToast, openOv, closeOv, companyFilter = null }) {
  const [resources,    setResources]    = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [search,       setSearch]       = useState('');
  const [activeType,   setActiveType]   = useState('all');
  const [activeCompany,setActiveCompany]= useState('All');
  const [pinnedIds,    setPinnedIds]    = useState(new Set());
  const [bookmarkFolders, setBookmarkFolders] = useState([]);
  const [bookmarkSidebarOpen, setBookmarkSidebarOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState(null); // null = show all
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [filterMode,   setFilterMode]   = useState(false); // show filter row

  const isAdmin = user.isAdmin;
  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c])),
    [categories],
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await listResources();
      setResources(data.resources || []);
      setCategories(data.categories || []);
      // Build initial pinned set from resource.user_pinned if the API returns it,
      // otherwise fall back to the legacy pinned_in_references flag per-resource.
      const userPinned = new Set(
        (data.resources || []).filter(r => r.user_pinned).map(r => r.id)
      );
      setPinnedIds(userPinned);
    } catch (e) {
      showToast?.('Failed to load references: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBookmarks = async () => {
    try {
      const data = await listBookmarkFolders();
      setBookmarkFolders(data.folders || []);
    } catch {
      // silently fail — bookmarks are non-critical
    }
  };

  useEffect(() => { load(); loadBookmarks(); }, []);

  const togglePin = async (id) => {
    const wasPinned = pinnedIds.has(id);
    setPinnedIds(prev => {
      const next = new Set(prev);
      wasPinned ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (wasPinned) await unpinReference(id);
      else           await pinReference(id);
    } catch (e) {
      // revert
      setPinnedIds(prev => {
        const next = new Set(prev);
        wasPinned ? next.add(id) : next.delete(id);
        return next;
      });
      showToast?.('Pin failed: ' + e.message);
    }
  };

  const handleAddToFolder = async (folderId, referenceId) => {
    try {
      await addBookmark(folderId, referenceId);
      setBookmarkFolders(prev => prev.map(f =>
        f.id === folderId
          ? { ...f, resourceIds: [...new Set([...(f.resourceIds || []), referenceId])] }
          : f,
      ));
      showToast?.('Added to folder ✓');
    } catch (e) {
      showToast?.('Failed to add bookmark: ' + e.message);
    }
  };

  const handleRemoveFromFolder = async (folderId, referenceId) => {
    try {
      await removeBookmark(folderId, referenceId);
      setBookmarkFolders(prev => prev.map(f =>
        f.id === folderId
          ? { ...f, resourceIds: (f.resourceIds || []).filter(rid => rid !== referenceId) }
          : f,
      ));
    } catch (e) {
      showToast?.('Failed to remove bookmark: ' + e.message);
    }
  };

  // Apply all filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    // If a folder is active, only show resources in that folder
    const folderIds = activeFolderId
      ? new Set(bookmarkFolders.find(f => f.id === activeFolderId)?.resourceIds || [])
      : null;

    return resources.filter(r => {
      if (folderIds && !folderIds.has(r.id)) return false;
      if (activeCategoryId !== 'all' && r.category_id !== activeCategoryId) return false;
      if (activeType !== 'all' && r.type !== activeType) return false;
      // §6: a company's References tab shows ONLY references tagged to that
      // company — untagged references stay on the global References tab and no
      // longer leak into every company page (per Tanner). The global tab
      // (companyFilter null) still shows everything.
      // A reference's `company` is usually a Notion Deal Category value
      // (ONEVIBEMEDIA, AMPLIFYARTISTS, …) — match it the same way Tasks do
      // (deal-category → slug), with a company-name fallback. companyNameMatches
      // alone failed for short slugs like ovm/ovd (token 'ovm' ≠ 'ONEVIBEMEDIA').
      if (companyFilter && !dealCategoryMatchesSlug([r.company], companyFilter, [r.company])) return false;
      if (activeCompany !== 'All') {
        const company = (r.company || r.owner || '').toLowerCase();
        if (!company.includes(activeCompany.toLowerCase())) return false;
      }
      if (!q) return true;
      return (
        (r.title       || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.url         || '').toLowerCase().includes(q) ||
        (r.owner       || '').toLowerCase().includes(q) ||
        (r.type        || '').toLowerCase().includes(q) ||
        (r.company     || '').toLowerCase().includes(q)
      );
    });
  }, [resources, activeCategoryId, activeType, activeCompany, search, activeFolderId, bookmarkFolders, companyFilter]);

  // Sort: pinned first when no active folder filter
  const sorted = useMemo(() => {
    if (activeFolderId) return filtered; // folder view: preserve folder order
    return [...filtered].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [filtered, pinnedIds, activeFolderId]);

  const countByCategory = useMemo(() => {
    const counts = { all: resources.length };
    for (const r of resources) {
      counts[r.category_id || 'uncategorized'] = (counts[r.category_id || 'uncategorized'] || 0) + 1;
    }
    return counts;
  }, [resources]);

  const openEditor = (resource = null) => {
    // When adding a new reference from within a company tab, pre-fill the
    // company with its canonical Deal Category (matches the COMPANY_OPTIONS list
    // and the per-company filter), e.g. ovm → ONEVIBEMEDIA.
    const initialCompany = !resource && companyFilter
      ? ((SLUG_TO_DEAL_CATEGORY[companyFilter] || [])[0] || COMPANY_META[companyFilter]?.label || companyFilter.toUpperCase())
      : undefined;
    openOv({
      kind: 'modal',
      title: resource ? `Edit reference — ${resource.title}` : 'New reference',
      body: <ResourceEditor
        resource={resource}
        categories={categories}
        initialCompany={initialCompany}
        onSaved={() => { closeOv(); load(); }}
        onClose={closeOv}
        onDelete={resource ? async () => {
          if (!confirm(`Delete "${resource.title}"?`)) return;
          try {
            await deleteResource(resource.id);
            showToast?.('Reference deleted');
            closeOv();
            load();
          } catch (e) {
            showToast?.('Delete failed: ' + e.message);
          }
        } : null}
        showToast={showToast}
      />,
    });
  };

  const openCategoryEditor = () => {
    openOv({
      kind: 'drawer',
      title: 'Manage categories',
      body: <CategoryEditor
        categories={categories}
        onChanged={() => load()}
        onClose={closeOv}
        showToast={showToast}
      />,
    });
  };

  // Active filter chips
  const activeFilters = [];
  if (activeCategoryId !== 'all') {
    const cat = categories.find(c => c.id === activeCategoryId);
    activeFilters.push({ key: 'category', label: `Category: ${cat?.label || activeCategoryId}`, clear: () => setActiveCategoryId('all') });
  }
  if (activeType !== 'all') {
    activeFilters.push({ key: 'type', label: `Type: ${TYPE_LABELS[activeType] || activeType}`, clear: () => setActiveType('all') });
  }
  if (activeCompany !== 'All') {
    activeFilters.push({ key: 'company', label: `Company: ${activeCompany}`, clear: () => setActiveCompany('All') });
  }
  if (activeFolderId) {
    const folder = bookmarkFolders.find(f => f.id === activeFolderId);
    activeFilters.push({ key: 'folder', label: `Folder: ${folder?.name || ''}`, clear: () => setActiveFolderId(null) });
  }

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>Library</Eyebrow>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 20,
        }}>
          <div>
            <h1 style={{
              fontFamily: SERIF, fontWeight: 500, fontSize: 38,
              letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1,
            }}>
              References
            </h1>
            <p style={{ fontSize: 13, color: C.ink5, margin: 0 }}>
              Curated links to OVMG's external documents, dashboards, and tools.
              {isAdmin && ' Click any card to edit, or use + to add a new one.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isAdmin && (
              <>
                <Btn v="gho" onClick={openCategoryEditor}>Manage categories</Btn>
                <Btn v="gho" onClick={() => setFilterMode(f => !f)}>
                  {filterMode ? 'Hide filters' : 'Filters'}
                </Btn>
              </>
            )}
            {!isAdmin && (
              <Btn v="gho" onClick={() => setFilterMode(f => !f)}>
                {filterMode ? 'Hide filters' : 'Filters'}
              </Btn>
            )}
            <Btn v="gho" onClick={() => setBookmarkSidebarOpen(o => !o)}>
              ⊞ Folders
            </Btn>
            {isAdmin && (
              <Btn onClick={() => openEditor()}>+ New reference</Btn>
            )}
          </div>
        </div>

        {/* ── Search + filter bar ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search references…"
              style={{
                flex: 1, minWidth: 200, maxWidth: 340,
                padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${C.cr3}`, background: C.bg2,
                fontFamily: SANS, fontSize: 13, color: C.ink9, outline: 'none',
              }}
            />
            {/* Active filter chips */}
            {activeFilters.map(f => (
              <span key={f.key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 99,
                background: C.accS, border: `1px solid ${C.acc}`,
                fontFamily: SANS, fontSize: 11, fontWeight: 500, color: C.acc,
              }}>
                {f.label}
                <button onClick={f.clear} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: C.acc, fontSize: 13, lineHeight: 1, padding: 0,
                }}>×</button>
              </span>
            ))}
          </div>

          {/* Category chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CategoryChip
              label="All"
              count={countByCategory.all || 0}
              active={activeCategoryId === 'all'}
              onClick={() => setActiveCategoryId('all')}
            />
            {categories.map(cat => (
              <CategoryChip
                key={cat.id}
                label={cat.label}
                icon={cat.icon}
                count={countByCategory[cat.id] || 0}
                active={activeCategoryId === cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
              />
            ))}
          </div>

          {/* Extra filter row (Type + Company) */}
          {filterMode && (
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap',
              padding: '12px 14px', background: C.bg2, borderRadius: 8,
              border: `1px solid ${C.cr3}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>Type</span>
                <select
                  value={activeType}
                  onChange={e => setActiveType(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.cr3}`,
                    background: C.bg, fontFamily: SANS, fontSize: 12, color: C.ink8, outline: 'none',
                  }}
                >
                  <option value="all">All types</option>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>Company</span>
                <select
                  value={activeCompany}
                  onChange={e => setActiveCompany(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.cr3}`,
                    background: C.bg, fontFamily: SANS, fontSize: 12, color: C.ink8, outline: 'none',
                  }}
                >
                  {COMPANY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Btn v="gho" onClick={() => { setActiveType('all'); setActiveCompany('All'); setActiveCategoryId('all'); setSearch(''); }}>
                  Clear all
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* ── Resource cards ──────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.ink3, fontSize: 13, display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.ink3, fontSize: 13 }}>
            {search || activeFilters.length ? 'No references match your filters.' : 'No references in this category yet.'}
            {isAdmin && (
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => openEditor()}>+ Add the first one</Btn>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 14,
          }}>
            {sorted.map(r => (
              <ResourceCard
                key={r.id}
                resource={r}
                category={categoriesById[r.category_id]}
                isAdmin={isAdmin}
                onEdit={() => openEditor(r)}
                user={user}
                showToast={showToast}
                isPinned={pinnedIds.has(r.id)}
                onTogglePin={() => togglePin(r.id)}
                expanded={expandedCardId === r.id}
                onToggleExpand={() => setExpandedCardId(id => id === r.id ? null : r.id)}
                bookmarkFolders={bookmarkFolders}
                onAddToFolder={handleAddToFolder}
                onRemoveFromFolder={handleRemoveFromFolder}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bookmarks sidebar ────────────────────────────────────────────── */}
      {bookmarkSidebarOpen && (
        <BookmarkSidebar
          folders={bookmarkFolders}
          setFolders={setBookmarkFolders}
          activeFolderId={activeFolderId}
          onSelectFolder={setActiveFolderId}
          onClose={() => setBookmarkSidebarOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function CategoryChip({ label, icon, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 99,
        background: active ? C.ink9 : C.bg2,
        color: active ? C.bg : C.ink8,
        border: `1px solid ${active ? C.ink9 : C.cr3}`,
        fontFamily: SANS, fontSize: 12, fontWeight: 500,
        cursor: 'pointer', transition: 'all .12s',
      }}
    >
      {icon && <span style={{ fontFamily: SERIF, fontSize: 12 }}>{icon}</span>}
      <span>{label}</span>
      <span style={{
        fontFamily: MONO, fontSize: 9, fontWeight: 600,
        padding: '0 5px', borderRadius: 4,
        background: active ? C.acc : C.cr3,
        color: active ? C.ink9 : C.ink5,
      }}>
        {count}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ResourceCard({
  resource, category, isAdmin, onEdit, user, showToast,
  isPinned, onTogglePin, expanded, onToggleExpand,
  bookmarkFolders, onAddToFolder, onRemoveFromFolder,
}) {
  const catStyle = categoryStyle(category);
  const typeIcon = TYPE_ICONS[resource.type] || '◎';
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close folder menu on outside click
  useEffect(() => {
    if (!folderMenuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setFolderMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderMenuOpen]);

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${isPinned ? C.acc : C.cr3}`,
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative',
      boxShadow: isPinned ? `0 0 0 1px ${C.acc}22` : 'none',
      transition: 'border-color .15s',
    }}>
      {/* Pin indicator strip */}
      {isPinned && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: C.acc, borderRadius: '12px 12px 0 0',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 22, color: C.acc, lineHeight: 1, flexShrink: 0 }}>
          {typeIcon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: C.ink9,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {resource.title}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {resource.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </div>
        </div>
        {/* Pin button */}
        <button onClick={onTogglePin} title={isPinned ? 'Unpin' : 'Pin'} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
          fontSize: 14, color: isPinned ? C.acc : C.ink3, flexShrink: 0,
          transition: 'color .12s',
        }}>
          {isPinned ? '⊡' : '⊟'}
        </button>
      </div>

      {resource.description && (
        <p style={{ margin: 0, fontSize: 13, color: C.ink5, lineHeight: 1.5 }}>
          {resource.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {category && <Pill label={category.label} bg={catStyle.bg} fg={catStyle.fg} />}
        <Pill label={TYPE_LABELS[resource.type] || 'Link'} bg={C.grS} fg={C.ink5} />
        {resource.ovmg_only && <Pill label="OVMG only" bg={C.redS} fg={C.red} />}
        {resource.company && <Pill label={resource.company} bg={C.bluS} fg={C.blu} />}
        {resource.owner && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, marginLeft: 'auto' }}>
            @{resource.owner}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, minWidth: 60, padding: '8px 12px', borderRadius: 6,
            background: C.ink9, color: C.bg, fontFamily: SANS, fontSize: 12,
            fontWeight: 500, textAlign: 'center', textDecoration: 'none',
          }}
        >
          Open ↗
        </a>
        {/* Add to folder button */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setFolderMenuOpen(o => !o)} title="Add to folder" style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'transparent', border: `1px solid ${C.cr3}`,
            fontFamily: SANS, fontSize: 12, color: C.ink5, cursor: 'pointer',
          }}>
            ⊞
          </button>
          {folderMenuOpen && (
            <div style={{
              position: 'absolute', bottom: '110%', right: 0, zIndex: 50,
              background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)', minWidth: 180,
              padding: '6px 0',
            }}>
              {bookmarkFolders.length === 0 && (
                <div style={{ padding: '8px 14px', fontFamily: SANS, fontSize: 12, color: C.ink3 }}>
                  No folders yet. Create one in Folders sidebar.
                </div>
              )}
              {bookmarkFolders.map(f => {
                const inFolder = (f.resourceIds || []).includes(resource.id);
                return (
                  <button key={f.id} onClick={() => {
                    if (inFolder) onRemoveFromFolder(f.id, resource.id);
                    else onAddToFolder(f.id, resource.id);
                    setFolderMenuOpen(false);
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '8px 14px', background: 'none', border: 'none',
                    fontFamily: SANS, fontSize: 12, color: C.ink8, cursor: 'pointer',
                    textAlign: 'left',
                  }}>
                    <span style={{ color: inFolder ? C.acc : C.ink3, fontSize: 13 }}>
                      {inFolder ? '◼' : '◻'}
                    </span>
                    {f.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* Expand/comments toggle */}
        <button onClick={onToggleExpand} title={expanded ? 'Collapse' : 'Comments / Notes'} style={{
          padding: '8px 10px', borderRadius: 6,
          background: expanded ? C.accS : 'transparent',
          border: `1px solid ${expanded ? C.acc : C.cr3}`,
          fontFamily: SANS, fontSize: 12, color: expanded ? C.acc : C.ink5,
          cursor: 'pointer', transition: 'all .12s',
        }}>
          ✎
        </button>
        {isAdmin && (
          <button onClick={onEdit} style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'transparent', border: `1px solid ${C.cr3}`,
            fontFamily: SANS, fontSize: 12, color: C.ink5, cursor: 'pointer',
          }}>
            Edit
          </button>
        )}
      </div>

      {/* Expanded section: comments + submit note */}
      {expanded && (
        <div style={{
          marginTop: 4, borderTop: `1px solid ${C.cr3}`, paddingTop: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <CommentsSection resourceId={resource.id} user={user} showToast={showToast} />
          <NoteForm doc={{ name: resource.title, url: resource.url }} user={user} showToast={showToast} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CommentsSection — lightweight in-card comment thread stored in Supabase.
// Uses the `resource_comments` table: (id, resource_id, user_id, author_name,
// body, created_at, updated_at). Falls back gracefully if table doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────
function CommentsSection({ resourceId, user, showToast }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [body,    setBody]       = useState('');
  const [saving,  setSaving]     = useState(false);
  const [editId,  setEditId]     = useState(null);
  const [editBody,setEditBody]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listResourceComments(resourceId);
      setComments(data.comments || []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const data = await createResourceComment({ resourceId, body: body.trim() });
      setComments(prev => [data.comment, ...prev]);
      setBody('');
    } catch (e) {
      showToast?.('Failed to post comment: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id) => {
    if (!editBody.trim()) return;
    try {
      const data = await updateResourceComment(id, { body: editBody.trim() });
      setComments(prev => prev.map(c => c.id === id ? data.comment : c));
      setEditId(null);
    } catch (e) {
      showToast?.('Failed to update: ' + e.message);
    }
  };

  const del = async (id) => {
    try {
      await deleteResourceComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      showToast?.('Failed to delete: ' + e.message);
    }
  };

  const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 8 }}>
        Comments
      </div>

      {loading ? (
        <div style={{ padding: '6px 0', color: C.ink3, fontSize: 12 }}>Loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic', marginBottom: 8 }}>No comments yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {comments.map(c => (
            <div key={c.id} style={{
              background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8,
              padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: C.ink7 }}>
                  {c.author_name || c.user_id}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>
                  {timeAgo(c.created_at)}
                </span>
              </div>
              {editId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={editBody} onChange={e => setEditBody(e.target.value)} rows={2}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '6px 8px',
                      border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg2,
                      fontFamily: SANS, fontSize: 12, resize: 'vertical', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditId(null)} style={miniBtn(false, C.ink3)}>Cancel</button>
                    <button onClick={() => saveEdit(c.id)} style={miniBtn(true, C.acc)}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 12, color: C.ink7, lineHeight: 1.5 }}>{c.body}</p>
                  {(c.user_id === user.id || user.isAdmin) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: C.ink3, fontFamily: MONO }}>
                        Edit
                      </button>
                      <button onClick={() => del(c.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: C.red, fontFamily: MONO }}>
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…" rows={2} disabled={saving}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 10px',
            border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
            fontFamily: SANS, fontSize: 12, color: C.ink9,
            resize: 'vertical', outline: 'none', lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={submit} disabled={saving || !body.trim()} style={miniBtn(true, C.acc)}>
            {saving ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmark sidebar
// ─────────────────────────────────────────────────────────────────────────────
function BookmarkSidebar({ folders, setFolders, activeFolderId, onSelectFolder, onClose, showToast }) {
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal,  setRenameVal]  = useState('');

  const createFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const data = await createBookmarkFolder({ name });
      setFolders(prev => [...prev, data.folder]);
      setNewName(''); setCreating(false);
    } catch (e) {
      showToast?.('Failed to create folder: ' + e.message);
    }
  };

  const renameFolder = async (id) => {
    const name = renameVal.trim();
    if (!name) return;
    try {
      const data = await updateBookmarkFolder(id, { name });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name: data.folder.name } : f));
      setRenamingId(null);
    } catch (e) {
      showToast?.('Failed to rename: ' + e.message);
    }
  };

  const deleteFolder = async (id) => {
    if (!confirm('Delete this folder? The references inside won\'t be deleted.')) return;
    try {
      await deleteBookmarkFolder(id);
      setFolders(prev => prev.filter(f => f.id !== id));
      if (activeFolderId === id) onSelectFolder(null);
    } catch (e) {
      showToast?.('Failed to delete: ' + e.message);
    }
  };

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: C.bg2, borderLeft: `1px solid ${C.cr3}`,
      borderRadius: '0 12px 12px 0',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      marginLeft: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px 10px', borderBottom: `1px solid ${C.cr3}`,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>
          Bookmark Folders
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 16, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {/* "All references" option */}
        <button onClick={() => onSelectFolder(null)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 10px', borderRadius: 6,
          background: activeFolderId === null ? C.accS : 'transparent',
          border: 'none', cursor: 'pointer',
          fontFamily: SANS, fontSize: 12, color: activeFolderId === null ? C.acc : C.ink7,
          fontWeight: activeFolderId === null ? 600 : 400, textAlign: 'left',
        }}>
          <span>⊟</span> All references
        </button>

        {folders.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {renamingId === f.id ? (
              <div style={{ flex: 1, display: 'flex', gap: 4, padding: '4px 6px' }}>
                <input
                  value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameFolder(f.id); if (e.key === 'Escape') setRenamingId(null); }}
                  autoFocus
                  style={{
                    flex: 1, padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.cr3}`,
                    fontFamily: SANS, fontSize: 12, background: C.bg, outline: 'none',
                  }}
                />
                <button onClick={() => renameFolder(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.acc, fontSize: 12 }}>✓</button>
                <button onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 12 }}>×</button>
              </div>
            ) : (
              <button onClick={() => onSelectFolder(f.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 6,
                background: activeFolderId === f.id ? C.accS : 'transparent',
                border: 'none', cursor: 'pointer',
                fontFamily: SANS, fontSize: 12,
                color: activeFolderId === f.id ? C.acc : C.ink7,
                fontWeight: activeFolderId === f.id ? 600 : 400, textAlign: 'left',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                  ⊞ {f.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, flexShrink: 0 }}>
                  {(f.resourceIds || []).length}
                </span>
              </button>
            )}
            {renamingId !== f.id && (
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button onClick={() => { setRenamingId(f.id); setRenameVal(f.name); }} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: C.ink3,
                  fontSize: 10, padding: '4px', fontFamily: MONO,
                }} title="Rename">✎</button>
                <button onClick={() => deleteFolder(f.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: C.red,
                  fontSize: 10, padding: '4px', fontFamily: MONO,
                }} title="Delete">✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create folder */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.cr3}` }}>
        {creating ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
              placeholder="Folder name…" autoFocus
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.cr3}`,
                fontFamily: SANS, fontSize: 12, background: C.bg, outline: 'none',
              }}
            />
            <button onClick={createFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.acc, fontSize: 14 }}>✓</button>
            <button onClick={() => { setCreating(false); setNewName(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 14 }}>×</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{
            width: '100%', padding: '7px 10px', borderRadius: 6,
            background: 'none', border: `1px dashed ${C.cr3}`,
            fontFamily: SANS, fontSize: 12, color: C.ink3, cursor: 'pointer',
            textAlign: 'left',
          }}>
            + New folder
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit-a-note form, preserved from the old References.jsx — posts to the
// existing Notion NOTES integration via `references-note.js`.
// ─────────────────────────────────────────────────────────────────────────────
function NoteForm({ doc, user, showToast }) {
  const [open,   setOpen]   = useState(false);
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await submitReferenceNote({
        site: doc.name, siteUrl: doc.url, note: note.trim(),
        authorName: user.fullName || user.email, authorEmail: user.email,
      });
      setDone(true); setNote('');
      showToast('Note sent to Tanner ✓');
      setTimeout(() => { setDone(false); setOpen(false); }, 2500);
    } catch (e) {
      showToast('Failed to submit note: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{
        marginTop: 2, display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 6,
        color: C.ink3, fontSize: 11, fontFamily: MONO, letterSpacing: '.06em',
        textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer',
        transition: 'all .15s',
      }}
    >
      ✎ Submit a Note to Tanner
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
        Note for Tanner
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        placeholder={`Suggestions or notes for ${doc.name}…`} rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 10px',
          border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
          color: C.ink9, fontFamily: SANS, fontSize: 12, lineHeight: 1.5,
          resize: 'vertical', outline: 'none',
        }}
        disabled={saving || done}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={() => { setOpen(false); setNote(''); }} disabled={saving}
          style={miniBtn(false, C.ink3)}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving || !note.trim() || done}
          style={miniBtn(true, done ? C.grn : C.acc)}>
          {done ? 'Sent' : saving ? 'Sending…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function miniBtn(filled, color) {
  return {
    padding: '6px 14px', borderRadius: 6,
    background: filled ? color : 'none',
    color: filled ? '#fff' : color,
    border: filled ? 'none' : `1px solid ${C.cr3}`,
    fontFamily: MONO, fontSize: 10, letterSpacing: '.06em',
    textTransform: 'uppercase', cursor: 'pointer',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
function ResourceEditor({ resource, categories, onSaved, onClose, onDelete, showToast, initialCompany }) {
  const [title,      setTitle]      = useState(resource?.title       || '');
  const [url,        setUrl]        = useState(resource?.url         || '');
  const [categoryId, setCategoryId] = useState(resource?.category_id || categories[0]?.id || '');
  const [type,       setType]       = useState(resource?.type        || 'url');
  const [description,setDescription]= useState(resource?.description || '');
  const [owner,      setOwner]      = useState(resource?.owner       || '');
  const [company,    setCompany]    = useState(resource?.company     || initialCompany || '');
  const [tags,       setTags]       = useState((resource?.tags || []).join(', '));
  const [ovmgOnly,   setOvmgOnly]   = useState(!!resource?.ovmg_only);
  const [pinned,     setPinned]     = useState(resource?.pinned_in_references !== false);
  const [saving,     setSaving]     = useState(false);

  const save = async () => {
    if (!title.trim()) { showToast?.('Title is required'); return; }
    if (!url.trim())   { showToast?.('URL is required'); return; }
    setSaving(true);
    try {
      await upsertResource({
        id:                   resource?.id,
        title:                title.trim(),
        url:                  url.trim(),
        category_id:          categoryId || null,
        type,
        description:          description.trim(),
        owner:                owner.trim(),
        company:              company.trim(),
        tags:                 tags.split(',').map(t => t.trim()).filter(Boolean),
        ovmg_only:            ovmgOnly,
        pinned_in_references: pinned,
      });
      showToast?.(resource ? 'Saved ✓' : 'Created ✓');
      onSaved?.();
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FR label="Title *">
        <Inp value={title} onChange={e => setTitle(e.target.value)} placeholder="OVMG Pitch Deck" />
      </FR>
      <FR label="URL *">
        <Inp value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
      </FR>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FR label="Category">
          <Sel value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">(uncategorized)</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
            ))}
          </Sel>
        </FR>
        <FR label="Type">
          <Sel value={type} onChange={e => setType(e.target.value)}>
            {TYPE_OPTIONS.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Sel>
        </FR>
      </div>
      <FR label="Company">
        <Sel value={company} onChange={e => setCompany(e.target.value)}>
          <option value="">(none)</option>
          {COMPANY_OPTIONS.filter(c => c !== 'All').map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Sel>
      </FR>
      <FR label="Description">
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="One-line summary of what this resource is for"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 12px',
            border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg2,
            fontFamily: SANS, fontSize: 13, color: C.ink8,
            resize: 'vertical', outline: 'none', lineHeight: 1.5,
          }}
        />
      </FR>
      <FR label="Tags (comma-separated)">
        <Inp value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. finance, reporting, sheets" />
      </FR>
      <FR label="Owner">
        <Inp value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. carsten@ or 'sales team'" />
      </FR>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} style={{ accentColor: C.acc }} />
          Show on the References tab (uncheck for registry-only)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink8 }}>
          <input type="checkbox" checked={ovmgOnly} onChange={e => setOvmgOnly(e.target.checked)} style={{ accentColor: C.acc }} />
          OVMG-only (hide from non-OVMG accounts)
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div>
          {onDelete && (
            <Btn v="dan" onClick={onDelete}>Delete</Btn>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : (resource ? 'Save changes' : 'Create reference')}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function CategoryEditor({ categories, onChanged, onClose, showToast }) {
  const [items, setItems] = useState(categories);
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState('◎');

  const add = async () => {
    if (!newId.trim() || !newLabel.trim()) { showToast?.('Id and label required'); return; }
    try {
      const { category } = await upsertCategory({ id: newId.trim(), label: newLabel.trim(), icon: newIcon.trim() });
      setItems([...items, category].sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100)));
      onChanged?.();
      setAdding(false); setNewId(''); setNewLabel(''); setNewIcon('◎');
    } catch (e) {
      showToast?.('Add failed: ' + e.message);
    }
  };

  const remove = async (id) => {
    if (!confirm(`Delete category "${id}"? Resources in this category will become uncategorized.`)) return;
    try {
      await deleteCategory(id);
      setItems(items.filter(c => c.id !== id));
      onChanged?.();
    } catch (e) {
      showToast?.('Delete failed: ' + e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: C.bg2, borderRadius: 8,
        }}>
          <span style={{ fontFamily: SERIF, fontSize: 18, color: C.acc, width: 24, textAlign: 'center' }}>{c.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: C.ink9 }}>{c.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{c.id}</div>
          </div>
          <Btn v="dan" onClick={() => remove(c.id)}>Delete</Btn>
        </div>
      ))}

      {!adding ? (
        <Btn v="gho" onClick={() => setAdding(true)}>+ New category</Btn>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px dashed ${C.cr3}`, borderRadius: 8 }}>
          <FR label="ID (slug)">
            <Inp value={newId} onChange={e => setNewId(e.target.value)} placeholder="e.g. partnerships" />
          </FR>
          <FR label="Label">
            <Inp value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Partnerships" />
          </FR>
          <FR label="Icon">
            <Inp value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="single glyph" />
          </FR>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Btn v="gho" onClick={() => setAdding(false)}>Cancel</Btn>
            <Btn onClick={add}>Add</Btn>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn v="gho" onClick={onClose}>Close</Btn>
      </div>
    </div>
  );
}
