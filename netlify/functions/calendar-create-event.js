// calendar-create-event — Phase 9.
// Creates a new event on a Google Calendar (defaults to the shared OVMG team
// calendar if OVMG_TEAM_CALENDAR_ID is set, otherwise the user's primary).
//
// Per the plan: dashboard CREATES events. It does NOT edit them — editing
// existing events forces the user into actual Google Calendar (a deliberate
// guardrail to protect Playbook references that may link to events).
//
// POST body:
//   {
//     calendarId?: string         (defaults to OVMG team cal or 'primary')
//     title:       string
//     start:       ISO-8601       (required)
//     end:         ISO-8601       (required)
//     description?: string
//     location?:   string
//     attendees?:  string[]       (email addresses)
//     withMeet?:   boolean        (default: true — auto-attach Google Meet)
//     alerts?:     number[]       (minutes before; default [60, 30, 5])
//   }

import { google } from 'googleapis';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getActiveGoogleClient } from './_google.js';
import { logAudit } from './_audit.js';
import crypto from 'crypto';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const title = (body.title || '').trim();
  const start = body.start;
  const end   = body.end;
  if (!title) return err(400, 'title is required');
  if (!start) return err(400, 'start is required (ISO-8601)');
  if (!end)   return err(400, 'end is required (ISO-8601)');

  // Calendar to write to. Default to the connected account's OWN primary
  // calendar — always writable, and the right place to mark "I'm busy." Writing
  // to a shared team calendar (pass calendarId, or set OVMG_TEAM_CALENDAR_ID)
  // only works if that calendar is shared to the account with "Make changes to
  // events" permission — otherwise Google returns "writer access" errors.
  const calendarId = body.calendarId || 'primary';

  const description = (body.description || '').trim();
  const location    = (body.location    || '').trim();
  const attendees   = Array.isArray(body.attendees) ? body.attendees.filter(Boolean) : [];
  const withMeet    = body.withMeet !== false;  // default true
  const alerts      = Array.isArray(body.alerts) && body.alerts.length > 0
                    ? body.alerts.filter(n => Number.isFinite(n) && n >= 0)
                    : [60, 30, 5];  // per the plan: 1h, 30m, 5m defaults

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');

    const { oauth2Client, account } = await getActiveGoogleClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Build the event payload
    const eventBody = {
      summary:     title,
      description: description || undefined,
      location:    location    || undefined,
      start:       { dateTime: start },
      end:         { dateTime: end },
      attendees:   attendees.length > 0 ? attendees.map(email => ({ email })) : undefined,
      reminders: {
        useDefault: false,
        overrides:  alerts.map(min => ({ method: 'popup', minutes: min })),
      },
    };

    if (withMeet) {
      // Request a Google Meet conference. requires conferenceDataVersion=1 query.
      eventBody.conferenceData = {
        createRequest: {
          requestId:           crypto.randomBytes(8).toString('hex'),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const resp = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: withMeet ? 1 : 0,
      sendUpdates:           attendees.length > 0 ? 'all' : 'none',
      requestBody:           eventBody,
    });

    // Pull the Meet link out of the response if present
    let meetLink = null;
    const conf = resp.data.conferenceData?.entryPoints || [];
    for (const ep of conf) {
      if (ep.entryPointType === 'video' && ep.uri?.includes('meet.google.com')) {
        meetLink = ep.uri;
        break;
      }
    }

    // Audit log
    await logAudit({
      event,
      actor: { id: user.id, email: user.email },
      action: 'calendar.event.create',
      meta: {
        calendarId,
        eventId:     resp.data.id,
        title,
        start,
        end,
        attendeesCount: attendees.length,
        withMeet,
        sourceAccount: account.email,
      },
    });

    return ok({
      event: {
        id:        resp.data.id,
        htmlLink:  resp.data.htmlLink,
        meetLink,
        title:     resp.data.summary,
        start:     resp.data.start?.dateTime,
        end:       resp.data.end?.dateTime,
        calendarId,
        organizerEmail: resp.data.organizer?.email,
      },
    });
  } catch (e) {
    console.error('[calendar-create-event]', e.message);
    // Surface Google's specific error if it's something the user can act on
    const detail = e.errors?.[0]?.message || e.message;
    return err(500, detail);
  }
};
