import { useState, useRef, useEffect } from 'react';
import { C, SERIF, SANS, MONO } from '../constants.js';
import { Eyebrow, Btn, Inp, FR, Sel } from '../components/UI.jsx';
import { sendEmail } from '../api.js';
import useIsMobile from '../hooks/useIsMobile.js';

// ─────────────────────────────────────────────────────────────────────────────
// OVM HTML — Outbound HTML email generator. Sender: Nathan South.
// A library of 4 templates, live HTML preview, and one-click send via the
// existing send-email API.
// ─────────────────────────────────────────────────────────────────────────────

const SENDER = { id: 'nathan', name: 'Nathan South', email: 'nathan@onevibemediagroup.com' };

// ── HTML Template Library ─────────────────────────────────────────────────────
function buildTemplate(id, vars) {
  const { recipientName = 'there', senderName = 'Nathan South', senderEmail = 'nathan@onevibemediagroup.com' } = vars;
  const logoUrl = '/email-logo.png';

  const wrap = (body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f4f0e6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; }
  .outer { background:#f4f0e6; padding:32px 16px; }
  .card  { background:#fff; border-radius:12px; max-width:560px; margin:0 auto; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:#0e1014; padding:24px 32px; }
  .header img { height:36px; width:auto; display:block; }
  .body { padding:32px; color:#1f232e; font-size:15px; line-height:1.7; }
  .body h2 { font-size:22px; font-weight:600; color:#0e1014; margin:0 0 16px; }
  .body p  { margin:0 0 14px; }
  .cta { display:inline-block; margin:8px 0 20px; padding:12px 28px; background:#d96b3a; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; }
  .footer { background:#f4f0e6; padding:20px 32px; border-top:1px solid #ebe4d3; font-size:12px; color:#6b7180; }
  .footer a { color:#d96b3a; text-decoration:none; }
</style>
</head>
<body>
<div class="outer">
<div class="card">
  <div class="header">
    <img src="${logoUrl}" alt="OneVibeMediaGroup" width="160" height="36">
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    ${senderName} &middot; <a href="mailto:${senderEmail}">${senderEmail}</a>
    &middot; <a href="https://onevibemedia.shop">onevibemedia.shop</a>
    <br>OneVibeMediaGroup &middot; Orlando, FL
    <br><small style="color:#a6abb8">You received this because we thought your business could benefit from working together. Reply "unsubscribe" to opt out.</small>
  </div>
</div>
</div>
</body>
</html>`;

  switch (id) {
    case 'intro':
      return wrap(`
<h2>Let's work together, ${recipientName}</h2>
<p>Hi ${recipientName},</p>
<p>My name is ${senderName} from <strong>OneVibeMediaGroup</strong>. We help local businesses grow through high-converting content, social campaigns, and digital strategy.</p>
<p>I came across your business and genuinely think there's an opportunity to help you get more eyes on what you do. We've helped businesses in your area increase their online visibility — and we'd love to show you what that could look like for you.</p>
<p>Would you be open to a quick 15-minute call this week?</p>
<a class="cta" href="https://onevibemedia.shop">See Our Work</a>
<p>No pressure at all — happy to answer any questions by email too.</p>
<p>Looking forward to connecting,<br><strong>${senderName}</strong></p>`);

    case 'followup':
      return wrap(`
<h2>Following up, ${recipientName}</h2>
<p>Hi ${recipientName},</p>
<p>I reached out a little while ago about partnering with your business — I wanted to follow up in case my last message got buried.</p>
<p>We specialize in content creation, social media growth, and digital campaigns for local businesses. Right now we have a few spots open for new clients and I believe your business would be a great fit.</p>
<p>If you're curious about what results we've gotten for businesses similar to yours, I'd love to share some examples.</p>
<a class="cta" href="https://onevibemedia.shop">View Our Portfolio</a>
<p>Even a quick reply letting me know if it's a no — I'd really appreciate it.</p>
<p>Best,<br><strong>${senderName}</strong></p>`);

    case 'offer':
      return wrap(`
<h2>A special offer for ${recipientName}</h2>
<p>Hi ${recipientName},</p>
<p>I wanted to reach out with something specific: we're currently offering a <strong>free 30-minute strategy session</strong> for local businesses looking to grow their online presence.</p>
<p>No strings attached — we'll look at your current social/web presence, identify the biggest opportunities, and walk you through exactly what we'd do to improve it.</p>
<a class="cta" href="https://onevibemedia.shop">Book Your Free Session</a>
<p>These spots fill up fast, so I wanted to make sure you knew about it before we open it to everyone.</p>
<p>Talk soon,<br><strong>${senderName}</strong></p>`);

    case 'casestudy':
      return wrap(`
<h2>How we helped a business like yours</h2>
<p>Hi ${recipientName},</p>
<p>I wanted to share a quick story. A few months ago we started working with a local service business that had a solid product but wasn't getting nearly enough online visibility.</p>
<p>After 90 days of working with us:</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>3x increase in Instagram engagement</li>
  <li>Booked out 6 weeks in advance</li>
  <li>Over 40 new leads from content alone</li>
</ul>
<p>We think we can do the same for you. Want to see the full breakdown?</p>
<a class="cta" href="https://onevibemedia.shop">See the Case Study</a>
<p>Happy to answer any questions,<br><strong>${senderName}</strong></p>`);

    case 'ovm-outreach':
      // Custom OneVibeMedia outreach email. `recipientName` fills in the
      // company name everywhere "Company" appears.
      return buildOvmOutreach(recipientName === 'there' ? 'your company' : recipientName);

    default:
      return wrap(`<p>Hello ${recipientName},</p><p>Message from ${senderName}.</p>`);
  }
}

// ── Standalone OneVibeMedia outreach template (full custom HTML) ────────────────
// The company name is substituted wherever the literal word "Company" appears.
function buildOvmOutreach(company) {
  const co = company || 'your company';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>OneVibeMedia</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6fa; -webkit-font-smoothing:antialiased; -webkit-text-size-adjust:100%; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fa;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(11,61,145,0.08);">
          <tr>
            <td style="background-color:#0B3D91; background-image:linear-gradient(135deg, #0B3D91 0%, #4A90E2 100%); padding:36px 32px 32px 32px; text-align:center;">
              <h1 style="margin:0 0 6px 0; font-family:Georgia,'Times New Roman',serif; font-size:30px; line-height:1.2; font-weight:700; color:#ffffff; letter-spacing:-0.3px;">OneVibeMedia</h1>
              <p style="margin:0; font-size:11px; line-height:1.4; letter-spacing:2.4px; color:#58F2E4; text-transform:uppercase; font-weight:600;">Premium Media &amp; Marketing Systems</p>
            </td>
          </tr>
          <tr>
            <td style="height:4px; background:linear-gradient(90deg, #39BAEB 0%, #58F2E4 35%, #00EDA7 70%, #FFD700 100%); font-size:0; line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:40px 36px 32px 36px; color:#2c3e50; font-size:16px; line-height:1.65;">
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">Hi ${co} team,</p>
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">I'll keep this simple.</p>
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">I'm Nathan, Director of Sales at OneVibeMedia.</p>
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">Our team started by building and scaling marketing systems for our own companies, and after getting asked how we were doing it, we turned that into a company that helps other businesses grow through media and marketing.</p>
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">I'm reaching out because I think we could help ${co} improve how you attract attention, turn that attention into leads, and convert more of those leads into customers.</p>
              <p style="margin:0 0 18px 0; font-size:16px; color:#2c3e50;">Rather than send a long pitch, I'd rather just ask if you'd be open to a short discovery call. Even our founder still takes these calls personally because we stay selective about who we work with &mdash; you can check out his socials linked in the button below.</p>
              <p style="margin:0 0 24px 0; font-size:16px; color:#2c3e50;">If you're open to it, I'd be happy to coordinate a time.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                <tr>
                  <td align="left">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:#0B3D91; background-image:linear-gradient(135deg, #0B3D91 0%, #4A90E2 100%); border-radius:6px; padding:0;">
                          <a href="https://calendar.app.google/SuFHuGBPZPKuwWWU6" target="_blank" style="display:inline-block; padding:12px 22px; font-size:12px; font-weight:700; letter-spacing:1.2px; color:#ffffff; text-decoration:none; text-transform:uppercase;">Book a Time</a>
                        </td>
                        <td style="width:8px; font-size:0; line-height:0;">&nbsp;</td>
                        <td style="background-color:#00EDA7; background-image:linear-gradient(135deg, #00EDA7 0%, #58F2E4 100%); border-radius:6px; padding:0;">
                          <a href="https://onevibemedia.shop/" target="_blank" style="display:inline-block; padding:12px 22px; font-size:12px; font-weight:700; letter-spacing:1.2px; color:#0B3D91; text-decoration:none; text-transform:uppercase;">Our Website</a>
                        </td>
                        <td style="width:8px; font-size:0; line-height:0;">&nbsp;</td>
                        <td style="background-color:#39BAEB; background-image:linear-gradient(135deg, #39BAEB 0%, #58F2E4 100%); border-radius:6px; padding:0;">
                          <a href="https://www.instagram.com/mronevibe?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw%3D%3D" target="_blank" style="display:inline-block; padding:12px 22px; font-size:12px; font-weight:700; letter-spacing:1.2px; color:#0B3D91; text-decoration:none; text-transform:uppercase;">Founder's Socials</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-size:14px; color:#4B4F54; font-style:italic;">Or just reply to this email &mdash; happy to work around your schedule.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 36px 36px; background-color:#fafbfd; border-top:1px solid #e6ebf2;">
              <p style="margin:24px 0 16px 0; font-size:15px; color:#2c3e50;">Best,</p>
              <table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;border-collapse:collapse;">
                <tr>
                  <td style="padding-right:18px;border-right:1px solid #d8d4cc;vertical-align:top;">&nbsp;</td>
                  <td style="padding-left:18px;vertical-align:top;">
                    <div style="font-size:20px;font-weight:700;color:#0e0e10;line-height:1.2;letter-spacing:-0.01em;">Nathan South <span style="display:inline-block;vertical-align:middle;width:16px;height:16px;background:#1d9bf0;border-radius:50%;color:white;font-size:11px;font-weight:700;text-align:center;line-height:16px;margin-left:4px;font-family:Helvetica,Arial,sans-serif;">&#10003;</span></div>
                    <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.4;">Director of Sales</div>
                    <div style="font-size:14px;color:#0e0e10;font-weight:700;margin-top:10px;line-height:1.4;">OneVibeMedia</div>
                    <div style="font-size:14px;line-height:1.6;margin-top:2px;">
                      <a href="mailto:nathan@onevibemediagroup.com" style="color:#222;text-decoration:underline;">nathan@onevibemediagroup.com</a>
                    </div>
                    <div style="font-size:13px;line-height:1.6;margin-top:2px;">
                      <a href="https://onevibemedia.shop/" style="color:#222;text-decoration:none;">onevibemedia.shop</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0B3D91; background-image:linear-gradient(135deg, #0B3D91 0%, #4A90E2 100%); padding:24px 32px; text-align:center;">
              <p style="margin:0 0 8px 0; font-family:Georgia,'Times New Roman',serif; font-size:18px; font-style:italic; color:#ffffff; letter-spacing:0.3px;">OneVibeMedia</p>
              <p style="margin:0; font-size:11px; letter-spacing:2px; color:#58F2E4; text-transform:uppercase; font-weight:600;">&copy; 2026 OneVibeMedia &middot; Denver, Colorado</p>
            </td>
          </tr>
          <tr>
            <td style="height:4px; background:linear-gradient(90deg, #39BAEB 0%, #58F2E4 35%, #00EDA7 70%, #FFD700 100%); font-size:0; line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Only the two official outbound options remain: the founder-built OVM outreach
// email and a free-form Custom Body. The earlier draft templates (Cold Intro,
// Follow-Up, Free Strategy Call, Case Study) were removed as unofficial.
const TEMPLATES = [
  { id: 'ovm-outreach', label: 'OVM Outreach (Original)', desc: 'Nathan\'s branded outreach email — enter the company name', usesCompany: true },
];

export default function OvmHtml({ user, showToast }) {
  const isMobile = useIsMobile();
  const [recipientName,  setRecipientName]  = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject,        setSubject]        = useState('');
  // Default to the canonical, founder-built OVM outreach template so the tool
  // always opens on the proven email and never silently drifts to another one.
  const [templateId,     setTemplateId]     = useState('ovm-outreach');
  const [useCustom,      setUseCustom]      = useState(false);
  const [customBody,     setCustomBody]     = useState('');
  const [sending,        setSending]        = useState(false);
  const [sent,           setSent]           = useState(false);
  const iframeRef = useRef(null);

  const sender   = SENDER;
  const template = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0];

  // Auto-populate subject when template or recipient changes
  useEffect(() => {
    if (!subject || TEMPLATES.some(t => subject.startsWith(t.label))) {
      const map = {
        'ovm-outreach': recipientName ? `OneVibeMedia x ${recipientName}` : 'A quick idea for your business',
        intro:     recipientName ? `Hey ${recipientName} — let's connect` : 'Let\'s work together',
        followup:  'Following up on my last message',
        offer:     'Free strategy session — no strings attached',
        casestudy: 'How we helped a business like yours',
      };
      setSubject(map[templateId] || '');
    }
  }, [templateId, recipientName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom Body renders inside the generic branded card shell (default case of
  // buildTemplate, which exposes a <div class="body"> for injection) — never the
  // table-based OVM Outreach layout, which has no body slot.
  const previewHtml = useCustom
    ? buildTemplate('__custom__', { recipientName: recipientName || 'there', senderName: sender.name, senderEmail: sender.email }).replace(
        /<div class="body">[\s\S]*?<\/div>\s*<div class="footer">/,
        `<div class="body">${customBody}</div>\n  <div class="footer">`
      )
    : buildTemplate(templateId, { recipientName: recipientName || 'there', senderName: sender.name, senderEmail: sender.email });

  // Resize iframe after content loads
  const handleIframeLoad = (e) => {
    try {
      const h = e.target.contentDocument?.body?.scrollHeight;
      if (h) e.target.style.height = Math.min(h + 32, 600) + 'px';
    } catch {}
  };

  const handleSend = async () => {
    if (!recipientEmail.trim()) { showToast?.('Enter a recipient email'); return; }
    if (!subject.trim())        { showToast?.('Enter a subject line');    return; }
    setSending(true);
    try {
      await sendEmail({
        to:      recipientEmail.trim(),
        subject: subject.trim(),
        body:    previewHtml,
        from:    sender.email,
      });
      setSent(true);
      showToast?.('Email sent via ' + sender.email);
    } catch (e) {
      showToast?.('Send failed: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setRecipientName('');
    setRecipientEmail('');
    setSubject('');
    setTemplateId('ovm-outreach');
    setUseCustom(false);
    setCustomBody('');
    setSent(false);
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(previewHtml);
      showToast?.('HTML copied to clipboard');
    } catch {
      showToast?.('Copy failed — try selecting and copying manually');
    }
  };

  if (sent) {
    return (
      <div>
        <Eyebrow>Email</Eyebrow>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 24px', color: C.ink9, lineHeight: 1 }}>
          OVM HTML
        </h1>
        <div style={{ maxWidth: 500, background: C.grnS, border: `1px solid ${C.grn}30`, borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontFamily: SERIF, fontSize: 42, color: C.grn, marginBottom: 10 }}>✓</div>
          <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, color: C.ink9, marginBottom: 6 }}>Email Sent</div>
          <div style={{ fontSize: 13, color: C.ink5, marginBottom: 4 }}>
            Sent to <span style={{ color: C.ink9, fontWeight: 500 }}>{recipientName || recipientEmail}</span>
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginBottom: 20 }}>
            From: {sender.email} &middot; Template: {template.label}
          </div>
          <Btn v="gho" onClick={handleReset}>Send Another</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Email</Eyebrow>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 38, letterSpacing: '-.025em', margin: '0 0 6px', color: C.ink9, lineHeight: 1 }}>
        OVM HTML
      </h1>
      <p style={{ fontSize: 13, color: C.ink5, marginBottom: 24 }}>
        Generate and send branded HTML outbound emails from Nathan South. Fill in recipient details, pick a template, and preview before sending.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Left: Form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Recipient */}
          <div style={{
            padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`,
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
              Recipient
            </div>
            <FR label={template.usesCompany ? 'Company Name' : 'Name'}>
              <Inp value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder={template.usesCompany ? 'Acme Co.' : 'Jane Smith'} />
            </FR>
            <FR label="Email *">
              <Inp type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="jane@business.com" />
            </FR>
            <FR label="Subject *">
              <Inp value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line" />
            </FR>
          </div>

          {/* Template selector */}
          <div style={{
            padding: '14px 16px', background: C.bg2, border: `1px solid ${C.cr2}`,
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3 }}>
              Template
            </div>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => { setTemplateId(t.id); setUseCustom(false); }}
                style={{
                  padding: '10px 12px', borderRadius: 8, border: `1px solid ${templateId === t.id && !useCustom ? C.acc : C.cr3}`,
                  background: templateId === t.id && !useCustom ? C.accS : C.bg,
                  cursor: 'pointer', textAlign: 'left', transition: 'all .12s',
                }}
              >
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: templateId === t.id && !useCustom ? C.acc : C.ink9 }}>
                  {t.label}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  {t.desc}
                </div>
              </button>
            ))}

            {/* Custom body toggle */}
            <button
              onClick={() => setUseCustom(u => !u)}
              style={{
                padding: '10px 12px', borderRadius: 8, border: `1px solid ${useCustom ? C.blu : C.cr3}`,
                background: useCustom ? C.bluS : C.bg,
                cursor: 'pointer', textAlign: 'left', transition: 'all .12s',
              }}
            >
              <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: useCustom ? C.blu : C.ink9 }}>
                Custom Body
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                Write your own HTML body content
              </div>
            </button>

            {useCustom && (
              <textarea
                value={customBody}
                onChange={e => setCustomBody(e.target.value)}
                rows={6}
                placeholder="<h2>Hello!</h2><p>Your custom HTML here...</p>"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                  border: `1px solid ${C.cr3}`, borderRadius: 6,
                  background: C.bg, color: C.ink9, fontFamily: MONO,
                  fontSize: 12, lineHeight: 1.5, resize: 'vertical', outline: 'none',
                }}
              />
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={handleSend} disabled={sending || !recipientEmail.trim() || !subject.trim()} v="acc"
              sx={{ flex: 1, justifyContent: 'center' }}>
              {sending ? 'Sending…' : '→ Send Email'}
            </Btn>
            <Btn v="gho" onClick={handleCopyHtml} sx={{ whiteSpace: 'nowrap' }}>
              Copy HTML
            </Btn>
          </div>

          <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 }}>
            Sends from {sender.email}
          </div>
        </div>

        {/* ── Right: Preview ── */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.cr3}`, borderRadius: 10,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${C.cr3}`,
            fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
            textTransform: 'uppercase', color: C.ink3,
          }}>
            Live Preview &middot; <span style={{ color: C.ink8 }}>{template.label}</span>
          </div>
          <div style={{ background: '#f4f0e6', flex: 1, padding: 0 }}>
            <iframe
              ref={iframeRef}
              key={previewHtml.slice(0, 80) + templateId + recipientName}
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              title="Email preview"
              onLoad={handleIframeLoad}
              style={{ width: '100%', border: 'none', display: 'block', minHeight: 400, height: 500 }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
