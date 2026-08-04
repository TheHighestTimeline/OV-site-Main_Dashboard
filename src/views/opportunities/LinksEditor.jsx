// Links on an opportunity: Data Room, Contracts, and any number of named ones.
//
// Data Room and Contracts are real Airtable url fields because they are asked
// for on every deal. Everything else — term sheet, proforma, site map — is a
// named pair stored as JSON in `Extra Links`, since Airtable has no
// repeating-group field and adding a column per document would not scale.
//
// Saved rows render as clickable links, not as inputs. An editable-looking box
// that is really a saved value is how people end up unsure whether their change
// took; a link that opens is unambiguous.

import { useState, useEffect } from 'react';
import { C, SANS, MONO } from '../../constants.js';

const lbl = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.ink3, display: 'block', marginBottom: 3,
};

const inp = {
  background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8,
  padding: '6px 10px', fontFamily: SANS, fontSize: 12.5, color: C.ink9,
  width: '100%', boxSizing: 'border-box', outline: 'none',
};

const btn = {
  padding: '5px 11px', borderRadius: 7, border: `1px solid ${C.cr3}`,
  background: 'transparent', fontFamily: MONO, fontSize: 9.5,
  letterSpacing: '.05em', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function LinksEditor({ opp, onSave, busy }) {
  const [dataRoom,  setDataRoom]  = useState(opp.dataRoom || '');
  const [contracts, setContracts] = useState(opp.contractsUrl || '');
  const [adding,    setAdding]    = useState(false);
  const [label,     setLabel]     = useState('');
  const [url,       setUrl]       = useState('');

  useEffect(() => {
    setDataRoom(opp.dataRoom || '');
    setContracts(opp.contractsUrl || '');
    setAdding(false);
    setLabel('');
    setUrl('');
  }, [opp.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const extras = Array.isArray(opp.extraLinks) ? opp.extraLinks : [];

  function addLink() {
    const u = url.trim();
    if (!u) return;
    // A link with no label is still useful; the host is a better fallback than
    // an empty chip, and better than refusing to save it.
    const name = label.trim() || hostOf(u);
    onSave({ extraLinks: [...extras, { label: name, url: normalise(u) }] });
    setLabel('');
    setUrl('');
    setAdding(false);
  }

  function removeLink(i) {
    onSave({ extraLinks: extras.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <span style={lbl}>Links</span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 7 }}>
        <UrlField
          name="Data room"
          value={dataRoom}
          onChange={setDataRoom}
          onCommit={() => dataRoom !== (opp.dataRoom || '') && onSave({ dataRoom: normalise(dataRoom) })}
          busy={busy}
        />
        <UrlField
          name="Contracts"
          value={contracts}
          onChange={setContracts}
          onCommit={() => contracts !== (opp.contractsUrl || '') && onSave({ contractsUrl: normalise(contracts) })}
          busy={busy}
        />
      </div>

      {extras.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
          {extras.map((l, i) => (
            <span key={`${l.url}-${i}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 6px 3px 10px', borderRadius: 999,
              background: C.bg2, border: `1px solid ${C.cr2}`,
            }}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.url}
                style={{ color: C.acc, fontFamily: SANS, fontSize: 11.5, textDecoration: 'none' }}
              >{l.label || hostOf(l.url)} ↗</a>
              <button
                onClick={() => removeLink(i)}
                disabled={busy}
                title="Remove"
                style={{ border: 'none', background: 'none', color: C.ink3, cursor: 'pointer', fontSize: 11 }}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Name, e.g. Term Sheet"
            style={{ ...inp, flex: '0 1 150px' }}
            autoFocus
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addLink()}
            placeholder="https://…"
            style={{ ...inp, flex: '1 1 200px' }}
          />
          <button onClick={addLink} disabled={busy || !url.trim()} style={{
            ...btn, borderColor: url.trim() ? C.acc : C.cr3, color: url.trim() ? C.acc : C.ink3,
          }}>Save</button>
          <button
            onClick={() => { setAdding(false); setLabel(''); setUrl(''); }}
            style={{ ...btn, borderColor: C.cr3, color: C.ink3 }}
          >Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...btn, borderColor: C.cr3, color: C.ink5 }}>
          ＋ Add a link
        </button>
      )}
    </div>
  );
}

function UrlField({ name, value, onChange, onCommit, busy }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
        <span style={{ ...lbl, marginBottom: 0 }}>{name}</span>
        {value && (
          <a
            href={normalise(value)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.acc, fontFamily: MONO, fontSize: 9, textDecoration: 'none' }}
          >open ↗</a>
        )}
      </div>
      <input
        value={value}
        disabled={busy}
        onChange={e => onChange(e.target.value)}
        onBlur={onCommit}
        placeholder="https://…"
        style={inp}
      />
    </div>
  );
}

/** A bare "drive.google.com/..." is a relative path to the browser, not a link. */
function normalise(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function hostOf(u) {
  try { return new URL(normalise(u)).hostname.replace(/^www\./, ''); }
  catch { return 'link'; }
}

