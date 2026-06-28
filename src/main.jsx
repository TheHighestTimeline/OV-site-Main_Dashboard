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
