import { useState, useEffect } from 'react';
import { C, SERIF, MONO, prBg, prFg, stBg, stFg, dUntil } from '../constants.js';
import { Tag, Eyebrow } from '../components/UI.jsx';
import { getTasks, getGoals, getContacts, getOutreach } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';
import MyDay from './MyDay.jsx';

export default function Overview({ user, showToast, setView, openOv, closeOv }) {
  const isMobile = useIsMobile();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTasks(), getGoals(), getContacts(), getOutreach()])
      .then(([tasks, goals, contacts, outreach]) => {
        setData({ tasks, goals, contacts, outreach });
        setLoading(false);
      })
      .catch(e => { showToast('Failed to load data: ' + e.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: C.ink3 }}>Loading…</div>;

  const tasks    = data?.tasks    || [];
  const goals    = data?.goals    || [];
  const contacts = data?.contacts || [];
  const outreach = Array.isArray(data?.outreach) ? data.outreach : (data?.outreach?.leads || []);

  const overdue  = tasks.filter(t => { const d = dUntil(t.dueDate); return d !== null && d < 0; }).length;
  const myFirst  = user.fullName.split(' ')[0].toLowerCase();
  const mine     = tasks.filter(t => (t.owner || '').toLowerCase().startsWith(myFirst)).length;
  const upcoming = [...tasks].filter(t => t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5);
  const activeGoals = goals.filter(g => g.status !== 'Done').slice(0, 4);

  return (
    <div>
      <Eyebrow>Today</Eyebrow>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? 26 : 38, letterSpacing: '-.025em', margin: 0, color: C.ink9, lineHeight: 1 }}>
          Welcome back, {user.fullName.split(' ')[0]}.
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12, marginBottom: 22 }}>
        {[
          // §9: each card routes to the Tasks page with the matching filter applied.
          { l: 'Active tasks', v: tasks.length, s: 'awaiting action', a: false, click: () => setView('tasks') },
          { l: 'My tasks',     v: mine,         s: 'assigned to me',  a: false, click: () => setView('tasks', { assignee: '__me__' }) },
          { l: 'Overdue',      v: overdue,      s: 'past due',        a: true,  click: () => setView('tasks', { due: 'overdue' }) },
        ].map(stat => (
          <div key={stat.l}
            onClick={stat.click || undefined}
            style={{
              background: stat.a ? C.accS : C.bg2,
              border: `1px solid ${stat.a ? '#ecd1bc' : C.cr2}`,
              borderRadius: 10, padding: '14px 18px',
              cursor: stat.click ? 'pointer' : 'default',
              transition: stat.click ? 'box-shadow .15s' : undefined,
            }}
            onMouseEnter={stat.click ? e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; } : undefined}
            onMouseLeave={stat.click ? e => { e.currentTarget.style.boxShadow = ''; } : undefined}
          >
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: stat.a ? C.accD : C.ink3, marginBottom: 8 }}>{stat.l}</div>
            <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, lineHeight: 1, color: stat.a ? C.accD : C.ink9 }}>{stat.v}</div>
            <div style={{ fontSize: 11, color: stat.a ? C.accD : C.ink3, marginTop: 5 }}>{stat.s}</div>
          </div>
        ))}
      </div>

      {/* OVM Outreach summary */}
      <div
        onClick={() => setView('outreach')}
        style={{
          background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10,
          padding: '14px 18px', marginBottom: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          transition: 'box-shadow .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; }}
      >
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 4 }}>OVM Outreach</div>
          <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 16, color: C.ink9 }}>Active campaigns</div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { l: 'Contacts touched', v: outreach.filter(o => o.status === 'Contacted' || o.status === 'Replied').length },
            { l: 'Emails sent',      v: outreach.filter(o => o.status === 'Contacted').length },
            { l: 'Replies',          v: outreach.filter(o => o.status === 'Replied').length },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 28, lineHeight: 1, color: C.ink9 }}>{s.v}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, letterSpacing: '.06em', textTransform: 'uppercase' }}>View all →</span>
      </div>

      {/* Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
        {/* Up next */}
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid ${C.cr2}` }}>
            <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 16 }}>Up next</span>
            <button onClick={() => setView('tasks')} style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 10, color: C.ink5, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: 8 }}>
            {upcoming.length ? upcoming.map(t => {
              const d = dUntil(t.dueDate);
              const dl = d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: C.ink8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 2 }}>{t.owner || 'unassigned'} · {dl}</div>
                  </div>
                  {t.priority && <Tag bg={prBg(t.priority)} fg={prFg(t.priority)}>{t.priority}</Tag>}
                </div>
              );
            }) : <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>No upcoming tasks.</div>}
          </div>
        </div>

        {/* Active goals */}
        <div style={{ background: C.bg2, border: `1px solid ${C.cr2}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid ${C.cr2}` }}>
            <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 16 }}>Active goals</span>
            <button onClick={() => setView('team-goals')} style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 10, color: C.ink5, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: 8 }}>
            {activeGoals.length ? activeGoals.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: C.ink8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.goal}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginTop: 2 }}>{g.owner} · {g.quarter}</div>
                </div>
                {g.status && <Tag bg={stBg(g.status)} fg={stFg(g.status)}>{g.status}</Tag>}
              </div>
            )) : <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 12 }}>No active goals.</div>}
          </div>
        </div>
      </div>

      {/* Admin quick links */}
      {(user?.isAdmin || (user?.email || '').endsWith('@onevibemediagroup.com')) && (
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <Eyebrow>Admin</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {[
              { label: '⬡ AI Spend', view: 'cost', desc: 'Token costs by model' },
              { label: '◉ Audio Logs', view: 'audio-dump', desc: 'Review queue' },
              { label: '◎ Admin', view: 'admin', desc: 'Users & access' },
            ].map(item => (
              <button key={item.view} onClick={() => setView(item.view)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '10px 16px', background: C.bg2, border: `1px solid ${C.cr3}`,
                borderRadius: 8, cursor: 'pointer', textAlign: 'left', gap: 2,
                transition: 'border-color .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.ink5}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.cr3}
              >
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.ink9 }}>{item.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3 }}>{item.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* My Day — end-of-day voice capture */}
      <div style={{ height: 1, background: C.cr2, margin: '28px 0' }} />
      <MyDay user={user} showToast={showToast} />
    </div>
  );
}
