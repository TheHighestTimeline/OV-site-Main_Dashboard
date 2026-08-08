import { useState, useEffect, useMemo } from 'react';
import { C, SERIF, MONO } from '../constants.js';
import { Btn, Spinner, Modal } from '../components/UI.jsx';
import {
  previewContactMerge, mergeContacts,
  previewCompanyMerge, mergeCompanies,
} from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Merge review — the screen for folding duplicates together.
//
// WHAT WAS WRONG WITH THE OLD ONE. It asked you to pick a record and pressed
// merge. Everything on the records you did not pick was deleted, sight unseen.
// Duplicates are almost never one full record and one empty one — the 2023 row
// has the phone number, the row somebody made last week has the LinkedIn and
// the right title — so picking a survivor wholesale threw away real data every
// single time, and there was no way to know what you had just lost.
//
// WHAT THIS DOES INSTEAD.
//   1. Shows the records side by side, field by field, with the ones that
//      actually disagree marked. Fields that already agree are collapsed by
//      default: they are not a decision.
//   2. Lets you take the winning value per FIELD, independently of which record
//      survives. The survivor is about which id keeps the links; the field picks
//      are about which values the merged record ends up with.
//   3. Defaults so that nothing empties. Each field starts on the survivor's
//      value, or — if the survivor's is blank — the first non-blank value from
//      any of the others. Pressing merge without touching anything can only
//      ever add data to the survivor, never remove it.
//   4. Shows what points at each record before you choose. The one with four
//      tasks and eleven activities against it is the one whose id should live,
//      and that is invisible from a name and an email alone.
//
// The default survivor is the record carrying the most inbound links, not the
// oldest and not the first alphabetically, for the same reason: repointing links
// is the one part of a merge that can silently half-fail, so doing the least of
// it is the safest default.
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', role: 'Title', linkedin: 'LinkedIn',
  type: 'Type', status: 'Status', owner: 'Owner', source: 'Source', segment: 'Segment',
  introducedBy: 'Introduced by', nextAction: 'Next action', nextActionDate: 'Next action date',
  lastContactedAt: 'Last contacted', currentSummary: 'Current summary', bio: 'Bio', notes: 'Notes',
};

const COMPANY_LABELS = {
  name: 'Name', entityCode: 'Entity code', shortCode: 'Short code', type: 'Type',
  status: 'Status', health: 'Health', stage: 'Stage', website: 'Website',
  followUpDate: 'Follow-up date', subjectDescriptor: 'Subject descriptor',
  summary: 'Summary', callsNotes: 'Calls / notes', waitingOn: 'Waiting on',
};

const blank = (v) => v == null || String(v).trim() === '';
const norm  = (v) => String(v ?? '').trim();

/** "4 tasks · 2 deals · 11 activities", or "nothing linked". */
function linkSummary(links) {
  const entries = Object.entries(links?.counts || {}).filter(([, n]) => n > 0);
  if (!entries.length) return 'nothing linked';
  return entries.map(([label, n]) => `${n} ${label}`).join(' · ');
}

export default function MergeReview({ kind = 'contact', ids, names = [], onClose, onDone, showToast }) {
  const isCompany = kind === 'company';
  const LABELS = isCompany ? COMPANY_LABELS : CONTACT_LABELS;

  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState(null);
  const [keepId, setKeepId] = useState(null);
  const [picks,  setPicks]  = useState({});      // field -> chosen record id
  const [busy,   setBusy]   = useState(false);
  const [showAgreed, setShowAgreed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    const load = isCompany ? previewCompanyMerge : previewContactMerge;
    load(ids)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [ids, isCompany]);

  // Survivor default: most inbound links, then oldest. The record that already
  // carries the history should keep its id — every other choice means moving
  // more links, and moving links is the only step that can half-fail.
  useEffect(() => {
    if (!data?.records?.length || keepId) return;
    const ranked = [...data.records].sort((a, b) => {
      const d = (b.links?.total || 0) - (a.links?.total || 0);
      if (d) return d;
      return String(a.createdTime || '').localeCompare(String(b.createdTime || ''));
    });
    setKeepId(ranked[0].id);
  }, [data, keepId]);

  // Field defaults follow the survivor, and fall back to whoever HAS a value.
  // This is the rule that makes the safe action the default one.
  useEffect(() => {
    if (!data?.records?.length || !keepId) return;
    const keeper = data.records.find(r => r.id === keepId);
    const next = {};
    for (const f of data.fields) {
      if (keeper && !blank(keeper.values?.[f])) { next[f] = keepId; continue; }
      const donor = data.records.find(r => !blank(r.values?.[f]));
      next[f] = donor ? donor.id : keepId;
    }
    setPicks(next);
  }, [data, keepId]);

  // A field is a decision only when two records hold DIFFERENT non-blank values.
  // One filled and one empty is not a conflict — it is just the merge working.
  const conflicts = useMemo(() => {
    if (!data) return new Set();
    const out = new Set();
    for (const f of data.fields) {
      const vals = new Set(data.records.map(r => norm(r.values?.[f])).filter(v => v !== ''));
      if (vals.size > 1) out.add(f);
    }
    return out;
  }, [data]);

  const visibleFields = useMemo(() => {
    if (!data) return [];
    if (showAgreed) return data.fields;
    // Show anything contested, plus anything that will actually change on the
    // survivor. A row where every record says the same thing is noise.
    return data.fields.filter(f => {
      if (conflicts.has(f)) return true;
      const vals = data.records.map(r => norm(r.values?.[f]));
      return vals.some(v => v !== '') && new Set(vals).size > 1;
    });
  }, [data, conflicts, showAgreed]);

  const resultValue = (f) => {
    const src = data?.records.find(r => r.id === picks[f]);
    return src?.values?.[f] ?? null;
  };

  const doMerge = async () => {
    if (!keepId || !data) return;
    const dropIds = data.records.map(r => r.id).filter(id => id !== keepId);
    if (!dropIds.length) return;

    // Only send fields whose winning value differs from what the survivor
    // already holds. A no-op patch is a write that can fail for no gain.
    const keeper = data.records.find(r => r.id === keepId);
    const fields = {};
    for (const f of data.fields) {
      const chosen = resultValue(f);
      if (blank(chosen)) continue;
      if (norm(chosen) === norm(keeper?.values?.[f])) continue;
      fields[f] = chosen;
    }

    const changed = Object.keys(fields).length;
    const msg = `Merge ${dropIds.length} record${dropIds.length > 1 ? 's' : ''} into “${keeper?.name || 'the survivor'}”?\n\n` +
      `Everything linked to ${dropIds.length > 1 ? 'them' : 'it'} is repointed onto the survivor, ` +
      `${changed ? `${changed} field${changed > 1 ? 's are' : ' is'} updated, ` : ''}` +
      `and the duplicate${dropIds.length > 1 ? 's are' : ' is'} deleted. This can't be undone.`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      if (isCompany) {
        await mergeCompanies(keepId, dropIds, changed ? fields : undefined);
      } else {
        // Company links are a union, never a choice: somebody who worked at two
        // of the duplicated employers worked at both.
        const companyIds = [...new Set(data.records.flatMap(r => r.companyIds || []))];
        await mergeContacts(keepId, dropIds, changed ? fields : undefined, companyIds);
      }
      showToast?.(`Merged ${dropIds.length} duplicate${dropIds.length > 1 ? 's' : ''} ✓`);
      onDone?.();
      onClose();
    } catch (e) {
      showToast?.('Merge failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = `Merge ${isCompany ? 'companies' : 'contacts'}`;
  const sub   = names.filter(Boolean).join('  ·  ') || undefined;

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>
        {conflicts.size
          ? `${conflicts.size} field${conflicts.size > 1 ? 's' : ''} disagree — pick a winner in each`
          : 'No conflicts. Merging only fills blanks on the survivor.'}
      </span>
      <span style={{ flex: 1 }} />
      <Btn v="gho" onClick={onClose} disabled={busy}>Cancel</Btn>
      <Btn v="dan" onClick={doMerge} disabled={busy || !data || !keepId}>
        {busy ? 'Merging…' : `Merge ${Math.max((data?.records.length || 1) - 1, 0)} into survivor`}
      </Btn>
    </div>
  );

  const cell = {
    padding: '7px 10px', borderBottom: `1px solid ${C.cr1}`, fontSize: 12.5,
    color: C.ink7, verticalAlign: 'top', maxWidth: 260,
  };

  return (
    <Modal title={title} sub={sub} onClose={busy ? () => {} : onClose} size="wide" footer={data ? footer : null}>
      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: C.redS, color: C.red, fontSize: 13 }}>
          Couldn't load the records: {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.ink5, fontSize: 13, padding: '32px 0' }}>
          <Spinner size={18} /> Reading both records and everything linked to them…
        </div>
      )}

      {data && (
        <>
          <p style={{ fontSize: 12.5, color: C.ink5, lineHeight: 1.55, margin: '0 0 14px' }}>
            Pick which record <b>survives</b> (it keeps its id, so everything already pointing at it stays put),
            then take the best value for each field. Defaults never blank a field — where the survivor is empty,
            a value from one of the others is filled in.
          </p>

          <div style={{ overflowX: 'auto', border: `1px solid ${C.cr2}`, borderRadius: 10, background: C.bg2 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, borderBottom: `1px solid ${C.cr2}`, width: 130 }}>
                    Field
                  </th>
                  {data.records.map(r => {
                    const keep = r.id === keepId;
                    return (
                      <th key={r.id} style={{ ...cell, textAlign: 'left', borderBottom: `1px solid ${C.cr2}`, background: keep ? C.grnS : 'transparent' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}>
                          <input type="radio" name="survivor" checked={keep} onChange={() => setKeepId(r.id)} style={{ marginTop: 3 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontFamily: SERIF, fontSize: 14, color: C.ink9, fontWeight: keep ? 600 : 400 }}>
                              {r.name || '(unnamed)'}
                            </span>
                            <span style={{ display: 'block', fontFamily: MONO, fontSize: 9.5, color: keep ? C.grn : C.ink3, marginTop: 2 }}>
                              {keep ? 'SURVIVES · ' : ''}{linkSummary(r.links)}
                            </span>
                          </span>
                        </label>
                      </th>
                    );
                  })}
                  <th style={{ ...cell, textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.acc, borderBottom: `1px solid ${C.cr2}`, borderLeft: `1px solid ${C.cr2}` }}>
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleFields.length === 0 ? (
                  <tr>
                    <td colSpan={data.records.length + 2} style={{ ...cell, color: C.ink3, fontStyle: 'italic' }}>
                      These records hold identical values in every field. Merging just folds the links together.
                    </td>
                  </tr>
                ) : visibleFields.map(f => {
                  const contested = conflicts.has(f);
                  return (
                    <tr key={f}>
                      <td style={{ ...cell, fontFamily: MONO, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: contested ? C.red : C.ink3, whiteSpace: 'nowrap' }}>
                        {contested && <span title="These disagree">⚠ </span>}{LABELS[f] || f}
                      </td>
                      {data.records.map(r => {
                        const v = r.values?.[f];
                        const chosen = picks[f] === r.id;
                        const empty  = blank(v);
                        return (
                          <td key={r.id}
                            onClick={empty ? undefined : () => setPicks(p => ({ ...p, [f]: r.id }))}
                            title={empty ? 'Empty — nothing to take' : 'Use this value'}
                            style={{
                              ...cell,
                              cursor: empty ? 'default' : 'pointer',
                              background: chosen && !empty ? C.accS : 'transparent',
                              border: chosen && !empty ? `1px solid ${C.acc}` : undefined,
                              borderBottom: `1px solid ${C.cr1}`,
                              color: empty ? C.ink3 : C.ink7,
                              fontStyle: empty ? 'italic' : 'normal',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                            {empty ? '—' : String(v)}
                          </td>
                        );
                      })}
                      <td style={{ ...cell, borderLeft: `1px solid ${C.cr2}`, color: C.ink9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {blank(resultValue(f)) ? <span style={{ color: C.ink3, fontStyle: 'italic' }}>—</span> : String(resultValue(f))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setShowAgreed(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, padding: 0 }}>
              {showAgreed ? '− Hide fields that already agree' : `+ Show all ${data.fields.length} fields`}
            </button>
            {!isCompany && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginLeft: 'auto' }}>
                Company links are combined, not chosen.
              </span>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
