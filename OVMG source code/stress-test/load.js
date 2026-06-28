/**
 * OneVibe Internal Hub — Load Test
 * Simulates multiple concurrent users hitting all read endpoints.
 * Write endpoints (create) are called at low frequency to avoid flooding Notion.
 *
 * Stages:
 *   0–30s  ramp from 1 → 5 users   (warm-up)
 *   30–90s hold at 10 users         (sustained load)
 *   90–2m  spike to 20 users        (peak — your whole team + headroom)
 *   2–2.5m ramp back to 0           (cool-down)
 *
 * Run:
 *   k6 run --env BASE_URL=https://your-site.netlify.app \
 *           --env EMAIL=you@onevibemediagroup.com \
 *           --env PASSWORD=yourpassword \
 *           stress-test/load.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate      = new Rate('error_rate');
const notionLatency  = new Trend('notion_latency_ms');
const aiLatency      = new Trend('ai_parse_latency_ms');
const totalRequests  = new Counter('total_requests');

// ── Test config ───────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 5  },   // warm-up
    { duration: '60s', target: 10 },   // sustained — typical team load
    { duration: '30s', target: 20 },   // spike — double team size
    { duration: '30s', target: 0  },   // cool-down
  ],
  thresholds: {
    // 95% of Notion reads must be under 3s
    http_req_duration:   ['p(95)<3000'],
    // AI parse must stay under 6s
    ai_parse_latency_ms: ['p(95)<6000'],
    // Error rate must stay below 5%
    error_rate:          ['rate<0.05'],
  },
};

const BASE = __ENV.BASE_URL || 'https://ovmgdashboard.netlify.app';

// ── Setup: get JWT once, share with all VUs ───────────────────────────────────
export function setup() {
  console.log(`Authenticating against ${BASE}...`);
  const res = http.post(
    `${BASE}/.netlify/identity/token`,
    `grant_type=password&username=${encodeURIComponent(__ENV.EMAIL)}&password=${encodeURIComponent(__ENV.PASSWORD)}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (res.status !== 200) {
    throw new Error(`Auth failed (${res.status}): ${res.body}`);
  }

  console.log('Auth OK — starting load test');
  return { token: res.json('access_token') };
}

// ── Main virtual user scenario ────────────────────────────────────────────────
export default function (data) {
  const headers = {
    Authorization:  `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // Each VU randomly picks a scenario to simulate realistic mixed traffic
  const scenario = Math.random();

  if (scenario < 0.35) {
    // 35% — user opens Overview (loads tasks + goals + contacts simultaneously)
    scenarioOverview(headers);
  } else if (scenario < 0.60) {
    // 25% — user browses Tasks kanban
    scenarioTasks(headers);
  } else if (scenario < 0.78) {
    // 18% — user looks up a contact
    scenarioContacts(headers);
  } else if (scenario < 0.88) {
    // 10% — user checks Team Goals
    scenarioGoals(headers);
  } else if (scenario < 0.94) {
    // 6% — user checks Financials
    scenarioFinancials(headers);
  } else if (scenario < 0.97) {
    // 3% — user submits a My Day voice parse (text only, no audio cost)
    scenarioVoiceParse(headers);
  } else {
    // 3% — user creates a task
    scenarioCreateTask(headers);
  }

  // Realistic think time between actions: 1–4 seconds
  sleep(1 + Math.random() * 3);
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

function scenarioOverview(headers) {
  group('Overview — parallel load', () => {
    const responses = http.batch([
      ['GET', `${BASE}/.netlify/functions/tasks-list`,    null, { headers }],
      ['GET', `${BASE}/.netlify/functions/goals-list`,    null, { headers }],
      ['GET', `${BASE}/.netlify/functions/contacts-list`, null, { headers }],
    ]);

    totalRequests.add(3);

    responses.forEach((res, i) => {
      const names = ['tasks-list', 'goals-list', 'contacts-list'];
      notionLatency.add(res.timings.duration);
      const ok = check(res, {
        [`overview ${names[i]}: 200`]:         r => r.status === 200,
        [`overview ${names[i]}: array`]:       r => Array.isArray(r.json()),
        [`overview ${names[i]}: under 3s`]:    r => r.timings.duration < 3000,
      });
      errorRate.add(!ok);
    });
  });
}

function scenarioTasks(headers) {
  group('Tasks — load kanban', () => {
    const res = http.get(`${BASE}/.netlify/functions/tasks-list`, { headers });
    totalRequests.add(1);
    notionLatency.add(res.timings.duration);
    const ok = check(res, {
      'tasks: status 200':    r => r.status === 200,
      'tasks: returns array': r => Array.isArray(r.json()),
      'tasks: under 3s':      r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
  });
}

function scenarioContacts(headers) {
  group('Contacts — load CRM', () => {
    const res = http.get(`${BASE}/.netlify/functions/contacts-list`, { headers });
    totalRequests.add(1);
    notionLatency.add(res.timings.duration);
    const ok = check(res, {
      'contacts: status 200':    r => r.status === 200,
      'contacts: returns array': r => Array.isArray(r.json()),
      'contacts: under 3s':      r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);

    // If contacts loaded, simulate opening one contact's notes
    const contacts = res.json();
    if (Array.isArray(contacts) && contacts.length > 0) {
      sleep(0.5);
      const contact = contacts[Math.floor(Math.random() * Math.min(contacts.length, 5))];
      const notesRes = http.get(
        `${BASE}/.netlify/functions/notes-list?contactId=${contact.id}`,
        { headers }
      );
      totalRequests.add(1);
      notionLatency.add(notesRes.timings.duration);
      check(notesRes, {
        'notes: status 200':    r => r.status === 200,
        'notes: returns array': r => Array.isArray(r.json()),
      });
    }
  });
}

function scenarioGoals(headers) {
  group('Goals — load cards', () => {
    const res = http.get(`${BASE}/.netlify/functions/goals-list`, { headers });
    totalRequests.add(1);
    notionLatency.add(res.timings.duration);
    const ok = check(res, {
      'goals: status 200':    r => r.status === 200,
      'goals: returns array': r => Array.isArray(r.json()),
      'goals: under 3s':      r => r.timings.duration < 3000,
    });
    errorRate.add(!ok);
  });
}

function scenarioFinancials(headers) {
  group('Financials — load cards', () => {
    const res = http.get(`${BASE}/.netlify/functions/financial-list`, { headers });
    totalRequests.add(1);
    notionLatency.add(res.timings.duration);
    const ok = check(res, {
      'financials: status 200':    r => r.status === 200,
      'financials: returns array': r => Array.isArray(r.json()),
    });
    errorRate.add(!ok);
  });
}

function scenarioVoiceParse(headers) {
  group('Voice parse — AI call', () => {
    const samples = [
      'Finished the deck for Elena, marking that done. Need to follow up with Sarah on sponsorship.',
      'Quick day. Knocked out the NCNDA. Need to ping accounting about Q3 budget.',
      'Venue walkthrough is set for Tuesday. Still waiting on Marcus about the press release.',
    ];
    const transcript = samples[Math.floor(Math.random() * samples.length)];

    const payload = JSON.stringify({
      transcript,
      context: { section: 'my-day', tasks: [] },
    });

    const res = http.post(`${BASE}/.netlify/functions/voice-parse`, payload, { headers });
    totalRequests.add(1);
    aiLatency.add(res.timings.duration);
    const ok = check(res, {
      'voice-parse: status 200':    r => r.status === 200,
      'voice-parse: has summary':   r => !!r.json('summary'),
      'voice-parse: under 6s':      r => r.timings.duration < 6000,
    });
    errorRate.add(!ok);
  });
}

function scenarioCreateTask(headers) {
  group('Create task — write to Notion', () => {
    const payload = JSON.stringify({
      task:     `[LOAD TEST] Task ${Date.now()} — safe to delete`,
      status:   'Not started',
      priority: 'Low',
      owner:    'Load Test',
    });
    const res = http.post(`${BASE}/.netlify/functions/tasks-create`, payload, { headers });
    totalRequests.add(1);
    notionLatency.add(res.timings.duration);
    const ok = check(res, {
      'create-task: status 200': r => r.status === 200,
      'create-task: returns id': r => !!r.json('id'),
    });
    errorRate.add(!ok);
  });
}

// ── Teardown: summary ─────────────────────────────────────────────────────────
export function teardown(data) {
  console.log('\n📋 Load test complete.');
  console.log('   Check Netlify Functions log for any 429 (Notion rate limit) errors.');
  console.log('   Delete any "[LOAD TEST]" tasks created in Notion.');
}
