import React, { useState } from 'react';
import { Send, Lock, Mail, User, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';

// ============================================================
// CONFIG — Update WEBHOOK_URL after you create the Zap
// ============================================================
const WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/25092373/4yq1a1f/';
// ============================================================

export default function NCNDASender() {
  const [triggerer, setTriggerer] = useState('');
  const [password, setPassword] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [envelopeId, setEnvelopeId] = useState('');

  const allFilled =
    triggerer && password && counterpartyName && counterpartyEmail;

  const handleSubmit = async () => {
    if (!allFilled) return;
    if (WEBHOOK_URL.startsWith('PASTE_')) {
      setStatus('error');
      setErrorMessage('Webhook URL not configured. Paste your Zapier hook URL in the artifact code.');
      return;
    }

    setStatus('sending');
    setErrorMessage('');

    try {
      const payload = {
        triggerer_email: triggerer,
        password: password,
        counterparty_name: counterpartyName.trim(),
        counterparty_email: counterpartyEmail.trim().toLowerCase(),
        notes: notes.trim(),
        client_timestamp: new Date().toISOString(),
      };

      // Use form-urlencoded body to avoid CORS preflight (Zapier still
      // parses each field into the trigger output the same as JSON).
      const body = new URLSearchParams(payload).toString();
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body,
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      let data = {};
      try {
        data = await response.json();
      } catch {
        // Zapier returns plain text sometimes; not an error
      }

      if (data.envelope_id) setEnvelopeId(data.envelope_id);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to send. Check connection.');
    }
  };

  const reset = () => {
    setCounterpartyName('');
    setCounterpartyEmail('');
    setNotes('');
    setStatus('idle');
    setErrorMessage('');
    setEnvelopeId('');
  };

  return (
    <div className="min-h-screen w-full bg-stone-950 text-stone-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-sm bg-amber-400 flex items-center justify-center">
              <FileText className="h-5 w-5 text-stone-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
                OVMG · Internal Tool
              </div>
              <h1 className="text-2xl font-bold tracking-tight">NCNDA Sender</h1>
            </div>
          </div>
          <p className="text-sm text-stone-400 leading-relaxed">
            Send a Mutual NCNDA to a counterparty via SignWell. Carsten signs first, counterparty signs second.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 space-y-5">
          {status === 'success' ? (
            <SuccessState envelopeId={envelopeId} counterpartyName={counterpartyName} onReset={reset} />
          ) : (
            <>
              {/* Triggerer */}
              <Field label="Your Email" icon={<User className="h-3.5 w-3.5" />}>
                <input
                  type="email"
                  value={triggerer}
                  onChange={(e) => setTriggerer(e.target.value)}
                  disabled={status === 'sending'}
                  placeholder="you@onevibemediagroup.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600"
                />
              </Field>

              {/* Password */}
              <Field label="Password" icon={<Lock className="h-3.5 w-3.5" />}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === 'sending'}
                  placeholder="Team password"
                  className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600"
                />
              </Field>

              <div className="h-px bg-stone-800 my-2" />

              {/* Counterparty Name */}
              <Field label="Counterparty Name" icon={<User className="h-3.5 w-3.5" />}>
                <input
                  type="text"
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  disabled={status === 'sending'}
                  placeholder="Jane Smith or Acme Corp"
                  className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600"
                />
                <p className="text-[11px] text-stone-500 mt-1.5">
                  Document title will be: <span className="text-stone-400">{counterpartyName || '[Name]'} X OVMG</span>
                </p>
              </Field>

              {/* Counterparty Email */}
              <Field label="Counterparty Email" icon={<Mail className="h-3.5 w-3.5" />}>
                <input
                  type="email"
                  value={counterpartyEmail}
                  onChange={(e) => setCounterpartyEmail(e.target.value)}
                  disabled={status === 'sending'}
                  placeholder="jane@acme.com"
                  className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600"
                />
              </Field>

              {/* Notes */}
              <Field label="Notes (optional)" icon={<FileText className="h-3.5 w-3.5" />}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={status === 'sending'}
                  rows={2}
                  placeholder="Context for the log (e.g. lead source, deal type)"
                  className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition placeholder:text-stone-600 resize-none"
                />
              </Field>

              {/* Error */}
              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900/60 rounded">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-300">{errorMessage}</div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!allFilled || status === 'sending'}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold py-3 rounded transition flex items-center justify-center gap-2 mt-2"
              >
                {status === 'sending' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send NCNDA
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600">
            Logged · Audited · Sent via SignWell
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function SuccessState({ envelopeId, counterpartyName, onReset }) {
  return (
    <div className="text-center py-4">
      <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="h-7 w-7 text-emerald-400" strokeWidth={2.5} />
      </div>
      <h2 className="text-lg font-bold mb-1">NCNDA Sent</h2>
      <p className="text-sm text-stone-400 mb-1">
        Envelope sent to <span className="text-stone-200">{counterpartyName}</span>
      </p>
      {envelopeId && (
        <p className="text-[11px] text-stone-500 font-mono mb-5">
          ID: {envelopeId}
        </p>
      )}
      <p className="text-xs text-stone-500 mb-5">
        Logged to Google Sheet · Carsten will receive his copy first
      </p>
      <button
        onClick={onReset}
        className="bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-medium py-2 px-5 rounded transition"
      >
        Send Another
      </button>
    </div>
  );
}
