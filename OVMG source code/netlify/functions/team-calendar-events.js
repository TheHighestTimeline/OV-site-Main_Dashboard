import { google } from 'googleapis';
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { clientForTokens } from './_google.js';

const PERSON_COLORS = [
  '#d96b3a', '#2c5d8a', '#2f7d5f', '#b48a1e', '#9b59b6',
  '#b03a3a', '#2986cc', '#6aa84f', '#e06666', '#8e7cc3',
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  try {
    const supabase = getSupabase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const timeMin = body.timeMin || monthStart;
    const timeMax = body.timeMax || monthEnd;

    const { data: accounts, error: accErr } = await supabase
      .from('user_google_accounts')
      .select('id, user_id, email, display_name, refresh_token, access_token, access_expires, is_active')
      .eq('is_active', true);
    if (accErr) throw accErr;

    const teamCalId = process.env.OVMG_TEAM_CALENDAR_ID;
    const allEvents = [];
    const members = [];
    let teamCalFetched = false;

    await Promise.all((accounts || []).map(async (acct, idx) => {
      const color = PERSON_COLORS[idx % PERSON_COLORS.length];
      const name = acct.display_name || acct.email.split('@')[0];
      members.push({ email: acct.email, displayName: name, color });

      try {
        const oauth2Client = clientForTokens(acct);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const calIds = ['primary'];
        if (teamCalId && !teamCalFetched) {
          calIds.push(teamCalId);
          teamCalFetched = true;
        }

        for (const calId of calIds) {
          try {
            const resp = await calendar.events.list({
              calendarId: calId,
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: 250,
            });
            const isTeamCal = calId === teamCalId;
            for (const ev of (resp.data.items || [])) {
              const start = ev.start?.dateTime || ev.start?.date;
              const end   = ev.end?.dateTime   || ev.end?.date;
              if (!start) continue;

              let meetLink = null;
              for (const ep of (ev.conferenceData?.entryPoints || [])) {
                if (ep.entryPointType === 'video' && ep.uri?.includes('meet.google.com')) {
                  meetLink = ep.uri; break;
                }
              }

              allEvents.push({
                id: ev.id,
                calendarId: calId,
                calendarLabel: isTeamCal ? 'OVMG Team' : name,
                ownerEmail: acct.email,
                ownerName: name,
                title: ev.summary || '(no title)',
                start,
                end,
                allDay: !ev.start?.dateTime,
                location: ev.location || '',
                description: ev.description || '',
                attendees: (ev.attendees || []).map(a => ({
                  email: a.email,
                  displayName: a.displayName || a.email,
                  responseStatus: a.responseStatus,
                })),
                meetLink,
                htmlLink: ev.htmlLink || '',
                color: isTeamCal ? '#666666' : color,
                isTeamEvent: isTeamCal,
                status: ev.status || 'confirmed',
              });
            }
          } catch (e) {
            console.warn(`[team-calendar] ${acct.email} cal ${calId}:`, e.message);
          }
        }
      } catch (e) {
        console.warn(`[team-calendar] ${acct.email} failed:`, e.message);
      }
    }));

    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    return ok({ events: allEvents, members });
  } catch (e) {
    console.error('[team-calendar-events]', e.message);
    return err(500, e.message);
  }
};
