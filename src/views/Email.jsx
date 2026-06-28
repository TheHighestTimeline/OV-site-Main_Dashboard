import { useState, useEffect, useRef, useCallback } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { getEmailLabels, getEmailThreads, getEmailThread, getEmailState, saveEmailState, sendEmail, deleteEmailThread } from '../api.js';
import useIsMobile, { useDevice } from '../hooks/useIsMobile.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const LABEL_ICONS = {
  INBOX:   '◉', SENT: '↗', DRAFTS: '✎', STARRED: '★',
  SPAM:    '⚠', TRASH: '⌫',
};
const LABEL_NAMES = {
  INBOX: 'Inbox', SENT: 'Sent', DRAFTS: 'Drafts',
  STARRED: 'Starred', SPAM: 'Spam', TRASH: 'Trash',
};

const INPUT = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  border: `1px solid ${C.cr3}`, borderRadius: 6,
  fontFamily: SANS, fontSize: 13, color: C.ink9,
  background: C.bg, outline: 'none', transition: 'border-color .15s',
};
const LABEL_STYLE = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
  textTransform: 'uppercase', color: C.ink3, marginBottom: 4, display: 'block',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d   = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays < 7)   return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function fmtDateFull(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

function parseName(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : fromHeader.split('@')[0];
}

function parseEmail(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader;
}

function hasComposerContent(composer) {
  // composer.body holds HTML innerHTML from the rich editor — strip tags to
  // check if there's any actual content (empty editor is "<br>" or "")
  const bodyText = (composer.body || '').replace(/<[^>]*>/g, '').trim();
  return !!(composer.to || composer.subject || bodyText);
}

// ── Folder Sidebar ────────────────────────────────────────────────────────────
function FolderSidebar({ labels, activeLabel, onSelect, isMobile, isTablet }) {
  return (
    <div style={{
      width: isMobile ? '100%' : isTablet ? 150 : 180, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${C.cr2}`,
      display: 'flex', flexDirection: 'column', background: C.bg2, overflowY: 'auto',
    }}>
      <div style={{ padding: '14px 12px 8px', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
        Folders
      </div>
      {labels.map(label => {
        const active = label.id === activeLabel;
        const icon   = LABEL_ICONS[label.id] || '○';
        const name   = LABEL_NAMES[label.id] || label.name;
        return (
          <button
            key={label.id}
            onClick={() => onSelect(label.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '8px 12px', border: 'none', textAlign: 'left',
              background: active ? C.accS : 'transparent',
              borderLeft: `3px solid ${active ? C.acc : 'transparent'}`,
              cursor: 'pointer', transition: 'background .1s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13, color: active ? C.acc : C.ink3 }}>{icon}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: active ? C.acc : C.ink7, fontWeight: active ? 600 : 400 }}>
                {name}
              </span>
            </span>
            {label.messagesUnread > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: active ? C.acc : C.ink3, fontWeight: 700 }}>
                {label.messagesUnread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Thread List ───────────────────────────────────────────────────────────────
function ThreadList({ threads, loading, activeThreadId, onSelect, onNewEmail, nextPageToken, onLoadMore, isMobile, isTablet, error }) {
  return (
    <div style={{
      width: isMobile ? '100%' : isTablet ? 240 : 280, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${C.cr2}`,
      display: 'flex', flexDirection: 'column', background: C.bg2, overflowY: 'auto',
    }}>
      {/* New email button */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.cr2}`, flexShrink: 0 }}>
        <button onClick={onNewEmail} style={{
          width: '100%', padding: '8px 0', background: C.acc, color: '#fff',
          border: 'none', borderRadius: 7, fontFamily: SANS, fontSize: 13,
          fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6,
        }}>
          ✏ New Email
        </button>
      </div>

      {/* Thread rows */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.ink3, fontSize: 13 }}>Loading…</div>
      ) : threads.length === 0 ? (
        <div style={{ padding: '24px 18px', textAlign: 'center', color: C.ink3, fontSize: 13, lineHeight: 1.5 }}>
          {error || 'No messages'}
        </div>
      ) : (
        <>
          {threads.map(thread => {
            const active = thread.id === activeThreadId;
            return (
              <button
                key={thread.id}
                onClick={() => onSelect(thread)}
                style={{
                  display: 'block', width: '100%', padding: '11px 14px',
                  borderBottom: `1px solid ${C.cr2}`, border: 'none', textAlign: 'left',
                  background: active ? C.accS : thread.unread ? '#fff' : C.bg2,
                  borderLeft: `3px solid ${active ? C.acc : 'transparent'}`,
                  cursor: 'pointer', transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bg; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = thread.unread ? '#fff' : C.bg2; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{
                    fontFamily: SANS, fontSize: 13, color: active ? C.acc : C.ink9,
                    fontWeight: thread.unread ? 700 : 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
                  }}>
                    {parseName(thread.from) || thread.from}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, flexShrink: 0, marginLeft: 4 }}>
                    {fmtDate(thread.date)}
                  </span>
                </div>
                <div style={{
                  fontFamily: SANS, fontSize: 12, color: active ? C.acc : C.ink7,
                  fontWeight: thread.unread ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3,
                }}>
                  {thread.subject}
                  {thread.messageCount > 1 && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3, marginLeft: 5 }}>
                      ({thread.messageCount})
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {thread.snippet}
                </div>
              </button>
            );
          })}
          {nextPageToken && (
            <button onClick={onLoadMore} style={{
              padding: '12px', border: 'none', background: 'transparent',
              color: C.acc, fontFamily: SANS, fontSize: 13, cursor: 'pointer', width: '100%',
            }}>
              Load more…
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteConfirmModal({ onConfirm, onCancel, deleting }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(14,16,20,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: C.bg, borderRadius: 12, padding: 24, maxWidth: 360, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9, marginBottom: 8 }}>
          Delete this thread?
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink5, marginBottom: 20, lineHeight: 1.5 }}>
          This will permanently delete the entire email thread and all its messages. This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={deleting} style={{ padding: '8px 14px', background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: C.ink5, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} style={{ padding: '8px 14px', background: C.red, border: 'none', borderRadius: 7, fontFamily: SANS, fontSize: 13, color: '#fff', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete Thread'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Thread Viewer ─────────────────────────────────────────────────────────────
function ThreadViewer({ thread, loading, onReply, onDelete, isAdmin, isMobile }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting,          setDeleting]          = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(thread.messages[0]?.threadId || thread.id);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink3 }}>
      Loading thread…
    </div>
  );
  if (!thread) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: C.ink3 }}>
      <span style={{ fontSize: 28 }}>◉</span>
      <span style={{ fontSize: 13 }}>Select a thread to read</span>
    </div>
  );

  const subject = thread.messages[0]?.subject || '(no subject)';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          deleting={deleting}
        />
      )}

      {/* Thread subject header */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.cr2}`, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: 0, color: C.ink9, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {subject}
        </h2>
        {isAdmin && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '5px 12px', background: C.redS, border: `1px solid ${C.red}`,
              borderRadius: 6, fontFamily: SANS, fontSize: 12, color: C.red,
              cursor: 'pointer', flexShrink: 0, fontWeight: 500,
            }}
          >
            ⌫ Delete
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 20px' }}>
        {thread.messages.map((msg, i) => (
          <div key={msg.id} style={{
            borderBottom: i < thread.messages.length - 1 ? `1px solid ${C.cr2}` : 'none',
            padding: '16px 20px',
          }}>
            {/* Message header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink9 }}>
                  {parseName(msg.from) || msg.from}
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink3, fontWeight: 400, marginLeft: 6 }}>
                    &lt;{parseEmail(msg.from)}&gt;
                  </span>
                </div>
                {msg.to && (
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                    To: {msg.to}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink3 }}>
                  {fmtDateFull(msg.date)}
                </span>
                {/* Reply button on each message */}
                <button onClick={() => onReply(msg)} style={{
                  padding: '5px 12px', background: C.bg2, border: `1px solid ${C.cr3}`,
                  borderRadius: 6, fontFamily: SANS, fontSize: 12, color: C.ink7,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  ↩ Reply
                </button>
              </div>
            </div>

            {/* Message body. For a single-message thread (the common case) the
                box fills the viewport so short emails don't render as a tiny
                sliver; longer content still grows past that via onLoad. In a
                multi-message thread each message sizes to its content so they
                stack naturally. */}
            <div style={{ fontSize: 13, color: C.ink8, lineHeight: 1.6 }}>
              <iframe
                srcDoc={msg.body || `<p style="color:#6b7180;font-family:sans-serif;font-size:13px">${msg.snippet}</p>`}
                style={{ width: '100%', border: 'none', minHeight: thread.messages.length === 1 ? 'max(440px, calc(100vh - 230px))' : 80 }}
                sandbox="allow-same-origin"
                title={`Message from ${msg.from}`}
                onLoad={e => {
                  try {
                    const h = e.target.contentDocument?.body?.scrollHeight;
                    if (h) e.target.style.height = h + 20 + 'px';
                  } catch {}
                }}
              />
            </div>

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.cr2}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, marginBottom: 6 }}>
                  Attachments ({msg.attachments.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {msg.attachments.map((att, ai) => (
                    <a
                      key={ai}
                      href={att.url || `data:${att.mimeType};base64,${att.data}`}
                      download={att.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', background: C.bg2,
                        border: `1px solid ${C.cr3}`, borderRadius: 6,
                        fontFamily: SANS, fontSize: 12, color: C.ink7,
                        textDecoration: 'none', cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 14 }}>📎</span>
                      {att.filename}
                      {att.size && <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink3 }}>({Math.round(att.size / 1024)}KB)</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick reply footer */}
      <div style={{ padding: '10px 20px', borderTop: `1px solid ${C.cr2}`, flexShrink: 0 }}>
        <button
          onClick={() => onReply(thread.messages[thread.messages.length - 1])}
          style={{
            padding: '8px 18px', background: C.acc, color: '#fff',
            border: 'none', borderRadius: 7, fontFamily: SANS,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↩ Reply to thread
        </button>
      </div>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────
function Composer({ composer, onChange, onSend, sending, user, isMobile, isTablet }) {
  const fileRef       = useRef();
  const attachRef     = useRef();
  const editorRef     = useRef(null);
  const myName    = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const isReply   = composer.mode === 'reply';

  // Sync external composer.body changes (draft restore, reply start, send clear)
  // into the contentEditable. Avoid disturbing the cursor while the user types
  // by only writing when the DOM is out of sync with state.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = el.innerHTML;
    const incoming = composer.body || '';
    if (current !== incoming) {
      el.innerHTML = incoming;
    }
  }, [composer.body, composer.mode]);

  // Paste: prefer the clipboard's text/html (preserves rich formatting from
  // pages like the template generator). Fall back to plain text → <br>.
  const handlePaste = e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const payload = html || (text ? text.replace(/\n/g, '<br>') : '');
    if (!payload) return;
    document.execCommand('insertHTML', false, payload);
    if (editorRef.current) onChange({ body: editorRef.current.innerHTML });
  };

  const handleEditorInput = e => onChange({ body: e.currentTarget.innerHTML });

  // Load an .html file's contents into the editor (replaces current content).
  const loadFile = file => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const html = e.target.result;
      if (editorRef.current) editorRef.current.innerHTML = html;
      onChange({ body: html });
    };
    reader.readAsText(file);
  };

  const attachFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      onChange({ attachment: { name: file.name, base64, type: file.type } });
    };
    reader.readAsDataURL(file);
  };

  const [dragging,  setDragging]  = useState(false);
  const onDrop     = e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); };
  const onDragOver = e => { e.preventDefault(); setDragging(true); };

  const bodyIsEmpty = !(composer.body || '').replace(/<[^>]*>/g, '').trim();

  return (
    <div style={{
      width: isMobile ? '100%' : isTablet ? 290 : 340, flexShrink: 0, borderLeft: isMobile ? 'none' : `1px solid ${C.cr2}`, borderTop: isMobile ? `1px solid ${C.cr2}` : 'none',
      display: 'flex', flexDirection: 'column', background: C.bg2, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.cr2}`, flexShrink: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: isReply ? C.blu : C.acc }}>
          {isReply ? `↩ Replying to thread` : '✏ New Email'}
        </div>
        {isReply && composer.replySubject && (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {composer.replySubject}
          </div>
        )}
      </div>

      {/* Fields */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        <div>
          <span style={LABEL_STYLE}>From</span>
          <div style={{ ...INPUT, background: C.bg, color: C.ink3, cursor: 'default', userSelect: 'none', padding: '8px 10px' }}>
            nathan@onevibemediagroup.com
          </div>
        </div>

        <div>
          <span style={LABEL_STYLE}>To</span>
          <input
            style={INPUT} type="email" placeholder="recipient@example.com"
            value={composer.to}
            onChange={e => onChange({ to: e.target.value })}
            onFocus={e => { e.target.style.borderColor = C.acc; }}
            onBlur={e => { e.target.style.borderColor = C.cr3; }}
          />
        </div>

        <div>
          <span style={LABEL_STYLE}>Subject</span>
          <input
            style={INPUT} type="text" placeholder="Email subject line"
            value={composer.subject}
            onChange={e => onChange({ subject: e.target.value })}
            onFocus={e => { e.target.style.borderColor = C.acc; }}
            onBlur={e => { e.target.style.borderColor = C.cr3; }}
          />
        </div>

        {/* Attachment */}
        <div>
          <span style={LABEL_STYLE}>Attachment</span>
          {composer.attachment ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: C.accS, border: `1px solid ${C.acc}`, borderRadius: 6 }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.ink8, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ⊞ {composer.attachment.name}
              </span>
              <button type="button" onClick={() => onChange({ attachment: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>
                ×
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => attachRef.current.click()}
              style={{ ...INPUT, textAlign: 'left', cursor: 'pointer', color: C.ink3, fontSize: 12, fontFamily: SANS, background: C.bg2 }}>
              + Attach a file…
            </button>
          )}
          <input ref={attachRef} type="file" style={{ display: 'none' }}
            onChange={e => { attachFile(e.target.files[0]); e.target.value = ''; }} />
        </div>

        {/* Message — rich editor. Paste HTML from your template page and it
            renders here just like a Gmail draft. Drop an .html file or click
            the "Load .html" link to insert from a saved template. */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ ...LABEL_STYLE, marginBottom: 0 }}>Message</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!bodyIsEmpty && (
                <button
                  type="button"
                  onClick={() => { if (editorRef.current) editorRef.current.innerHTML = ''; onChange({ body: '' }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.05em', color: C.red, padding: 0 }}
                >
                  × Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => fileRef.current.click()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.05em', color: C.acc, padding: 0 }}
              >
                ⬆ Load .html
              </button>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onPaste={handlePaste}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onFocus={e => { e.currentTarget.style.borderColor = C.acc; }}
              onBlur={e => { e.currentTarget.style.borderColor = dragging ? C.acc : C.cr3; setDragging(false); }}
              style={{
                border: `1px solid ${dragging ? C.acc : C.cr3}`,
                background: dragging ? C.accS : '#fff',
                borderRadius: 6,
                padding: 12,
                minHeight: 240,
                maxHeight: 460,
                overflowY: 'auto',
                fontFamily: SANS,
                fontSize: 13,
                color: C.ink9,
                lineHeight: 1.5,
                outline: 'none',
                cursor: 'text',
                transition: 'border-color .15s, background .15s',
              }}
            />
            {bodyIsEmpty && (
              <div style={{
                position: 'absolute',
                top: 13, left: 13, right: 13,
                fontFamily: SANS,
                fontSize: 13,
                color: C.ink3,
                pointerEvents: 'none',
                lineHeight: 1.5,
                userSelect: 'none',
              }}>
                {isReply
                  ? 'Type your reply…'
                  : 'Type a message, or paste your HTML template here (Ctrl/⌘+V). It renders just like a Gmail draft.'}
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept=".html" style={{ display: 'none' }}
            onChange={e => { loadFile(e.target.files[0]); e.target.value = ''; }} />
        </div>

        {/* Send button + attribution */}
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <button onClick={onSend} disabled={sending} style={{
            width: '100%', padding: '10px', background: sending ? C.ink5 : C.acc,
            color: '#fff', border: 'none', borderRadius: 7, fontFamily: SANS,
            fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
            transition: 'background .15s',
          }}>
            {sending ? 'Sending…' : isReply ? '↩ Send Reply' : '→ Send Email'}
          </button>
          {myName && (
            <div style={{ marginTop: 6, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: C.ink3 }}>
              Logged as sent by {myName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Draft Warning Modal ───────────────────────────────────────────────────────
function DraftWarning({ onSave, onDiscard, onCancel }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(14,16,20,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: C.bg, borderRadius: 12, padding: 24, maxWidth: 360, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: C.ink9, marginBottom: 8 }}>
          Reply in progress
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink5, marginBottom: 20, lineHeight: 1.5 }}>
          You have an unsaved reply. Save it as a draft to come back to it later, or discard it.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 14px', background: 'none', border: `1px solid ${C.cr3}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: C.ink5, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onDiscard} style={{ padding: '8px 14px', background: C.redS, border: `1px solid ${C.red}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: C.red, cursor: 'pointer' }}>
            Discard
          </button>
          <button onClick={onSave} style={{ padding: '8px 14px', background: C.acc, border: 'none', borderRadius: 7, fontFamily: SANS, fontSize: 13, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Save Draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Email View ───────────────────────────────────────────────────────────
const EMPTY_COMPOSER = { mode: 'new', to: '', subject: '', body: '', attachment: null, replyThreadId: null, replyMessageId: null, replyReferences: null, replySubject: null };

export default function Email({ user, showToast }) {
  const isAdmin = !!(user?.isAdmin);
  const isMobile = useIsMobile();
  const isTablet = useDevice() === 'tablet';
  const [mobilePane, setMobilePane] = useState('folders'); // folders | threads | thread
  const [labels,        setLabels]        = useState([]);
  const [connErr,       setConnErr]       = useState(null);  // Gmail-not-connected notice (no toast)
  const [activeLabel,   setActiveLabel]   = useState('INBOX');
  const [threads,       setThreads]       = useState([]);
  const [nextPage,      setNextPage]      = useState(null);
  const [threadsLoad,   setThreadsLoad]   = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [thread,        setThread]        = useState(null);
  const [threadLoad,    setThreadLoad]    = useState(false);
  const [composer,      setComposer]      = useState(EMPTY_COMPOSER);
  const [sending,       setSending]       = useState(false);
  const [warning,       setWarning]       = useState(null); // pending action fn
  const [stateLoaded,   setStateLoaded]   = useState(false);

  const autoSaveRef = useRef(null);

  // ── Update composer fields ─────────────────────────────────────────────────
  const updateComposer = useCallback(patch => {
    setComposer(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Auto-save draft to Notion (debounced 30s) ──────────────────────────────
  useEffect(() => {
    if (!stateLoaded) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveEmailState({
        lastLabel:    activeLabel,
        lastThreadId: activeThreadId,
        draftTo:      composer.to,
        draftSubject: composer.subject,
        draftBody:    composer.body,
      }).catch(() => {});
    }, 30000);
    return () => clearTimeout(autoSaveRef.current);
  }, [activeLabel, activeThreadId, composer.to, composer.subject, composer.body, stateLoaded]);

  // ── Save state to Notion immediately (for draft save action) ──────────────
  const persistState = useCallback(() => {
    return saveEmailState({
      lastLabel:    activeLabel,
      lastThreadId: activeThreadId,
      draftTo:      composer.to,
      draftSubject: composer.subject,
      draftBody:    composer.body,
    }).catch(() => {});
  }, [activeLabel, activeThreadId, composer]);

  // ── Load labels + restore state on mount ──────────────────────────────────
  useEffect(() => {
    Promise.all([getEmailLabels(), getEmailState()]).then(([lbls, state]) => {
      setLabels(lbls);
      const label = state.lastLabel || 'INBOX';
      setActiveLabel(label);
      if (state.draftTo || state.draftSubject || state.draftBody) {
        setComposer(prev => ({
          ...prev,
          to:      state.draftTo      || '',
          subject: state.draftSubject || '',
          body:    state.draftBody    || '',
        }));
      }
      setStateLoaded(true);
      // Load threads for restored label
      loadThreads(label, true);
      // Restore last open thread
      if (state.lastThreadId) {
        setActiveThreadId(state.lastThreadId);
        loadThread(state.lastThreadId);
      }
    }).catch(() => {
      setStateLoaded(true);
      loadThreads('INBOX', true);
    });
  }, []);

  // ── Load threads for a label ───────────────────────────────────────────────
  const loadThreads = useCallback(async (labelId, reset = true, token = null) => {
    setThreadsLoad(true);
    try {
      const res = await getEmailThreads(labelId, token);
      setThreads(prev => reset ? res.threads : [...prev, ...res.threads]);
      setNextPage(res.nextPageToken || null);
      setConnErr(null);
    } catch (e) {
      // Most commonly the shared Gmail account isn't connected/credentialed yet.
      // Show a calm inline notice instead of a recurring error toast (this view
      // stays mounted in the OVM tools hub, so a toast would pop "randomly").
      console.warn('[email] threads load failed:', e.message);
      setConnErr('Email isn’t connected yet. Set up the shared Gmail account (see GOOGLE_CALENDAR_SETUP.md), then refresh.');
    } finally {
      setThreadsLoad(false);
    }
  }, []);

  // ── Load full thread ───────────────────────────────────────────────────────
  const loadThread = useCallback(async (threadId) => {
    setThreadLoad(true);
    try {
      const data = await getEmailThread(threadId);
      setThread(data);
    } catch (e) {
      // Quiet — the inline "not connected" notice (set by loadThreads) explains it.
      console.warn('[email] thread load failed:', e.message);
    } finally {
      setThreadLoad(false);
    }
  }, []);

  // ── Guard: run action, warn if composer has unsaved content ───────────────
  const guardDraft = useCallback((action) => {
    if (hasComposerContent(composer)) {
      setWarning(() => action);
    } else {
      action();
    }
  }, [composer]);

  // ── Select label ──────────────────────────────────────────────────────────
  const handleSelectLabel = useCallback(labelId => {
    guardDraft(() => {
      setActiveLabel(labelId);
      setActiveThreadId(null);
      setThread(null);
      setComposer(EMPTY_COMPOSER);
      loadThreads(labelId, true);
    });
  }, [guardDraft, loadThreads]);

  // ── Select thread ─────────────────────────────────────────────────────────
  const handleSelectThread = useCallback(threadStub => {
    guardDraft(() => {
      setActiveThreadId(threadStub.id);
      setComposer(EMPTY_COMPOSER);
      loadThread(threadStub.id);
    });
  }, [guardDraft, loadThread]);

  // ── New email ─────────────────────────────────────────────────────────────
  const handleNewEmail = useCallback(() => {
    guardDraft(() => {
      setActiveThreadId(null);
      setThread(null);
      setComposer(EMPTY_COMPOSER);
    });
  }, [guardDraft]);

  // ── Reply to a message ────────────────────────────────────────────────────
  const handleReply = useCallback(msg => {
    guardDraft(() => {
      const replyTo  = parseEmail(msg.from);
      const subject  = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
      setComposer({
        mode:            'reply',
        to:              replyTo,
        subject,
        body:            '',
        attachment:      null,
        replyThreadId:   msg.threadId,
        replyMessageId:  msg.messageId,
        replyReferences: msg.references,
        replySubject:    msg.subject,
      });
    });
  }, [guardDraft]);

  // ── Send email ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!composer.to.trim())      { showToast('Enter a recipient');  return; }
    if (!composer.subject.trim()) { showToast('Enter a subject');    return; }

    // composer.body is HTML innerHTML from the rich editor. Strip-tag check
    // ensures there's real content (empty contentEditable can leave "<br>").
    const body     = composer.body || '';
    const bodyText = body.replace(/<[^>]*>/g, '').trim();
    if (!bodyText) { showToast('Enter a message'); return; }

    setSending(true);
    try {
      await sendEmail({
        to:      composer.to.trim(),
        subject: composer.subject.trim(),
        body,
        ...(composer.attachment ? {
          attachmentName:   composer.attachment.name,
          attachmentBase64: composer.attachment.base64,
        } : {}),
        ...(composer.mode === 'reply' ? {
          threadId:   composer.replyThreadId,
          inReplyTo:  composer.replyMessageId,
          references: composer.replyReferences,
        } : {}),
      });

      showToast('Email sent ✓');
      // Clear composer + persist cleared state
      setComposer(EMPTY_COMPOSER);
      saveEmailState({ lastLabel: activeLabel, lastThreadId: activeThreadId, draftTo: '', draftSubject: '', draftBody: '' }).catch(() => {});
      // Refresh thread list
      loadThreads(activeLabel, true);
      // If was a reply, reload the thread
      if (composer.replyThreadId) loadThread(composer.replyThreadId);
    } catch (e) {
      showToast('Send failed: ' + e.message);
    } finally {
      setSending(false);
    }
  }, [composer, activeLabel, activeThreadId, showToast, loadThreads, loadThread]);

  // ── Draft warning handlers ────────────────────────────────────────────────
  const handleWarnSave = useCallback(async () => {
    await persistState();
    showToast('Draft saved ✓');
    const action = warning;
    setComposer(EMPTY_COMPOSER);
    setWarning(null);
    action?.();
  }, [persistState, warning, showToast]);

  const handleWarnDiscard = useCallback(() => {
    const action = warning;
    setComposer(EMPTY_COMPOSER);
    setWarning(null);
    action?.();
  }, [warning]);

  // ── Delete thread (admin only) ────────────────────────────────────────────
  const handleDeleteThread = useCallback(async (threadId) => {
    try {
      await deleteEmailThread(threadId, false);
      showToast('Thread deleted');
      setActiveThreadId(null);
      setThread(null);
      // Remove from thread list
      setThreads(prev => prev.filter(t => t.id !== threadId));
    } catch (e) {
      showToast('Delete failed: ' + e.message);
    }
  }, [showToast]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page title */}
      <div style={{ padding: '0 0 12px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: C.ink9, margin: 0 }}>Email</h1>
        <p style={{ fontSize: 13, color: C.ink3, marginTop: 4, margin: '4px 0 0' }}>
          Sending as <span style={{ fontFamily: MONO, color: C.acc }}>nathan@onevibemediagroup.com</span>
        </p>
      </div>

      {/* Four-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', border: `1px solid ${C.cr2}`, borderRadius: 12, position: 'relative', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* Mobile back/breadcrumb bar */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderBottom: `1px solid ${C.cr2}`,
            background: C.bg2, flexShrink: 0,
          }}>
            {mobilePane !== 'folders' && (
              <button
                onClick={() => {
                  if (mobilePane === 'thread') setMobilePane('threads');
                  else setMobilePane('folders');
                }}
                style={{ background: 'none', border: 'none', color: C.acc, fontSize: 13, cursor: 'pointer', padding: 4, fontFamily: MONO, letterSpacing: '.04em' }}>
                ‹ Back
              </button>
            )}
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink5, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {mobilePane === 'folders' ? 'Folders' : mobilePane === 'threads' ? (LABEL_NAMES[activeLabel] || activeLabel) : 'Message'}
            </span>
          </div>
        )}

        {/* Draft warning overlay */}
        {warning && (
          <DraftWarning
            onSave={handleWarnSave}
            onDiscard={handleWarnDiscard}
            onCancel={() => setWarning(null)}
          />
        )}

        {/* Panel 1: Folder sidebar */}
        {(!isMobile || mobilePane === 'folders') && (
          <div style={isMobile ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : { display: 'contents' }}>
            <FolderSidebar
              labels={labels}
              activeLabel={activeLabel}
              onSelect={(l) => { handleSelectLabel(l); if (isMobile) setMobilePane('threads'); }}
              isMobile={isMobile}
              isTablet={isTablet}
            />
          </div>
        )}

        {/* Panel 2: Thread list */}
        {(!isMobile || mobilePane === 'threads') && (
          <div style={isMobile ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : { display: 'contents' }}>
            <ThreadList
              threads={threads}
              loading={threadsLoad}
              activeThreadId={activeThreadId}
              onSelect={(t) => { handleSelectThread(t); if (isMobile) setMobilePane('thread'); }}
              onNewEmail={() => { handleNewEmail(); if (isMobile) setMobilePane('thread'); }}
              nextPageToken={nextPage}
              onLoadMore={() => loadThreads(activeLabel, false, nextPage)}
              isMobile={isMobile}
              isTablet={isTablet}
              error={connErr}
            />
          </div>
        )}

        {/* Panel 3 + 4: Thread viewer + Composer stacked on mobile, side-by-side on desktop */}
        {(!isMobile || mobilePane === 'thread') && (
          <div style={isMobile
            ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }
            : { display: 'contents' }
          }>
            <ThreadViewer
              thread={thread}
              loading={threadLoad}
              onReply={handleReply}
              onDelete={handleDeleteThread}
              isAdmin={isAdmin}
              isMobile={isMobile}
            />
            <Composer
              composer={composer}
              onChange={updateComposer}
              onSend={handleSend}
              sending={sending}
              user={user}
              isMobile={isMobile}
              isTablet={isTablet}
            />
          </div>
        )}
      </div>
    </div>
  );
}

