// Bug report (2026-07 audit §2.4). Employees fill out an in-app form; this
// emails the full details (plus auto-captured context: view, user, device,
// recent console errors) to the owner. Env: BUG_REPORT_TO (defaults to
// tanner@onevibemediagroup.com). Sends via the shared Gmail system account.
import { gmail } from './_gmail.js';
import { requireAuth, getUser } from './_auth.js';
import { CORS, ok, err } from './_http.js';

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const user = await getUser(event);
    const { title, description, severity, view, userAgent, screen, recentErrors } = JSON.parse(event.body || '{}');
    if (!title) return err(400, 'title is required');

    const to       = process.env.BUG_REPORT_TO || 'tanner@onevibemediagroup.com';
    const fromAddr = process.env.GMAIL_SENDER || 'nathan@onevibemediagroup.com';
    const subject  = `[Dashboard bug] ${severity ? `(${severity}) ` : ''}${title}`;

    const body = `
      <h2 style="margin:0 0 12px">${esc(title)}</h2>
      <p style="white-space:pre-wrap">${esc(description)}</p>
      <hr>
      <table style="font-size:13px;color:#444">
        <tr><td><b>Reported by</b></td><td>${esc(user?.fullName)} &lt;${esc(user?.email)}&gt;</td></tr>
        <tr><td><b>Severity</b></td><td>${esc(severity || 'unspecified')}</td></tr>
        <tr><td><b>View</b></td><td>${esc(view)}</td></tr>
        <tr><td><b>Device</b></td><td>${esc(userAgent)} · ${esc(screen)}</td></tr>
        <tr><td><b>Time</b></td><td>${new Date().toISOString()}</td></tr>
      </table>
      ${Array.isArray(recentErrors) && recentErrors.length ? `
        <h3 style="margin:16px 0 6px">Recent console errors</h3>
        <pre style="font-size:11px;background:#f5f5f5;padding:10px;border-radius:6px;white-space:pre-wrap">${esc(recentErrors.slice(-10).join('\n\n'))}</pre>` : ''}
    `;

    const raw = Buffer.from([
      'MIME-Version: 1.0',
      `To: ${to}`,
      `From: ${fromAddr}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `X-Sent-By: ${user?.email || ''}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      body,
    ].join('\r\n')).toString('base64url');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return ok({ sent: true });
  } catch (e) {
    console.error('bug-report error:', e);
    return err(500, e.message);
  }
};
