import { useState, useEffect, useMemo, useRef } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Spinner, Modal } from '../components/UI.jsx';
import { SITES, getSite, needsPathB } from '../sites.js';
import {
  listBranches, getBranch, getFile, getCommitDiff, createBranch,
  compareCommits, mergeBranch,
  getBranchDeploy, triggerBuild,
} from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Websites tab — Phases 2+3 + Phase 7 audit fixes:
//   C-3: Deploy now opens a Modal showing files changed + line counts before
//        merging (was: browser confirm() with no diff visibility).
//   M-5: Branch name validation tightened — rejects leading slash/dash,
//        double slashes, trailing periods, reserved names (HEAD, main, etc.).
//   M-7: Deploy button disabled while merging — no more double-click races.
// ─────────────────────────────────────────────────────────────────────────────

// Branch-name validity (M-5).
// Git lets a lot through but several patterns cause issues with tools/UIs.
const RESERVED_BRANCH_NAMES = new Set(['HEAD', 'head', 'main', 'master', '@', '.', '..']);
function validateBranchName(name) {
  const n = (name || '').trim();
  if (!n)                            return 'Name is required';
  if (n.length > 100)                return 'Name is too long (max 100)';
  if (RESERVED_BRANCH_NAMES.has(n))  return `"${n}" is a reserved name`;
  if (n.startsWith('-'))             return 'Cannot start with "-"';
  if (n.startsWith('/'))             return 'Cannot start with "/"';
  if (n.endsWith('/') || n.endsWith('.')) return 'Cannot end with "/" or "."';
  if (n.includes('//'))              return 'Cannot contain "//"';
  if (n.includes('..'))              return 'Cannot contain ".."';
  if (n.includes(' '))               return 'Cannot contain spaces';
  if (!/^[\w./-]+$/.test(n))         return 'Allowed: letters, numbers, _ - . /';
  return null;
}

export default function Websites({ user, showToast }) {
  const [siteId,   setSiteId]   = useState(SITES[0]?.id || null);
  const [branchName, setBranchName] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState(null);
  const [branchListVersion, setBranchListVersion] = useState(0);
  // M-7: track in-flight merges to disable Deploy button
  const [deployingBranch, setDeployingBranch] = useState(null);
  // C-3: state for the deploy confirmation modal
  const [deployModal, setDeployModal] = useState(null); // { branch, comparison } | null

  const site = useMemo(() => getSite(siteId), [siteId]);

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    setBranchesLoading(true);
    setBranchesError(null);
    setBranches([]);

    listBranches(site.repo)
      .then(({ branches }) => {
        if (cancelled) return;
        const sorted = [...branches].sort((a, b) => {
          if (a.name === site.defaultBranch) return -1;
          if (b.name === site.defaultBranch) return 1;
          return a.name.localeCompare(b.name);
        });
        setBranches(sorted);
        setBranchName(prev => prev && sorted.some(b => b.name === prev) ? prev : site.defaultBranch);
      })
      .catch(e => {
        if (cancelled) return;
        setBranchesError(e.message || 'Failed to load branches');
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });

    return () => { cancelled = true; };
  }, [site, branchListVersion]);

  const refreshBranchList = () => setBranchListVersion(v => v + 1);

  // C-3 + M-7: open the deploy modal (fetches diff first).
  const openDeployModal = async () => {
    if (!branchName || branchName === site.defaultBranch) return;
    if (deployingBranch) return;  // M-7 guard
    try {
      const { comparison } = await compareCommits(site.repo, site.defaultBranch, branchName);
      setDeployModal({ branch: branchName, comparison });
    } catch (e) {
      showToast?.(`Could not load diff: ${e.message}`);
      // Fall back to a no-diff modal so the user can still confirm
      setDeployModal({ branch: branchName, comparison: null });
    }
  };

  // C-3 + M-7: actual merge, called from the modal's confirm button.
  const performDeploy = async () => {
    if (!deployModal || deployingBranch) return;
    const branch = deployModal.branch;
    setDeployingBranch(branch);
    setDeployModal(null);
    try {
      const { merge } = await mergeBranch(site.repo, branch, site.defaultBranch);
      if (merge.merged) {
        showToast?.(`Merged ${branch} → ${site.defaultBranch}. Netlify will deploy main shortly.`);
        setBranchName(site.defaultBranch);
        refreshBranchList();
      } else {
        showToast?.('Already up to date.');
      }
    } catch (e) {
      showToast?.(`Merge failed: ${e.message}`);
    } finally {
      setDeployingBranch(null);
    }
  };

  return (
    <div>
      <Eyebrow>Sites</Eyebrow>
      <h1 style={{
        fontFamily: SERIF, fontWeight: 500, fontSize: 38,
        letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1,
      }}>
        Websites
      </h1>
      <p style={{ fontSize: 13, color: C.ink5, marginBottom: 20 }}>
        Preview any branch of any OVMG site without triggering a production build.
        Static commits render free via JSDelivr CDN; commits that need a real runtime
        fall back to Netlify branch previews. Deploy a branch to production with one click.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '180px 260px 1fr',
        gap: 16,
        height: 'calc(100vh - 230px)',
        minHeight: 480,
      }}>

        <SiteList sites={SITES} activeId={siteId} onSelect={(id) => { setSiteId(id); setBranchName(null); }} />

        <BranchSidebar
          site={site}
          branches={branches}
          loading={branchesLoading}
          error={branchesError}
          activeBranch={branchName}
          onSelect={setBranchName}
          onRefresh={refreshBranchList}
          onCreateBranch={async (newName) => {
            try {
              await createBranch(site.repo, site.defaultBranch, newName);
              showToast?.(`Branch ${newName} created`);
              setBranchName(newName);
              refreshBranchList();
            } catch (e) {
              showToast?.(`Failed: ${e.message}`);
            }
          }}
          onDeploy={openDeployModal}
          isDeploying={deployingBranch === branchName}
        />

        <PreviewPane site={site} branchName={branchName} />

      </div>

      {/* C-3: Deploy confirmation modal with diff preview */}
      {deployModal && (
        <Modal
          title={`Deploy ${deployModal.branch} → ${site.defaultBranch}`}
          onClose={() => setDeployModal(null)}
        >
          <DeployConfirmation
            site={site}
            target={deployModal}
            onConfirm={performDeploy}
            onCancel={() => setDeployModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// C-3: Deploy confirmation content — shows diff summary inside the Modal.
// ─────────────────────────────────────────────────────────────────────────────
function DeployConfirmation({ site, target, onConfirm, onCancel }) {
  const { comparison } = target;
  const filesChanged = comparison?.files?.length || 0;
  const additions    = (comparison?.files || []).reduce((s, f) => s + (f.additions || 0), 0);
  const deletions    = (comparison?.files || []).reduce((s, f) => s + (f.deletions || 0), 0);
  const aheadBy      = comparison?.aheadBy ?? null;
  const behindBy     = comparison?.behindBy ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: '12px 14px', background: C.bg2, borderRadius: 8,
        fontSize: 13, color: C.ink8, lineHeight: 1.5,
      }}>
        You're about to merge <strong style={{ fontFamily: MONO }}>{target.branch}</strong> into
        {' '}<strong style={{ fontFamily: MONO }}>{site.defaultBranch}</strong>.
        This triggers a Netlify production build of <strong>{site.label}</strong>.
      </div>

      {comparison ? (
        <div style={{
          padding: '12px 14px', background: C.bg2, border: `1px solid ${C.cr3}`,
          borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            display: 'flex', gap: 12, fontFamily: MONO, fontSize: 12, color: C.ink8,
            flexWrap: 'wrap',
          }}>
            <Stat label="files changed" value={filesChanged} color={C.ink9} />
            <Stat label="ahead"    value={aheadBy ?? '—'}    color={C.grn} />
            {behindBy > 0 && <Stat label="behind"   value={behindBy} color={C.yel} />}
            <Stat label="additions" value={`+${additions}`} color={C.grn} />
            <Stat label="deletions" value={`-${deletions}`} color={C.red} />
          </div>

          {behindBy > 0 && (
            <div style={{
              fontSize: 11, color: C.yel, padding: '6px 10px',
              background: C.yelS, borderRadius: 6, lineHeight: 1.4,
            }}>
              ⚠ This branch is {behindBy} commit{behindBy === 1 ? '' : 's'} behind
              {' '}{site.defaultBranch}. The merge will still succeed but you may
              want to pull main into this branch first if you want a clean linear history.
            </div>
          )}

          {filesChanged > 0 && (
            <div style={{
              maxHeight: 200, overflowY: 'auto', borderTop: `1px solid ${C.cr3}`,
              paddingTop: 8, fontFamily: MONO, fontSize: 11,
            }}>
              {comparison.files.slice(0, 50).map(f => (
                <div key={f.filename} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 8,
                  padding: '3px 4px', borderRadius: 4,
                  color: f.status === 'removed' ? C.red : f.status === 'added' ? C.grn : C.ink8,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename}
                  </span>
                  <span style={{ color: C.ink3 }}>
                    +{f.additions} -{f.deletions}
                  </span>
                </div>
              ))}
              {comparison.files.length > 50 && (
                <div style={{ padding: 4, color: C.ink3 }}>
                  …and {comparison.files.length - 50} more files
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: '10px 14px', background: C.yelS, color: C.yel,
          borderRadius: 8, fontSize: 12, lineHeight: 1.4,
        }}>
          Couldn't load diff details. You can still proceed if you're confident in the changes.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn v="gho" onClick={onCancel}>Cancel</Btn>
        <Btn v="acc" onClick={onConfirm}>
          ↗ Merge to {site.defaultBranch} and deploy
        </Btn>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
      <span style={{ color: C.ink3, fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider badge colours
const PROVIDER_STYLE = {
  netlify:      { bg: '#d6f0ff', fg: '#0e6e9e' },
  external_url: { bg: C.yelS,   fg: C.yel     },
};

function SiteList({ sites, activeId, onSelect }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.cr3}`,
      borderRadius: 10, padding: 10, overflowY: 'auto',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
        textTransform: 'uppercase', color: C.ink3,
        padding: '4px 6px 8px',
      }}>
        Sites
      </div>
      {sites.map(s => {
        const active   = s.id === activeId;
        const provSty  = s.provider ? (PROVIDER_STYLE[s.provider] || PROVIDER_STYLE.netlify) : null;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 6, border: 'none',
              background: active ? C.ink9 : 'transparent',
              color: active ? C.bg : C.ink8,
              fontFamily: SANS, fontSize: 13, cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            <div style={{ fontWeight: 500 }}>{s.label}</div>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '.04em',
              color: active ? C.cr2 : C.ink3, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.repo}
            </div>
            {provSty && (
              <div style={{
                display: 'inline-block', marginTop: 4,
                fontFamily: MONO, fontSize: 8, letterSpacing: '.06em',
                textTransform: 'uppercase', padding: '1px 6px', borderRadius: 3,
                background: active ? 'rgba(255,255,255,.14)' : provSty.bg,
                color: active ? C.cr2 : provSty.fg,
              }}>
                {s.provider.replace('_', ' ')}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function BranchSidebar({ site, branches, loading, error, activeBranch, onSelect, onRefresh, onCreateBranch, onDeploy, isDeploying }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [creating, setCreating] = useState(false);
  const isDeployable = activeBranch && site && activeBranch !== site.defaultBranch;

  if (!site) {
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10,
        padding: 16, color: C.ink3, fontSize: 13,
      }}>
        Select a site to see branches.
      </div>
    );
  }

  const handleSubmitNewBranch = async () => {
    const validation = validateBranchName(newName);
    if (validation) { setNameError(validation); return; }
    setCreating(true);
    await onCreateBranch(newName.trim());
    setCreating(false);
    setAdding(false);
    setNewName('');
    setNameError(null);
  };

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${C.cr3}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
          textTransform: 'uppercase', color: C.ink3,
        }}>
          Branches
        </div>
        <button onClick={onRefresh} title="Refresh branch list"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.ink5, fontSize: 14, padding: '0 4px',
          }}>
          ↻
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: C.ink3 }}>
            <Spinner size={16} /> <span style={{ marginLeft: 8, fontSize: 12 }}>Loading branches…</span>
          </div>
        )}
        {error && (
          <div style={{
            padding: 12, margin: 6, borderRadius: 6,
            background: C.redS, color: C.red, fontSize: 12,
          }}>
            {error}
          </div>
        )}
        {!loading && !error && branches.map(b => {
          const active = b.name === activeBranch;
          const isDefault = b.name === site.defaultBranch;
          return (
            <button
              key={b.name}
              onClick={() => onSelect(b.name)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: 6, border: 'none',
                background: active ? C.ink9 : 'transparent',
                color: active ? C.bg : C.ink8,
                fontFamily: SANS, fontSize: 13, cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: isDefault ? 600 : 500 }}>{b.name}</span>
                {isDefault && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8, letterSpacing: '.1em',
                    padding: '1px 5px', borderRadius: 3,
                    background: active ? C.acc : C.cr3,
                    color: active ? C.ink9 : C.ink5,
                    textTransform: 'uppercase',
                  }}>Main</span>
                )}
              </div>
              {b.sha && (
                <div style={{
                  fontFamily: MONO, fontSize: 9,
                  color: active ? C.cr2 : C.ink3, marginTop: 2,
                }}>
                  {b.sha.slice(0, 7)}
                </div>
              )}
            </button>
          );
        })}
        {!loading && !error && branches.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: C.ink3, fontSize: 12 }}>
            No branches found.
          </div>
        )}
      </div>

      <div style={{
        padding: 10, borderTop: `1px solid ${C.cr3}`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* M-7: Deploy button disabled while merging is in flight */}
        {isDeployable && (
          <Btn v="acc" onClick={onDeploy} disabled={isDeploying}
               sx={{ width: '100%', justifyContent: 'center' }}>
            {isDeploying ? 'Merging…' : `↗ Deploy ${activeBranch} → ${site.defaultBranch}`}
          </Btn>
        )}

        {!adding ? (
          <Btn v="gho" onClick={() => { setAdding(true); setNameError(null); }}
               sx={{ width: '100%', justifyContent: 'center' }}>
            + New Branch
          </Btn>
        ) : (
          <>
            <input
              autoFocus
              value={newName}
              onChange={e => {
                setNewName(e.target.value);
                setNameError(null);
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmitNewBranch(); }}
              placeholder="feature-name"
              style={{
                background: C.bg,
                border: `1px solid ${nameError ? C.red : C.cr3}`,
                borderRadius: 6,
                padding: '6px 10px', fontFamily: MONO, fontSize: 12, color: C.ink9,
                outline: 'none',
              }}
            />
            {nameError && (
              <div style={{ fontSize: 10, color: C.red, fontFamily: MONO }}>
                {nameError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn v="pri" disabled={!newName.trim() || creating}
                   onClick={handleSubmitNewBranch}
                   sx={{ flex: 1, justifyContent: 'center' }}>
                {creating ? 'Creating…' : 'Create'}
              </Btn>
              <Btn v="gho"
                   onClick={() => { setAdding(false); setNewName(''); setNameError(null); }}
                   sx={{ justifyContent: 'center' }}>
                Cancel
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function PreviewPane({ site, branchName }) {
  const [status, setStatus] = useState('idle');
  const [srcDoc, setSrcDoc] = useState('');
  const [pathBUrl, setPathBUrl] = useState('');
  const [error, setError]   = useState(null);
  const [meta, setMeta]     = useState(null);
  const [iframeError, setIframeError] = useState(false);

  const refresh = async () => {
    if (!site || !branchName) return;
    setStatus('loading');
    setError(null);
    setSrcDoc('');
    setPathBUrl('');
    setMeta(null);
    setIframeError(false);

    // If site is flagged noIframe (e.g. Cloudflare-tunneled), skip preview entirely
    if (site.noIframe) {
      setStatus('no-iframe');
      return;
    }

    try {
      const { branch: br } = await getBranch(site.repo, branchName);

      let pathBNeeded = site.type === 'built';
      let detectedReason = pathBNeeded ? 'site type is built' : null;

      if (!pathBNeeded && br.sha) {
        try {
          const { diff } = await getCommitDiff(site.repo, br.sha);
          const changedPaths = (diff.files || []).map(f => f.filename);
          if (needsPathB(changedPaths)) {
            pathBNeeded = true;
            detectedReason = 'commit touched function/build-config';
          }
        } catch { /* fall through to Path A */ }
      }

      setMeta({
        commitSha:     br.sha,
        commitMessage: br.commitMessage || '(no message)',
        commitDate:    br.commitDate,
        pathB:         pathBNeeded,
        reason:        detectedReason,
      });

      if (pathBNeeded) {
        await renderPathB(site, branchName);
        return;
      }

      const { file } = await getFile(site.repo, branchName, 'index.html');
      // Detect 404 in the HTML content itself
      if (
        typeof file.content === 'string' &&
        /404|not found/i.test(file.content) &&
        file.content.length < 2000
      ) {
        setError('The page returned a 404. The site may need to be redeployed or the index.html may be missing from this branch.');
        setStatus('error');
        return;
      }
      const html = rewriteForPreview(file.content, site.repo, branchName);
      setSrcDoc(html);
      setStatus('ready');
    } catch (e) {
      const msg = e.message || 'Failed to load preview';
      // Surface 404-specific guidance
      if (msg.includes('404') || msg.includes('Not Found')) {
        setError('404 — file not found. The branch may not have an index.html, or the Netlify deploy may need to be triggered. Try deploying the branch first.');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  };

  const renderPathB = async (s, b) => {
    setStatus('path-b-building');
    try {
      let { deploy } = await getBranchDeploy(s.netlifySiteId, b);
      if (!deploy) await triggerBuild(s.netlifySiteId, b);
      const start = Date.now();
      while (Date.now() - start < 90_000) {
        const { deploy: d } = await getBranchDeploy(s.netlifySiteId, b);
        if (d && d.state === 'ready' && d.deployUrl) {
          setPathBUrl(d.sslUrl || d.deployUrl);
          setStatus('path-b-ready');
          return;
        }
        if (d && d.state === 'error') {
          setError(d.errorMessage || 'Netlify build failed');
          setStatus('path-b-error');
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      setError('Timed out waiting for Netlify build (>90s). Refresh to keep trying.');
      setStatus('path-b-error');
    } catch (e) {
      setError(e.message || 'Path B failed');
      setStatus('path-b-error');
    }
  };

  // Detect iframe load errors (X-Frame-Options / CSP blocks show as blank, but
  // onError fires for network errors). For path-b-ready frames, show fallback.
  const handleIframeError = () => setIframeError(true);

  useEffect(() => { refresh(); }, [site?.id, branchName]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveUrl = site?.liveUrl;

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${C.cr3}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
            textTransform: 'uppercase', color: C.ink3, marginBottom: 2,
          }}>
            Preview {branchName && <>· <span style={{ color: C.ink8 }}>{branchName}</span></>}
            {meta?.pathB && <span style={{ marginLeft: 8, color: C.yel }}>· PATH B</span>}
            {site?.noIframe && <span style={{ marginLeft: 8, color: C.yel }}>· EXTERNAL</span>}
          </div>
          {meta && (
            <div style={{
              fontSize: 11, color: C.ink3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontFamily: MONO }}>{(meta.commitSha || '').slice(0, 7)}</span>
              {' · '}
              <span>{meta.commitMessage.split('\n')[0]}</span>
              {meta.commitDate && (
                <span style={{ marginLeft: 8, color: C.ink3 }}>
                  · {new Date(meta.commitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </div>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6,
              border: `1px solid ${C.cr3}`, background: C.bg,
              fontFamily: SANS, fontSize: 11, color: C.ink7, textDecoration: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            ↗ Live site
          </a>
        )}
        <Btn v="gho" onClick={refresh}>↻ Refresh</Btn>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#fff', overflow: 'hidden' }}>
        {status === 'idle' && <CenterMessage>Select a branch to preview.</CenterMessage>}
        {status === 'loading' && (
          <CenterMessage>
            <Spinner size={20} />
            <div style={{ marginTop: 10 }}>Loading preview…</div>
          </CenterMessage>
        )}
        {status === 'no-iframe' && (
          <CenterMessage tone="warn">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Cannot preview in-dashboard</div>
            <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              This site ({site?.label}) uses an external URL or Cloudflare tunnel and
              cannot be iframed. Open it directly in a new tab.
            </div>
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', background: C.acc, color: '#fff',
                  borderRadius: 8, textDecoration: 'none',
                  fontFamily: SANS, fontSize: 13, fontWeight: 600,
                }}
              >
                ↗ Open {site.label} in new tab
              </a>
            )}
          </CenterMessage>
        )}
        {status === 'error' && (
          <CenterMessage tone="error">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Preview failed</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>{error}</div>
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: C.red, color: '#fff',
                  borderRadius: 7, textDecoration: 'none',
                  fontFamily: SANS, fontSize: 12, fontWeight: 600,
                }}
              >
                ↗ Open live site instead
              </a>
            )}
          </CenterMessage>
        )}
        {status === 'path-b-building' && (
          <CenterMessage tone="warn">
            <Spinner size={20} />
            <div style={{ marginTop: 12, fontWeight: 500 }}>Building Netlify branch preview…</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              {meta?.reason ? `Reason: ${meta.reason}` : null}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              This usually takes 20-60 seconds. We're polling Netlify for completion.
            </div>
          </CenterMessage>
        )}
        {status === 'path-b-error' && (
          <CenterMessage tone="error">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Netlify preview failed</div>
            <div style={{ fontSize: 12 }}>{error}</div>
          </CenterMessage>
        )}
        {status === 'path-b-ready' && !iframeError && (
          <iframe
            title={`${site?.label} · ${branchName} · Netlify preview`}
            src={pathBUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            onError={handleIframeError}
          />
        )}
        {status === 'path-b-ready' && iframeError && (
          <CenterMessage tone="warn">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Could not load preview in iframe</div>
            <div style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              The Netlify preview may block embedding. Open it directly:
            </div>
            <a
              href={pathBUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', background: C.acc, color: '#fff',
                borderRadius: 8, textDecoration: 'none',
                fontFamily: SANS, fontSize: 13, fontWeight: 600,
              }}
            >
              ↗ Open Netlify preview
            </a>
          </CenterMessage>
        )}
        {status === 'ready' && (
          <iframe title={`${site?.label} · ${branchName}`} srcDoc={srcDoc}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            onError={handleIframeError}
          />
        )}
      </div>
    </div>
  );
}

function CenterMessage({ children, tone }) {
  const bg = tone === 'error' ? C.redS : tone === 'warn' ? C.yelS : 'transparent';
  const fg = tone === 'error' ? C.red  : tone === 'warn' ? C.yel  : C.ink5;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24, background: bg, color: fg,
      fontFamily: SANS, fontSize: 13,
    }}>
      {children}
    </div>
  );
}

function rewriteForPreview(html, repo, branch) {
  const safeBranch = encodeURIComponent(branch).replace(/%2F/g, '/');
  const cdnBase = `https://cdn.jsdelivr.net/gh/${repo}@${safeBranch}/`;

  const rewriteUrl = (url) => {
    if (!url) return url;
    const t = url.trim();
    if (
      t.startsWith('http://')  || t.startsWith('https://') ||
      t.startsWith('//')       || t.startsWith('data:')    ||
      t.startsWith('mailto:')  || t.startsWith('tel:')     ||
      t.startsWith('#')        || t.startsWith('javascript:') ||
      t.startsWith('blob:')
    ) return url;
    const clean = t.replace(/^\.?\//, '');
    return cdnBase + clean;
  };

  let out = html;
  const baseTag = `<base href="${cdnBase}">`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>${baseTag}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html([^>]*)>/i, (_m, attrs) => `<html${attrs}><head>${baseTag}</head>`);
  } else {
    out = baseTag + out;
  }

  out = out
    .replace(/\b(href|src)\s*=\s*(["'])([^"']+)\2/gi,
      (_m, attr, q, url) => `${attr}=${q}${rewriteUrl(url)}${q}`)
    .replace(/\bsrcset\s*=\s*(["'])([^"']+)\1/gi,
      (_m, q, val) => {
        const out2 = val.split(',').map(part => {
          const [u, ...rest] = part.trim().split(/\s+/);
          return [rewriteUrl(u), ...rest].join(' ');
        }).join(', ');
        return `srcset=${q}${out2}${q}`;
      });

  return out;
}
