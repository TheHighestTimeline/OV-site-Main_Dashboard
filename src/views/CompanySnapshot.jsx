import { useState, useEffect, useMemo } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Tag, Btn, Spinner } from '../components/UI.jsx';
import { getCompanyDetail } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

const PRIORITY_COLORS = { High: C.red, Medium: C.yel, Low: C.ink5 };

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < new Date().setHours(0, 0, 0, 0);
}
function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function Section({ title, count, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>{title}</span>
        {count != null && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>· {count}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * CompanySnapshot — centered modal drill-down opened from a contact (or the
 * Contacts list). Pulls one aggregated read (getCompanyDetail) and shows the
 * company's notes, documents (grouped by folder), open tasks, people, and
 * opportunities. Close with the × (top-right) or Esc to return to the contact.
 */
export default function CompanySnapshot({ companyId, companyName, onClose, showToast }) {
  const isMobile = useIsMobile();
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getCompanyDetail(companyId)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [companyId]);

  const { folderGroups, unfiledDocs } = useMemo(() => {
    if (!data) return { folderGroups: [], unfiledDocs: [] };
    const byId = Object.fromEntries((data.folders || []).map(f => [f.id, f]));
    const groups = {}; const unfiled = [];
    (data.documents || []).forEach(d => {
      const fid = (d.folderIds || []).find(id => byId[id]);
      if (fid) (groups[fid] = groups[fid] || []).push(d);
      else unfiled.push(d);
    });
    const folderGroups = (data.folders || [])
      .map(f => ({ folder: f, docs: groups[f.id] || [] }))
      .filter(g => g.docs.length > 0);
    return { folderGroups, unfiledDocs: unfiled };
  }, [data]);

  const co = data?.company;

  const DocLink = ({ d }) => (
    <a href={d.driveLink} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '7px 10px', background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12 }}>⎘</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontFamily: SERIF, fontSize: 13, color: C.ink9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name} <span style={{ color: C.ink3, fontSize: 11 }}>↗</span></span>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{hostLabel(d.driveLink)}</span>
      </span>
      {d.type && <Tag bg={C.cr2} fg={C.ink5}>{d.type}</Tag>}
    </a>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 185, display: 'grid', placeItems: isMobile ? 'stretch' : 'center', padding: isMobile ? 0 : 22 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,16,20,.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', background: C.bg,
        borderRadius: isMobile ? 0 : 18,
        width: '100%', maxWidth: isMobile ? '100%' : 760,
        height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,.5)',
      }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '18px 16px 14px' : '22px 26px 16px', borderBottom: `1px solid ${C.cr2}`, flexShrink: 0 }}>
          <button onClick={onClose} title="Back to contact" style={{ position: 'absolute', top: 14, right: 18, background: 'none', border: 'none', fontSize: 26, color: C.ink3, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Company</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 22 : 28, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1.05 }}>
            {co?.name || companyName || 'Company'}
          </h2>
          {co && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              {co.entityCode && <Tag bg={C.accS} fg={C.accD}>{co.entityCode}</Tag>}
              {co.type && <Tag bg="transparent" fg={C.ink5}>{co.type}</Tag>}
              {co.status && <Tag bg={C.cr2} fg={C.ink5}>{co.status}</Tag>}
              {co.stage && <Tag bg="transparent" fg={C.ink5}>Stage: {co.stage}</Tag>}
              {co.health && <Tag bg="transparent" fg={C.ink5}>Health: {co.health}</Tag>}
              {co.website && <a href={co.website} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: C.acc, textDecoration: 'none' }}>{hostLabel(co.website)} ↗</a>}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '18px 26px 30px' }}>
          {error && <div style={{ padding: 14, borderRadius: 10, background: C.redS, color: C.red, fontFamily: SANS, fontSize: 13 }}>Couldn't load company: {error}</div>}

          {!data && !error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.ink5, fontSize: 13, padding: '40px 0' }}>
              <Spinner size={18} /> Loading company…
            </div>
          )}

          {data && (
            <div>
              {/* Notes */}
              <Section title="Notes & summary">
                {(co.notes?.summary || co.notes?.callsNotes || co.notes?.waitingOn) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {co.notes.summary && <NoteBlock label="Summary" body={co.notes.summary} />}
                    {co.notes.callsNotes && <NoteBlock label="Calls / Notes" body={co.notes.callsNotes} />}
                    {co.notes.waitingOn && <NoteBlock label="Waiting on" body={co.notes.waitingOn} />}
                  </div>
                ) : <Empty>No notes recorded for this company yet.</Empty>}

                {(data.activities || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>Recent activity</div>
                    {data.activities.slice(0, 6).map(a => (
                      <div key={a.id} style={{ padding: '8px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`, borderRadius: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.ink9 }}>{a.title || a.type || 'Activity'}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, whiteSpace: 'nowrap' }}>{a.type ? a.type + ' · ' : ''}{fmtR(a.date)}</span>
                        </div>
                        {(a.aiSummary || a.body) && <div style={{ fontSize: 12, color: C.ink7, marginTop: 4, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{a.aiSummary || a.body}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Documents */}
              <Section title="Documents" count={(data.documents || []).length}>
                {(data.documents || []).length === 0 ? <Empty>No documents linked to this company.</Empty> : (
                  <div>
                    {folderGroups.map(({ folder, docs }) => (
                      <div key={folder.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13 }}>📁</span>
                          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.ink8 }}>{folder.name}</span>
                          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{docs.length}</span>
                        </div>
                        <div style={{ paddingLeft: 8 }}>{docs.map(d => <DocLink key={d.id} d={d} />)}</div>
                      </div>
                    ))}
                    {unfiledDocs.length > 0 && (
                      <div>
                        {folderGroups.length > 0 && <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, margin: '4px 0 6px' }}>Unfiled</div>}
                        {unfiledDocs.map(d => <DocLink key={d.id} d={d} />)}
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Open tasks */}
              <Section title="Open tasks" count={(data.openTasks || []).length}>
                {(data.openTasks || []).length === 0 ? <Empty>No open tasks for this company.</Empty> : (
                  <div>
                    {data.openTasks.map(t => {
                      const overdue = isOverdue(t.dueDate);
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: C.bg2, border: `1px solid ${overdue ? C.red : C.cr2}`, borderRadius: 8, marginBottom: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[t.priority] || C.ink3, marginTop: 5, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: C.ink9 }}>{t.task}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              {t.taskType && <Tag bg="transparent" fg={t.taskType === 'Reminder' ? C.yel : C.ink5}>{t.taskType}</Tag>}
                              {t.dueDate && <Tag bg="transparent" fg={overdue ? C.red : C.ink5}>{fmtR(t.dueDate)}{overdue ? ' ⚑' : ''}</Tag>}
                              {t.priority && <Tag bg="transparent" fg={PRIORITY_COLORS[t.priority] || C.ink5}>{t.priority}</Tag>}
                              {(t.contactNames || []).map(n => <Tag key={n} bg="transparent" fg={C.ink3}>{n}</Tag>)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* People + Opportunities side by side on desktop */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
                <Section title="People" count={(data.people || []).length}>
                  {(data.people || []).length === 0 ? <Empty>No people linked.</Empty> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.people.map(p => (
                        <div key={p.id} style={{ padding: '8px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
                          <div style={{ fontFamily: SERIF, fontSize: 13, color: C.ink9 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: C.ink5 }}>{[p.role, p.email].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Opportunities" count={(data.opportunities || []).length}>
                  {(data.opportunities || []).length === 0 ? <Empty>No opportunities.</Empty> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.opportunities.map(o => (
                        <div key={o.id} style={{ padding: '8px 10px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
                          <div style={{ fontFamily: SERIF, fontSize: 13, color: C.ink9 }}>{o.name}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                            {o.stage && <Tag bg="transparent" fg={C.ink5}>{o.stage}</Tag>}
                            {money(o.dealValue) && <Tag bg="transparent" fg={C.ink5}>{money(o.dealValue)}</Tag>}
                            {o.closeDate && <Tag bg="transparent" fg={C.ink5}>{fmtR(o.closeDate)}</Tag>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteBlock({ label, body }) {
  return (
    <div style={{ padding: '10px 12px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink7, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{body}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>{children}</div>;
}
