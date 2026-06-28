// calendar-list-events — Phase 9.
// Lists Google Calendar events for the authenticated user's active Google
// account, in a given time range. Optionally includes events from the shared
// OVMG team calendar.
//
// POST body:
//   {
//     timeMin?: ISO-8601 (default: start of current month)
//     timeMax?: ISO-8601 (default: end of current month)
//     calendarIds?: string[]  (default: ['primary'] + OVMG_TEAM_CALENDAR_ID if set)
//   }
//
// Returns: { events: [...] }
//   each event: { id, calendarId, title, start, end, allDay, location, description,
//                 attendees, meetLink, htmlLink, color, organizer }
//
// The shared OVMG calendar is read from env var OVMG_TEAM_CALENDAR_ID. Set it
// to the calendar's iCal address (looks like "team@onevibemediagroup.com" or
// a long id ending in @group.calendar.google.com).

import { google } from 'googleapis';
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getActiveGoogleClient } from './_google.js';

// Color palette assigned per source calendar (cycled through as we encounter them)
const CAL_COLORS = ['#d96b3a', '#2c5d8a', '#2f7d5f', '#b48a1e', '#9b59b6', '#b03a3a'];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');

    const { oauth2Client, account } = await getActiveGoogleClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Defaults: current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const timeMin = body.timeMin || monthStart;
    const timeMax = body.timeMax || monthEnd;

    // Default calendar set: user's primary + shared OVMG team cal (if configured)
    let calendarIds = Array.isArray(body.calendarIds) && body.calendarIds.length > 0
      ? body.calendarIds
      : ['primary'];
    const teamCalId = process.env.OVMG_TEAM_CALENDAR_ID;
    if (teamCalId && !calendarIds.includes(teamCalId)) {
      calendarIds = [...calendarIds, teamCalId];
    }

    const allEvents = [];
    const errors = [];

    // Fetch in parallel
    await Promise.all(calendarIds.map(async (calId, calIdx) => {
      try {
        const resp = await calendar.events.list({
          calendarId:   calId,
          timeMin,
          timeMax,
          singleEvents: true,        // expand recurring events into instances
          orderBy:      'startTime',
          maxResults:   250,
        });
        const color = CAL_COLORS[calIdx % CAL_COLORS.length];
        const calLabel = calId === 'primary' ? account.email
                       : calId === teamCalId ? 'OVMG Team'
                       : calId;
        for (const ev of (resp.data.items || [])) {
          const start = ev.start?.dateTime || ev.start?.date;
          const end   = ev.end?.dateTime   || ev.end?.date;
          if (!start) continue;
          const isAllDay = !ev.start?.dateTime;

          // Find a Meet link if present (Google Meet conferencing)
          let meetLink = null;
          const conf = ev.conferenceData?.entryPoints || [];
          for (const ep of conf) {
            if (ep.entryPointType === 'video' && ep.uri?.includes('meet.google.com')) {
              meetLink = ep.uri;
              break;
            }
          }

          allEvents.push({
            id:           ev.id,
            calendarId:   calId,
            calendarLabel: calLabel,
            title:        ev.summary  || '(no title)',
            start,
            end,
            allDay:       isAllDay,
            location:     ev.location || '',
            description:  ev.description || '',
            attendees:    (ev.attendees || []).map(a => ({
              email:        a.email,
              displayName:  a.displayName || a.email,
              responseStatus: a.responseStatus,
              optional:     !!a.optional,
            })),
            meetLink,
            htmlLink:     ev.htmlLink || '',
            organizer:    ev.organizer ? {
              email: ev.organizer.email,
              displayName: ev.organizer.displayName || ev.organizer.email,
              isSelf: !!ev.organizer.self,
            } : null,
            color,
            status:       ev.status || 'confirmed',
            recurring:    !!(ev.recurringEventId),
          });
        }
      } catch (e) {
        console.warn(`[calendar-list-events] calendar ${calId} failed:`, e.message);
        errors.push({ calendarId: calId, message: e.message });
      }
    }));

    // Sort by start time (allDay events first within a day)
    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    return ok({
      events: allEvents,
      activeAccount: { email: account.email, displayName: account.displayName },
      calendarsQueried: calendarIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error('[calendar-list-events]', e.message);
    return err(500, e.message);
  }
};
