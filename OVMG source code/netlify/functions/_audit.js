// Shared audit-log helper (Phase 7 audit fix H-6).
//
// Usage:
//   import { logAudit } from './_audit.js';
//   await logAudit({
//     event,                       // the Netlify function event, for IP/UA
//     actor: { id, email },        // from getUser(event)
//     action: 'tool_override.grant', // dot-namespaced verb
//     target: { id, email },       // (optional) the user being affected
//     meta: { tab: 'ncnda', ... }, // any extra context
//   });
//
// Failures are swallowed — auditing should NEVER break the calling function.
// All failures are console.error'd for debugging.

import { getSupabase } from './_supabase.js';

export async function logAudit({ event, actor, action, target, meta = {} }) {
  try {
    const supabase = getSupabase();
    const ip = event?.headers?.['x-nf-client-connection-ip']
            || event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
            || event?.headers?.['client-ip']
            || null;
    const userAgent = event?.headers?.['user-agent'] || null;

    const { error } = await supabase.from('audit_log').insert({
      actor_user_id:  actor?.id    || '',
      actor_email:    actor?.email || '',
      action,
      target_user_id: target?.id    || '',
      target_email:   target?.email || '',
      meta,
      ip,
      user_agent: userAgent,
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (e) {
    // Audit must NEVER break the calling function.
    console.error('[audit]', e.message);
  }
}
