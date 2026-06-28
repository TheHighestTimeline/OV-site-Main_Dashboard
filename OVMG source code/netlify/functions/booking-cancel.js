import { CORS } from './_notion.js';
import { getSupabase } from './_supabase.js';
import { google } from 'googleapis';
import { getActiveGoogleClient } from './_google.js';

function err(code, msg) { return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
function ok(body) { return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const token = event.queryStringParameters?.token;
  if (!token) return err(400, 'token required');

  try {
    const supabase = getSupabase();
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*, booking_pages(*)').eq('cancel_token', token).single();
    if (fetchErr || !booking) return err(404, 'Invalid cancellation token');
    if (booking.status === 'cancelled') return ok({ alreadyCancelled: true });

    if (booking.google_event_id) {
      try {
        const page = booking.booking_pages;
        const { oauth2Client } = await getActiveGoogleClient(page.owner_user_id);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        await calendar.events.delete({
          calendarId:  page.target_calendar_id || 'primary',
          eventId:     booking.google_event_id,
          sendUpdates: 'all',
        });
      } catch (e) { console.warn('[booking-cancel] calendar delete:', e.message); }
    }

    await supabase.from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', booking.id);

    return ok({ cancelled: true, when: booking.start_at });
  } catch (e) {
    console.error('[booking-cancel]', e.message);
    return err(500, e.message);
  }
};
