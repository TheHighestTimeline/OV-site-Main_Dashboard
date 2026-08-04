import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, Modal, SkeletonRows, EmptyState, useConfirm } from '../components/UI.jsx';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache.js';
import { findDuplicateGroups } from '../lib/companyName.js';
import {
  getCompanies, createCompany, updateCompany,
  previewCompanyDelete, deleteCompany,
} from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import CompanySnapshot from './CompanySnapshot.jsx';
import MergeReview from './MergeReview.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Companies — the tab that closes the loop on the company record.
//
// Companies were already the routing key for the whole CRM: an Activity links to
// exactly one company, Documents and Folders are filed under one, an
// Opportunity's counterparty is one, and a contact's employer is one. The table
// was reachable from precisely two places — a chip on a contact row, and the
// picker in the opportunity popup — and from neither of those could you create
// one, edit one, see the whole list, or find out that you had four rows for the
// same counterparty.
//
// That is why the free-text company box on the contact form used to map to
// nothing: there was no company surface to send anyone to. The box now resolves
// to a real record (netlify/functions/_companies.js) and creates one when it has
// to, which by design produces near-duplicates. This tab is the other half of
// that bargain — entry wins, and cleanup happens here.
// ─────────────────────────────────────────────────────────────────────────────

const TYPES    = ['', 'Internal', 'External', 'Client', 'Partner', 'Vendor', 'Investor'];
const STATUSES = ['', 'Active', 'Inactive', 'Prospect', 'Archived'];

const hostLabel = (url) => {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return url; }
};

const ta = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: `1px solid ${C.cr3}`, background: C.bg2, color: C.ink9,
  fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', outline: 'none',
};

// ── Create / edit form ───────────────────────────────────────────────────────
function CompanyForm({ initial = null, onSave, onClose, saving }) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({
    name: '', entityCode: '', shortCode: '', type: '', status: '', website: '',
    subjectDescriptor: '', summary: '', callsNotes: '', waitingOn: '',
    health: '', stage: '', followUpDate: '',
    ...(initial || {}),
  });
  const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FR label="Name *"><Inp value={f.name} onChange={fld('name')} placeholder="BrightSunSolr" /></FR>
      <div style={grid}>
        <FR label="Type"><Sel value={f.type} onChange={fld('type')}>{TYPES.map(t => <option key={t} value={t}>{t || '— None'}</option>)}</Sel></FR>
        <FR label="Status"><Sel value={f.status} onChange={fld('status')}>{STATUSES.map(s => <option key={s} value={s}>{s || '— None'}</option>)}</Sel></FR>
      </div>
      <div style={grid}>
        {/* Entity Code is what marks a company as one of OURS. It is the field
            the participation suggester uses to exclude internal companies from
            counterparty matching, so it earns a place on the create form. */}
        <FR label="Entity code (ours only)"><Inp value={f.entityCode} onChange={fld('entityCode')} placeholder="OVMG, OVM, …" /></FR>
        <FR label="Short code"><Inp value={f.shortCode} onChange={fld('shortCode')} /></FR>
      </div>
      <div style={grid}>
        <FR label="Website"><Inp value={f.website} onChange={fld('website')} placeholder="https://…" /></FR>
        <FR label="Follow-up date"><Inp type="date" value={f.followUpDate || ''} onChange={fld('followUpDate')} /></FR>
      </div>
      <div style={grid}>
        <FR label="Health"><Inp value={f.health} onChange={fld('health')} /></FR>
        <FR label="Stage"><Inp value={f.stage} onChange={fld('stage')} /></FR>
      </div>
      <FR label="Subject descriptor"><Inp value={f.subjectDescriptor} onChange={fld('subjectDescriptor')} placeholder="What they actually do" /></FR>
      <FR label="Summary"><textarea rows={2} value={f.summary} onChange={fld('summary')} style={ta} /></FR>
      <FR label="Waiting on"><Inp value={f.waitingOn} onChange={fld('waitingOn')} /></FR>
      <FR label="Calls / notes"><textarea rows={3} value={f.callsNotes} onChange={fld('callsNotes')} style={ta} /></FR>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Btn v="gho" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn onClick={() => onSave(f)} disabled={saving || !f.name.trim()}>
          {saving ? 'Saving…' : initial?.id ? 'Save company' : 'Add company'}
        </Btn>
      </div>
    </div>
  );
}

export default function Companies({ showToast, setView }) {
  const isMobile = useIsMobile();
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');
  const [typeF,     setTypeF]     = useState('All');
  const [statusF,   setStatusF]   = useState('All');
  const [scope,     setScope]     = useState('all');   // all | ours | external | orphans
  const [sortCol,   setSortCol]   = useState('name');
  const [sortDir,   setSortDir]   = useState('asc');

  const [openCompany, setOpenCompany] = useState(null); // snapshot
  const [formFor,     setFormFor]     = useState(null); // null | {} | record
  const [selIds,      setSelIds]      = useState([]);
  const [mergeIds,    setMergeIds]    = useState(null);
  const [confirmNode, confirm] = useConfirm();

  const load = useCallback(() => {
    const cached = cacheGet('companies');
    if (cached) { setCompanies(cached); setLoading(false); }
    return getCompanies()
      .then(list => { const arr = Array.isArray(list) ? list : []; cacheSet('companies', arr); setCompanies(arr); })
      .catch(e => showToast?.('Could not load companies: ' + e.message))
      .finally(() => setLoading(false));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  // Duplicate detection uses the SAME key the server uses when it resolves a
  // typed company name, so this flags exactly the pairs the server would have
  // treated as one had they been typed rather than created separately.
  const dupGroups = useMemo(() => findDuplicateGroups(companies), [companies]);

  // "Ours" = carries an Entity Code, is typed Internal, or is named OneVibe/OVMG.
  // Two legacy records carry neither flag, which is why the name check is here.
  const isOurs = (c) =>
    !!c.entityCode || String(c.type || '').toLowerCase() === 'internal' ||
    /^(onevibe|ovmg)/i.test(c.name || '');

  const filtered = useMemo(() => companies.filter(c => {
    if (typeF   !== 'All' && (c.type   || '') !== typeF)   return false;
    if (statusF !== 'All' && (c.status || '') !== statusF) return false;
    if (scope === 'ours'     && !isOurs(c)) return false;
    if (scope === 'external' && isOurs(c))  return false;
    // An orphan is a company nothing points at. It is either a typo from the
    // contact form or a record somebody made and abandoned — either way it is
    // the working list for a cleanup pass.
    if (scope === 'orphans'  && (c.peopleCount > 0 || c.dealCount > 0)) return false;
    if (search) {
      const hay = [c.name, c.entityCode, c.shortCode, c.type, c.status, c.website, c.subjectDescriptor]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'people')      cmp = (a.peopleCount || 0) - (b.peopleCount || 0);
    else if (sortCol === 'deals')  cmp = (a.dealCount || 0) - (b.dealCount || 0);
    else if (sortCol === 'last')   cmp = String(a.lastActivityDate || '').localeCompare(String(b.lastActivityDate || ''));
    else if (sortCol === 'type')   cmp = (a.type || '').localeCompare(b.type || '');
    else if (sortCol === 'status') cmp = (a.status || '').localeCompare(b.status || '');
    else cmp = (a.name || '').localeCompare(b.name || '');
    return sortDir === 'asc' ? cmp : -cmp;
  }), [companies, search, typeF, statusF, scope, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    // Counts are interesting from the top down; names from A.
    else { setSortCol(col); setSortDir(['people', 'deals', 'last'].includes(col) ? 'desc' : 'asc'); }
  };

  const refresh = () => { cacheClear('companies'); load(); };

  const save = async (data) => {
    setSaving(true);
    try {
      if (formFor?.id) {
        await updateCompany(formFor.id, data);
        showToast?.('Saved ✓');
      } else {
        const res = await createCompany(data);
        // The server matches before creating, so a name that already exists
        // returns that record rather than making a second one. Say so — silently
        // "creating" a company that already existed is how people end up
        // convinced the button is broken.
        showToast?.(res?.matchedExisting
          ? `“${res.name}” already existed — opened that one instead`
          : `Added ${data.name} ✓`);
      }
      setFormFor(null);
      refresh();
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  // Delete asks the server what points at the record FIRST, so the confirm can
  // name the damage instead of asking "are you sure?" about an unknown weight.
  const askDelete = async (c) => {
    let preview = null;
    try { preview = await previewCompanyDelete(c.id); }
    catch { /* fall through to the generic warning */ }

    const links = Object.entries(preview?.links || {}).filter(([, n]) => n > 0);
    const detail = links.length
      ? `${links.map(([l, n]) => `${n} ${l}`).join(', ')} point at it and will be unlinked (those records are kept).`
      : 'Nothing links to it.';

    confirm({
      itemName: c.name,
      confirmLabel: 'Delete company',
      message: `Delete “${c.name}”? ${detail} This can't be undone — if this is a duplicate, merge it instead so the history survives.`,
      onConfirm: async () => {
        try {
          await deleteCompany(c.id);
          showToast?.(`Deleted ${c.name}`);
          setOpenCompany(null);
          refresh();
        } catch (e) { showToast?.('Delete failed: ' + e.message); }
      },
    });
  };

  const th = (label, col) => {
    const active = col && sortCol === col;
    return (
      <th key={label} onClick={col ? () => toggleSort(col) : undefined}
        style={{ textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
          color: active ? C.ink8 : C.ink3, padding: '9px 14px', borderBottom: `1px solid ${C.cr2}`,
          whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
        {label}{col && <span style={{ opacity: active ? 1 : .4 }}>{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ▲▼'}</span>}
      </th>
    );
  };

  return (
    <div>
      {confirmNode}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>CRM</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Companies</h1>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, marginTop: 4 }}>
            {filtered.length} of {companies.length}
            {companies.length > 0 && <> · {companies.reduce((s, c) => s + (c.peopleCount || 0), 0)} people · {companies.reduce((s, c) => s + (c.dealCount || 0), 0)} deals</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…" sx={{ width: 190 }} />
          <Btn onClick={() => setFormFor({})}>+ New</Btn>
        </div>
      </div>

      {/* Duplicates — the reason this tab exists, so it sits above the table. */}
      {!loading && dupGroups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px', marginBottom: 14, background: C.redS, border: '1px solid #e0b4b4', borderRadius: 12 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: C.red }}>
            {dupGroups.length} possible duplicate {dupGroups.length > 1 ? 'sets' : 'set'} — e.g. <b>{dupGroups[0].map(c => c.name).join(' / ')}</b>
          </div>
          <Btn v="gho" onClick={() => setMergeIds(dupGroups[0].map(c => c.id))}>Review first set</Btn>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {[
          ['all', `Everyone (${companies.length})`],
          ['ours', `Ours (${companies.filter(isOurs).length})`],
          ['external', `Counterparties (${companies.filter(c => !isOurs(c)).length})`],
          ['orphans', `Nothing linked (${companies.filter(c => !c.peopleCount && !c.dealCount).length})`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setScope(v)}
            style={{ background: scope === v ? C.ink9 : C.bg2, color: scope === v ? C.bg : C.ink5,
              border: `1px solid ${scope === v ? C.ink9 : C.cr3}`, borderRadius: 999, padding: '5px 12px',
              fontSize: 11.5, cursor: 'pointer', fontFamily: SANS }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <Sel value={typeF}   onChange={e => setTypeF(e.target.value)}   sx={{ width: 'auto' }}><option value="All">All types</option>{TYPES.filter(Boolean).map(t => <option key={t}>{t}</option>)}</Sel>
        <Sel value={statusF} onChange={e => setStatusF(e.target.value)} sx={{ width: 'auto' }}><option value="All">All statuses</option>{STATUSES.filter(Boolean).map(s => <option key={s}>{s}</option>)}</Sel>
      </div>

      {/* Selection bar — merge is the action, so it leads. */}
      {selIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, background: C.ink9, borderRadius: 11 }}>
          <b style={{ fontSize: 13, color: C.bg }}>{selIds.length} selected</b>
          <span style={{ flex: 1 }} />
          <Btn onClick={() => setMergeIds(selIds)} disabled={selIds.length < 2}>
            {selIds.length < 2 ? 'Pick two to merge' : `Merge ${selIds.length}`}
          </Btn>
          <Btn v="gho" onClick={() => setSelIds([])}>Clear</Btn>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={8} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="⌂" title={companies.length ? 'No companies match those filters' : 'No companies yet'}
          body={companies.length
            ? 'Clear the filters, or search for something else.'
            : 'Every Activity, document and deal routes through a company. Add the first one and contacts can be filed against it.'}
          actionLabel={companies.length ? null : '+ New company'}
          onAction={companies.length ? null : () => setFormFor({})} />
      ) : (
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 34, padding: '9px 14px', borderBottom: `1px solid ${C.cr2}` }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(c => selIds.includes(c.id))}
                    onChange={e => setSelIds(e.target.checked ? filtered.map(c => c.id) : [])} />
                </th>
                {th('Company', 'name')}
                {th('Type', 'type')}
                {th('Status', 'status')}
                {th('People', 'people')}
                {th('Deals', 'deals')}
                {th('Last activity', 'last')}
                {th('Website', null)}
                {th('', null)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const orphan = !c.peopleCount && !c.dealCount;
                return (
                  <tr key={c.id} onClick={() => setOpenCompany(c)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.cr1}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td onClick={e => e.stopPropagation()} style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>
                      <input type="checkbox" checked={selIds.includes(c.id)}
                        onChange={() => setSelIds(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])} />
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>
                      {c.name || '(unnamed)'}
                      {c.entityCode && <Tag bg={C.accS} fg={C.accD}>{c.entityCode}</Tag>}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontSize: 12.5, color: C.ink7 }}>{c.type || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}` }}>{c.status ? <Tag bg={C.cr2} fg={C.ink5}>{c.status}</Tag> : <span style={{ color: C.ink3 }}>—</span>}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 12, color: c.peopleCount ? C.ink7 : C.ink3 }}>{c.peopleCount || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 12, color: c.dealCount ? C.ink7 : C.ink3 }}>{c.dealCount || '—'}</td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11, color: C.ink5, whiteSpace: 'nowrap' }}>
                      {c.lastActivityDate ? fmtR(c.lastActivityDate) : <span style={{ color: orphan ? C.ink3 : C.yel }}>never</span>}
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, fontFamily: MONO, fontSize: 11 }}>
                      {c.website
                        ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()} style={{ color: C.blu, textDecoration: 'none' }}>{hostLabel(c.website)} ↗</a>
                        : <span style={{ color: C.ink3 }}>—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ padding: '9px 14px', borderBottom: `1px solid ${C.cr1}`, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setFormFor(c)} title="Edit"
                        style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, color: C.ink5, fontFamily: MONO, fontSize: 10, padding: '2px 7px', cursor: 'pointer', marginRight: 5 }}>✎</button>
                      <button onClick={() => askDelete(c)} title="Delete"
                        style={{ background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 5, color: C.red, fontFamily: MONO, fontSize: 10, padding: '2px 7px', cursor: 'pointer' }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formFor && (
        <Modal title={formFor.id ? formFor.name : 'New company'} sub={formFor.id ? 'Edit company' : null} onClose={() => setFormFor(null)}>
          <CompanyForm initial={formFor.id ? formFor : null} onSave={save} onClose={() => setFormFor(null)} saving={saving} />
        </Modal>
      )}

      {openCompany && (
        <CompanySnapshot
          companyId={openCompany.id}
          companyName={openCompany.name}
          onClose={() => setOpenCompany(null)}
          showToast={showToast}
          onOpenContact={setView ? (id) => { setOpenCompany(null); setView('contacts', { openContactId: id }); } : null}
          onOpenOpp={setView ? (o) => { setOpenCompany(null); setView('kanban', { openOppId: o.id }); } : null}
          onOpenTask={setView ? (t) => { setOpenCompany(null); setView('tasks', { search: t.task }); } : null}
        />
      )}

      {mergeIds && (
        <MergeReview
          kind="company"
          ids={mergeIds}
          names={companies.filter(c => mergeIds.includes(c.id)).map(c => c.name)}
          onClose={() => setMergeIds(null)}
          onDone={() => { setSelIds([]); refresh(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
