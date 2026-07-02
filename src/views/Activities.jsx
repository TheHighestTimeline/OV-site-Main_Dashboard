import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, Sel, FR, Spinner } from '../components/UI.jsx';
import { getActivities, createActivity, getCompanies, getContacts } from '../api.js';

// Matches the Entity Code single-select choices created on the Companies
// table in Airtable (see CRM build plan, Section 4 / July 2026 schema pass).
const ENTITY_CODE_BY_SLUG = {
  ovmg: 'OVMG', ovm: 'OVM', ovtv: 'OVTV', ovf: 'OVF',
  amplify: 'Amplify', carbonsponge: 'Carbon Sponge', ovd: 'OVD', ovv: 'OVV',
};

const TYPES   = ['Note', 'Call', 'Email', 'Meeting', 'Voice Note', 'Transcript'];
const TYPE_ICON = { Note: '✎', Call: '☎', Email: '✉', Meeting: '⚇', 'Voice Note': '◉', Transcript: '▤' };

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

export default function Activities({ user, showToast, companyFilter = null }) {
  const [companies,   setCompanies]   = useState([]);
  const [contacts,    setContacts]    = useState([]);
  const [activities,  setActivities]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);

  // New-activity form state
  const [fTitle,   setFTitle]   = useState('');
  const [fType,    setFType]    = useState('Note');
  const [fContact, setFContact] = useState('');
  const [fDate,    setFDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [fBody,    setFBody]    = useState('');

  const company = useMemo(() => {
    const code = ENTITY_CODE_BY_SLUG[companyFilter];
    return companies.find(c => c.entityCode === code) || null;
  }, [companies, companyFilter]);

  const contactName = useCallback(
    id => contacts.find(c => c.id === id)?.name || '(unknown contact)',
    [contacts]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [comps, cts] = await Promise.all([getCompanies(), getContacts()]);
      setCompanies(comps);
      setContacts(cts);

      const code = ENTITY_CODE_BY_SLUG[companyFilter];
      const match = comps.find(c => c.entityCode === code);
      if (match) {
        const acts = await getActivities(match.id);
        setActivities(acts);
      } else {
        setActivities([]);
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!fTitle.trim()) { showToast('Title is required'); return; }
    if (!fContact)      { showToast('Pick a contact'); return; }
    if (!company)       { showToast('No matching Company record found in Airtable for this entity — check Entity Code on the Companies table'); return; }

    setSaving(true);
    try {
      await createActivity({
        title: fTitle.trim(),
        type: fType,
        source: 'Manual',
        date: fDate,
        bodyText: fBody.trim(),
        contactIds: [fContact],
        companyIds: [company.id],
      });
      showToast('Activity logged ✓');
      setFTitle(''); setFBody(''); setFContact(''); setFType('Note');
      setShowForm(false);
      await load();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Eyebrow>Activity timeline</Eyebrow>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={() => setShowForm(s => !s)}>{showForm ? 'Cancel' : '+ Log activity'}</Btn>
        </div>
      </div>

      {loadError && (
        <div style={{ padding: 12, borderRadius: 8, background: C.redS, color: C.red, fontFamily: SANS, fontSize: 13 }}>
          Could not load: {loadError}
        </div>
      )}

      {!loadError && !company && (
        <div style={{ padding: 14, borderRadius: 10, background: C.yelS, color: C.yel, fontFamily: SANS, fontSize: 13 }}>
          No Companies record found for this entity yet — activities can't be linked until one exists with the matching Entity Code.
        </div>
      )}

      {showForm && (
        <div style={{ border: `1px solid ${C.cr3}`, borderRadius: 12, padding: 16, background: C.bg2, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FR label="Title">
            <Inp value={fTitle} onChange={setFTitle} placeholder="e.g. Call with Carsten re: term sheet" />
          </FR>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <FR label="Type">
                <Sel value={fType} onChange={setFType}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </FR>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <FR label="Date">
                <Inp type="date" value={fDate} onChange={setFDate} />
              </FR>
            </div>
          </div>
          <FR label="Contact">
            <Sel value={fContact} onChange={setFContact}>
              <option value="">Select a contact…</option>
              {contacts
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel>
          </FR>
          <FR label="Notes">
            <textarea
              value={fBody}
              onChange={e => setFBody(e.target.value)}
              placeholder="What happened / what was discussed…"
              rows={4}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${C.cr3}`, fontFamily: SANS, fontSize: 13,
                color: C.ink9, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </FR>
          <div>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save activity'}</Btn>
          </div>
        </div>
      )}

      {activities.length === 0 ? (
        <div style={{
          border: `1px solid ${C.cr3}`, borderRadius: 14, padding: 40,
          textAlign: 'center', color: C.ink3, fontFamily: SANS, fontSize: 14,
        }}>
          No activities logged for this company yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.map(a => (
            <div key={a.id} style={{
              border: `1px solid ${C.cr3}`, borderRadius: 10, padding: 14,
              display: 'flex', flexDirection: 'column', gap: 6, background: C.bg,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, opacity: 0.8 }}>{TYPE_ICON[a.type] || '•'}</span>
                <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: C.ink9 }}>{a.title}</span>
                <Tag bg={C.cr2} fg={C.ink5}>{a.type || 'Note'}</Tag>
                <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: C.ink3 }}>{fmtDate(a.date)}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.ink3 }}>
                {(a.contactIds || []).map(contactName).join(', ') || 'No contact linked'}
              </div>
              {a.body && (
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {a.body}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
