import { useState, useEffect, useRef } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Eyebrow, Btn, Tag, Inp, Sel, FR } from '../components/UI.jsx';
import useIsMobile, { useDevice } from '../hooks/useIsMobile.js';
import {
  getOutreach, createOutreach, updateOutreach, deleteOutreach, getOutreachNotes, addOutreachNote,
  getTeamMembers, getAirtableSchema, airtableRecordUrl,
} from '../api.js';

// Default pipeline stages (includes "Additional Outreach" for phone-only leads)
const DEFAULT_STAGES = [
  'No Status', 'Assigned', 'Contacted',
  'Founder Outreach', 'Negotiations', 'Won', 'Lost', 'Archived',
  'Additional Outreach',
];

// Persist custom stage order/names in localStorage
const LANES_KEY = 'ovmg.outreach.lanes';
function loadLanes() {
  try {
    const stored = JSON.parse(localStorage.getItem(LANES_KEY));
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {}
  return DEFAULT_STAGES;
}
function saveLanes(lanes) {
  try { localStorage.setItem(LANES_KEY, JSON.stringify(lanes)); } catch {}
}

const STAGE_STYLE = {
  'No Status':          { hBg: C.ink7,     hFg: C.ink2,  border: C.ink5    },
  'Assigned':           { hBg: C.blu,      hFg: '#fff',  border: C.blu     },
  'Contacted':          { hBg: C.yel,      hFg: '#fff',  border: C.yel     },
  'Founder Outreach':   { hBg: C.acc,      hFg: '#fff',  border: C.acc     },
  'Negotiations':       { hBg: '#7a4f99',  hFg: '#fff',  border: '#7a4f99' },
  'Won':                { hBg: C.grn,      hFg: '#fff',  border: C.grn     },
  'Lost':               { hBg: C.red,      hFg: '#fff',  border: C.red     },
  'Archived':           { hBg: C.ink5,     hFg: C.ink2,  border: C.ink5    },
  'Additional Outreach':{ hBg: '#5a7a4f',  hFg: '#fff',  border: '#5a7a4f' },
};
// Fallback style for custom lanes not in STAGE_STYLE
function getStageStyle(stage) {
  return STAGE_STYLE[stage] || { hBg: C.ink5, hFg: C.ink2, border: C.ink5 };
}

const QUALITY_STYLE = {
  'Ultra Qualified': { bg: C.grnS, fg: C.grn },
  'Qualified':       { bg: C.bluS, fg: C.blu },
};

const QUALITY_OPTIONS = ['', 'Ultra Qualified', 'Qualified', 'Unqualified'];
const PRIORITY_OPTIONS = ['', 'High', 'Medium', 'Low'];
const SOURCE_OPTIONS   = ['', 'Cold Outreach', 'Referral', 'Inbound', 'Event', 'Other'];

// Helpers
function getMyName(user) {
  return user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me';
}

function isMyLead(lead, user) {
  if (!lead.assignedTo) return false;
  const a       = lead.assignedTo.toLowerCase().trim();
  const myName  = getMyName(user).toLowerCase();
  const myEmail = (user.email || '').toLowerCase();
  return a === myName || a === myEmail || a.includes(myName.split(' ')[0]);
}

// New Lead drawer
function NewLeadDrawer({ user, teamNames, stages, onSave, onClose, showToast }) {
  const myName = getMyName(user);
  const [form, setForm] = useState({
    name: '', contactName: '', businessType: '', cityState: '',
    email: '', phone: '', website: '', instagram: '', linkedin: '',
    source: '', leadQuality: '', priority: '',
    status: 'No Status', assignedTo: myName,
    recOffer: '', nextAction: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name.trim()) {
      showToast('Lead / Business Name is required');
      return;
    }
    setSaving(true);
    try {
      const status = (form.assignedTo && form.status === 'No Status') ? 'Assigned' : form.status;
      await createOutreach({ ...form, status });
      showToast('Lead added');
      onSave();
      onClose();
    } catch (e) {
      showToast('Failed to add lead: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: C.accS, border: `1px solid ${C.acc}`,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: '.06em' }}>
          NEW OUTREACH LEAD
        </div>
        <div style={{ fontSize: 12, color: C.ink5, marginTop: 3 }}>
          Add a new business to the pipeline. Only the name is required - you can fill the rest later.
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10,
      }}>
        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Lead / Business Name *">
            <Inp value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Springfield Heating & Air" />
          </FR>
        </div>

        <FR label="Contact Name">
          <Inp value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Owner / decision maker" />
        </FR>
        <FR label="Business Type">
          <Inp value={form.businessType} onChange={e => set('businessType', e.target.value)} placeholder="HVAC, salon, etc." />
        </FR>

        <FR label="City / State">
          <Inp value={form.cityState} onChange={e => set('cityState', e.target.value)} placeholder="Austin, TX" />
        </FR>
        <FR label="Phone">
          <Inp value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 123 4567" />
        </FR>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Email">
            <Inp value={form.email} onChange={e => set('email', e.target.value)} placeholder="owner@business.com" type="email" />
          </FR>
        </div>

        <FR label="Website">
          <Inp value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://..." />
        </FR>
        <FR label="Instagram">
          <Inp value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="https://instagram.com/..." />
        </FR>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="LinkedIn">
            <Inp value={form.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="https://linkedin.com/in/..." />
          </FR>
        </div>

        <FR label="Source">
          <Sel value={form.source} onChange={e => set('source', e.target.value)}>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s || '-- Select --'}</option>)}
          </Sel>
        </FR>
        <FR label="Lead Quality">
          <Sel value={form.leadQuality} onChange={e => set('leadQuality', e.target.value)}>
            {QUALITY_OPTIONS.map(s => <option key={s} value={s}>{s || '-- Select --'}</option>)}
          </Sel>
        </FR>

        <FR label="Priority">
          <Sel value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITY_OPTIONS.map(s => <option key={s} value={s}>{s || '-- Select --'}</option>)}
          </Sel>
        </FR>
        <FR label="Stage">
          <Sel value={form.status} onChange={e => set('status', e.target.value)}>
            {(stages || DEFAULT_STAGES).map(s => <option key={s}>{s}</option>)}
          </Sel>
        </FR>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Assigned To">
            <input
              list="ovmg-team-datalist-new"
              value={form.assignedTo}
              onChange={e => set('assignedTo', e.target.value)}
              placeholder="Select or type name..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px', border: `1px solid ${C.cr3}`, borderRadius: 6,
                fontFamily: SANS, fontSize: 13, color: C.ink9,
                background: C.bg, outline: 'none',
              }}
            />
            <datalist id="ovmg-team-datalist-new">
              {teamNames.map(n => <option key={n} value={n} />)}
            </datalist>
            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
              {form.assignedTo !== myName && (
                <button onClick={() => set('assignedTo', myName)}
                  style={{ fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: 0 }}>
                  Assign to me
                </button>
              )}
              {form.assignedTo && (
                <button onClick={() => set('assignedTo', '')}
                  style={{ fontSize: 11, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: 0 }}>
                  Leave unclaimed
                </button>
              )}
            </div>
          </FR>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Recommended Offer">
            <Inp value={form.recOffer} onChange={e => set('recOffer', e.target.value)} placeholder="What package / service should we pitch?" />
          </FR>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Next Action">
            <Inp value={form.nextAction} onChange={e => set('nextAction', e.target.value)} placeholder="What's the next step?" />
          </FR>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Initial Notes">
            <textarea
              value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              placeholder="Context, intro details, where you found them..."
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                border: `1px solid ${C.cr3}`, borderRadius: 6,
                background: C.bg, color: C.ink9, fontFamily: SANS,
                fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
              }}
            />
          </FR>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn v="gho" onClick={onClose}>Cancel</Btn>
        <Btn onClick={create} disabled={saving}>{saving ? 'Adding...' : '+ Add Lead'}</Btn>
      </div>
    </div>
  );
}

// Notes timeline (newest first)
function NotesTimeline({ leadId, showToast }) {
  const [notes, setNotes]   = useState(null);
  const [draft, setDraft]   = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const data = await getOutreachNotes(leadId);
      setNotes(data);
    } catch (e) {
      setNotes([]);
    }
  };

  useEffect(() => { load(); }, [leadId]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setAdding(true);
    try {
      await addOutreachNote(leadId, body);
      setDraft('');
      await load();
    } catch (e) {
      showToast('Failed to add note: ' + e.message);
    }
    setAdding(false);
  };

  const onKey = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Log an outreach update, call note, or context... (Cmd/Ctrl+Enter to save)"
          style={{
            flex: 1, boxSizing: 'border-box', padding: '8px 10px',
            border: `1px solid ${C.cr3}`, borderRadius: 6,
            background: C.bg, color: C.ink9, fontFamily: SANS,
            fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
          }}
        />
        <Btn onClick={add} disabled={adding || !draft.trim()}>
          {adding ? 'Adding...' : '+ Note'}
        </Btn>
      </div>

      {notes === null ? (
        <div style={{ fontSize: 12, color: C.ink3, fontFamily: MONO, padding: '8px 0' }}>Loading notes...</div>
      ) : notes.length === 0 ? (
        <div style={{
          fontSize: 12, color: C.ink3, fontFamily: MONO,
          padding: '12px', textAlign: 'center',
          background: C.bg, border: `1px dashed ${C.cr3}`, borderRadius: 6,
        }}>
          No notes yet - add the first one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {notes.map(n => (
            <div key={n.id} style={{
              display: 'flex', gap: 10, padding: '8px 10px',
              background: C.bg, border: `1px solid ${C.cr2}`, borderRadius: 6,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1.3 }}>{n.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {n.timestamp && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                    {n.timestamp}
                  </div>
                )}
                <div style={{ fontSize: 13, color: C.ink8, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {n.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lead detail drawer
function LeadDrawer({ lead, user, teamNames, stages, onSave, onClose, onDelete, showToast, tableId }) {
  const [status,     setStatus]     = useState(lead.status     || 'No Status');
  const [assignedTo, setAssignedTo] = useState(lead.assignedTo || '');
  const [nextAction, setNextAction] = useState(lead.nextAction || '');
  const [emailSent,  setEmailSent]  = useState(lead.emailSent  || false);
  const [dmSent,     setDmSent]     = useState(lead.dmSent     || false);
  const [saving,     setSaving]     = useState(false);

  const myName     = getMyName(user);
  const isAssigned = !!lead.assignedTo;
  const isMine     = isMyLead(lead, user);
  const assignLocked = isAssigned && !isMine && !user.isAdmin;

  const save = async () => {
    setSaving(true);
    try {
      await updateOutreach(lead.id, { status, assignedTo, nextAction, emailSent, dmSent });
      showToast('Lead updated');
      onSave();
      onClose();
    } catch (e) {
      showToast('Failed to save: ' + e.message);
    }
    setSaving(false);
  };

  const claim = async () => {
    setSaving(true);
    try {
      const newStatus = (lead.status === 'No Status' || !lead.status) ? 'Assigned' : lead.status;
      await updateOutreach(lead.id, { assignedTo: myName, status: newStatus });
      showToast(`Lead claimed - assigned to ${myName}`);
      onSave();
      onClose();
    } catch (e) {
      showToast('Failed to claim: ' + e.message);
    }
    setSaving(false);
  };

  const LABEL_STYLE = {
    fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
    textTransform: 'uppercase', color: C.ink3, marginBottom: 3,
  };

  const Row = ({ label, value }) => value ? (
    <div>
      <div style={LABEL_STYLE}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink8, wordBreak: 'break-all' }}>{value}</div>
    </div>
  ) : null;

  const LinkRow = ({ label, href }) => href ? (
    <a href={href.startsWith('http') ? href : 'https://' + href}
      target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.acc, fontFamily: MONO, textDecoration: 'none' }}>
      {label}
    </a>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {!isAssigned && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: C.accS, border: `1px solid ${C.acc}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: '.06em' }}>
              UNCLAIMED LEAD
            </div>
            <div style={{ fontSize: 12, color: C.ink5, marginTop: 3 }}>
              Nobody owns this yet - claim it to add it to your pipeline.
            </div>
          </div>
          <Btn onClick={claim} disabled={saving}>
            {saving ? 'Claiming...' : 'Claim for me'}
          </Btn>
        </div>
      )}

      {assignLocked && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: C.yelS, border: `1px solid ${C.yel}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>!</span>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.yel, letterSpacing: '.06em' }}>
              ASSIGNED TO {(lead.assignedTo || '').toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: C.ink5, marginTop: 3 }}>
              This lead belongs to someone else. You can update the stage and log notes, but the assignment is locked.
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Row label="Contact Name"  value={lead.contactName}  />
          <Row label="Business Type" value={lead.businessType} />
          <Row label="City / State"  value={lead.cityState}    />
          <Row label="Email"         value={lead.email}        />
          <Row label="Phone"         value={lead.phone}        />
          <Row label="Source"        value={lead.source}       />
          <Row label="Lead Quality"  value={lead.leadQuality}  />
          <Row label="Priority"      value={lead.priority}     />
          <Row label="Offer"         value={lead.recOffer}     />
          <Row label="Added"         value={fmtR(lead.createdTime)} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <LinkRow label="Website"   href={lead.website}      />
          <LinkRow label="Instagram" href={lead.instagram}    />
          <LinkRow label="LinkedIn"  href={lead.linkedin}     />
          <LinkRow label="Airtable"  href={lead.airtableLink} />
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10,
      }}>
        <FR label="Stage">
          <Sel value={status} onChange={e => setStatus(e.target.value)}>
            {(stages || DEFAULT_STAGES).map(s => <option key={s}>{s}</option>)}
          </Sel>
        </FR>

        <FR label="Assigned To">
          {assignLocked ? (
            <div style={{
              padding: '9px 12px', border: `1px solid ${C.cr3}`, borderRadius: 6,
              background: C.bg, color: C.ink5, fontSize: 13, fontFamily: SANS,
              opacity: 0.65, userSelect: 'none',
            }}>
              {lead.assignedTo}
            </div>
          ) : (
            <div>
              <input
                list="ovmg-team-datalist"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="Select or type name..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 12px', border: `1px solid ${C.cr3}`, borderRadius: 6,
                  fontFamily: SANS, fontSize: 13, color: C.ink9,
                  background: C.bg, outline: 'none', transition: 'border-color .15s',
                }}
                onFocus={e => { e.target.style.borderColor = C.acc; }}
                onBlur={e => { e.target.style.borderColor = C.cr3; }}
              />
              <datalist id="ovmg-team-datalist">
                {teamNames.map(n => <option key={n} value={n} />)}
              </datalist>
              <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                {assignedTo !== myName && (
                  <button onClick={() => setAssignedTo(myName)}
                    style={{ fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: 0 }}>
                    Assign to me
                  </button>
                )}
                {assignedTo && (
                  <button onClick={() => setAssignedTo('')}
                    style={{ fontSize: 11, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: 0 }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </FR>

        <div style={{ gridColumn: '1/-1' }}>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['Email Sent', emailSent, setEmailSent], ['Instagram DM Sent', dmSent, setDmSent]].map(([label, val, set]) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: C.ink7, userSelect: 'none' }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                  style={{ accentColor: C.acc, width: 15, height: 15, cursor: 'pointer' }} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <FR label="Next Action">
            <Inp value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="What's the next step?" />
          </FR>
        </div>
      </div>

      <div style={{ padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: 10 }}>Activity Notes</div>
        <NotesTimeline leadId={lead.id} showToast={showToast} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {onDelete && <Btn v="dan" onClick={() => onDelete(lead)} disabled={saving}>Delete</Btn>}
          <a href={airtableRecordUrl(tableId, lead.id)} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ⊞ Airtable ↗
          </a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="gho" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Btn>
        </div>
      </div>
    </div>
  );
}

// Lead card
function LeadCard({ lead, user, onClick, onDragStart }) {
  const qs      = lead.leadQuality ? QUALITY_STYLE[lead.leadQuality] : null;
  const isMine  = isMyLead(lead, user);
  const unowned = !lead.assignedTo;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: C.cr1,
        border: `1px solid ${unowned ? C.acc : C.cr2}`,
        borderRadius: 8, padding: '10px 12px',
        cursor: 'grab', userSelect: 'none',
        boxShadow: unowned ? `0 0 0 2px ${C.acc}18` : '0 1px 3px rgba(0,0,0,.04)',
        transition: 'box-shadow .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = unowned
          ? `0 0 0 2px ${C.acc}18`
          : '0 1px 3px rgba(0,0,0,.04)';
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9, lineHeight: 1.3, marginBottom: 2 }}>
        {lead.name}
      </div>

      {(lead.contactName || lead.cityState) && (
        <div style={{ fontSize: 11, color: C.ink3, marginBottom: 5 }}>
          {[lead.contactName, lead.cityState].filter(Boolean).join(' - ')}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5, alignItems: 'center' }}>
        {qs && <Tag bg={qs.bg} fg={qs.fg}>{lead.leadQuality}</Tag>}
        {lead.emailSent && <Tag bg={C.bluS} fg={C.blu}>EMAIL</Tag>}
        {lead.dmSent    && <Tag bg={C.accS} fg={C.acc}>DM</Tag>}

        <span style={{ marginLeft: 'auto' }}>
          {unowned ? (
            <Tag bg={C.accS} fg={C.acc}>Unclaimed</Tag>
          ) : isMine ? (
            <Tag bg={C.grnS} fg={C.grn}>Mine</Tag>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>
              {lead.assignedTo.split(' ')[0]}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// Lane management modal
function LaneManager({ lanes, onClose, onSave }) {
  const [editing, setEditing] = useState(lanes.slice());
  const [confirmDelete, setConfirmDelete] = useState(null); // index to delete
  const [renameIdx, setRenameIdx]         = useState(null);
  const [renameVal, setRenameVal]         = useState('');
  const [newName, setNewName]             = useState('');

  const move = (from, to) => {
    if (to < 0 || to >= editing.length) return;
    const next = editing.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setEditing(next);
  };

  const startRename = (i) => { setRenameIdx(i); setRenameVal(editing[i]); };
  const commitRename = () => {
    const v = renameVal.trim();
    if (!v || (editing.includes(v) && editing[renameIdx] !== v)) return;
    const next = editing.slice();
    next[renameIdx] = v;
    setEditing(next);
    setRenameIdx(null);
    setRenameVal('');
  };

  const addLane = () => {
    const v = newName.trim();
    if (!v || editing.includes(v)) return;
    setEditing(prev => [...prev, v]);
    setNewName('');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(14,16,20,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: C.bg, borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: C.ink9 }}>
          Manage Swim Lanes
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {editing.map((lane, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: C.bg2, borderRadius: 7,
              border: `1px solid ${C.cr3}`,
            }}>
              {renameIdx === i ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameIdx(null); } }}
                  style={{
                    flex: 1, padding: '4px 8px', border: `1px solid ${C.acc}`, borderRadius: 5,
                    fontFamily: SANS, fontSize: 13, color: C.ink9, background: C.bg, outline: 'none',
                  }}
                />
              ) : (
                <span style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: C.ink8 }}>{lane}</span>
              )}

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {renameIdx === i ? (
                  <>
                    <button onClick={commitRename} style={{ fontSize: 11, color: C.grn, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: '2px 6px' }}>Save</button>
                    <button onClick={() => setRenameIdx(null)} style={{ fontSize: 11, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, padding: '2px 6px' }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startRename(i)} title="Rename"
                      style={{ fontSize: 12, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>✎</button>
                    <button onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up"
                      style={{ fontSize: 12, color: C.ink5, background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: '2px 5px' }}>↑</button>
                    <button onClick={() => move(i, i + 1)} disabled={i === editing.length - 1} title="Move down"
                      style={{ fontSize: 12, color: C.ink5, background: 'none', border: 'none', cursor: i === editing.length - 1 ? 'default' : 'pointer', opacity: i === editing.length - 1 ? 0.3 : 1, padding: '2px 5px' }}>↓</button>
                    <button onClick={() => setConfirmDelete(i)} title="Delete lane"
                      style={{ fontSize: 12, color: C.red, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>×</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add lane */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addLane(); }}
            placeholder="New lane name…"
            style={{
              flex: 1, padding: '8px 10px', border: `1px solid ${C.cr3}`, borderRadius: 7,
              fontFamily: SANS, fontSize: 13, color: C.ink9, background: C.bg, outline: 'none',
            }}
          />
          <Btn v="gho" onClick={addLane} disabled={!newName.trim() || editing.includes(newName.trim())}>
            + Add
          </Btn>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn v="gho" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { saveLanes(editing); onSave(editing); onClose(); }}>Save Lanes</Btn>
        </div>
      </div>

      {/* Delete confirmation sub-modal */}
      {confirmDelete !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(14,16,20,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
        }}>
          <div style={{
            background: C.bg, borderRadius: 12, padding: 24, maxWidth: 340, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,.22)',
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9, marginBottom: 8 }}>
              Delete lane "{editing[confirmDelete]}"?
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink5, marginBottom: 20, lineHeight: 1.5 }}>
              Cards in this lane will still exist in the database but will no longer appear in this lane. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn v="gho" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn v="dan" onClick={() => {
                const next = editing.filter((_, j) => j !== confirmDelete);
                setEditing(next);
                setConfirmDelete(null);
              }}>Delete Lane</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Kanban column
function StageColumn({ stage, leads, user, dragOverStage, onCardClick, onDragStart, onDragOver, onDrop, onDragLeave, isTablet }) {
  const st     = getStageStyle(stage);
  const isOver = dragOverStage === stage;

  return (
    <div style={{ flex: isTablet ? '0 0 168px' : '0 0 220px', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '9px 12px', borderRadius: '8px 8px 0 0', background: st.hBg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: st.hFg }}>
          {stage}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, background: 'rgba(255,255,255,.18)', color: st.hFg, padding: '1px 7px', borderRadius: 99 }}>
          {leads.length}
        </span>
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
        {leads.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: MONO, opacity: isOver ? .3 : .6 }}>
            Drop here
          </div>
        ) : leads.map(l => (
          <LeadCard
            key={l.id}
            lead={l}
            user={user}
            onClick={() => onCardClick(l)}
            onDragStart={e => onDragStart(e, l)}
          />
        ))}
      </div>
    </div>
  );
}

// Filter pill
function FilterPill({ label, active, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? (accent || C.ink9) : C.bg,
        color:      active ? '#fff' : C.ink5,
        border:     `1px solid ${active ? (accent || C.ink9) : C.cr3}`,
        borderRadius: 999, padding: '4px 11px', fontSize: 11,
        cursor: 'pointer', fontFamily: SANS, transition: 'all .12s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}


// Mobile board — one stage at a time selected from a tab strip
function MobileBoard({ stages, byStage, user, onCardClick }) {
  // Pick the first stage that has leads as initial, else No Status
  const firstWithLeads = stages.find(s => (byStage[s] || []).length > 0) || stages[0];
  const [activeStage, setActiveStage] = useState(firstWithLeads);
  const leads = byStage[activeStage] || [];
  const st = getStageStyle(activeStage);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* Horizontal stage tab strip */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8,
        marginBottom: 10, scrollbarWidth: 'thin',
      }}>
        {stages.map(s => {
          const active = s === activeStage;
          const cnt = (byStage[s] || []).length;
          const sty = getStageStyle(s);
          return (
            <button
              key={s}
              onClick={() => setActiveStage(s)}
              style={{
                flex: '0 0 auto',
                background: active ? sty.hBg : C.bg,
                color: active ? sty.hFg : C.ink5,
                border: `1px solid ${active ? sty.border : C.cr3}`,
                borderRadius: 999, padding: '6px 12px',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                letterSpacing: '.06em', textTransform: 'uppercase',
                cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {s}
              <span style={{
                background: active ? 'rgba(255,255,255,.22)' : C.cr2,
                color: active ? sty.hFg : C.ink3,
                fontSize: 10, padding: '1px 6px', borderRadius: 99,
              }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Active stage card list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {leads.length === 0 ? (
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            color: C.ink3, fontFamily: MONO, fontSize: 11,
            background: C.bg2, border: `1px dashed ${C.cr3}`, borderRadius: 10,
          }}>
            No leads in {activeStage}
          </div>
        ) : leads.map(l => (
          <LeadCard
            key={l.id}
            lead={l}
            user={user}
            onClick={() => onCardClick(l)}
            onDragStart={() => {}}
          />
        ))}
      </div>
    </div>
  );
}

// Main view
export default function Outreach({ user, showToast, openOv, closeOv }) {
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  const [leads,         setLeads]         = useState([]);
  const [teamNames,     setTeamNames]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [tfAssign,      setTfAssign]      = useState('All');
  const [showMineOnly,  setShowMineOnly]  = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [lanes,         setLanes]         = useState(() => loadLanes());
  const [showLaneMgr,   setShowLaneMgr]   = useState(false);
  const [outreachTableId, setOutreachTableId] = useState(null);
  const dragLead = useRef(null);

  const myName = getMyName(user);

  // Fetch Airtable table ID once so we can deep-link to records
  useEffect(() => {
    getAirtableSchema().then(({ tables }) => {
      const t = tables.find(t => t.name === 'Outreach' || t.name === 'CRM Outreach');
      if (t) setOutreachTableId(t.id);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [data, team] = await Promise.allSettled([getOutreach(), getTeamMembers()]);
      // outreach-list returns { leads, databaseId }; tolerate the legacy array too.
      const payload = data.status === 'fulfilled' ? data.value : [];
      const leads = Array.isArray(payload) ? payload : (payload?.leads || []);
      setLeads(leads);

      if (team.status === 'fulfilled') {
        const apiNames = team.value.map(m => m.fullName).filter(Boolean);
        const leadNames = leads.map(l => l.assignedTo).filter(Boolean);
        const merged    = Array.from(new Set([...apiNames, ...leadNames])).sort();
        setTeamNames(merged);
      } else {
        const names = Array.from(new Set(leads.map(l => l.assignedTo).filter(Boolean))).sort();
        setTeamNames(names);
      }

      if (data.status === 'rejected') showToast('Could not load leads: ' + data.reason?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = leads.filter(l => {
    if (showMineOnly && !isMyLead(l, user))                                 return false;
    if (tfAssign === 'mine')            { if (!isMyLead(l, user))           return false; }
    else if (tfAssign === 'unassigned') { if (l.assignedTo)                 return false; }
    else if (tfAssign !== 'All')        { if (l.assignedTo !== tfAssign)    return false; }

    if (search) {
      const hay = [l.name, l.contactName, l.email, l.assignedTo, l.cityState, l.businessType]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const byStage = Object.fromEntries(lanes.map(s => [s, []]));
  filtered.forEach(l => {
    const s = l.status || 'No Status';
    if (byStage[s] !== undefined) byStage[s].push(l);
    else if (byStage['No Status'] !== undefined) byStage['No Status'].push(l);
  });

  const activeCount     = leads.filter(l => !['Won', 'Lost', 'Archived'].includes(l.status)).length;
  const wonCount        = leads.filter(l => l.status === 'Won').length;
  const unassignedCount = leads.filter(l => !l.assignedTo).length;
  const mineCount       = leads.filter(l => isMyLead(l, user)).length;
  const repNames        = Array.from(new Set(leads.map(l => l.assignedTo).filter(Boolean))).sort();

  // Drag handlers
  const handleDragStart = (e, lead) => {
    dragLead.current = lead;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };
  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const lead = dragLead.current;
    if (!lead || lead.status === targetStage) return;

    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: targetStage } : l));

    try {
      await updateOutreach(lead.id, { status: targetStage === 'No Status' ? null : targetStage });
    } catch {
      showToast('Failed to move lead');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: lead.status } : l));
    }
    dragLead.current = null;
  };
  const handleDragLeave = () => setDragOverStage(null);

  const openLead = lead => {
    openOv({
      kind: 'drawer',
      title: lead.name,
      sub: [lead.businessType, lead.cityState, lead.status].filter(Boolean).join(' - '),
      body: (
        <LeadDrawer
          lead={lead}
          user={user}
          teamNames={teamNames}
          stages={lanes}
          onSave={load}
          onClose={closeOv}
          onDelete={(l) => {
            if (!window.confirm(`Delete lead "${l.name}"? This cannot be undone.`)) return;
            deleteOutreach(l.id)
              .then(() => { setLeads(prev => prev.filter(x => x.id !== l.id)); showToast('Lead deleted'); closeOv(); })
              .catch(e => showToast('Delete failed: ' + e.message));
          }}
          showToast={showToast}
          tableId={outreachTableId}
        />
      ),
    });
  };

  const openNewLead = () => {
    openOv({
      kind: 'drawer',
      title: 'New Outreach Lead',
      sub: 'Add a new business to the pipeline',
      body: (
        <NewLeadDrawer
          user={user}
          teamNames={teamNames}
          stages={lanes}
          onSave={load}
          onClose={closeOv}
          showToast={showToast}
        />
      ),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {showLaneMgr && (
        <LaneManager
          lanes={lanes}
          onClose={() => setShowLaneMgr(false)}
          onSave={(newLanes) => setLanes(newLanes)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div>
          <Eyebrow>Sales</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
            OVM Kanban
          </h1>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink3 }}>
              <span style={{ color: C.ink9, fontWeight: 600 }}>{activeCount}</span> active
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.grn, fontWeight: 600 }}>
              {wonCount} won
            </span>
            {unassignedCount > 0 && (
              <span
                style={{ fontFamily: MONO, fontSize: 11, color: C.acc, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setTfAssign('unassigned')}
                title="Click to filter unclaimed leads"
              >
                {unassignedCount} unclaimed
              </span>
            )}
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink3 }}>{leads.length} total</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
          {/* Show only mine toggle */}
          <button
            onClick={() => setShowMineOnly(v => !v)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontFamily: SANS, fontSize: 12, fontWeight: 500,
              border: `1px solid ${showMineOnly ? C.grn : C.cr3}`,
              background: showMineOnly ? C.grnS : C.bg,
              color: showMineOnly ? C.grn : C.ink5,
              cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {showMineOnly ? '✓ Mine only' : 'Show only mine'}
          </button>
          <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." sx={{ width: isMobile ? '100%' : 200 }} />
          <Btn v="gho" onClick={() => setShowLaneMgr(true)} sx={{ whiteSpace: 'nowrap' }}>⋮ Lanes</Btn>
          <a href={airtableRecordUrl(outreachTableId, null)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              fontFamily: SANS, fontSize: 12, fontWeight: 500, textDecoration: 'none',
              border: `1px solid ${C.cr3}`, color: C.ink5, background: C.bg, whiteSpace: 'nowrap' }}>
            ⊞ Open Airtable ↗
          </a>
          <Btn onClick={openNewLead}>+ New Lead</Btn>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
        padding: '8px 12px', background: C.bg2, border: `1px solid ${C.cr2}`,
        borderRadius: 10, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.1em', marginRight: 2 }}>
          Filter
        </span>

        <FilterPill label="All"        active={tfAssign === 'All'}        onClick={() => setTfAssign('All')} />
        <FilterPill label={`My Leads${mineCount ? ` (${mineCount})` : ''}`}
          active={tfAssign === 'mine'} onClick={() => setTfAssign('mine')} accent={C.grn} />
        <FilterPill label={`Unclaimed${unassignedCount ? ` (${unassignedCount})` : ''}`}
          active={tfAssign === 'unassigned'} onClick={() => setTfAssign('unassigned')} accent={C.acc} />

        {repNames.length > 0 && (
          <span style={{ width: 1, height: 16, background: C.cr3, margin: '0 4px' }} />
        )}

        {repNames.map(name => (
          <FilterPill
            key={name}
            label={name.split(' ')[0]}
            active={tfAssign === name}
            onClick={() => setTfAssign(name)}
          />
        ))}
      </div>

      {!user.hasFullAccess && (
        <div style={{
          padding: '9px 16px', borderRadius: 8, marginBottom: 12,
          background: C.accS, border: `1px solid ${C.cr3}`,
          fontSize: 12, color: C.acc, fontFamily: MONO, letterSpacing: '.04em', flexShrink: 0,
        }}>
          Work your assigned leads and log all activity. Claim unclaimed leads to add them to your pipeline.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading leads...</div>
      ) : isMobile ? (
        <MobileBoard
          stages={lanes}
          byStage={byStage}
          user={user}
          onCardClick={openLead}
        />
      ) : (
        <div style={{ overflowX: 'auto', flex: 1, paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {lanes.map(stage => (
              <StageColumn
                key={stage}
                stage={stage}
                leads={byStage[stage] || []}
                user={user}
                dragOverStage={dragOverStage}
                onCardClick={openLead}
                onDragStart={handleDragStart}
                onDragOver={e => handleDragOver(e, stage)}
                onDrop={e => handleDrop(e, stage)}
                onDragLeave={handleDragLeave}
                isTablet={isTablet}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
