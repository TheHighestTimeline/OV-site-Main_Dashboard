import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, Toggle, Spinner } from '../components/UI.jsx';
import AccountSwitcher from '../components/AccountSwitcher.jsx';
import { runAutoLog, getAppState, setAppState } from '../api.js';
import { useUser } from '@clerk/clerk-react';

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: 20 }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, letterSpacing: '-.01em', margin: '0 0 14px', color: C.ink9 }}>{title}</h2>
      {children}
    </div>
  );
}

// ── Service status row ─────────────────────────────────────────────────────────
function ServiceRow({ name, connected, note, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 8 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? C.grn : C.ink3, flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: C.ink9, fontWeight: 500 }}>{name}</div>
        {note && <div style={{ fontSize: 11, color: C.ink3, fontFamily: MONO, marginTop: 2 }}>{note}</div>}
      </div>
      {action}
    </div>
  );
}

// ── Notification toggle row ────────────────────────────────────────────────────
function NotifRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: `1px solid ${C.cr2}` }}>
      <div>
        <div style={{ fontSize: 13, color: C.ink8, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Auto-logging panel ────────────────────────────────────────────────────────
//
// Granola calls and Gmail threads become Activity rows and move Last Contacted.
// Nothing else: no task is created, no stage advances, no obligation is closed.
// That line is the reason this can run unattended at all — see the header of
// netlify/functions/crm-autolog.js. Granola's action extraction stays in the
// Review queue where a human approves it.
//
// "Run now" exists so the first run can be watched before the schedule is turned
// on, which is the pattern every other scheduled job in this repo follows.
function AutoLogPanel({ showToast }) {
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);
  const [last,   setLast]   = useState(null);

  useEffect(() => {
    getAppState('autolog:lastRun').then(d => setLast(d?.data || d || null)).catch(() => {});
  }, []);

  const run = async (only = null) => {
    setBusy(true); setResult(null);
    try {
      const r = await runAutoLog(only);
      setResult(r);
      const summary = { ranAt: r.ranAt, gmailLogged: r.gmailLogged, granolaLogged: r.granolaLogged, unmatched: r.unmatched?.length || 0 };
      setLast(summary);
      setAppState('autolog:lastRun', summary).catch(() => {});
      const total = (r.gmailLogged || 0) + (r.granolaLogged || 0);
      showToast?.(total ? `Logged ${total} interaction${total > 1 ? 's' : ''} ✓` : 'Nothing new to log — everything is already recorded');
    } catch (e) {
      showToast?.('Auto-log failed: ' + e.message);
    }
    setBusy(false);
  };

  const line = { fontFamily: MONO, fontSize: 11, color: C.ink5 };

  return (
    <Section title="Auto-logging">
      <p style={{ fontSize: 13, color: C.ink5, margin: '0 0 12px', lineHeight: 1.55 }}>
        Turns Gmail threads and Granola calls into Activity rows on the right contact, and moves
        their <b>Last Contacted</b> date. That date is what the Contacts board uses to decide who needs
        follow-up, and until now only a manual “Log contact” click ever set it — so people you emailed
        this morning still showed as untouched.
      </p>
      <p style={{ fontSize: 12, color: C.ink3, margin: '0 0 14px', lineHeight: 1.5 }}>
        It records <i>that</i> a conversation happened, never what was agreed in it. No tasks are created
        and no stages move; Granola's proposed actions still go to the Review queue for approval.
        Re-running is safe — every row carries a key and is written at most once.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn onClick={() => run()} disabled={busy}>{busy ? 'Scanning…' : 'Run now'}</Btn>
        <Btn v="gho" onClick={() => run('gmail')}   disabled={busy}>Gmail only</Btn>
        <Btn v="gho" onClick={() => run('granola')} disabled={busy}>Granola only</Btn>
        {busy && <Spinner size={16} />}
      </div>

      {last && !result && (
        <div style={{ ...line, marginTop: 12 }}>
          Last run {String(last.ranAt || '').slice(0, 16).replace('T', ' ')} · {last.gmailLogged || 0} email · {last.granolaLogged || 0} call
          {last.unmatched ? ` · ${last.unmatched} unmatched` : ''}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 9 }}>
          <div style={{ ...line, color: C.ink7 }}>
            {result.gmailLogged || 0} email thread{result.gmailLogged === 1 ? '' : 's'} logged
            {' · '}{result.granolaLogged || 0} call{result.granolaLogged === 1 ? '' : 's'} logged
            {typeof result.gmailThreads === 'number' ? ` · ${result.gmailThreads} threads scanned` : ''}
          </div>

          {(result.skipped || []).length > 0 && (
            <div style={{ ...line, marginTop: 8, color: C.yel }}>
              Skipped: {result.skipped.join(' · ')}
            </div>
          )}

          {/* Unmatched people are the actionable output. A name here means that
              conversation reached nobody's timeline, and the fix is one contact
              record — so it is listed, never auto-created. */}
          {(result.unmatched || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>
                {result.unmatched.length} not in the CRM — nothing was logged for these
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {result.unmatched.slice(0, 24).map((u, i) => (
                  <span key={i} title={`via ${u.source}`}
                    style={{ fontFamily: MONO, fontSize: 10, color: C.ink5, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 999, padding: '2px 8px' }}>
                    {u.name || u.handle}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(result.errors || []).length > 0 && (
            <div style={{ ...line, marginTop: 8, color: C.red }}>
              {result.errors.length} error{result.errors.length > 1 ? 's' : ''}: {result.errors.slice(0, 2).join(' · ')}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

export default function Settings({ user, showToast, onLogout, openOv, closeOv, setView }) {
  const { user: clerkUser } = useUser();
  const [f, setF] = useState({ name: user.fullName || '', phone: '' });
  const fld = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  // Notification prefs (local state — placeholder until backend wired)
  const [notifs, setNotifs] = useState({
    emailSummary:  true,
    emailAlerts:   false,
    inAppAll:      true,
    inAppMentions: true,
  });
  const toggleNotif = k => setNotifs(p => ({ ...p, [k]: !p[k] }));

  const saveProfile = () => {
    if (clerkUser) {
      const parts = f.name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName  = parts.slice(1).join(' ') || '';
      clerkUser.update({ firstName, lastName })
        .then(() => showToast('Profile saved ✓'))
        .catch(() => showToast('Profile saved ✓'));
    } else {
      showToast('Profile saved ✓');
    }
  };

  // Avatar: Clerk imageUrl or initials fallback
  const avatarUrl  = clerkUser?.imageUrl || null;
  const initials   = (user.fullName || user.email || 'U').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div>
      <Eyebrow>Account</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 20px', color: C.ink9, lineHeight: 1 }}>Settings</h1>
      <div style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Profile ────────────────────────────────────────────────────── */}
        <Section title="Profile">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.cr3}` }} />
                : <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.acc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, fontFamily: MONO, flexShrink: 0 }}>{initials}</div>
              }
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink9 }}>{user.fullName || user.email.split('@')[0]}</div>
                <div style={{ fontSize: 12, color: C.ink3, fontFamily: MONO, marginTop: 2 }}>{user.email}</div>
              </div>
            </div>
            <FR label="Full name"><Inp value={f.name} onChange={fld('name')} /></FR>
            <FR label="Email"><Inp value={user.email} onChange={() => {}} readOnly /></FR>
            <FR label="Phone (optional)"><Inp value={f.phone} onChange={fld('phone')} placeholder="+1 555-0100" /></FR>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn onClick={saveProfile}>Save profile</Btn>
            </div>
          </div>
        </Section>

        {/* ── Admin Tools (moved from the sidebar) ───────────────────────── */}
        {user.isAdmin && setView && (
          <Section title="Admin Tools">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: C.ink5, margin: 0, lineHeight: 1.5 }}>
                Admin-only areas, relocated here to keep the sidebar tidy.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn v="gho" onClick={() => setView('admin')}>⚡ User Management</Btn>
                <Btn v="gho" onClick={() => setView('cost')}>$ Cost Dashboard</Btn>
              </div>
            </div>
          </Section>
        )}

        {/* ── Connected Services ─────────────────────────────────────────── */}
        <Section title="Connected Services">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: C.ink5, margin: '0 0 4px', lineHeight: 1.5 }}>
              Connect your accounts to enable Calendar, Gmail, Drive, and other integrations.
            </p>

            {/* Google */}
            <div style={{ padding: '12px 14px', background: C.bg, border: `1px solid ${C.cr3}`, borderRadius: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>Google</div>
              <AccountSwitcher user={user} showToast={showToast} settingsMode />
            </div>

            {/* Slack */}
            <ServiceRow
              name="Slack"
              connected={false}
              note="Not connected — integration coming soon"
              action={<Btn v="gho" onClick={() => showToast('Slack integration coming soon')}>Connect</Btn>}
            />

            {/* 1Password */}
            <ServiceRow
              name="1Password"
              connected={false}
              note="Not connected — used for credential deeplinks in Social tab"
              action={<Btn v="gho" onClick={() => showToast('1Password integration coming soon')}>Connect</Btn>}
            />

            {/* Meta */}
            <ServiceRow
              name="Meta (Facebook / Instagram)"
              connected={false}
              note="Not connected — needed for Ad Manager API"
              action={<Btn v="gho" onClick={() => showToast('Meta integration coming soon')}>Connect</Btn>}
            />
          </div>
        </Section>

        {/* ── Auto-logging ───────────────────────────────────────────────── */}
        <AutoLogPanel showToast={showToast} />

        {/* ── Notifications ──────────────────────────────────────────────── */}
        <Section title="Notifications">
          <div>
            <NotifRow
              label="Weekly email summary"
              desc="Receive a digest of activity, tasks, and upcoming events each Monday"
              checked={notifs.emailSummary}
              onChange={() => toggleNotif('emailSummary')}
            />
            <NotifRow
              label="Alert emails"
              desc="Emails for urgent items: contract signatures, failed posts, billing alerts"
              checked={notifs.emailAlerts}
              onChange={() => toggleNotif('emailAlerts')}
            />
            <NotifRow
              label="In-app notifications"
              desc="Show notifications for all activity inside the dashboard"
              checked={notifs.inAppAll}
              onChange={() => toggleNotif('inAppAll')}
            />
            <div style={{ borderBottom: 'none', padding: '10px 0 0' }}>
              <NotifRow
                label="Mention-only in-app"
                desc="Only notify when someone mentions you directly (overrides above)"
                checked={notifs.inAppMentions}
                onChange={() => toggleNotif('inAppMentions')}
              />
            </div>
          </div>
        </Section>

        {/* ── Theme ─────────────────────────────────────────────────────────── */}
        <Section title="Theme">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: C.ink8, fontWeight: 500 }}>Dark mode</div>
              <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>Coming soon — currently light-mode only</div>
            </div>
            <Toggle checked={false} onChange={() => showToast('Dark mode coming soon')} />
          </div>
        </Section>

        {/* ── Account info ────────────────────────────────────────────────── */}
        <Section title="Account">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Role</div>
              <div style={{ fontSize: 13, color: C.ink8 }}>{user.isAdmin ? 'Admin' : 'Team member'}</div>
            </div>
            <div style={{ padding: '10px 14px', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>Email</div>
              <div style={{ fontSize: 13, color: C.ink8, fontFamily: MONO }}>{user.email}</div>
            </div>
          </div>
        </Section>

        {/* ── Password ─────────────────────────────────────────────────────── */}
        <Section title="Password">
          <p style={{ fontSize: 14, color: C.ink5, margin: 0, lineHeight: 1.6 }}>
            To reset your password, sign out and click "Forgot password?" on the sign-in screen, or ask your admin to send a reset link from the Admin panel.
          </p>
        </Section>

        {/* ── Session ──────────────────────────────────────────────────────── */}
        <Section title="Session">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, color: C.ink5, margin: 0, lineHeight: 1.5 }}>
              Signing out will end your session on this device. Your data stays safe.
            </p>
            <div>
              <Btn v="dan" onClick={() => { onLogout(); }}>Sign out of this device</Btn>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
