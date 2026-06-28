// Returns a safe list of team members (name + email) for the assignee dropdown.
// Available to any authenticated user — no admin role required.
import fetch from 'node-fetch';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const siteUrl = process.env.URL || `https://${process.env.SITE_NAME}.netlify.app`;
  const token   = context.clientContext?.identity?.token;

  if (!token) return err(500, 'Identity token not available');

  try {
    const res  = await fetch(`${siteUrl}/.netlify/identity/admin/users?per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    // Return minimal, safe data only — no roles, no sensitive metadata
    const members = (data.users || [])
      .filter(u => !u.banned && u.confirmed_at)
      .map(u => ({
        email:    u.email,
        fullName: u.user_metadata?.full_name || u.email.split('@')[0],
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return ok(members);
  } catch (e) {
    return err(500, e.message);
  }
};
