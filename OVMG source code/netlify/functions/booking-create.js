// booking-create — PUBLIC endpoint that creates a booking + calendar event.
// No auth — recipients aren't logged into OVMG.
//
// POST /.netlify/functions/booking-create
//   body: { slug, recipientName, recipientEmail, recipientNotes, start, end }
// returns: { booking: {...}, meetLink }

import { google } from 'googleapis';
import { CORS } from './_notion.js';
import { getSupabase } from './_supabase.js';
import { getActiveGoogleClient } from './_google.js';
import crypto from 'crypto';

function err(code, msg) {
  return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
function ok(body) {
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return err(405, 'POST required');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const slug             = body.slug;
  const recipientName    = (body.recipientName  || '').trim();
  const recipientEmail   = (body.recipientEmail || '').trim().toLowerCase();
  const recipientNotes   = (body.recipientNotes || '').trim();
  const start            = body.start;
  const end              = body.end;

  if (!slug)                         return err(400, 'slug required');
  if (!recipientName)                return err(400, 'recipientName required');
  if (!recipientEmail.includes('@')) return err(400, 'Valid recipientEmail required');
  if (!start || !end)                return err(400, 'start and end required');

  try {
    const supabase = getSupabase();
    const { data: page, error: fErr } = await supabase
      .from('booking_pages').select('*').eq('slug', slug).eq('active', true).single();
    if (fErr || !page) return err(404, 'Booking page not found');

    // Build Google Calendar event on the owner's calendar
    const { oauth2Client, account } = await getActiveGoogleClient(page.owner_user_id);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const calendarId = page.target_calendar_id || 'primary';

    const eventBody = {
      summary:     `${page.label} — ${recipientName}`,
      description: recipientNotes
        ? `Booked via ${slug}.\n\nFrom: ${recipientName} <${recipientEmail}>\n\nNotes:\n${recipientNotes}`
        : `Booked via ${slug}. From: ${recipientName} <${recipientEmail}>`,
      start:       { dateTime: start },
      end:         { dateTime: end },
      attendees:   [{ email: recipientEmail, displayName: recipientName }],
      reminders:   { useDefault: false, overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 5  },
      ]},
    };
    if (page.with_meet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomBytes(8).toString('hex'),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const fbResp = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        items: [{ id: calendarId }],
      },
    });
    const busy = fbResp.data.calendars?.[calendarId]?.busy || [];
    if (busy.length > 0) {
      return err(409, 'That time slot was just taken — please pick another.');
    }

    const resp = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: page.with_meet ? 1 : 0,
      sendUpdates:           'all',
      requestBody:           eventBody,
    });

    let meetLink = null;
    const conf = resp.data.conferenceData?.entryPoints || [];
    for (const ep of conf) {
      if (ep.entryPointType === 'video' && ep.uri?.includes('meet.google.com')) {
        meetLink = ep.uri; break;
      }
    }

    // Insert into bookings table
    const cancelToken = crypto.randomBytes(24).toString('hex');
    const { data: booking, error: insErr } = await supabase
      .from('bookings').insert({
        booking_page_id: page.id,
        google_event_id: resp.data.id,
        recipient_name:  recipientName,
        recipient_email: recipientEmail,
        recipient_notes: recipientNotes,
        start_at:        start,
        end_at:          end,
        meet_link:       meetLink,
        cancel_token:    cancelToken,
        status:          'confirmed',
      }).select().single();
    if (insErr) throw insErr;

    return ok({
      booking: {
        id:         booking.id,
        start_at:   booking.start_at,
        end_at:     booking.end_at,
        meet_link:  meetLink,
        htmlLink:   resp.data.htmlLink,
      },
      cancelUrl: `/book/${slug}/cancel?token=${cancelToken}`,
    });
  } catch (e) {
    console.error('[booking-create]', e.message);
    return err(500, e.message);
  }
};
