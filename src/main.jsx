import { StrictMode, useReducer, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import PublicBookingPage from './PublicBookingPage.jsx';
import CancelBookingPage from './CancelBookingPage.jsx';

// Re-renders the whole tree when the theme toggles so inline styles pick up the
// swapped `C` palette. No remount → component state and fetched data survive.
function ThemeRoot({ children }) {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    window.addEventListener('ovmg:theme', force);
    return () => window.removeEventListener('ovmg:theme', force);
  }, []);
  return children;
}

// ── Error buffer for bug reports (2026-07 audit §2.4) ────────────────────────
// Keeps the last ~20 console/uncaught errors in memory so the "Report a bug"
// form can attach them. No network calls; purely local until a report is sent.
window.__ovmgErrors = [];
const pushErr = (msg) => {
  try {
    window.__ovmgErrors.push(`[${new Date().toISOString()}] ${String(msg).slice(0, 500)}`);
    if (window.__ovmgErrors.length > 20) window.__ovmgErrors.shift();
  } catch { /* never let error capture cause errors */ }
};
window.addEventListener('error', e => pushErr(e.message + (e.filename ? ` @ ${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', e => pushErr('Unhandled promise rejection: ' + (e.reason?.message || e.reason)));

// ── PWA service worker (§3.3) — network-first, install-enabling only ─────────
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — add it to your .env file');
}

const path = window.location.pathname;
const cancelMatch  = path.match(/^\/book\/([\w-]+)\/cancel\/?$/);
const bookingMatch = path.match(/^\/book\/([\w-]+)\/?$/);
const cancelToken  = cancelMatch ? new URLSearchParams(window.location.search).get('token') : null;

if (cancelMatch && cancelToken) {
  const slug = cancelMatch[1];
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ThemeRoot><CancelBookingPage slug={slug} token={cancelToken} /></ThemeRoot>
    </StrictMode>
  );
} else if (bookingMatch) {
  const slug = bookingMatch[1];
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ThemeRoot><PublicBookingPage slug={slug} /></ThemeRoot>
    </StrictMode>
  );
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <ThemeRoot><App /></ThemeRoot>
      </ClerkProvider>
    </StrictMode>
  );
}
