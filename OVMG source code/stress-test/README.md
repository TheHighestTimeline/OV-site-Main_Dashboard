# OneVibe Hub — Stress Tests

Two test scripts:
- **smoke.js** — hits every function once, verifies they all work. Run this first.
- **load.js** — simulates 5–20 concurrent users over 2.5 minutes, measures performance under real load.

---

## 1. Install k6

**Windows (easiest — use winget):**
```powershell
winget install k6 --source winget
```

Or download the installer from [k6.io/docs/get-started/installation](https://k6.io/docs/get-started/installation/) and run it.

Verify it works:
```powershell
k6 version
```

---

## 2. Run the smoke test first

Confirms every single function is working before you stress it.

```powershell
k6 run `
  --env BASE_URL=https://your-site.netlify.app `
  --env EMAIL=you@onevibemediagroup.com `
  --env PASSWORD=yourpassword `
  stress-test/smoke.js
```

Replace `your-site.netlify.app` with your actual Netlify URL.

**What to look for:**
- All checks should show ✓ green
- Zero failures
- Response times under 3s for Notion calls

After it runs, go to Notion and delete anything with `[SMOKE TEST]` in the name.

---

## 3. Run the load test

Simulates your whole team using the dashboard simultaneously.

```powershell
k6 run `
  --env BASE_URL=https://your-site.netlify.app `
  --env EMAIL=you@onevibemediagroup.com `
  --env PASSWORD=yourpassword `
  stress-test/load.js
```

The test runs for ~2.5 minutes through these stages:

| Time    | Users | What it simulates          |
|---------|-------|----------------------------|
| 0–30s   | 1→5   | Team starting their day    |
| 30–90s  | 10    | Everyone working at once   |
| 90–120s | 20    | Double load / spike        |
| 120–150s| 0     | Cool-down                  |

---

## 4. Reading the results

k6 prints a summary at the end. Key numbers to check:

```
✓ http_req_duration........: avg=842ms  p(95)=2.1s   ← should be under 3s
✓ error_rate...............: 0.00%                    ← should be 0% or near 0%
✓ ai_parse_latency_ms......: avg=1.2s   p(95)=4.8s   ← should be under 6s
  total_requests............: 1,432                   ← total API calls made
```

**If you see failures:**

| Error | Cause | Fix |
|-------|-------|-----|
| `status 429` | Notion rate limit (3 req/sec) | Normal under heavy load — Notion's limit, not a bug |
| `status 401` | JWT expired mid-test | Re-run the test (token is fetched fresh each run) |
| `status 500` | Function crash | Check Netlify → Functions log for the stack trace |
| `p(95) > 3s` | Notion is slow | Check Notion status page; expected occasionally |

---

## 5. After the load test

Delete the test data from Notion — search for `[LOAD TEST]` in your Tasks database and bulk-delete those entries.

---

## What's NOT tested here

- **Voice transcription** (audio → Whisper) — skipped to avoid OpenAI costs. Voice parse (text → GPT) IS tested.
- **Admin functions** — skipped since they mutate users; test those manually.
