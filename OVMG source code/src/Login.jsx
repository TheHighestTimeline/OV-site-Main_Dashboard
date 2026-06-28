import { useState } from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { C, SERIF, SANS, MONO } from './constants.js';

/**
 * Login — renders Clerk's embedded SignIn or SignUp panel.
 *
 * Clerk handles all auth flows: password, SSO, magic link, MFA.
 * New-user invitations are managed in the Clerk dashboard
 * (Users → Invitations). You can also restrict sign-ups to
 * @onevibemediagroup.com only via Clerk dashboard →
 * User & Authentication → Restrictions → Allowed email patterns.
 */
export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'

  const clerkAppearance = {
    variables: {
      colorPrimary:         C.acc,
      colorBackground:      C.ink8,
      colorText:            C.cr1,
      colorInputBackground: C.ink8,
      colorInputText:       C.cr1,
      borderRadius:         '10px',
      fontFamily:           SANS,
    },
    elements: {
      card:   { boxShadow: 'none', border: `1px solid ${C.ink7}` },
      footer: { display: 'none' },
    },
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: C.chromeBg,
      fontFamily: SANS, padding: 24, flexDirection: 'column', gap: 24,
    }}>
      {/* Brand header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 56, color: C.acc, lineHeight: 1 }}>◐</div>
        <h1 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 28,
          letterSpacing: '-.02em', color: C.chromeFg, margin: '8px 0 4px',
        }}>
          OneVibe Internal Hub
        </h1>
        <p style={{ fontSize: 13, color: C.chromeMut, margin: 0, lineHeight: 1.6 }}>
          {mode === 'signin' ? 'Sign in to your team account.' : 'Create your team account.'}
        </p>
      </div>

      {/* Clerk embedded UI */}
      {mode === 'signin'
        ? <SignIn appearance={clerkAppearance} />
        : <SignUp appearance={clerkAppearance} />
      }

      {/* Toggle between sign-in and sign-up */}
      <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>
        {mode === 'signin' ? (
          <>
            {'Need an account? '}
            <button
              onClick={() => setMode('signup')}
              style={{ background: 'none', border: 'none', color: C.acc, cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              Create one
            </button>
          </>
        ) : (
          <>
            {'Already have an account? '}
            <button
              onClick={() => setMode('signin')}
              style={{ background: 'none', border: 'none', color: C.acc, cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
