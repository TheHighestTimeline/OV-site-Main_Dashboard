# OVMG Dashboard — Master Update Sweep

Branch: `claude/master-update-sweep` (based on `master`, the live production line — **not** `main`, which is a stale divergent branch).

Build: `npm run build` passes locally (Vite, 138 modules). Functions are bundled by Netlify on deploy.

> ⚠️ **Branch base note:** the features in the brief (Cost, Audio Dump, Booking, company pages, Drive, Playbook, OAuth) only exist on `master`. `origin/main` is a different/older line (Clerk-auth migration) with none of them, so this work is based on `master`.

---

## Per-section status

| # | Item | Status |
|---|------|--------|
| 0 | Node 18 WebSocket crash | ✅ Fixed — root cause + fallback |
| 1 | OVM custom HTML in Tools | ✅ Surfaced in OVM → Tools (see note) |
| 2 | Drive editable templates + gated folders | ✅ UI done · ⚠️ needs persistence backend |
| 3 | Playbook: per-page Notion URLs + gating | ✅ iframe + Edit-in-Notion, multi-URL, gated |
| 4 | References fix + URL-only + restore | ✅ Crash fixed, URL-only, company-filtered |
| 5 | Cost page renders per period | ✅ Unblocked by §0 (verify on deploy) |
| 6 | Per-company filter/scroll/sections/Tools/mobile | ✅ Mostly (see notes) |
| 7 | Clients CSV bulk upload | ✅ Done (bulk-add draft posts) |
| 8 | Task collapse behavior | ✅ Done |
| 9 | Overview clickable metric cards | ✅ Done |
| 10 | Refresh stays on route | ✅ Done (URL-hash routing) |
| 11 | Calendar grid lines | ✅ Week time-column gridline fixed |
| 12 | Audio Dump review queue | ✅ Unblocked by §0 (verify on deploy) |
| 13 | Booking page | ✅ Unblocked by §0 (verify on deploy) |
| 14 | Google OAuth connect | ✅ Unblocked by §0 (pill already wired) |
| 15 | Admin / roles (PM, Carsten parity) | ✅ PM role + Admin UI; Carsten = 1 op step |
| 16 | Global destructive-action confirm | ✅ Shared dialog; applied to Tasks + Drive |

---

## §0 — the recurring WebSocket crash (root cause)

`@supabase/realtime-js` throws *"Node.js 18 detected without native WebSocket support"* from its `RealtimeClient` **constructor**, which `@supabase/supabase-js` calls eagerly inside `createClient()` — so **every** Netlify function that touches Supabase crashed on Node 18 (`autoConnect:false` didn't help; the throw is at construction, not connect). That's why References, Cost, Audio Dump, Booking, all company pages, and Google OAuth all broke.

Fix (belt-and-suspenders):
1. `netlify.toml` → `NODE_VERSION = "22"` + `AWS_LAMBDA_JS_RUNTIME = "nodejs22.x"` (Node 22 ships a native global `WebSocket`).
2. `.nvmrc` → `22`; `package.json` engines `>=22`.
3. `netlify/functions/_supabase.js` → injects the `ws` package as the realtime transport when no global `WebSocket` exists.

---

## Operational steps you (Tanner/Carsten) need to do after merge

1. **Netlify env** — no new vars required for §0; the Node bump is in `netlify.toml`. Confirm the deploy log shows Node 22.
2. **Carsten = admin parity (§15):** in **Admin → Manage roles**, give Carsten the **Admin** role (or set his Clerk `publicMetadata.roles = ["admin"]`). That grants full app + Drive + Playbook + grant/revoke, same as Tanner. (Tanner is already admin via the `admin` role since he's on a gmail address, not `@onevibemediagroup.com`.)
3. **Google OAuth (§14):** the "Connect Google" flow now completes once §0 deploys. Make sure the Google OAuth client ID/secret + redirect URI env vars are set in Netlify (`google-accounts-oauth-*` functions).
4. **References (§4):** the saved URLs that "disappeared" were the §0 crash blocking `resources-list` — they should reappear after deploy. If they were truly deleted from the DB, restore from a Supabase backup.
5. **Playbook sharing (§3):** run `supabase-playbook-links.sql` in the Supabase SQL editor so playbook URLs are shared team-wide. Without it, each person's URL edits still work but persist only in their own browser.

---

## Known follow-ups (not finished in this sweep)

- **§2 Drive persistence** — `DriveView` is still backed by placeholder data. The editable templates, remove, and folder-visibility controls work in-session but **do not persist** yet. To make them real + shared, add a Supabase `drive_items` table (`company, folder, name, url, type, owner_email, visibility, allowed_roles[]`) + `drive-list / drive-upsert / drive-delete` functions, then wire `DriveView` to them. The personal-folders requirement falls out of `visibility = 'onlyme'` + `owner_email`.
- **§3 Playbook** — reworked to exactly the requested model: each playbook is a live Notion **iframe** + an **"Edit in Notion ↗"** button that opens that page's real URL in a new tab (edit there, come back, hit Refresh). Admins manage a list of playbooks via **⚙ Manage**, each with its **own** URL. The in-app block editor was removed. URLs persist per-browser immediately and team-wide once `supabase-playbook-links.sql` is run. Domain gating (OVMG/admin only, incl. company sub-tabs) stays in place. The old `playbook-tree/page/block-children/save-block` functions are now dormant.
- **§16 rollout** — the shared `ConfirmDialog`/`useConfirm` is in `components/UI.jsx` and applied to Tasks delete + Drive template remove. Remaining `window.confirm` deletes (AccountSwitcher disconnect, References/Admin/Kanban/Ads deletes) are functional but should be migrated to the branded dialog. Undo-toasts are a further enhancement.
- **§6 company filtering** — Tasks/Contacts/References pre-filter by company. Calendar events (Google-sourced) and the Clients tab are not company-partitioned (Clients all belong to OVM, the agency). Tighten if companies get distinct calendars.
- **§6 mobile** — the app is responsive throughout (`useIsMobile`/`useDevice`); these changes preserve it. Recommend a real-device QA pass on the heavy editors.
- **Runtime verification** — §5/§12/§13/§14 were blocked purely by §0; confirm them on the Netlify deploy preview.
