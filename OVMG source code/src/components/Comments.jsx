import { useState, useEffect } from 'react';
import { C, SERIF, SANS, MONO, fmtR } from '../constants.js';
import { Btn, Spinner } from './UI.jsx';
import { listComments, createComment, updateComment, deleteComment } from '../api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Comments — reusable component for task / contact / reference comments.
//
// Props:
//   entity      — 'task' | 'contact' | 'reference'
//   entityId    — the record ID to attach comments to
//   user        — current user object { id, fullName, roles, isAdmin }
//
// Features:
//   - Fetches via api.js listComments; optimistic UI on add / edit / delete
//   - Author name + relative timestamp on each comment
//   - Markdown-lite renderer: **bold**, *italic*, `code`, bare URLs
//   - Edit own comment (admins can edit any)
//   - Delete own comment (admins can delete any) — soft-delete on server
// ─────────────────────────────────────────────────────────────────────────────

// ── Very lightweight markdown-lite renderer ────────────────────────────────
function renderMarkdownLite(text) {
  if (!text) return null;
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch   = remaining.match(/^(.*?)\*\*(.+?)\*\*/s);
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/s);
    const codeMatch   = remaining.match(/^(.*?)`(.+?)`/s);
    const urlMatch    = remaining.match(/^(.*?)(https?:\/\/[^\s]+)/s);

    const candidates = [
      boldMatch   && { idx: boldMatch[1].length,   type: 'bold',   before: boldMatch[1],   inner: boldMatch[2],   total: boldMatch[0] },
      italicMatch && { idx: italicMatch[1].length, type: 'italic', before: italicMatch[1], inner: italicMatch[2], total: italicMatch[0] },
      codeMatch   && { idx: codeMatch[1].length,   type: 'code',   before: codeMatch[1],   inner: codeMatch[2],   total: codeMatch[0] },
      urlMatch    && { idx: urlMatch[1].length,    type: 'url',    before: urlMatch[1],    inner: urlMatch[2],    total: urlMatch[0] },
    ].filter(Boolean).sort((a, b) => a.idx - b.idx);

    if (candidates.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    const m = candidates[0];
    if (m.before) parts.push(<span key={key++}>{m.before}</span>);
    if (m.type === 'bold')   parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{m.inner}</strong>);
    if (m.type === 'italic') parts.push(<em key={key++}>{m.inner}</em>);
    if (m.type === 'code')   parts.push(<code key={key++} style={{ fontFamily: MONO, background: C.cr2, borderRadius: 3, padding: '1px 4px', fontSize: '0.9em' }}>{m.inner}</code>);
    if (m.type === 'url')    parts.push(<a key={key++} href={m.inner} target="_blank" rel="noopener noreferrer" style={{ color: C.acc, textDecoration: 'none' }}>{m.inner}</a>);
    remaining = remaining.slice(m.total.length);
  }
  return parts;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Comments({ entity, entityId, user }) {
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [newBody,   setNewBody]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody,  setEditBody]  = useState('');
  const [saving,    setSaving]    = useState(false);

  const isAdmin = user?.isAdmin || user?.roles?.includes('admin') || (user?.email || '').endsWith('@onevibemediagroup.com');

  const load = async () => {
    if (!entity || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listComments(entity, entityId);
      setComments(data.comments || []);
    } catch (e) {
      setError('Could not load comments: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entity, entityId]);

  const canEdit   = (c) => c.author_id === user?.id || isAdmin;
  const canDelete = (c) => c.author_id === user?.id || isAdmin;

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const body = newBody.trim();
    if (!body) return;
    setAdding(true);
    const optimistic = {
      id: `_opt_${Date.now()}`,
      entity,
      entity_id: entityId,
      author_id: user?.id || '',
      author_name: user?.fullName || 'You',
      body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setComments(prev => [...prev, optimistic]);
    setNewBody('');
    try {
      const data = await createComment({
        entity,
        entity_id: entityId,
        body,
        author_name: user?.fullName || '',
      });
      setComments(prev => prev.map(c => c.id === optimistic.id ? (data.comment || c) : c));
    } catch {
      setComments(prev => prev.filter(c => c.id !== optimistic.id));
      setNewBody(body);
    }
    setAdding(false);
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (c) => { setEditingId(c.id); setEditBody(c.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };

  const handleEdit = async (c) => {
    const body = editBody.trim();
    if (!body) return;
    setSaving(true);
    const original = c.body;
    setComments(prev => prev.map(x => x.id === c.id ? { ...x, body, updated_at: new Date().toISOString() } : x));
    setEditingId(null);
    try {
      await updateComment(c.id, { body });
    } catch {
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, body: original } : x));
    }
    setSaving(false);
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (c) => {
    if (!window.confirm('Delete this comment?')) return;
    const saved = [...comments];
    setComments(prev => prev.filter(x => x.id !== c.id));
    try {
      await deleteComment(c.id);
    } catch {
      setComments(saved);
    }
  };

  if (loading) return <div style={{ padding: 16, textAlign: 'center' }}><Spinner size={18} /></div>;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, marginBottom: 10 }}>
        Comments ({comments.length})
      </div>

      {error && (
        <div style={{ fontSize: 12, color: C.red, padding: '8px 0' }}>{error}</div>
      )}

      {!error && comments.length === 0 && (
        <p style={{ fontSize: 12, color: C.ink3, margin: '0 0 12px', fontStyle: 'italic' }}>No comments yet. Be the first to comment.</p>
      )}

      {/* Comment list */}
      {comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {comments.map(c => (
            <div key={c.id} style={{
              background: C.bg2, border: `1px solid ${C.cr2}`, borderLeft: `3px solid ${C.acc}`,
              borderRadius: 6, padding: '10px 14px',
              opacity: c.id.startsWith('_opt_') ? 0.6 : 1,
            }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                      border: `1px solid ${C.cr3}`, borderRadius: 6, background: C.bg,
                      color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5,
                      resize: 'vertical', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Btn v="gho" onClick={cancelEdit}>Cancel</Btn>
                    <Btn onClick={() => handleEdit(c)} disabled={saving || !editBody.trim()}>Save</Btn>
                  </div>
                </div>
              ) : (
                <>
                  {/* Author + timestamp header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', background: C.acc,
                        color: '#fff', fontSize: 10, fontWeight: 600,
                        display: 'grid', placeItems: 'center', flexShrink: 0,
                      }}>
                        {(c.author_name || 'U')[0].toUpperCase()}
                      </div>
                      <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 12, color: C.ink8 }}>
                        {c.author_name || 'Unknown'}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.ink3, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
                        {fmtR(c.created_at)}
                        {c.updated_at && c.updated_at !== c.created_at && (
                          <span style={{ marginLeft: 4 }}>(edited)</span>
                        )}
                      </span>
                    </div>
                    {!c.id.startsWith('_opt_') && (canEdit(c) || canDelete(c)) && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {canEdit(c) && (
                          <button onClick={() => startEdit(c)}
                            style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 11, color: C.ink3, cursor: 'pointer', padding: '0 4px' }}>
                            Edit
                          </button>
                        )}
                        {canDelete(c) && (
                          <button onClick={() => handleDelete(c)}
                            style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 11, color: C.red, cursor: 'pointer', padding: '0 4px' }}>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Body with markdown-lite */}
                  <div style={{ fontSize: 13, color: C.ink7, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {renderMarkdownLite(c.body)}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment textarea */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={newBody}
          onChange={e => setNewBody(e.target.value)}
          placeholder="Add a comment… (Cmd+Enter to post)"
          rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd(); } }}
          style={{
            flex: 1, boxSizing: 'border-box', padding: '8px 12px',
            border: `1px solid ${C.cr3}`, borderRadius: 8, background: C.bg2,
            color: C.ink9, fontFamily: SANS, fontSize: 13, lineHeight: 1.5,
            resize: 'none', outline: 'none', transition: 'border-color .15s',
          }}
          onFocus={e => { e.target.style.borderColor = C.acc; }}
          onBlur={e => { e.target.style.borderColor = C.cr3; }}
          disabled={adding}
        />
        <Btn onClick={handleAdd} disabled={adding || !newBody.trim()} sx={{ alignSelf: 'flex-end' }}>
          {adding ? <Spinner size={14} /> : 'Post'}
        </Btn>
      </div>
    </div>
  );
}
