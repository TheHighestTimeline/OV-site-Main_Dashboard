import { useEffect, useRef, useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow } from '../components/UI.jsx';

// Logo URL — served from the /public directory so it works in both dev and prod.
// For email signatures the embedded base64 data URI is used; this URL is only
// shown in the preview strip inside the dashboard.
const DEFAULT_LOGO_URL = '/ovmg-logo.png';

// ── Embed HTML (structure + styles, script injected separately via useEffect) ──
const EMBED_HTML = `
<style>
.ovmg-sig * { box-sizing: border-box; }
.ovmg-sig {
  font-family: inherit;
  color: inherit;
  --sig-accent:     #d96b3a;
  --sig-line:       #ddd3bb;
  --sig-line-strong:#c5b99e;
  --sig-muted:      #6b7180;
  --sig-field-bg:   #f4f0e6;
  --sig-ink:        #0e1014;
  display: block;
  width: 100%;
}
.ovmg-sig .ovmg-sig__layout {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1.1fr);
  gap: 24px;
  align-items: start;
}
@media (max-width: 860px) {
  .ovmg-sig .ovmg-sig__layout { grid-template-columns: 1fr; }
}
.ovmg-sig .ovmg-sig__col {
  border: 1px solid var(--sig-line);
  border-radius: 10px;
  padding: 20px;
  background: #fbf8f2;
}
.ovmg-sig .ovmg-sig__title {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--sig-muted);
  margin: 0 0 14px;
  font-weight: 600;
}
.ovmg-sig .ovmg-sig__title--mt { margin-top: 22px; }
.ovmg-sig .ovmg-sig__field { margin-bottom: 12px; }
.ovmg-sig .ovmg-sig__field label {
  display: block;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 5px;
  color: var(--sig-muted);
}
.ovmg-sig .ovmg-sig__field label .opt {
  opacity: 0.65;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 9px;
  margin-left: 5px;
}
.ovmg-sig .ovmg-sig__field input[type="text"],
.ovmg-sig .ovmg-sig__field input[type="email"],
.ovmg-sig .ovmg-sig__field input[type="tel"],
.ovmg-sig .ovmg-sig__field input[type="url"] {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--sig-line);
  border-radius: 6px;
  background: var(--sig-field-bg);
  font-family: inherit;
  font-size: 13px;
  color: #0e1014;
  transition: border-color 0.15s, background 0.15s;
}
.ovmg-sig .ovmg-sig__field input:focus {
  outline: none;
  border-color: var(--sig-accent);
  background: #fbf8f2;
}
.ovmg-sig .ovmg-sig__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 480px) {
  .ovmg-sig .ovmg-sig__row { grid-template-columns: 1fr; }
}
.ovmg-sig .ovmg-sig__check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--sig-field-bg);
  border: 1px solid var(--sig-line);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}
.ovmg-sig .ovmg-sig__check input { margin: 0; cursor: pointer; accent-color: var(--sig-accent); }
.ovmg-sig .ovmg-sig__check span { font-size: 12px; color: #3a4050; }
.ovmg-sig .ovmg-sig__note {
  font-size: 11px;
  line-height: 1.5;
  margin-top: 6px;
  padding: 8px 10px;
  background: #f3e6c4;
  border: 1px solid #b48a1e40;
  border-radius: 6px;
  color: #6b5a1e;
}
.ovmg-sig .ovmg-sig__stage {
  border: 1px solid var(--sig-line);
  border-radius: 8px;
  padding: 24px 22px;
  min-height: 220px;
  background: #ffffff;
  color: #222;
  margin-bottom: 12px;
  overflow-x: auto;
}
.ovmg-sig .ovmg-sig__greeting {
  font-size: 13px;
  color: #999;
  font-style: italic;
  margin-bottom: 16px;
}
.ovmg-sig .ovmg-sig__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.ovmg-sig .ovmg-sig__btn {
  border: 1px solid var(--sig-ink);
  background: var(--sig-ink);
  color: #fbf8f2;
  padding: 10px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: all 0.15s;
}
.ovmg-sig .ovmg-sig__btn:hover {
  background: var(--sig-accent);
  border-color: var(--sig-accent);
  color: #fff;
}
.ovmg-sig .ovmg-sig__btn--ghost {
  background: transparent;
  color: #3a4050;
  border-color: #ddd3bb;
}
.ovmg-sig .ovmg-sig__btn--ghost:hover {
  background: #f4f0e6;
  color: #0e1014;
  border-color: #c5b99e;
}
.ovmg-sig .ovmg-sig__help {
  font-size: 11px;
  color: #6b7180;
  text-align: center;
  line-height: 1.5;
}
.ovmg-sig .ovmg-sig__help strong { color: #0e1014; font-weight: 600; }
.ovmg-sig details.ovmg-sig__src {
  margin-top: 12px;
  border: 1px solid var(--sig-line);
  border-radius: 6px;
}
.ovmg-sig details.ovmg-sig__src summary {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  color: #6b7180;
}
.ovmg-sig details.ovmg-sig__src pre {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--sig-line);
  font-family: 'Geist Mono', ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f4f0e6;
  max-height: 260px;
  color: #3a4050;
}
.ovmg-sig .ovmg-sig__toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: #0e1014;
  color: #fbf8f2;
  padding: 11px 20px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  opacity: 0;
  pointer-events: none;
  transition: all 0.25s ease;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 99999;
}
.ovmg-sig .ovmg-sig__toast.is-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>

<div class="ovmg-sig__layout">

  <!-- FORM -->
  <div class="ovmg-sig__col">
    <p class="ovmg-sig__title">Your details</p>

    <div class="ovmg-sig__row">
      <div class="ovmg-sig__field">
        <label>Full name</label>
        <input type="text" id="ovmg_name" placeholder="Nathan South" autocomplete="name">
      </div>
      <div class="ovmg-sig__field">
        <label>Pronouns <span class="opt">optional</span></label>
        <input type="text" id="ovmg_pronouns" placeholder="he/him" autocomplete="off">
      </div>
    </div>

    <div class="ovmg-sig__field">
      <label>Job title</label>
      <input type="text" id="ovmg_title" placeholder="Director of Sales">
    </div>

    <div class="ovmg-sig__field">
      <label class="ovmg-sig__check">
        <input type="checkbox" id="ovmg_verified">
        <span>Show verified checkmark next to name</span>
      </label>
    </div>

    <div class="ovmg-sig__field">
      <label>Company line</label>
      <input type="text" id="ovmg_company" placeholder="OneVibeMediaGroup" value="OneVibeMediaGroup">
    </div>

    <div class="ovmg-sig__row">
      <div class="ovmg-sig__field">
        <label>Phone label</label>
        <input type="text" id="ovmg_phonelabel" placeholder="Cell" value="Cell">
      </div>
      <div class="ovmg-sig__field">
        <label>Phone number</label>
        <input type="tel" id="ovmg_phone" placeholder="(321) 471-9078" autocomplete="tel">
      </div>
    </div>

    <div class="ovmg-sig__field">
      <label>Email</label>
      <input type="email" id="ovmg_email" placeholder="nathan@onevibemediagroup.com" autocomplete="email">
    </div>

    <div class="ovmg-sig__field">
      <label>Website <span class="opt">optional</span></label>
      <input type="url" id="ovmg_website" placeholder="onevibemedia.shop">
    </div>

    <p class="ovmg-sig__title ovmg-sig__title--mt">Social links</p>

    <div class="ovmg-sig__row">
      <div class="ovmg-sig__field">
        <label>TikTok <span class="opt">optional</span></label>
        <input type="url" id="ovmg_tiktok" placeholder="tiktok.com/@handle">
      </div>
      <div class="ovmg-sig__field">
        <label>Instagram <span class="opt">optional</span></label>
        <input type="url" id="ovmg_instagram" placeholder="instagram.com/handle">
      </div>
    </div>

    <div class="ovmg-sig__row">
      <div class="ovmg-sig__field">
        <label>LinkedIn <span class="opt">optional</span></label>
        <input type="url" id="ovmg_linkedin" placeholder="linkedin.com/in/name">
      </div>
      <div class="ovmg-sig__field">
        <label>Facebook <span class="opt">optional</span></label>
        <input type="url" id="ovmg_facebook" placeholder="facebook.com/page">
      </div>
    </div>

    <div class="ovmg-sig__field">
      <label>YouTube <span class="opt">optional</span></label>
      <input type="url" id="ovmg_youtube" placeholder="youtube.com/@channel">
    </div>

  </div>

  <!-- PREVIEW -->
  <div>
    <p class="ovmg-sig__title">Live preview</p>
    <div class="ovmg-sig__stage">
      <div class="ovmg-sig__greeting">Looking forward to connecting,</div>
      <div id="ovmg_preview"></div>
    </div>

    <div class="ovmg-sig__actions">
      <button type="button" class="ovmg-sig__btn" id="ovmg_copyRich">Copy signature</button>
      <button type="button" class="ovmg-sig__btn ovmg-sig__btn--ghost" id="ovmg_copyHtml">Copy HTML</button>
    </div>

    <p class="ovmg-sig__help">
      Hit <strong>Copy signature</strong>, then paste into <strong>Gmail</strong> Settings &rarr; Signature,
      or <strong>Outlook</strong> &rarr; Options &rarr; Mail &rarr; Signatures.
    </p>

    <details class="ovmg-sig__src">
      <summary>View raw HTML source</summary>
      <pre id="ovmg_htmlSrc"></pre>
    </details>
  </div>

</div>

<div class="ovmg-sig__toast" id="ovmg_toast">Copied</div>
`;

// ── Script IIFE (runs after DOM is ready) ─────────────────────────────────────
const EMBED_SCRIPT = `
(function () {
  var LOGO_DATA_URI = "data:image/png;base64,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";
  // Use hosted URL so the logo loads in email clients; fall back to inline if unreachable
  var DEFAULT_LOGO_URL = "https://ovmgdashboard.netlify.app/ovmg-logo.png";

  var state = {
    name: '', pronouns: '', title: '', verified: false,
    company: 'OneVibeMediaGroup', phoneLabel: 'Cell', phone: '',
    email: '', website: '',
    tiktok: '', instagram: '', linkedin: '', facebook: '', youtube: '',
    logoUrl: ''
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cleanUrl(u) {
    if (!u) return '';
    u = u.trim();
    if (!u) return '';
    if (!/^https?:\\/\\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function dispUrl(u) {
    return u.replace(/^https?:\\/\\//i, '').replace(/^www\\./i, '').replace(/\\/$/, '');
  }

  var ICONS = {
    tiktok:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.05a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-1.48Z"/></svg>',
    instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    linkedin:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z"/></svg>',
    facebook:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95Z"/></svg>',
    youtube:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 4 12 4 12 4s-7.5 0-9.4.4A3 3 0 0 0 .5 6.5C.1 8.4.1 12 .1 12s0 3.6.4 5.5a3 3 0 0 0 2.1 2.1C4.5 20 12 20 12 20s7.5 0 9.4-.4a3 3 0 0 0 2.1-2.1c.4-1.9.4-5.5.4-5.5s0-3.6-.4-5.5ZM9.75 15.5v-7l6.5 3.5-6.5 3.5Z"/></svg>'
  };

  function socialIcon(href, svg) {
    return '<a href="' + esc(cleanUrl(href)) + '" style="display:inline-block;margin-right:6px;text-decoration:none;">'
      + '<span style="display:inline-block;width:28px;height:28px;background:#0e1014;border-radius:50%;text-align:center;line-height:28px;vertical-align:middle;">'
      + '<span style="display:inline-block;vertical-align:middle;line-height:0;">' + svg + '</span></span></a>';
  }

  function buildSignature() {
    var name = esc(state.name || 'Your Name');
    var verified = state.verified
      ? ' <span style="display:inline-block;vertical-align:middle;width:16px;height:16px;background:#1d9bf0;border-radius:50%;color:white;font-size:11px;font-weight:700;text-align:center;line-height:16px;margin-left:4px;font-family:Helvetica,Arial,sans-serif;">&#10003;</span>'
      : '';
    var pronouns = state.pronouns
      ? ' <span style="color:#888;font-weight:400;font-size:13px;">(' + esc(state.pronouns) + ')</span>'
      : '';
    var title   = esc(state.title   || 'Your Title');
    var company = esc(state.company || '');

    var phoneLine = '';
    if (state.phone) {
      phoneLine = '<div style="font-size:14px;color:#222;line-height:1.6;margin-top:2px;">'
        + '<strong style="font-weight:600;">' + esc(state.phoneLabel || 'Cell') + '</strong> '
        + '<span style="display:inline-block;padding:1px 8px;background:#f0f0ee;border-radius:12px;font-weight:500;">' + esc(state.phone) + '</span></div>';
    }
    var emailLine = '';
    if (state.email) {
      emailLine = '<div style="font-size:14px;line-height:1.6;margin-top:2px;">'
        + '<a href="mailto:' + esc(state.email) + '" style="color:#222;text-decoration:underline;">' + esc(state.email) + '</a></div>';
    }
    var websiteLine = '';
    if (state.website) {
      var w = cleanUrl(state.website);
      websiteLine = '<div style="font-size:13px;line-height:1.6;margin-top:2px;">'
        + '<a href="' + esc(w) + '" style="color:#222;text-decoration:none;">' + esc(dispUrl(w)) + '</a></div>';
    }

    var icons = [];
    if (state.tiktok)    icons.push(socialIcon(state.tiktok,    ICONS.tiktok));
    if (state.instagram) icons.push(socialIcon(state.instagram, ICONS.instagram));
    if (state.linkedin)  icons.push(socialIcon(state.linkedin,  ICONS.linkedin));
    if (state.facebook)  icons.push(socialIcon(state.facebook,  ICONS.facebook));
    if (state.youtube)   icons.push(socialIcon(state.youtube,   ICONS.youtube));
    var socialLine = icons.length
      ? '<div style="margin-top:14px;line-height:1;">' + icons.join('') + '</div>'
      : '';

    // Logo is always the hosted OneVibe Media logo; falls back to embedded data URI if unreachable
    var logoSrc = DEFAULT_LOGO_URL || LOGO_DATA_URI;
    var logoLine = (logoSrc && (logoSrc.indexOf('data:image') === 0 || /^https?:\\/\\//.test(logoSrc)))
      ? '<div style="margin-bottom:10px;"><img src="' + esc(logoSrc) + '" alt="' + company + '" height="28" width="auto" loading="eager" style="display:block;height:28px;width:auto;max-width:220px;" /></div>'
      : '';

    return '<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Helvetica,Arial,sans-serif;color:#222;border-collapse:collapse;">'
      + '<tr>'
      + '<td style="padding-right:18px;border-right:2px solid #ddd3bb;vertical-align:top;">&nbsp;</td>'
      + '<td style="padding-left:18px;vertical-align:top;">'
      + logoLine
      + '<div style="font-size:20px;font-weight:700;color:#0e1014;line-height:1.2;letter-spacing:-0.01em;">' + name + verified + pronouns + '</div>'
      + '<div style="font-size:13px;color:#6b7180;margin-top:2px;line-height:1.4;">' + title + '</div>'
      + (company ? '<div style="font-size:14px;color:#0e1014;font-weight:700;margin-top:10px;line-height:1.4;">' + company + '</div>' : '')
      + phoneLine + emailLine + websiteLine + socialLine
      + '</td></tr></table>';
  }

  function render() {
    var preview = $('ovmg_preview');
    var src     = $('ovmg_htmlSrc');
    if (!preview || !src) return;
    var html = buildSignature();
    preview.innerHTML = html;
    src.textContent   = html;
    var img = preview.querySelector('img[alt]');
    if (img && img.src.indexOf('data:image') !== 0) {
      img.onerror = function () { this.onerror = null; this.src = LOGO_DATA_URI; };
    }
  }

  function bind(id, key) {
    var el = $(id);
    if (el) el.addEventListener('input', function (e) { state[key] = e.target.value; render(); });
  }
  bind('ovmg_name',      'name');
  bind('ovmg_pronouns',  'pronouns');
  bind('ovmg_title',     'title');
  bind('ovmg_company',   'company');
  bind('ovmg_phonelabel','phoneLabel');
  bind('ovmg_phone',     'phone');
  bind('ovmg_email',     'email');
  bind('ovmg_website',   'website');
  bind('ovmg_tiktok',    'tiktok');
  bind('ovmg_instagram', 'instagram');
  bind('ovmg_linkedin',  'linkedin');
  bind('ovmg_facebook',  'facebook');
  bind('ovmg_youtube',   'youtube');
  // Logo URL input removed — logo is always the embedded OneVibe Media mark

  var chk = $('ovmg_verified');
  if (chk) chk.addEventListener('change', function (e) { state.verified = e.target.checked; render(); });

  var toastTimer;
  function toast(msg) {
    var t = $('ovmg_toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, 2400);
  }

  var copyRich = $('ovmg_copyRich');
  if (copyRich) copyRich.addEventListener('click', function () {
    var html  = buildSignature();
    var plain = ($('ovmg_preview') || {}).innerText || '';
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html],  { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })
      ]).then(function () {
        toast('\\u2713 Signature copied \\u2014 paste into Gmail or Outlook');
      }).catch(legacyCopy);
    } else {
      legacyCopy();
    }
    function legacyCopy() {
      var range = document.createRange();
      var node  = $('ovmg_preview');
      if (!node) return;
      range.selectNode(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand('copy'); toast('\\u2713 Signature copied'); }
      catch (e) { toast('Copy failed \\u2014 use the HTML option'); }
      sel.removeAllRanges();
    }
  });

  var copyHtml = $('ovmg_copyHtml');
  if (copyHtml) copyHtml.addEventListener('click', function () {
    var html = buildSignature();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(html).then(function () {
        toast('\\u2713 HTML source copied');
      }).catch(function () { toast('Copy failed'); });
    } else {
      toast('Copy not supported in this browser');
    }
  });

  render();
})();
`;

export default function Signature() {
  const ref = useRef(null);
  const [logoStatus, setLogoStatus] = useState('loading'); // 'loading' | 'ok' | 'error'

  // Test hosted logo URL on mount
  useEffect(() => {
    const img = new Image();
    img.onload  = () => setLogoStatus('ok');
    img.onerror = () => setLogoStatus('error');
    img.src = DEFAULT_LOGO_URL;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const script = document.createElement('script');
    script.textContent = EMBED_SCRIPT;
    ref.current.appendChild(script);
    // Cleanup: remove script on unmount (state/listeners are GC'd with the DOM nodes)
    return () => {
      try { if (ref.current && ref.current.contains(script)) ref.current.removeChild(script); } catch (_) {}
    };
  }, []);

  return (
    <div>
      <Eyebrow>Branding</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>
        Email Signature
      </h1>
      <p style={{ fontSize: 13, color: C.ink5, marginBottom: 24 }}>
        Fill in your details to generate a copy-paste-ready HTML signature for Gmail and Outlook.
      </p>

      {/* Logo preview strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        padding: '10px 16px', background: '#fbf8f2',
        border: '1px solid #ddd3bb', borderRadius: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b7180', whiteSpace: 'nowrap' }}>
          Logo preview
        </span>
        {logoStatus === 'error' ? (
          <span style={{ fontSize: 12, color: '#c0392b', background: '#fdecea', border: '1px solid #f5c2c7', borderRadius: 6, padding: '4px 10px', fontWeight: 500 }}>
            ⚠ Logo URL unreachable — embedded fallback will be used in signatures
          </span>
        ) : (
          <img
            src={DEFAULT_LOGO_URL}
            alt="OneVibeMediaGroup"
            width={160}
            height={36}
            style={{ display: 'block', width: 160, height: 36, maxWidth: 220, objectFit: 'contain', opacity: logoStatus === 'loading' ? 0.35 : 1, transition: 'opacity 0.25s' }}
          />
        )}
      </div>

      {/* Self-contained embed — script injected via useEffect above */}
      <div
        className="ovmg-sig"
        ref={ref}
        dangerouslySetInnerHTML={{ __html: EMBED_HTML }}
      />
    </div>
  );
}
