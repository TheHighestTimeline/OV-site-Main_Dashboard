import { useState, useEffect } from 'react';
import { T, SERIF, SANS, MONO, ALL_PLAT, PLAT_LIST, tag, inputStyle, btn, Lbl } from './_shared.jsx';
import { listAds, upsertAd, deleteAd } from '../../api.js';

const AD_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'];

const AD_STATUS_META = {
  draft:   { label: 'Draft',   color: T.ink3 },
  running: { label: 'Running', color: T.grn  },
  paused:  { label: 'Paused',  color: T.amb  },
  ended:   { label: 'Ended',   color: T.ink5 },
};

const BLANK_AD = {
  platform: 'instagram',
  headline: '',
  body_text: '',
  asset_url: '',
  budget: '',
  start_date: '',
  end_date: '',
  status: 'draft',
  metrics: { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
};

function AdForm({ clientId, initial, onSave, onCancel, showToast }) {
  const [form, setForm] = useState(initial || { ...BLANK_AD });
  const fld = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const mfld = k => e => setForm(p => ({ ...p, metrics: { ...(p.metrics || {}), [k]: parseFloat(e.target.value) || 0 } }));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.headline.trim()) { showToast?.('Headline required'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, client_id: clientId, budget: parseFloat(form.budget) || 0 });
    } catch (e) {
      showToast?.('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  return (
    <div style={{ background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: T.ink3, marginBottom: 14 }}>
        {initial?.id ? 'Edit Ad' : 'Create New Ad'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Lbl>Platform</Lbl>
          <select value={form.platform} onChange={fld('platform')} style={{ ...inputStyle }}>
            {AD_PLATFORMS.map(p => <option key={p} value={p}>{ALL_PLAT[p]?.label || p}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Status</Lbl>
          <select value={form.status} onChange={fld('status')} style={{ ...inputStyle }}>
            {Object.entries(AD_STATUS_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Lbl>Headline</Lbl>
          <input value={form.headline} onChange={fld('headline')} placeholder="Ad headline…" style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Lbl>Body text</Lbl>
          <textarea value={form.body_text} onChange={fld('body_text')} rows={3} placeholder="Ad copy…" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Lbl>Image / Video URL</Lbl>
          <input value={form.asset_url} onChange={fld('asset_url')} placeholder="https://… or Drive link" style={inputStyle} />
        </div>
        <div>
          <Lbl>Budget (total $)</Lbl>
          <input type="number" value={form.budget} onChange={fld('budget')} placeholder="500" style={inputStyle} />
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Lbl>Start date</Lbl>
              <input type="date" value={form.start_date} onChange={fld('start_date')} style={inputStyle} />
            </div>
            <div>
              <Lbl>End date</Lbl>
              <input type="date" value={form.end_date} onChange={fld('end_date')} style={inputStyle} />
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>Manual metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['impressions','Impressions'],['clicks','Clicks'],['conversions','Conv.'],['spend','Spend ($)']].map(([k, label]) => (
            <div key={k}>
              <Lbl>{label}</Lbl>
              <input type="number" value={form.metrics?.[k] || 0} onChange={mfld(k)} style={inputStyle} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onCancel} style={btn('ghost')}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...btn('primary'), opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save ad'}
        </button>
      </div>
    </div>
  );
}

export default function AdManager({ client, showToast }) {
  const [ads,     setAds]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAd,   setEditAd]  = useState(null);

  useEffect(() => {
    setLoading(true);
    listAds(client.id)
      .then(d => setAds(Array.isArray(d) ? d : (d.ads || [])))
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  }, [client.id]);

  async function handleSave(data) {
    const saved = await upsertAd(data);
    const updated = data.id
      ? ads.map(a => a.id === data.id ? (saved.ad || data) : a)
      : [...ads, saved.ad || { ...data, id: 'local_' + Date.now() }];
    setAds(updated);
    setShowForm(false);
    setEditAd(null);
    showToast?.('Ad saved ✓');
  }

  async function handleDelete(id) {
    if (!confirm('Delete this ad?')) return;
    await deleteAd(id).catch(() => {});
    setAds(ads.filter(a => a.id !== id));
    showToast?.('Ad deleted');
  }

  function openEdit(ad) {
    setEditAd(ad);
    setShowForm(true);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const statusGroups = Object.keys(AD_STATUS_META);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: T.ink2 }}>
          Manage paid advertising for {client.name}.
        </div>
        <button onClick={() => { setEditAd(null); setShowForm(true); }} style={btn('primary')}>+ Create ad</button>
      </div>

      {/* Form */}
      {showForm && (
        <AdForm
          clientId={client.id}
          initial={editAd}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditAd(null); }}
          showToast={showToast}
        />
      )}

      {/* Meta pixel placeholder */}
      <div style={{ background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: '#4f87f520', display: 'grid', placeItems: 'center', fontSize: 16 }}>◇</div>
          <div>
            <div style={{ fontSize: 13, color: T.fg, fontWeight: 500 }}>Meta Pixel</div>
            <div style={{ fontSize: 11, color: T.ink3, fontFamily: MONO, marginTop: 2 }}>Not configured — add pixel ID to enable conversion tracking</div>
          </div>
          <input placeholder="Meta Pixel ID…" style={{ ...inputStyle, width: 200, marginLeft: 'auto' }} onChange={() => showToast?.('Pixel tracking coming in v2')} />
        </div>
      </div>

      {/* Ad list */}
      {loading
        ? <div style={{ padding: 32, textAlign: 'center', color: T.ink3 }}>Loading ads…</div>
        : ads.length === 0 && !showForm
          ? <div style={{ background: T.ink8, border: `1px dashed ${T.ink7}`, borderRadius: 10, padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
              No ads yet — create your first ad above.
            </div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ads.map(ad => {
                const platMeta = ALL_PLAT[ad.platform] || { label: ad.platform, color: T.acc, icon: '◇' };
                const stMeta   = AD_STATUS_META[ad.status] || { label: ad.status, color: T.ink3 };
                const m        = ad.metrics || {};
                const ctr      = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(1) : '—';
                const cpc      = m.clicks > 0 ? (m.spend / m.clicks).toFixed(2) : '—';
                return (
                  <div key={ad.id} style={{ background: T.ink8, border: `1px solid ${T.ink7}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: platMeta.color + '20', display: 'grid', placeItems: 'center', fontSize: 18, color: platMeta.color, flexShrink: 0 }}>
                        {platMeta.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: T.fg }}>{ad.headline || 'Untitled ad'}</span>
                          <span style={tag(platMeta.color)}>{platMeta.label}</span>
                          <span style={tag(stMeta.color)}>{stMeta.label}</span>
                        </div>
                        {ad.body_text && <p style={{ margin: '0 0 8px', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>{ad.body_text.slice(0, 100)}{ad.body_text.length > 100 ? '…' : ''}</p>}
                        {/* Dates & budget */}
                        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: T.ink3, fontFamily: MONO, marginBottom: 8 }}>
                          {(ad.start_date || ad.end_date) && <span>{fmtDate(ad.start_date)} → {fmtDate(ad.end_date)}</span>}
                          {ad.budget > 0 && <span>Budget: ${ad.budget.toFixed(2)}</span>}
                        </div>
                        {/* Metrics */}
                        {(m.impressions > 0 || m.clicks > 0 || m.spend > 0) && (
                          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.ink2, fontFamily: MONO, padding: '8px 12px', background: T.ink9, borderRadius: 7 }}>
                            <span><span style={{ color: T.fg }}>{(m.impressions || 0).toLocaleString()}</span> impr.</span>
                            <span><span style={{ color: T.fg }}>{(m.clicks || 0).toLocaleString()}</span> clicks</span>
                            <span><span style={{ color: T.fg }}>{(m.conversions || 0).toLocaleString()}</span> conv.</span>
                            <span><span style={{ color: T.fg }}>${(m.spend || 0).toFixed(2)}</span> spend</span>
                            {ctr !== '—' && <span><span style={{ color: T.grn }}>{ctr}%</span> CTR</span>}
                            {cpc !== '—' && <span>$<span style={{ color: T.grn }}>{cpc}</span> CPC</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => openEdit(ad)} style={{ ...btn('ghost'), padding: '5px 10px', fontSize: 10 }}>Edit</button>
                        <button onClick={() => handleDelete(ad.id)} style={{ ...btn('danger'), padding: '5px 10px', fontSize: 10 }}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}
