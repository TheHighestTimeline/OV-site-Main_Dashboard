import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Spinner, Btn, Inp, FR } from '../components/UI.jsx';
import { getCostDashboardData } from '../api.js';

// Cost Transparency Dashboard — Phase 7 enhanced.
// Reads from internal usage_events table (populated by every AI call going
// through the dashboard's Netlify functions). Adds manual cost entry and
// per-company allocation.

const PERIODS = [
  { id: 'today',      label: 'Today'      },
  { id: 'week',       label: 'This week'  },
  { id: 'month',      label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'all',        label: 'All time'   },
];

const SERVICE_COLOR = {
  anthropic: '#d96b3a', openai: '#2c5d8a', google: '#2f7d5f',
  netlify:   '#9b59b6', supabase: '#3ecf8e', notion: '#000000',
  stripe:    '#6772e5', vercel: '#000000', twilio: '#f22f46',
  clerk:     '#6c47ff', github: '#333', custom: '#6b7180',
};

// Known 3rd-party services that can have manual cost entries
const KNOWN_SERVICES = [
  { id: 'stripe',    label: 'Stripe',    desc: 'Payment processing' },
  { id: 'openai',    label: 'OpenAI',    desc: 'GPT API usage' },
  { id: 'anthropic', label: 'Anthropic', desc: 'Claude API usage' },
  { id: 'supabase',  label: 'Supabase',  desc: 'Database / storage' },
  { id: 'vercel',    label: 'Vercel',    desc: 'Hosting / edge functions' },
  { id: 'twilio',    label: 'Twilio',    desc: 'SMS / voice' },
  { id: 'netlify',   label: 'Netlify',   desc: 'Hosting / functions' },
  { id: 'notion',    label: 'Notion',    desc: 'Workspace API' },
  { id: 'clerk',     label: 'Clerk',     desc: 'Auth' },
  { id: 'github',    label: 'GitHub',    desc: 'Version control / CI' },
];

const COMPANIES = [
  { id: 'ovm',     label: 'OneVibe Media Group' },
  { id: 'fest',    label: 'OneVibeFest' },
  { id: 'amplify', label: 'Amplify Artists' },
  { id: 'group',   label: 'OneVibeGroup' },
  { id: 'shared',  label: 'Shared / Internal' },
];

// Local storage key for manual entries (persists per browser; in prod wire to Supabase)
const LS_KEY = 'ovmg_manual_costs';
function loadManual() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveManual(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

export default function CostDashboard({ showToast }) {
  const [period, setPeriod] = useState('month');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  // Manual cost entries
  const [manualEntries, setManualEntries] = useState(loadManual);
  const [showForm, setShowForm]           = useState(false);
  const [editIdx, setEditIdx]             = useState(null);
  const [form, setForm] = useState({ service: 'stripe', label: '', cost: '', company: 'shared', note: '', month: new Date().toISOString().slice(0, 7) });
  const fld = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    setLoading(true);
    getCostDashboardData(period)
      .then(setData)
      .catch(e => showToast?.('Cost data failed: ' + e.message))
      .finally(() => setLoading(false));
  }, [period]);

  // ── Manual entry helpers ───────────────────────────────────────────────────
  function openAdd() {
    setEditIdx(null);
    setForm({ service: 'stripe', label: '', cost: '', company: 'shared', note: '', month: new Date().toISOString().slice(0, 7) });
    setShowForm(true);
  }
  function openEdit(i) {
    setEditIdx(i);
    setForm({ ...manualEntries[i] });
    setShowForm(true);
  }
  function saveEntry() {
    if (!form.service || !form.cost || isNaN(parseFloat(form.cost))) {
      showToast?.('Service and valid cost required');
      return;
    }
    const entry = { ...form, cost: parseFloat(form.cost), updatedAt: new Date().toISOString() };
    let next;
    if (editIdx !== null) {
      next = manualEntries.map((e, i) => i === editIdx ? entry : e);
    } else {
      next = [...manualEntries, entry];
    }
    setManualEntries(next);
    saveManual(next);
    setShowForm(false);
    showToast?.('Cost entry saved ✓');
  }
  function deleteEntry(i) {
    const next = manualEntries.filter((_, j) => j !== i);
    setManualEntries(next);
    saveManual(next);
  }

  // Total manual costs for current display
  const manualTotal = manualEntries.reduce((s, e) => s + (e.cost || 0), 0);
  const combinedTotal = (data?.total || 0) + manualTotal;

  // Per-company breakdown from manual entries
  const byCompany = COMPANIES.map(c => ({
    ...c,
    total: manualEntries.filter(e => e.company === c.id).reduce((s, e) => s + (e.cost || 0), 0),
  })).filter(c => c.total > 0);

  return (
    <div>
      <Eyebrow>Admin · Cost transparency</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 28, color: C.ink9, margin: 0 }}>
          AI / API spend · {PERIODS.find(p => p.id === period)?.label}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <Btn key={p.id} v={period === p.id ? 'pri' : 'gho'} onClick={() => setPeriod(p.id)}>{p.label}</Btn>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>}

      {data && !loading && (
        <>
          {/* ── Total summary ────────────────────────────────────────────── */}
          <div style={{ background: C.chromeBg, color: C.chromeFg, padding: '20px 24px', borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>
              Combined total ({data.eventCount} AI events + {manualEntries.length} manual entries)
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500 }}>
              ${combinedTotal.toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>AI usage (tracked)</div>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>${data.total.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>Manual entries</div>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>${manualTotal.toFixed(2)}</div>
              </div>
            </div>
            {data.note && (
              <div style={{ marginTop: 8, fontSize: 12, color: C.chromeMut }}>{data.note}</div>
            )}
          </div>

          {/* ── Per-service cards ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink5 }}>Per-service breakdown</div>
              <Btn v="gho" onClick={openAdd}>+ Manual entry</Btn>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
              {/* AI-tracked services */}
              {data.byService.map(row => {
                const pct = combinedTotal > 0 ? (row.cost / combinedTotal) * 100 : 0;
                const svc = KNOWN_SERVICES.find(s => s.id === row.key) || { label: row.key, desc: '' };
                return (
                  <div key={row.key} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9 }}>{svc.label}</div>
                        <div style={{ fontSize: 10, color: C.ink3, fontFamily: MONO, marginTop: 2 }}>{row.count} calls</div>
                      </div>
                      <div style={{ fontSize: 15, fontFamily: SERIF, fontWeight: 500, color: C.ink9 }}>${row.cost.toFixed(2)}</div>
                    </div>
                    <div style={{ height: 4, background: C.cr2, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: SERVICE_COLOR[row.key] || C.acc }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.ink3, fontFamily: MONO, marginTop: 5 }}>{pct.toFixed(1)}% of total</div>
                  </div>
                );
              })}
              {/* Manual entries as cards */}
              {manualEntries.map((e, i) => {
                const pct = combinedTotal > 0 ? (e.cost / combinedTotal) * 100 : 0;
                const svc = KNOWN_SERVICES.find(s => s.id === e.service) || { label: e.service };
                const comp = COMPANIES.find(c => c.id === e.company);
                return (
                  <div key={`manual_${i}`} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10, padding: '14px 16px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink9 }}>{e.label || svc.label}</div>
                        <div style={{ fontSize: 10, color: C.ink3, fontFamily: MONO, marginTop: 2 }}>{comp?.label || e.company} · {e.month}</div>
                      </div>
                      <div style={{ fontSize: 15, fontFamily: SERIF, fontWeight: 500, color: C.ink9 }}>${e.cost.toFixed(2)}</div>
                    </div>
                    <div style={{ height: 4, background: C.cr2, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: SERVICE_COLOR[e.service] || C.acc }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: C.ink3, fontFamily: MONO }}>manual · {pct.toFixed(1)}%</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEdit(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 11, fontFamily: MONO }}>Edit</button>
                        <button onClick={() => deleteEntry(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 11, fontFamily: MONO }}>Del</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Manual entry form ─────────────────────────────────────────── */}
          {showForm && (
            <Card title={editIdx !== null ? 'Edit cost entry' : 'Add manual cost entry'}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FR label="Service">
                  <select value={form.service} onChange={fld('service')} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, width: '100%' }}>
                    {KNOWN_SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    <option value="custom">Custom / Other</option>
                  </select>
                </FR>
                <FR label="Custom label (optional)">
                  <Inp value={form.label} onChange={fld('label')} placeholder={`e.g. Stripe — ${new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' })}`} />
                </FR>
                <FR label="Monthly cost ($)">
                  <Inp value={form.cost} onChange={fld('cost')} placeholder="0.00" type="number" />
                </FR>
                <FR label="Month">
                  <input type="month" value={form.month} onChange={fld('month')} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, width: '100%' }} />
                </FR>
                <FR label="Allocated to company">
                  <select value={form.company} onChange={fld('company')} style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, width: '100%' }}>
                    {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </FR>
                <FR label="Notes">
                  <Inp value={form.note} onChange={fld('note')} placeholder="Optional notes…" />
                </FR>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <Btn v="gho" onClick={() => setShowForm(false)}>Cancel</Btn>
                <Btn onClick={saveEntry}>Save entry</Btn>
              </div>
            </Card>
          )}

          {/* ── Company allocation ────────────────────────────────────────── */}
          {byCompany.length > 0 && (
            <Card title="Allocation by company (manual entries)">
              {byCompany.map(c => (
                <div key={c.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontFamily: SANS, fontSize: 13, color: C.ink9, fontWeight: 500 }}>{c.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink8 }}>${c.total.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, background: C.cr2, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${manualTotal > 0 ? (c.total / manualTotal) * 100 : 0}%`, height: '100%', background: C.acc }} />
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* ── By model ──────────────────────────────────────────────────── */}
          <Card title="By model">
            {data.byModel.length === 0 ? <Empty>No model-tagged events.</Empty>
            : <Table headers={['Model','Calls','In tokens','Out tokens','Cost']} rows={data.byModel.map(r => [
                r.key, r.count, r.inputTokens.toLocaleString(), r.outputTokens.toLocaleString(), '$' + r.cost.toFixed(3)
              ])} />}
          </Card>

          {/* ── Top surfaces ─────────────────────────────────────────────── */}
          <Card title="Top surfaces">
            {data.topSurfaces.length === 0 ? <Empty>No surface-tagged events.</Empty>
            : <Table headers={['Surface','Calls','Cost']} rows={data.topSurfaces.map(r => [
                r.key, r.count, '$' + r.cost.toFixed(3)
              ])} />}
          </Card>

          {/* ── By day chart ──────────────────────────────────────────────── */}
          {data.byDay.length > 0 && (
            <Card title="AI usage by day">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '10px 0', overflowX: 'auto' }}>
                {data.byDay.map(d => {
                  const max = Math.max(...data.byDay.map(x => x.cost), 0.001);
                  const h = Math.max(2, (d.cost / max) * 100);
                  return (
                    <div key={d.day} style={{ flex: '1 1 0', minWidth: 18, maxWidth: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div title={`${d.day}: $${d.cost.toFixed(3)}`}
                             style={{ width: '100%', height: `${h}%`, background: C.acc, borderRadius: '3px 3px 0 0' }} />
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.ink3 }}>{d.day.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink5, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}
function Empty({ children }) { return <div style={{ color: C.ink3, fontSize: 12, fontStyle: 'italic', padding: 10 }}>{children}</div>; }
function Table({ headers, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 12 }}>
      <thead>
        <tr>{headers.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '6px 8px', color: C.ink5, fontWeight: 500, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', borderBottom: `1px solid ${C.cr3}` }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((cell, j) => <td key={j} style={{ padding: '6px 8px', color: C.ink8, borderBottom: `1px solid ${C.cr3}` }}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
