// Server-side Netlify API proxy.
//
// Used by the Websites tab for Path B (branch deploy preview) operations and
// for triggering a production deploy after merging a branch to main.
//
// Required Netlify env vars:
//   NETLIFY_API_TOKEN — a Netlify personal access token with read access to
//                        the team's sites (write access if using triggerBuild)
//
// Request shape (POST /.netlify/functions/netlify-proxy):
//   { action: 'getBranchDeploy',  siteId: 'ovmgdashboard', branch: 'feature-x' }
//   { action: 'triggerBuild',     siteId: 'ovmgdashboard', branch: 'feature-x' }
//   { action: 'listSiteDeploys',  siteId: 'ovmgdashboard', limit: 5 }
//   { action: 'getSiteInfo',      siteId: 'ovmgdashboard' }

import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

const NL_API = 'https://api.netlify.com/api/v1';

async function nl(path, opts = {}) {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) throw new Error('NETLIFY_API_TOKEN not configured on server');
  const res = await fetch(`${NL_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Netlify API ${res.status}: ${body.slice(0, 200)}`);
  }
  // Some endpoints return 204 / empty body.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function getSiteInfo(siteId) {
  const d = await nl(`/sites/${encodeURIComponent(siteId)}`);
  return {
    id:           d.id,
    name:         d.name,
    url:          d.url,
    adminUrl:     d.admin_url,
    repoUrl:      d.build_settings?.repo_url,
    repoBranch:   d.build_settings?.repo_branch,
    publishDir:   d.build_settings?.dir,
    buildCmd:     d.build_settings?.cmd,
  };
}

async function listSiteDeploys(siteId, limit = 5) {
  const deploys = await nl(
    `/sites/${encodeURIComponent(siteId)}/deploys?per_page=${limit}`,
  );
  return deploys.map(d => ({
    id:           d.id,
    state:        d.state,        // 'ready' | 'building' | 'enqueued' | 'error' | ...
    branch:       d.branch,
    context:      d.context,      // 'production' | 'deploy-preview' | 'branch-deploy'
    createdAt:    d.created_at,
    deployUrl:    d.deploy_url,   // unique per-deploy URL
    sslUrl:       d.ssl_url,      // pretty branch URL (for branch-deploy)
    commitRef:    d.commit_ref,
    commitMsg:    d.title || d.commit_message,
    errorMessage: d.error_message,
  }));
}

async function getBranchDeploy(siteId, branch) {
  // Find the most recent deploy for the given branch.
  // We grab the most recent 20 deploys and find the latest one matching the branch.
  const deploys = await listSiteDeploys(siteId, 20);
  const match = deploys.find(d => d.branch === branch);
  return match || null;
}

async function triggerBuild(siteId, branch) {
  // POST /sites/{site_id}/builds with the branch in the body triggers a build.
  // Netlify uses the branch's HEAD commit.
  const data = await nl(`/sites/${encodeURIComponent(siteId)}/builds`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  });
  return {
    id:       data.id,
    deployId: data.deploy_id,
    state:    data.state,
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

  const { action, siteId, branch, limit } = body;
  if (!action) return err(400, 'Missing action');
  if (!siteId) return err(400, 'Missing siteId');

  try {
    switch (action) {
      case 'getSiteInfo':
        return ok({ site: await getSiteInfo(siteId) });

      case 'listSiteDeploys':
        return ok({ deploys: await listSiteDeploys(siteId, limit || 5) });

      case 'getBranchDeploy':
        if (!branch) return err(400, 'Missing branch');
        return ok({ deploy: await getBranchDeploy(siteId, branch) });

      case 'triggerBuild':
        if (!branch) return err(400, 'Missing branch');
        return ok({ build: await triggerBuild(siteId, branch) });

      default:
        return err(400, `Unknown action: ${action}`);
    }
  } catch (e) {
    console.error('[netlify-proxy]', action, e.message);
    return err(500, e.message);
  }
};
