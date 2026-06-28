// Generates a one-time sign-in token for a user and returns the magic link.
// Strategy: clerk.signInTokens.createSignInToken() — creates a URL the user
// can click to sign in without a password. Token expires in 1 hour.
// The admin copies the link and sends it to the user via any channel.
import { createClerkClient } from '@clerk/backend';
import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  try {
    const { userId } = JSON.parse(event.body || '{}');
    if (!userId) return err(400, 'userId is required');

    const tokenRes = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 3600, // 1 hour
    });

    const siteUrl = process.env.URL || 'https://ovmgdashboard.netlify.app';
    // Clerk sign-in token URL format
    const signInUrl = `${siteUrl}/?__clerk_ticket=${tokenRes.token}`;

    return ok({ sent: true, userId, signInUrl, expiresIn: '1 hour' });
  } catch (e) {
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message;
    return err(500, msg);
  }
};
