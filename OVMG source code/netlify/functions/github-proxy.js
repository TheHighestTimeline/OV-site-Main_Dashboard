// Server-side GitHub API proxy.
//
// The dashboard frontend calls this function instead of hitting api.github.com
// directly so the GITHUB_TOKEN env var stays server-side (never shipped to the
// browser). All requests require a valid Clerk session.
//
// Required Netlify env vars:
//   GITHUB_TOKEN — a fine-grained or classic PAT with repo:read (+ repo:write
//                  if you intend to use the createBranch / openPR / mergeBranch
//                  actions)
//
// Request shape (POST /.netlify/functions/github-proxy):
//   { action: 'listBranches',  repo: 'owner/name' }
//   { action: 'getBranch',     repo: 'owner/name', branch: 'main' }
//   { action: 'getFile',       repo: 'owner/name', ref: 'main', path: 'index.html' }
//   { action: 'listTree',      repo: 'owner/name', ref: 'main', recursive: true }
//   { action: 'getCommitDiff', repo: 'owner/name', sha: 'abc123' }
//   { action: 'createBranch',  repo: 'owner/name', fromBranch: 'main', newBranch: 'feature-x' }
//   { action: 'detectSiteType', repo: 'owner/name', ref: 'main' }
//   { action: 'mergeBranch',   repo: 'owner/name', head: 'feature-x', base: 'main' }
//   { action: 'compareCommits', repo: 'owner/name', base: 'main', head: 'feature-x' }

import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const GH_API = 'https://api.github.com';

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured on server');
  const res = await fetch(`${GH_API}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function listBranches(repo) {
  const branches = await gh(`/repos/${repo}/branches?per_page=100`);
  return branches.map(b => ({
    name:      b.name,
    sha:       b.commit?.sha || null,
    protected: !!b.protected,
  }));
}

async function getBranch(repo, branch) {
  const data = await gh(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
  return {
    name:           data.name,
    sha:            data.commit?.sha,
    commitMessage:  data.commit?.commit?.message || '',
    commitAuthor:   data.commit?.commit?.author?.name || '',
    commitDate:     data.commit?.commit?.author?.date || null,
  };
}

async function getFile(repo, ref, path) {
  const data = await gh(`/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
  if (data.type !== 'file') throw new Error(`Path ${path} is not a file`);
  const content = data.content
    ? Buffer.from(data.content, 'base64').toString('utf8')
    : '';
  return {
    path:     data.path,
    sha:      data.sha,
    size:     data.size,
    download: data.download_url,
    content,
  };
}

async function listTree(repo, ref, recursive) {
  const branch = await gh(`/repos/${repo}/branches/${encodeURIComponent(ref)}`);
  const treeSha = branch.commit?.commit?.tree?.sha;
  if (!treeSha) throw new Error('Could not resolve tree SHA');
  const tree = await gh(`/repos/${repo}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`);
  return {
    sha:       tree.sha,
    truncated: !!tree.truncated,
    files:     (tree.tree || []).map(n => ({
      path: n.path,
      type: n.type,
      size: n.size,
      sha:  n.sha,
    })),
  };
}

async function getCommitDiff(repo, sha) {
  const data = await gh(`/repos/${repo}/commits/${encodeURIComponent(sha)}`);
  return {
    sha,
    message: data.commit?.message || '',
    files:   (data.files || []).map(f => ({
      filename:  f.filename,
      status:    f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

async function createBranch(repo, fromBranch, newBranch) {
  const src = await gh(`/repos/${repo}/branches/${encodeURIComponent(fromBranch)}`);
  const sha = src.commit?.sha;
  if (!sha) throw new Error(`Could not resolve tip of ${fromBranch}`);

  const created = await gh(`/repos/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  return { name: newBranch, sha: created.object?.sha };
}

// detectSiteType — inspects netlify.toml + package.json to determine if the
// site needs a Netlify build. Returns 'static' | 'static-with-functions' |
// 'built'.
async function detectSiteType(repo, ref) {
  let netlifyToml = '';
  let pkg = null;
  let hasFunctionsDir = false;

  try {
    const f = await getFile(repo, ref, 'netlify.toml');
    netlifyToml = f.content || '';
  } catch { /* ignore — toml not required */ }

  try {
    const f = await getFile(repo, ref, 'package.json');
    pkg = JSON.parse(f.content || '{}');
  } catch { /* ignore — package.json not required */ }

  try {
    const tree = await listTree(repo, ref, true);
    hasFunctionsDir = (tree.files || []).some(f =>
      f.path.startsWith('netlify/functions/') && f.type === 'blob',
    );
  } catch { /* ignore */ }

  // Look for an explicit build command in netlify.toml or package.json.
  // A non-empty build.command in netlify.toml = built site.
  const buildCmdMatch = netlifyToml.match(/\[build\][^\[]*?\bcommand\s*=\s*['"]([^'"]+)['"]/);
  const hasBuildCmd = !!(buildCmdMatch && buildCmdMatch[1].trim());

  const pkgBuild = pkg?.scripts?.build || '';
  const hasPkgBuild = !!pkgBuild.trim();

  if (hasBuildCmd || hasPkgBuild) {
    return { type: 'built', hasFunctions: hasFunctionsDir, reason: hasBuildCmd ? 'netlify.toml build.command' : 'package.json scripts.build' };
  }
  if (hasFunctionsDir) {
    return { type: 'static-with-functions', hasFunctions: true, reason: 'netlify/functions/ exists, no build step' };
  }
  return { type: 'static', hasFunctions: false, reason: 'no build step, no functions' };
}

async function compareCommits(repo, base, head) {
  // GitHub's compare endpoint: returns ahead_by / behind_by / files changed.
  const data = await gh(`/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  return {
    aheadBy:    data.ahead_by,
    behindBy:   data.behind_by,
    totalCommits: data.total_commits,
    files: (data.files || []).map(f => ({
      filename:  f.filename,
      status:    f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

async function mergeBranch(repo, head, base) {
  // Use the merging endpoint (creates a merge commit on base).
  // GitHub PR-and-merge would be cleaner but requires more roundtrips; this
  // is a single API call. 201 = merged. 204 = already up to date. 409 = conflict
  // (caught by gh() throwing).
  const data = await gh(`/repos/${repo}/merges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base,
      head,
      commit_message: `Merge ${head} into ${base} (via OVMG Dashboard)`,
    }),
  });
  return {
    sha:     data?.sha || null,
    merged:  !!data?.sha,
    message: data?.commit?.message || (data ? 'merged' : 'already up to date'),
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const {
    action, repo, branch, ref, path, recursive, sha, fromBranch, newBranch, base, head,
  } = body;
  if (!action) return err(400, 'Missing action');

  try {
    switch (action) {
      case 'listBranches':
        if (!repo) return err(400, 'Missing repo');
        return ok({ branches: await listBranches(repo) });

      case 'getBranch':
        if (!repo || !branch) return err(400, 'Missing repo/branch');
        return ok({ branch: await getBranch(repo, branch) });

      case 'getFile':
        if (!repo || !ref || !path) return err(400, 'Missing repo/ref/path');
        return ok({ file: await getFile(repo, ref, path) });

      case 'listTree':
        if (!repo || !ref) return err(400, 'Missing repo/ref');
        return ok({ tree: await listTree(repo, ref, !!recursive) });

      case 'getCommitDiff':
        if (!repo || !sha) return err(400, 'Missing repo/sha');
        return ok({ diff: await getCommitDiff(repo, sha) });

      case 'createBranch':
        if (!repo || !fromBranch || !newBranch) return err(400, 'Missing repo/fromBranch/newBranch');
        return ok({ branch: await createBranch(repo, fromBranch, newBranch) });

      case 'detectSiteType':
        if (!repo || !ref) return err(400, 'Missing repo/ref');
        return ok({ detection: await detectSiteType(repo, ref) });

      case 'compareCommits':
        if (!repo || !base || !head) return err(400, 'Missing repo/base/head');
        return ok({ comparison: await compareCommits(repo, base, head) });

      case 'mergeBranch':
        if (!repo || !head || !base) return err(400, 'Missing repo/head/base');
        return ok({ merge: await mergeBranch(repo, head, base) });

      default:
        return err(400, `Unknown action: ${action}`);
    }
  } catch (e) {
    console.error('[github-proxy]', action, e.message);
    return err(500, e.message);
  }
};
