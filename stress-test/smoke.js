/**
 * OneVibe Internal Hub — Smoke Test
 * Hits every function once, verifies status codes and response shapes.
 * Run with: k6 run --env BASE_URL=https://your-site.netlify.app --env EMAIL=you@onevibemediagroup.com --env PASSWORD=yourpassword stress-test/smoke.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  vus: 1,          // single virtual user
  iterations: 1,   // run once
  thresholds: {
    errors:          ['rate==0'],          // zero errors allowed in smoke test
    http_req_duration: ['p(95)<5000'],     // all responses under 5s
  },
};

const BASE = __ENV.BASE_URL || 'https://ovmgdashboard.netlify.app';

// ── Auth ─────────────────────────────────────────────────────────────────────
export function setup() {
  console.log(`\n🔐 Authenticating against ${BASE}...`);

  const res = http.post(
    `${BASE}/.netlify/identity/token`,
    `grant_type=password&username=${encodeURIComponent(__ENV.EMAIL)}&password=${encodeURIComponent(__ENV.PASSWORD)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  check(res, {
    'auth: status 200': r => r.status === 200,
    'auth: got access_token': r => r.json('access_token') !== undefined,
  });

  if (res.status !== 200) {
    console.error(`❌ Auth failed (${res.status}): ${res.body}`);
    return { token: null };
  }

  const token = res.json('access_token');
  console.log('✅ Authenticated\n');
  return { token };
}

// ── Test runner ───────────────────────────────────────────────────────────────
export default function (data) {
  if (!data.token) {
    console.error('No token — skipping tests');
    errorRate.add(1);
    return;
  }

  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  let createdTaskId    = null;
  let createdContactId = null;
  let createdGoalId    = null;

  // ── READ endpoints ─────────────────────────────────────────────────────────

  group('GET tasks-list', () => {
    const res = http.get(`${BASE}/.netlify/functions/tasks-list`, { headers });
    const ok = check(res, {
      'tasks-list: status 200':        r => r.status === 200,
      'tasks-list: returns array':     r => Array.isArray(r.json()),
      'tasks-list: response < 3s':     r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
    console.log(`tasks-list     → ${res.status} (${res.timings.duration.toFixed(0)}ms) — ${res.json()?.length ?? '?'} tasks`);
  });

  sleep(0.5);

  group('GET contacts-list', () => {
    const res = http.get(`${BASE}/.netlify/functions/contacts-list`, { headers });
    const ok = check(res, {
      'contacts-list: status 200':     r => r.status === 200,
      'contacts-list: returns array':  r => Array.isArray(r.json()),
      'contacts-list: response < 3s':  r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
    console.log(`contacts-list  → ${res.status} (${res.timings.duration.toFixed(0)}ms) — ${res.json()?.length ?? '?'} contacts`);
  });

  sleep(0.5);

  group('GET goals-list', () => {
    const res = http.get(`${BASE}/.netlify/functions/goals-list`, { headers });
    const ok = check(res, {
      'goals-list: status 200':        r => r.status === 200,
      'goals-list: returns array':     r => Array.isArray(r.json()),
      'goals-list: response < 3s':     r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
    console.log(`goals-list     → ${res.status} (${res.timings.duration.toFixed(0)}ms) — ${res.json()?.length ?? '?'} goals`);
  });

  sleep(0.5);

  group('GET financial-list', () => {
    const res = http.get(`${BASE}/.netlify/functions/financial-list`, { headers });
    const ok = check(res, {
      'financial-list: status 200':    r => r.status === 200,
      'financial-list: returns array': r => Array.isArray(r.json()),
      'financial-list: response < 3s': r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
    console.log(`financial-list → ${res.status} (${res.timings.duration.toFixed(0)}ms) — ${res.json()?.length ?? '?'} items`);
  });

  sleep(0.5);

  // ── WRITE endpoints ────────────────────────────────────────────────────────

  group('POST tasks-create', () => {
    const payload = JSON.stringify({
      task:     '[SMOKE TEST] Auto-created test task — safe to delete',
      status:   'Not started',
      priority: 'Low',
      owner:    'Smoke Test',
      dueDate:  '',
    });
    const res = http.post(`${BASE}/.netlify/functions/tasks-create`, payload, { headers });
    const ok = check(res, {
      'tasks-create: status 200':  r => r.status === 200,
      'tasks-create: returns id':  r => !!r.json('id'),
    });
    errorRate.add(!ok);
    createdTaskId = res.json('id');
    console.log(`tasks-create   → ${res.status} (${res.timings.duration.toFixed(0)}ms) id=${createdTaskId}`);
  });

  sleep(0.5);

  if (createdTaskId) {
    group('PATCH tasks-update', () => {
      const payload = JSON.stringify({
        id:     createdTaskId,
        status: 'Done',
        updateNote: 'Smoke test completed',
      });
      const res = http.patch(`${BASE}/.netlify/functions/tasks-update`, payload, { headers });
      const ok = check(res, {
        'tasks-update: status 200':    r => r.status === 200,
        'tasks-update: updated=true':  r => r.json('updated') === true,
      });
      errorRate.add(!ok);
      console.log(`tasks-update   → ${res.status} (${res.timings.duration.toFixed(0)}ms)`);
    });
    sleep(0.5);
  }

  group('POST contacts-create', () => {
    const payload = JSON.stringify({
      name:    '[SMOKE TEST] Auto Contact — safe to delete',
      company: 'Test Co',
      role:    'Tester',
      email:   'smoketest@test.com',
      type:    'External',
      status:  'Active',
    });
    const res = http.post(`${BASE}/.netlify/functions/contacts-create`, payload, { headers });
    const ok = check(res, {
      'contacts-create: status 200': r => r.status === 200,
      'contacts-create: returns id': r => !!r.json('id'),
    });
    errorRate.add(!ok);
    createdContactId = res.json('id');
    console.log(`contacts-create → ${res.status} (${res.timings.duration.toFixed(0)}ms) id=${createdContactId}`);
  });

  sleep(0.5);

  if (createdContactId) {
    group('GET notes-list', () => {
      const res = http.get(`${BASE}/.netlify/functions/notes-list?contactId=${createdContactId}`, { headers });
      const ok = check(res, {
        'notes-list: status 200':    r => r.status === 200,
        'notes-list: returns array': r => Array.isArray(r.json()),
      });
      errorRate.add(!ok);
      console.log(`notes-list     → ${res.status} (${res.timings.duration.toFixed(0)}ms)`);
    });
    sleep(0.5);

    group('POST notes-create', () => {
      const payload = JSON.stringify({
        contactId: createdContactId,
        title:     '[SMOKE TEST] Auto note — safe to delete',
        body:      'This note was created by the smoke test.',
        type:      'Note',
      });
      const res = http.post(`${BASE}/.netlify/functions/notes-create`, payload, { headers });
      const ok = check(res, {
        'notes-create: status 200':    r => r.status === 200,
        'notes-create: created=true':  r => r.json('created') === true,
      });
      errorRate.add(!ok);
      console.log(`notes-create   → ${res.status} (${res.timings.duration.toFixed(0)}ms)`);
    });
    sleep(0.5);
  }

  group('POST goals-create', () => {
    const payload = JSON.stringify({
      goal:     '[SMOKE TEST] Auto goal — safe to delete',
      owner:    'Smoke Test',
      quarter:  'Q2 2026',
      status:   'Not Started',
      priority: 'Low',
      progress: 0,
    });
    const res = http.post(`${BASE}/.netlify/functions/goals-create`, payload, { headers });
    const ok = check(res, {
      'goals-create: status 200': r => r.status === 200,
      'goals-create: returns id': r => !!r.json('id'),
    });
    errorRate.add(!ok);
    createdGoalId = res.json('id');
    console.log(`goals-create   → ${res.status} (${res.timings.duration.toFixed(0)}ms) id=${createdGoalId}`);
  });

  sleep(0.5);

  // ── Voice parse (no audio cost — just text parsing) ────────────────────────
  group('POST voice-parse', () => {
    const payload = JSON.stringify({
      transcript: 'I finished the deck for Elena, that task is done.',
      context: {
        section: 'my-day',
        tasks: [{ id: 'fake-id-1', task: 'Send deck to Elena', status: 'In progress' }],
      },
    });
    const res = http.post(`${BASE}/.netlify/functions/voice-parse`, payload, { headers });
    const ok = check(res, {
      'voice-parse: status 200':       r => r.status === 200,
      'voice-parse: has summary':      r => !!r.json('summary'),
      'voice-parse: response < 5s':    r => r.timings.duration < 5000,
    });
    errorRate.add(!ok);
    console.log(`voice-parse    → ${res.status} (${res.timings.duration.toFixed(0)}ms)`);
  });

  sleep(0.5);

  // ── Auth guard check (should reject unauthenticated requests) ──────────────
  group('Auth guard (no token)', () => {
    const res = http.get(`${BASE}/.netlify/functions/tasks-list`); // no auth header
    const ok = check(res, {
      'auth guard: rejects unauthenticated': r => r.status === 401,
    });
    errorRate.add(!ok);
    console.log(`auth-guard     → ${res.status} (expected 401)`);
  });

  console.log(`\n✅ Smoke test complete. Check Notion — delete any "[SMOKE TEST]" entries.`);
}
