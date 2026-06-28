import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Tag, Eyebrow, Btn, Inp, FR, Toggle, Spinner } from '../components/UI.jsx';
import ToolOverridesPanel from '../components/ToolOverridesPanel.jsx';
import { listUsers, inviteUser, resetUserPassword, updateUser, updateUserRoles, listAuditLog } from '../api.js';
import { ROLES, COMPANY_META } from '../constants/roles.js';

const ROLE_LIST = Object.entries(ROLES).map(([id, meta]) => ({ id, ...meta }));

// Small role-tag component
function RoleTag({ roleId }) {
  const colors = {
    admin:      { bg: C.redS,  fg: C.red  },
    executive:  { bg: C.accS,  fg: C.acc  },
    operations: { bg: C.bluS,  fg: C.blu  },
    sales:      { bg: C.grnS,  fg: C.grn  },
    finance:    { bg: C.yelS,  fg: C.yel  },
  };
  const c = colors[roleId] || { bg: C.grS, fg: C.ink5 };
  const label = ROLES[roleId]?.label || roleId;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 10, fontFamily: MONO, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </span>
  );
}

// Multi-select checkboxes for roles
function RoleCheckboxes({ selected, onChange, disabled = [] }) {
  const toggle = id => {
    if (selected.includes(id)) onChange(selected.filter(r => r !== id));
    else onChange([...selected, id]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ROLE_LIST.map(r => (
        <label key={r.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
          border: `1.5px solid ${selected.includes(r.id) ? C.acc : C.cr3}`,
          borderRadius: 8, background: selected.includes(r.id) ? C.acc + '12' : C.bg,
          cursor: disabled.includes(r.id) ? 'not-allowed' : 'pointer', opacity: disabled.includes(r.id) ? 0.5 : 1,
          transition: 'all .15s',
        }}>
          <input
            type="checkbox"
            checked={selected.includes(r.id)}
            onChange={() => !disabled.includes(r.id) && toggle(r.id)}
            style={{ marginTop: 2, accentColor: C.acc, cursor: 'pointer' }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: selected.includes(r.id) ? C.acc : C.ink9 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{r.desc}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

// ── Company access checkbox group ─────────────────────────────────────────────
// Derived from COMPANY_META so the ids ALWAYS match the slugs canAccess checks.
// (The old hardcoded list used ids like 'ovm'/'fest'/'group' that didn't match
//  the real slugs ovmg/ovm/ovtv/ovf/…, so grants silently gated nothing.)
const COMPANY_FULL_NAMES = {
  ovmg: 'OneVibe Media Group',
  ovm:  'OneVibe Media',
  ovd:  'OneVibe Data',
};
const COMPANIES = Object.entries(COMPANY_META).map(([id, m]) => ({
  id,
  label: COMPANY_FULL_NAMES[id] ? `${COMPANY_FULL_NAMES[id]} (${m.label})` : m.label,
}));

function CompanyAccess({ access, onChange }) {
  // access = { [companyId]: { read: bool, write: bool } }
  const toggle = (cid, perm) => {
    const cur = access[cid] || { read: false, write: false };
    const next = { ...cur, [perm]: !cur[perm] };
    // if write enabled, ensure read is also enabled
    if (perm === 'write' && next.write) next.read = true;
    onChange({ ...access, [cid]: next });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {COMPANIES.map(c => {
        const perms = access[c.id] || { read: false, write: false };
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.bg2, borderRadius: 7, border: `1px solid ${C.cr3}` }}>
            <div style={{ flex: 1, fontSize: 13, color: C.ink8 }}>{c.label}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: C.ink5, fontFamily: MONO }}>
              <input type="checkbox" checked={perms.read} onChange={() => toggle(c.id, 'read')} style={{ accentColor: C.acc }} />
              Read
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: C.ink5, fontFamily: MONO }}>
              <input type="checkbox" checked={perms.write} onChange={() => toggle(c.id, 'write')} style={{ accentColor: C.acc }} />
              Write
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ u }) {
  if (u.banned) return <Tag bg={C.redS} fg={C.red}>Deactivated</Tag>;
  if (!u.confirmedAt) return <Tag bg={C.yelS} fg={C.yel}>Invited</Tag>;
  return <Tag bg={C.grnS} fg={C.grn}>Active</Tag>;
}

// ── Audit log action badge ─────────────────────────────────────────────────────
function ActionBadge({ action }) {
  const colorMap = {
    'role.change':   { bg: C.yelS, fg: C.yel },
    'user.invite':   { bg: C.bluS, fg: C.blu },
    'user.ban':      { bg: C.redS, fg: C.red },
    'user.unban':    { bg: C.grnS, fg: C.grn },
    'post.create':   { bg: C.accS, fg: C.acc },
    'post.approve':  { bg: C.grnS, fg: C.grn },
    'post.reject':   { bg: C.redS, fg: C.red },
  };
  const c = colorMap[action] || { bg: C.grS, fg: C.ink5 };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 10, fontFamily: MONO, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>
      {action}
    </span>
  );
}

export default function Admin({ user, showToast, openOv, closeOv }) {
  const [subTab, setSubTab] = useState('users'); // users | audit
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // Audit log state
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter,  setAuditFilter]  = useState({ user: '', entity: '' });

  if (!user.isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.ink3, fontSize: 13 }}>
        Admin access required. Contact your administrator.
      </div>
    );
  }

  const load = () => {
    setLoading(true);
    listUsers()
      .then(setUsers)
      .catch(e => showToast('Could not load users: ' + e.message))
      .finally(() => setLoading(false));
  };

  const loadAudit = () => {
    setAuditLoading(true);
    const params = {};
    if (auditFilter.user)   params.actor  = auditFilter.user;
    if (auditFilter.entity) params.action = auditFilter.entity;
    listAuditLog(params)
      .then(d => setAuditEntries(d.entries || []))
      .catch(e => showToast('Audit log failed: ' + e.message))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (subTab === 'audit') loadAudit(); }, [subTab, auditFilter]);

  // ── Invite form ─────────────────────────────────────────────────────────────
  function IForm() {
    const [email,   setEmail]   = useState('');
    const [name,    setName]    = useState('');
    const [roles,   setRoles]   = useState([]);
    const [access,  setAccess]  = useState({});
    const [sending, setSending] = useState(false);

    const isOvmg = email.endsWith('@onevibemediagroup.com');

    const send = async () => {
      if (!email.includes('@')) { showToast('Valid email required'); return; }
      if (!isOvmg && roles.length === 0) {
        showToast('External users must be assigned at least one role');
        return;
      }
      setSending(true);
      try {
        await inviteUser({ email, name, roles, companyAccess: access });
        showToast(`Invitation sent to ${email} ✓`);
        closeOv();
        load();
      } catch (e) {
        showToast('Invite failed: ' + e.message);
      }
      setSending(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FR label="Email *">
          <Inp value={email} onChange={e => setEmail(e.target.value)} placeholder="name@domain.com" />
        </FR>
        {email && !isOvmg && (
          <p style={{ fontSize: 12, color: C.acc, margin: 0 }}>External email — must assign at least one role below.</p>
        )}
        <FR label="Full name">
          <Inp value={name} onChange={e => setName(e.target.value)} placeholder="Jordan Smith" />
        </FR>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 8 }}>Roles</div>
          <RoleCheckboxes selected={roles} onChange={setRoles} />
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 8 }}>Company Access</div>
          <CompanyAccess access={access} onChange={setAccess} />
        </div>
        <p style={{ fontSize: 12, color: C.ink3, margin: 0, lineHeight: 1.5 }}>
          They'll receive a Clerk invitation email to set their password and sign in.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send invitation'}</Btn>
        </div>
      </div>
    );
  }

  // ── Manage roles modal ──────────────────────────────────────────────────────
  function RolesModal({ u }) {
    const [roles,  setRoles]  = useState(u.roles || []);
    const [saving, setSaving] = useState(false);

    const save = async () => {
      setSaving(true);
      try {
        await updateUserRoles(u.id, roles);
        showToast(`Roles updated for ${u.email} ✓`);
        closeOv();
        load();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setSaving(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: C.bg2, borderRadius: 8, fontSize: 13, color: C.ink7 }}>
          <strong>{u.fullName || u.email}</strong> — {u.email}
        </div>
        <RoleCheckboxes selected={roles} onChange={setRoles} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save roles'}</Btn>
        </div>
      </div>
    );
  }

  // ── Company access modal ────────────────────────────────────────────────────
  function AccessModal({ u }) {
    // Build initial access from user metadata if available
    const init = u.publicMetadata?.companyAccess || {};
    const [access, setAccess] = useState(init);
    const [saving, setSaving] = useState(false);

    const save = async () => {
      setSaving(true);
      try {
        await updateUser(u.id, { publicMetadata: { ...u.publicMetadata, companyAccess: access } });
        showToast(`Company access updated for ${u.email} ✓`);
        closeOv();
        load();
      } catch (e) {
        showToast('Failed: ' + e.message);
      }
      setSaving(false);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: C.bg2, borderRadius: 8, fontSize: 13, color: C.ink7 }}>
          <strong>{u.fullName || u.email}</strong>
        </div>
        <CompanyAccess access={access} onChange={setAccess} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn v="gho" onClick={closeOv}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save access'}</Btn>
        </div>
      </div>
    );
  }

  // ── Tool access overrides drawer ────────────────────────────────────────────
  function ToolAccessModal({ u }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: C.bg2, borderRadius: 8, fontSize: 13, color: C.ink7 }}>
          <strong>{u.fullName || u.email}</strong> — {u.email}
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10, color: C.ink5, letterSpacing: '.05em' }}>
            Roles: {(u.roles || []).join(', ') || '(none)'}
          </div>
        </div>
        <ToolOverridesPanel
          targetUser={u}
          showToast={showToast}
          onUpdated={() => load()}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn v="gho" onClick={closeOv}>Close</Btn>
        </div>
      </div>
    );
  }

  // ── Reset password ──────────────────────────────────────────────────────────
  const handleReset = async (u) => {
    if (!confirm(`Generate a one-time sign-in link for ${u.email}?`)) return;
    try {
      const res = await resetUserPassword(u.id);
      if (res.signInUrl) {
        prompt(`Share this link with ${u.email} (expires in 1 hour):`, res.signInUrl);
      } else {
        showToast(`Sign-in link generated for ${u.email} ✓`);
      }
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  };

  const handleBan = async (u) => {
    const action = u.banned ? 'reactivate' : 'deactivate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${u.email}?`)) return;
    try {
      await updateUser(u.id, { banned: !u.banned });
      showToast(`${u.email} ${u.banned ? 'reactivated' : 'deactivated'} ✓`);
      load();
    } catch (e) {
      showToast('Failed: ' + e.message);
    }
  };

  // Filtered user list
  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q);
  });

  // ── Users tab ──────────────────────────────────────────────────────────────
  const UsersTab = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{ flex: 1, background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, outline: 'none', maxWidth: 320 }}
        />
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, letterSpacing: '.06em' }}>
          {filteredUsers.length} USER{filteredUsers.length !== 1 ? 'S' : ''}
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr 1fr auto', gap: 10, padding: '6px 18px', marginBottom: 4 }}>
        {['Name', 'Email', 'Roles', 'Companies', 'Last Seen', 'Status', ''].map((h, i) => (
          <div key={i} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>{h}</div>
        ))}
      </div>

      {loading
        ? <div style={{ padding: 32, textAlign: 'center', color: C.ink3 }}><Spinner /></div>
        : filteredUsers.length === 0
          ? <div style={{ padding: 48, textAlign: 'center', color: C.ink3, fontSize: 13 }}>No users found.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredUsers.map(u => {
                const overrideCount = Object.keys(u.toolOverrides || {}).length;
                const companyAccess = u.publicMetadata?.companyAccess || {};
                const accessedCompanies = COMPANIES.filter(c => companyAccess[c.id]?.read || companyAccess[c.id]?.write);
                return (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, padding: '12px 18px' }}>
                    {/* Name */}
                    <div>
                      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 14, color: C.ink9 }}>{u.fullName || u.email.split('@')[0]}</div>
                      {overrideCount > 0 && <Tag bg={C.accS} fg={C.acc}>{overrideCount} override{overrideCount !== 1 ? 's' : ''}</Tag>}
                    </div>
                    {/* Email */}
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                    {/* Roles */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(u.roles || []).length > 0
                        ? u.roles.map(r => <RoleTag key={r} roleId={r} />)
                        : <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>None</span>}
                    </div>
                    {/* Companies */}
                    <div style={{ fontSize: 11, color: C.ink5, fontFamily: MONO }}>
                      {accessedCompanies.length > 0
                        ? accessedCompanies.map(c => c.label.split(' ')[0]).join(', ')
                        : <span style={{ color: C.ink3 }}>—</span>}
                    </div>
                    {/* Last seen */}
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{fmtR(u.lastSignInAt)}</div>
                    {/* Status */}
                    <div><StatusBadge u={u} /></div>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Btn v="gho" sx={{ fontSize: 11, padding: '5px 10px' }} onClick={() => openOv({ kind: 'modal', title: `Roles — ${u.email}`, body: <RolesModal u={u} /> })}>Roles</Btn>
                      <Btn v="gho" sx={{ fontSize: 11, padding: '5px 10px' }} onClick={() => openOv({ kind: 'modal', title: `Company access — ${u.email}`, body: <AccessModal u={u} /> })}>Access</Btn>
                      <Btn v="gho" sx={{ fontSize: 11, padding: '5px 10px' }} onClick={() => openOv({ kind: 'drawer', title: `Tool access — ${u.email}`, body: <ToolAccessModal u={u} /> })}>Tools</Btn>
                      <Btn v="gho" sx={{ fontSize: 11, padding: '5px 10px' }} onClick={() => handleReset(u)}>Link</Btn>
                      <Btn v={u.banned ? 'gho' : 'dan'} sx={{ fontSize: 11, padding: '5px 10px' }} onClick={() => handleBan(u)}>
                        {u.banned ? 'Reactivate' : 'Deactivate'}
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </>
  );

  // ── Audit log tab ───────────────────────────────────────────────────────────
  const AuditTab = () => (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={auditFilter.user}
          onChange={e => setAuditFilter(p => ({ ...p, user: e.target.value }))}
          placeholder="Filter by user ID…"
          style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8, outline: 'none', width: 220 }}
        />
        <select
          value={auditFilter.entity}
          onChange={e => setAuditFilter(p => ({ ...p, entity: e.target.value }))}
          style={{ background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 8, padding: '8px 12px', fontFamily: SANS, fontSize: 13, color: C.ink8 }}
        >
          <option value="">All actions</option>
          <option value="role.change">role.change</option>
          <option value="user.invite">user.invite</option>
          <option value="user.ban">user.ban</option>
          <option value="user.unban">user.unban</option>
          <option value="post.create">post.create</option>
          <option value="post.approve">post.approve</option>
          <option value="post.reject">post.reject</option>
        </select>
        <Btn v="gho" onClick={loadAudit}>Refresh</Btn>
      </div>

      {auditLoading
        ? <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
        : auditEntries.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: C.ink3, fontSize: 13 }}>No audit log entries found.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {auditEntries.map((e, i) => (
                <div key={e.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 10, alignItems: 'center', background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 8, padding: '10px 16px' }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>{e.occurred_at ? new Date(e.occurred_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</div>
                  <div><ActionBadge action={e.action || '—'} /></div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.actor_email || e.actor_user_id}>{e.actor_email || e.actor_user_id || '—'}</div>
                  <div style={{ fontSize: 12, color: C.ink8 }}>
                    {e.entity_type && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginRight: 8 }}>{e.entity_type}</span>}
                    {e.details ? JSON.stringify(e.details).slice(0, 80) : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Eyebrow>Admin</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>Team Management</h1>
        </div>
        {subTab === 'users' && (
          <Btn onClick={() => openOv({ kind: 'modal', title: 'Invite team member', body: <IForm /> })}>+ Invite user</Btn>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.cr3}`, marginBottom: 20 }}>
        {[['users', 'Users'], ['audit', 'Audit Log']].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            padding: '8px 16px', border: 'none', background: 'transparent',
            color: subTab === id ? C.ink9 : C.ink3,
            borderBottom: subTab === id ? `2px solid ${C.acc}` : '2px solid transparent',
            fontFamily: MONO, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
            cursor: 'pointer', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {subTab === 'users' && <UsersTab />}
      {subTab === 'audit' && <AuditTab />}
    </div>
  );
}
