import { useEffect, useRef, useState } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow } from '../components/UI.jsx';

// The two brand lockups. Both live in /public/signature/, which is deliberately
// unlinked from the rest of the app and marked noindex in netlify.toml — the
// files exist to be hotlinked by email clients rendering a sent signature, which
// arrive as anonymous requests with no session.
//
// Two URLs per brand: the relative one is what the dashboard's own preview strip
// loads (so it resolves in dev against the Vite server and in prod against
// Netlify), and the absolute one is what gets baked into the copied signature —
// a relative path in an email would resolve against the mail client's own host
// and 404 for every recipient.
//
// `width` is the pixel width the mark occupies at the signature's 28px logo
// height, precomputed from each file's aspect ratio. Outlook drops CSS on images
// often enough that the HTML width attribute has to carry a real number;
// width="auto" is not a valid value there and leaves the mark at its natural size.
const BRANDS = {
  ovmg: {
    label: 'OneVibeMediaGroup',
    company: 'OneVibeMediaGroup',
    src: '/signature/ovmg-logo.png',
    width: 207,
  },
  ovm: {
    label: 'OneVibeMedia',
    company: 'OneVibeMedia',
    src: '/signature/ovm-logo.png',
    width: 147,
  },
};
const BRAND_ORDER = ['ovmg', 'ovm'];

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
.ovmg-sig .ovmg-sig__seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.ovmg-sig .ovmg-sig__segbtn {
  padding: 9px 10px;
  border: 1px solid var(--sig-line);
  border-radius: 6px;
  background: var(--sig-field-bg);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: #3a4050;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.ovmg-sig .ovmg-sig__segbtn:hover { border-color: var(--sig-line-strong); }
.ovmg-sig .ovmg-sig__segbtn:focus-visible {
  outline: 2px solid var(--sig-accent);
  outline-offset: 2px;
}
.ovmg-sig .ovmg-sig__segbtn.is-on {
  background: var(--sig-ink);
  border-color: var(--sig-ink);
  color: #fbf8f2;
  font-weight: 600;
}
/* The lockup is drawn as a black mark on transparent, so the swatch behind it
   has to stay light even when the button it sits in goes dark on selection. */
.ovmg-sig .ovmg-sig__segbtn img {
  display: block;
  height: 20px;
  width: auto;
  margin: 0 auto 6px;
  background: #fbf8f2;
  border-radius: 3px;
  padding: 3px 6px;
}
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
      <label>Brand lockup</label>
      <div class="ovmg-sig__seg" id="ovmg_brand" role="radiogroup" aria-label="Brand lockup">
        <button type="button" class="ovmg-sig__segbtn is-on" data-brand="ovmg" role="radio" aria-checked="true">
          <img src="/signature/ovmg-logo.png" alt="">OneVibeMediaGroup
        </button>
        <button type="button" class="ovmg-sig__segbtn" data-brand="ovm" role="radio" aria-checked="false">
          <img src="/signature/ovm-logo.png" alt="">OneVibeMedia
        </button>
      </div>
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
  // Offline fallbacks, one per brand, used only by the in-dashboard preview when
  // the hosted URL cannot be reached. The copied signature always references the
  // hosted URL — a data URI survives the clipboard, but Gmail and Outlook both
  // strip it on send, so a signature built around one arrives broken.
  //
  // These are BLACK marks. The single fallback that used to live here was the
  // WHITE lockup, which is invisible against the cream preview stage and against
  // the white background of virtually every mail client — so whenever the
  // fallback actually fired it rendered nothing at all.
  //
  // Quantized to 32 colours at 84px tall (3x the 28px display height). Full RGBA
  // at this size costs roughly 4x the bytes for detail nobody can resolve in a
  // 28px logo, and the pair still comes in smaller than the one blob it replaces.
  var LOGO_FALLBACK = {
      ovmg: "data:image/png;base64,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",
      ovm:  "data:image/png;base64,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"
    };
  // Absolute URLs on purpose: this HTML is copied out of the dashboard and pasted
  // into Gmail or Outlook, where a relative path resolves against the mail host.
  var BRANDS = {
    ovmg: { label: "OneVibeMediaGroup", company: "OneVibeMediaGroup", width: 207,
            url: "https://ovmgdashboard.netlify.app/signature/ovmg-logo.png" },
    ovm:  { label: "OneVibeMedia",      company: "OneVibeMedia",      width: 147,
            url: "https://ovmgdashboard.netlify.app/signature/ovm-logo.png"  }
  };

  function brand() { return BRANDS[state.brand] || BRANDS.ovmg; }

  // True when the company line still holds a brand default rather than something
  // typed by hand. Switching lockups rewrites the company line only in that case,
  // so "OneVibe Media Group LLC" or a department name survives a brand switch.
  function companyIsDefault() {
    var v = (state.company || "").trim();
    if (!v) return true;
    for (var k in BRANDS) { if (BRANDS[k].company === v) return true; }
    return false;
  }

  var state = {
    name: '', pronouns: '', title: '', verified: false,
    brand: 'ovmg',
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

    // The lockup follows the brand switcher, not the company line — someone at
    // OneVibeMedia may still spell out a longer legal name underneath the mark.
    var b = brand();
    var logoLine = '<div style="margin-bottom:10px;">'
      + '<img src="' + esc(b.url) + '" alt="' + esc(b.label) + '"'
      + ' height="28" width="' + b.width + '" loading="eager"'
      + ' style="display:block;height:28px;width:' + b.width + 'px;border:0;" /></div>';

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
      var fallback = LOGO_FALLBACK[state.brand] || LOGO_FALLBACK.ovmg;
      img.onerror = function () { this.onerror = null; this.src = fallback; };
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
  // Brand switcher. Delegated off the group so the click still registers when it
  // lands on the <img> inside a button rather than the button itself.
  var seg = $('ovmg_brand');
  if (seg) seg.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.ovmg-sig__segbtn') : null;
    if (!btn) return;
    var key = btn.getAttribute('data-brand');
    if (!BRANDS[key] || key === state.brand) return;

    var wasDefault = companyIsDefault();
    state.brand = key;

    var btns = seg.querySelectorAll('.ovmg-sig__segbtn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i] === btn;
      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }

    // Only rewrite the company line when it was still a brand default. A hand-typed
    // one is the user's, and silently overwriting it on a lockup switch would lose
    // work with no undo.
    if (wasDefault) {
      state.company = BRANDS[key].company;
      var ci = $('ovmg_company');
      if (ci) { ci.value = state.company; ci.placeholder = state.company; }
    }
    render();
  });

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
  // One status per lockup: 'loading' | 'ok' | 'error'. Both are checked because a
  // signature is only as good as the file it hotlinks, and one brand's asset can
  // go missing without touching the other.
  const [logoStatus, setLogoStatus] = useState(() =>
    Object.fromEntries(BRAND_ORDER.map((k) => [k, 'loading'])),
  );

  useEffect(() => {
    const imgs = BRAND_ORDER.map((key) => {
      const img = new Image();
      const set = (status) => setLogoStatus((prev) => ({ ...prev, [key]: status }));
      img.onload  = () => set('ok');
      img.onerror = () => set('error');
      img.src = BRANDS[key].src;
      return img;
    });
    // Drop the handlers if the view unmounts mid-request, so a late load does not
    // call setState on an unmounted component.
    return () => imgs.forEach((img) => { img.onload = null; img.onerror = null; });
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

      {/* Hosted-asset health strip — one entry per lockup. This is not a preview of
          the current selection; the switcher lives inside the embed below and the
          live preview there already reflects it. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20,
        padding: '10px 16px', background: '#fbf8f2',
        border: '1px solid #ddd3bb', borderRadius: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b7180', whiteSpace: 'nowrap' }}>
          Hosted lockups
        </span>
        {BRAND_ORDER.map((key) => {
          const b = BRANDS[key];
          const status = logoStatus[key];
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {status === 'error' ? (
                <span style={{ fontSize: 12, color: '#c0392b', background: '#fdecea', border: '1px solid #f5c2c7', borderRadius: 6, padding: '4px 10px', fontWeight: 500 }}>
                  ⚠ {b.label} logo unreachable — the preview falls back to an embedded copy,
                  but a signature copied now will arrive with a broken image
                </span>
              ) : (
                <img
                  src={b.src}
                  alt={b.label}
                  height={26}
                  style={{ display: 'block', height: 26, width: 'auto', opacity: status === 'loading' ? 0.35 : 1, transition: 'opacity 0.25s' }}
                />
              )}
            </div>
          );
        })}
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
