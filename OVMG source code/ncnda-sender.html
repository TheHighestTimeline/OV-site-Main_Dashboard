<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <title>NCNDA Sender · OVMG</title>

  <!-- iOS Home Screen / PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="NCNDA" />
  <meta name="theme-color" content="#0c0a09" />

  <!-- App icon: amber square w/ document on stone background -->
  <link rel="apple-touch-icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'><rect width='180' height='180' rx='32' fill='%230c0a09'/><rect x='44' y='44' width='92' height='92' rx='6' fill='%23fbbf24'/><g transform='translate(63 60)' fill='none' stroke='%230c0a09' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M42 0H8a5 5 0 0 0-5 5v50a5 5 0 0 0 5 5h38a5 5 0 0 0 5-5V13z'/><polyline points='42 0 42 13 55 13'/><line x1='13' y1='28' x2='42' y2='28'/><line x1='13' y1='38' x2='42' y2='38'/><line x1='13' y1='48' x2='33' y2='48'/></g></svg>" />
  <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='12' fill='%23fbbf24'/><g transform='translate(30 26)' fill='none' stroke='%230c0a09' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M30 0H5a3 3 0 0 0-3 3v42a3 3 0 0 0 3 3h30a3 3 0 0 0 3-3V10z'/><polyline points='30 0 30 10 38 10'/><line x1='10' y1='22' x2='30' y2='22'/><line x1='10' y1='30' x2='30' y2='30'/><line x1='10' y1='38' x2='25' y2='38'/></g></svg>" />

  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Lucide icons -->
  <script src="https://unpkg.com/lucide@latest"></script>

  <style>
    html, body { background: #0c0a09; }
    body {
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior-y: contain;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    input, select, textarea {
      font-size: 16px; /* prevent iOS zoom-on-focus */
    }
    select {
      -webkit-appearance: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
  </style>
</head>
<body class="bg-stone-950 text-stone-100 min-h-screen flex items-center justify-center p-4 font-sans">

  <div class="w-full max-w-md">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <div class="h-10 w-10 rounded-sm bg-amber-400 flex items-center justify-center">
          <i data-lucide="file-text" class="h-5 w-5 text-stone-950" stroke-width="2.5"></i>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">OVMG · Internal Tool</div>
          <h1 class="text-2xl font-bold tracking-tight">NCNDA Sender</h1>
        </div>
      </div>
      <p class="text-sm text-stone-400 leading-relaxed">
        Send a Mutual NCNDA to a counterparty via SignWell. Carsten signs first, counterparty signs second.
      </p>
    </div>

    <!-- Card -->
    <div class="bg-stone-900 border border-stone-800 rounded-lg p-6">

      <!-- FORM VIEW -->
      <div id="formView" class="space-y-5">
        <div>
          <label class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
            <i data-lucide="user" class="h-3.5 w-3.5"></i> Your Email
          </label>
          <input id="triggerer" type="email" placeholder="you@onevibemediagroup.com"
            autocapitalize="none" autocomplete="email" autocorrect="off" spellcheck="false"
            class="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600" />
        </div>

        <div>
          <label class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
            <i data-lucide="lock" class="h-3.5 w-3.5"></i> Password
          </label>
          <input id="password" type="password" placeholder="Team password"
            class="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600" />
        </div>

        <div class="h-px bg-stone-800"></div>

        <div>
          <label class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
            <i data-lucide="user" class="h-3.5 w-3.5"></i> Counterparty Name
          </label>
          <input id="counterpartyName" type="text" placeholder="Jane Smith or Acme Corp" autocapitalize="words"
            class="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600" />
          <p class="text-[11px] text-stone-500 mt-1.5">
            Document title will be: <span class="text-stone-400"><span id="titlePreview">[Name]</span> X OVMG</span>
          </p>
        </div>

        <div>
          <label class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
            <i data-lucide="mail" class="h-3.5 w-3.5"></i> Counterparty Email
          </label>
          <input id="counterpartyEmail" type="email" placeholder="jane@acme.com"
            autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false"
            class="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600" />
        </div>

        <div>
          <label class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
            <i data-lucide="file-text" class="h-3.5 w-3.5"></i> Notes (optional)
          </label>
          <textarea id="notes" rows="2" placeholder="Context for the log (e.g. lead source, deal type)"
            class="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600 resize-none"></textarea>
        </div>

        <div id="errorBox" class="hidden items-start gap-2 p-3 bg-red-950/40 border border-red-900/60 rounded">
          <i data-lucide="alert-circle" class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5"></i>
          <div class="text-xs text-red-300" id="errorText"></div>
        </div>

        <button id="submitBtn" disabled
          class="w-full bg-amber-400 hover:bg-amber-300 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold py-3 rounded transition flex items-center justify-center gap-2">
          <span id="iconSend"><i data-lucide="send" class="h-4 w-4"></i></span>
          <span id="iconSpin" class="hidden">
            <svg class="h-4 w-4 spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </span>
          <span id="submitLabel">Send NCNDA</span>
        </button>
      </div>

      <!-- SUCCESS VIEW -->
      <div id="successView" class="hidden text-center py-4">
        <div class="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <i data-lucide="check-circle-2" class="h-7 w-7 text-emerald-400" stroke-width="2.5"></i>
        </div>
        <h2 class="text-lg font-bold mb-1">NCNDA Sent</h2>
        <p class="text-sm text-stone-400 mb-1">Envelope sent to <span class="text-stone-200" id="successName"></span></p>
        <p class="text-[11px] text-stone-500 font-mono mb-5 hidden" id="successId"></p>
        <p class="text-xs text-stone-500 mb-5">Logged to Google Sheet · Carsten will receive his copy first</p>
        <button id="resetBtn" class="bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-medium py-2 px-5 rounded transition">Send Another</button>
      </div>
    </div>

    <div class="mt-6 text-center">
      <p class="text-[10px] uppercase tracking-[0.2em] text-stone-600">Logged · Audited · Sent via SignWell</p>
    </div>
  </div>

  <script>
    // ============================================================
    // CONFIG — paste your Zapier Catch Hook URL here
    // ============================================================
    const WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/25092373/4yq1a1f/';
    // ============================================================

    lucide.createIcons();

    const $ = (id) => document.getElementById(id);
    const els = {
      triggerer: $('triggerer'),
      password: $('password'),
      name: $('counterpartyName'),
      email: $('counterpartyEmail'),
      notes: $('notes'),
      submit: $('submitBtn'),
      submitLabel: $('submitLabel'),
      iconSend: $('iconSend'),
      iconSpin: $('iconSpin'),
      titlePreview: $('titlePreview'),
      formView: $('formView'),
      successView: $('successView'),
      successName: $('successName'),
      successId: $('successId'),
      errorBox: $('errorBox'),
      errorText: $('errorText'),
      reset: $('resetBtn'),
    };

    function refreshSubmit() {
      const filled = els.triggerer.value && els.password.value && els.name.value.trim() && els.email.value.trim();
      els.submit.disabled = !filled || els.submit.dataset.sending === '1';
    }

    function refreshPreview() {
      els.titlePreview.textContent = els.name.value.trim() || '[Name]';
    }

    ['input', 'change'].forEach((evt) => {
      [els.triggerer, els.password, els.name, els.email].forEach((el) => el.addEventListener(evt, refreshSubmit));
    });
    els.name.addEventListener('input', refreshPreview);

    function showError(msg) {
      els.errorText.textContent = msg;
      els.errorBox.classList.remove('hidden');
      els.errorBox.classList.add('flex');
    }
    function clearError() {
      els.errorBox.classList.add('hidden');
      els.errorBox.classList.remove('flex');
    }

    function setSending(sending) {
      els.submit.dataset.sending = sending ? '1' : '0';
      [els.triggerer, els.password, els.name, els.email, els.notes].forEach((el) => (el.disabled = sending));
      if (sending) {
        els.iconSend.classList.add('hidden');
        els.iconSpin.classList.remove('hidden');
        els.submitLabel.textContent = 'Sending…';
        els.submit.disabled = true;
      } else {
        els.iconSend.classList.remove('hidden');
        els.iconSpin.classList.add('hidden');
        els.submitLabel.textContent = 'Send NCNDA';
        refreshSubmit();
      }
    }

    function showSuccess(envelopeId, name) {
      els.successName.textContent = name;
      if (envelopeId) {
        els.successId.textContent = 'ID: ' + envelopeId;
        els.successId.classList.remove('hidden');
      } else {
        els.successId.classList.add('hidden');
      }
      els.formView.classList.add('hidden');
      els.successView.classList.remove('hidden');
    }

    function reset() {
      els.name.value = '';
      els.email.value = '';
      els.notes.value = '';
      // keep triggerer + password so resending is fast
      els.formView.classList.remove('hidden');
      els.successView.classList.add('hidden');
      clearError();
      setSending(false);
      refreshPreview();
      refreshSubmit();
    }

    els.reset.addEventListener('click', reset);

    els.submit.addEventListener('click', async () => {
      clearError();
      if (WEBHOOK_URL.startsWith('PASTE_')) {
        showError('Webhook URL not configured. Edit this file and set WEBHOOK_URL to your Zapier hook URL.');
        return;
      }
      setSending(true);

      const payload = {
        triggerer_email: els.triggerer.value,
        password: els.password.value,
        counterparty_name: els.name.value.trim(),
        counterparty_email: els.email.value.trim().toLowerCase(),
        notes: els.notes.value.trim(),
        client_timestamp: new Date().toISOString(),
      };

      try {
        // Use form-urlencoded body to avoid CORS preflight (Zapier still
        // parses each field into the trigger output the same as JSON).
        const body = new URLSearchParams(payload).toString();
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body,
        });
        if (!response.ok) throw new Error('Webhook returned ' + response.status);
        let data = {};
        try { data = await response.json(); } catch (_) {}
        showSuccess(data.envelope_id || '', payload.counterparty_name);
      } catch (err) {
        setSending(false);
        showError((err && err.message) || 'Failed to send. Check connection.');
      }
    });

    refreshPreview();
    refreshSubmit();
  </script>
</body>
</html>
