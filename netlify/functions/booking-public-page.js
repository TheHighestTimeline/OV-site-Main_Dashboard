// booking-public-page — PUBLIC endpoint (no auth) that:
//   1. Returns the booking page's config (label, duration, etc.)
//   2. Computes available time slots using the owner's Google Calendar
//      free/busy data
//
// Used by the public PublicBookingPage.jsx UI that recipients visit at
// /book/:slug (no login required).
//
// GET /.netlify/functions/booking-public-page?slug=xxx&date=YYYY-MM-DD
//   returns: { page: {...}, slots: [...] }  where slots is the available
//            half-hour blocks for the given date (or next 14 days if no date)

import { google } from 'googleapis';
import { CORS } from './_notion.js';
import { getSupabase } from './_supabase.js';
import { getActiveGoogleClient, clientForTokens } from './_google.js';

function err(code, msg) {
  return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
function ok(body) {
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Build candidate slots for a single day from availability rules
function buildDaySlots(dateISO, availability, durationMin, bufferMin) {
  const date = new Date(dateISO);
  const dow = date.getDay();
  const slots = [];
  for (const rule of availability) {
    if (rule.dow !== dow) continue;
    const [sh, sm] = rule.start.split(':').map(Number);
    const [eh, em] = rule.end.split(':').map(Number);
    const start = new Date(date); start.setHours(sh, sm, 0, 0);
    const end   = new Date(date); end.setHours(eh, em, 0, 0);
    let t = start;
    while (t.getTime() + durationMin * 60_000 <= end.getTime()) {
      slots.push({ start: new Date(t), end: new Date(t.getTime() + durationMin * 60_000) });
      t = new Date(t.getTime() + (durationMin + bufferMin) * 60_000);
    }
  }
  return slots;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const slug = event.queryStringParameters?.slug;
  if (!slug) return err(400, 'slug required');

  try {
    const supabase = getSupabase();
    const { data: page, error: fErr } = await supabase
      .from('booking_pages').select('*').eq('slug', slug).eq('active', true).single();
    if (fErr || !page) return err(404, 'Booking page not found');

    // Compute date range to consider
    const reqDate = event.queryStringParameters?.date;
    const days = reqDate ? 1 : 14;  // either show requested date or next 14 days
    const startDate = reqDate ? new Date(reqDate) : new Date();
    if (!reqDate) startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    // Build candidate slots from availability rules
    const allSlots = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const daySlots = buildDaySlots(d.toISOString(), page.availability || [], page.duration_min, page.buffer_min || 0);
      allSlots.push(...daySlots);
    }

    // Filter out slots violating min-notice / max-notice
    const now = Date.now();
    const minNotice = (page.min_notice_hours || 0) * 3600_000;
    const maxNotice = (page.max_notice_days  || 30) * 86400_000;
    const filtered = allSlots.filter(s => {
      const t = s.start.getTime();
      return t >= now + minNotice && t <= now + maxNotice;
    });

    // Get owner's active Google client + check free/busy
    let busyRanges = [];
    try {
      const { oauth2Client } = await getActiveGoogleClient(page.owner_user_id);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const calendarsToCheck = ['primary'];
      if (page.target_calendar_id && !calendarsToCheck.includes(page.target_calendar_id)) {
        calendarsToCheck.push(page.target_calendar_id);
      }
      const fbResp = await calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items:   calendarsToCheck.map(id => ({ id })),
        },
      });
      for (const cal of Object.values(fbResp.data.calendars || {})) {
        for (const busy of (cal.busy || [])) {
          busyRanges.push([new Date(busy.start).getTime(), new Date(busy.end).getTime()]);
        }
      }
    } catch (e) {
      console.warn('[booking-public-page] freebusy fetch failed:', e.message);
      // Don't fail — return slots without busy filtering. User will get a hard
      // collision check when actually booking.
    }

    // Remove slots that overlap with any busy range
    const available = filtered.filter(s => {
      const sStart = s.start.getTime();
      const sEnd   = s.end.getTime();
      return !busyRanges.some(([bStart, bEnd]) => sStart < bEnd && sEnd > bStart);
    });

    // Enforce max_per_day
    const byDate = {};
    for (const s of available) {
      const key = s.start.toISOString().slice(0, 10);
      byDate[key] = (byDate[key] || 0) + 1;
    }
    const filteredFinal = available.filter(s => {
      const key = s.start.toISOString().slice(0, 10);
      return byDate[key] <= page.max_per_day;
    });

    return ok({
      page: {
        slug:         page.slug,
        label:        page.label,
        description:  page.description,
        durationMin:  page.duration_min,
        withMeet:     page.with_meet,
        ownerName:    '',  // not exposed to recipients
      },
      slots: filteredFinal.map(s => ({
        start: s.start.toISOString(),
        end:   s.end.toISOString(),
      })),
    });
  } catch (e) {
    console.error('[booking-public-page]', e.message);
    return err(500, e.message);
  }
};
