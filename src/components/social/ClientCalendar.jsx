import { useState } from 'react';
import { T, SERIF, SANS, MONO, ALL_PLAT, STATUS_META, tag, btn } from './_shared.jsx';

// ── Post detail modal ─────────────────────────────────────────────────────────
function PostModal({ post, client, onClose }) {
  const platMeta   = ALL_PLAT[post.platform] || { label: post.platform, color: T.acc, icon: '◇' };
  const statusMeta = STATUS_META[post.status] || { label: post.status, color: T.acc };
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,20,.78)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 401, width: 480, maxHeight: '80vh', background: T.ink8,
        borderRadius: 14, border: `1px solid ${T.ink7}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.ink7}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...tag(platMeta.color) }}>{platMeta.icon} {platMeta.label}</span>
          <span style={{ ...tag(statusMeta.color) }}>{statusMeta.label}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 20, cursor: 'pointer', lineHeight: 1, marginLeft: 'auto' }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          {/* Image preview */}
          {post.asset_url && (
            <div style={{ marginBottom: 14, borderRadius: 8, overflow: 'hidden', maxHeight: 240 }}>
              <img src={post.asset_url} alt="post asset" style={{ width: '100%', objectFit: 'cover' }} onError={e => e.target.parentElement.style.display = 'none'} />
            </div>
          )}
          {/* Scheduled time */}
          {post.scheduled_at && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: T.ink3, marginBottom: 10, letterSpacing: '.06em' }}>
              SCHEDULED: {new Date(post.scheduled_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
          {/* Caption */}
          <p style={{ fontSize: 13, color: T.fg, lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{post.caption}</p>
          {/* Hashtags */}
          {post.hashtags && (
            <div style={{ fontSize: 12, color: platMeta.color, fontFamily: MONO }}>{post.hashtags}</div>
          )}
          {/* External link */}
          {post.post_url && (
            <div style={{ marginTop: 14 }}>
              <a href={post.post_url} target="_blank" rel="noreferrer" style={{ color: platMeta.color, fontSize: 12, fontFamily: MONO }}>
                ↗ View post on {platMeta.label}
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── ClientCalendar ────────────────────────────────────────────────────────────
export default function ClientCalendar({ client, posts, onCompose }) {
  const [cur, setCur]         = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedPost, setSel] = useState(null);
  const today = new Date();

  const first = new Date(cur.y, cur.m, 1).getDay();
  const days  = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, color: T.fg, fontWeight: 400 }}>
          {new Date(cur.y, cur.m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setCur(c => ({ y: c.m === 0 ? c.y-1 : c.y, m: (c.m+11)%12 }))} style={{ ...btn('ghost'), padding: '5px 9px' }}>‹</button>
          <button onClick={() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); }} style={btn('ghost')}>Today</button>
          <button onClick={() => setCur(c => ({ y: c.m === 11 ? c.y+1 : c.y, m: (c.m+1)%12 }))} style={{ ...btn('ghost'), padding: '5px 9px' }}>›</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ fontSize: 9, color: T.ink3, fontFamily: MONO, letterSpacing: '.1em', textAlign: 'center', padding: 4 }}>{d.toUpperCase()}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = day === today.getDate() && cur.m === today.getMonth() && cur.y === today.getFullYear();
          const dayPosts = posts.filter(p => {
            if (!p.scheduled_at) return false;
            const d = new Date(p.scheduled_at);
            return d.getDate() === day && d.getMonth() === cur.m && d.getFullYear() === cur.y;
          });
          return (
            <div key={i} style={{
              minHeight: 80, padding: 6, borderRadius: 7,
              background: T.ink8, border: `1px solid ${isToday ? T.acc : T.ink7}`,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: isToday ? T.acc : T.ink2, fontFamily: MONO, fontWeight: isToday ? 700 : 400 }}>{day}</span>
                <button onClick={() => onCompose({ scheduled_at: new Date(cur.y, cur.m, day).toISOString() })}
                  style={{ background: 'none', border: 'none', color: T.ink5, fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1 }}>+</button>
              </div>
              {dayPosts.slice(0, 4).map(p => {
                const platMeta   = ALL_PLAT[p.platform] || { color: T.acc, icon: '◇', label: p.platform };
                const statusMeta = STATUS_META[p.status] || { color: T.acc };
                return (
                  <button key={p.id} onClick={() => setSel(p)} style={{
                    padding: '2px 5px', borderRadius: 4, border: 'none',
                    background: platMeta.color + '22',
                    color: platMeta.color,
                    fontSize: 9, fontFamily: MONO, textAlign: 'left',
                    cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderLeft: `2px solid ${statusMeta.color}`,
                  }}>{platMeta.icon} {platMeta.label}</button>
                );
              })}
              {dayPosts.length > 4 && <span style={{ fontSize: 9, color: T.ink3, fontFamily: MONO }}>+{dayPosts.length - 4}</span>}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_META).map(([id, m]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.ink3, fontFamily: MONO }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: m.color }} />
            {m.label}
          </div>
        ))}
      </div>

      {/* Post modal */}
      {selectedPost && (
        <PostModal post={selectedPost} client={client} onClose={() => setSel(null)} />
      )}
    </div>
  );
}
