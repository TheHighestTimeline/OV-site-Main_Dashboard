import { useState, useEffect } from 'react';
import { C, SERIF, MONO, fmtC } from '../constants.js';
import { Tag, Eyebrow, PBar } from '../components/UI.jsx';
import { getFinancial } from '../api.js';

export default function Financial({ showToast }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinancial()
      .then(setItems)
      .catch(e => showToast('Could not load financials: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Eyebrow>Numbers</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 20px', color: C.ink9, lineHeight: 1 }}>
        Financial Goals
      </h1>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {items.length ? items.map((g, i) => (
            <div key={i} style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, margin: 0, color: C.ink9, lineHeight: 1.2 }}>{g.goal}</h3>
                <Tag bg={C.accS} fg={C.accD}>{g.type}</Tag>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink5 }}>{fmtC(g.currentAmount)} of {fmtC(g.target)}</div>
              <PBar pct={(g.progress || 0) * 100} />
            </div>
          )) : (
            <div style={{ padding: 32, color: C.ink3, fontSize: 13 }}>No financial goals found.</div>
          )}
        </div>
      )}
    </div>
  );
}
