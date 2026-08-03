# OVMG Dashboard: Notion Usage Inventory

**Generated:** 2026-08-03 from branch `TheHighestTimeline-ovmg-dashboard`

**Caveat:** generated from the flattened GitHub branch. Re-run against the local tree before acting. The script is at the bottom.

**Nothing here has been changed.** This is identification only, for your review.

## Summary

Total files mentioning Notion: **146**

| Category | Files | What to do |
|---|---|---|
| A. helpers only (mechanical) | 88 | Change one import path to `_http.js`. No logic change. Safe to batch. |
| B. real Notion usage (migrate) | 42 | Real migration work. Needs an Airtable table + field mapping. |
| C. env/config reference | 3 | Remove the env var once B is done. |
| D. mention only (comment/string) | 13 | Comment, doc string or dead reference. Read and delete. |


## B. real Notion usage (migrate)  (42 files)

| File | Notion DB | API calls | Imports | Airtable equivalent |
|---|---|---|---|---|
| `Outreach (1).jsx` | CRM | - | - | CRM Contacts `tbl6MKKs3xXrYBPL4` |
| `artists-create.js` | - | notion.pages | CORS, date, err, multiSelect, notion, number, ok, richText, select, title | n/a |
| `artists-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `artists-list.js` | - | notion.databases | CORS, err, getProp, notion, ok | n/a |
| `artists-update.js` | - | notion.pages | CORS, err, multiSelect, notion, ok, richText, select | n/a |
| `contacts-create.js` | CRM | notion.blocks, notion.pages | CORS, DB, err, multiSelect, notion, ok, richText, select, title | CRM Contacts `tbl6MKKs3xXrYBPL4` |
| `contacts-list.js` | CRM | notion.databases | CORS, DB, err, getProp, notion, ok | CRM Contacts `tbl6MKKs3xXrYBPL4` |
| `contacts-update.js` | - | notion.pages | CORS, err, multiSelect, notion, ok, richText, select, title | n/a |
| `docs-create.js` | - | notion.pages | CORS, err, notion, ok, richText, select, title | n/a |
| `docs-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `docs-list.js` | - | notion.databases | CORS, err, getProp, notion, ok | n/a |
| `docs-update.js` | - | notion.pages | CORS, err, notion, ok, richText, select, title | n/a |
| `email-state.js` | - | notion.databases, notion.pages | CORS, err, notion, ok | n/a |
| `financial-list.js` | FINANCIAL | notion.databases | CORS, DB, err, getProp, notion, ok | CONFIRM STILL USED |
| `goals-create.js` | GOALS | notion.pages | CORS, DB, err, multiSelect, notion, number, ok, richText, select, title | CONFIRM STILL USED |
| `goals-list.js` | GOALS | notion.databases | CORS, DB, err, getProp, notion, ok | CONFIRM STILL USED |
| `main.jsx` | FINANCIAL | notion.databases | CORS, DB, err, getProp, notion, ok | CONFIRM STILL USED |
| `notes-create.js` | NOTES | notion.pages | CORS, DB, err, notion, ok, relation, richText, select, title | Activities `tbldGvr7qmeuUBMA8` or Notes (TBD) |
| `notes-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `notes-list.js` | NOTES | notion.databases | CORS, DB, err, getProp, notion, ok | Activities `tbldGvr7qmeuUBMA8` or Notes (TBD) |
| `notes-update.js` | - | notion.pages | CORS, DB, err, notion, ok, richText | n/a |
| `opportunities-create.js` | OPPORTUNITIES | notion.pages | CORS, DB, date, err, multiSelect, notion, number, ok, richText, select, title | Opportunities `tblrYR26yf0xKlpiB` |
| `opportunities-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `opportunities-list.js` | OPPORTUNITIES | notion.databases | CORS, DB, err, getProp, notion, ok | Opportunities `tblrYR26yf0xKlpiB` |
| `opportunities-update.js` | - | notion.pages | CORS, date, err, multiSelect, notion, number, ok, richText, select | n/a |
| `outreach-create.js` | OUTREACH | notion.pages | CORS, DB, err, notion, ok, richText, select, title | Outreach (id TBD) |
| `outreach-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `outreach-list.js` | OUTREACH | notion.databases | CORS, DB, err, getProp, notion, ok | Outreach (id TBD) |
| `outreach-notes-list.js` | - | notion.blocks | CORS, err, notion, ok | n/a |
| `outreach-update.js` | - | notion.blocks, notion.pages | CORS, err, notion, ok, richText, select | n/a |
| `playbook-block-children.js` | - | notion.blocks | CORS, err, ok | n/a |
| `playbook-page.js` | - | notion.blocks, notion.pages | CORS, err, ok | n/a |
| `playbook-save-block.js` | - | notion.blocks | CORS, err, ok | n/a |
| `posts-create.js` | - | notion.pages | CORS, date, err, notion, ok, relation, richText, select, title | n/a |
| `posts-update.js` | - | notion.pages | CORS, date, err, notion, ok, richText, select | n/a |
| `references-note.js` | NOTES | notion.pages | CORS, DB, err, notion, ok, richText, select, title | Activities `tbldGvr7qmeuUBMA8` or Notes (TBD) |
| `tasks-create.js` | TASKS | notion.blocks, notion.pages | CORS, DB, date, err, multiSelect, notion, ok, relation, richText, select, title | Master Action Board `tblh8XdwnIxjYkPd9` |
| `tasks-delete.js` | - | notion.pages | CORS, err, notion, ok | n/a |
| `tasks-list.js` | TASKS | notion.databases | CORS, DB, err, getProp, notion, ok | Master Action Board `tblh8XdwnIxjYkPd9` |
| `tasks-notes-list.js` | - | notion.blocks | CORS, err, notion, ok | n/a |
| `tasks-update.js` | - | notion.blocks, notion.pages | CORS, DB, date, err, multiSelect, notion, ok, richText, select | n/a |
| `useVoice.js` | - | notion.pages | CORS, err, multiSelect, notion, ok, richText, select | n/a |

## A. helpers only (mechanical)  (88 files)

| File | Imports / refs | Lines |
|---|---|---|
| `_auth.js` | CORS | 3 |
| `admin-invite-user.js` | CORS, err, ok | 3 |
| `admin-list-users.js` | CORS, err, ok | 4 |
| `admin-reset-password.js` | CORS, err, ok | 6 |
| `admin-set-tool-override.js` | CORS, err, ok | 10 |
| `admin-update-user-roles.js` | CORS, err, ok | 4 |
| `admin-update-user.js` | CORS, err, ok | 3 |
| `ads-delete.js` | CORS | 3 |
| `ads-list.js` | CORS | 3 |
| `ads-upsert.js` | CORS | 3 |
| `app-state-get.js` | CORS | 4 |
| `app-state-set.js` | CORS | 6 |
| `audio-logs-create.js` | CORS, err, ok | 4 |
| `audio-logs-list.js` | CORS, err, ok | 4 |
| `audio-logs-update.js` | CORS, err, ok | 4 |
| `audit-log-list.js` | CORS, err, ok | 5 |
| `booking-cancel.js` | CORS | 1 |
| `booking-create.js` | CORS | 9 |
| `booking-pages-delete.js` | CORS, err, ok | 2 |
| `booking-pages-list.js` | CORS, err, ok | 2 |
| `booking-pages-upsert.js` | CORS, err, ok | 2 |
| `booking-public-page.js` | CORS | 14 |
| `bookmarks-add.js` | CORS, err, ok | 4 |
| `bookmarks-create.js` | CORS, err, ok | 4 |
| `bookmarks-delete.js` | CORS, err, ok | 4 |
| `bookmarks-list.js` | CORS, err, ok | 5 |
| `bookmarks-remove.js` | CORS, err, ok | 4 |
| `bookmarks-update.js` | CORS, err, ok | 4 |
| `calendar-create-event.js` | CORS, err, ok | 23 |
| `calendar-list-events.js` | CORS, err, ok | 22 |
| `categories-delete.js` | CORS, err, ok | 4 |
| `categories-upsert.js` | CORS, err, ok | 9 |
| `client-platforms-list.js` | CORS | 3 |
| `client-platforms-upsert.js` | CORS | 3 |
| `comments-create.js` | CORS | 3 |
| `comments-delete.js` | CORS | 3 |
| `comments-list.js` | CORS | 3 |
| `comments-update.js` | CORS | 3 |
| `cost-dashboard-data.js` | CORS, err, ok | 10 |
| `email-labels.js` | CORS, err, ok | 4 |
| `email-thread-delete.js` | CORS, err, ok | 7 |
| `email-thread-get.js` | CORS, err, ok | 4 |
| `email-thread-modify.js` | CORS, err, ok | 5 |
| `email-threads.js` | CORS, err, ok | 4 |
| `github-proxy.js` | CORS, err, ok | 23 |
| `google-accounts-list.js` | CORS, err, ok | 4 |
| `google-accounts-oauth-callback.js` | CORS | 14 |
| `google-accounts-oauth-start.js` | CORS, err, ok | 14 |
| `google-accounts-remove.js` | CORS, err, ok | 5 |
| `google-accounts-set-active.js` | CORS, err, ok | 5 |
| `kanban-boards-list.js` | CORS | 3 |
| `kanban-cards-delete.js` | CORS | 3 |
| `kanban-cards-list.js` | CORS | 3 |
| `kanban-cards-move.js` | CORS | 3 |
| `kanban-cards-upsert.js` | CORS | 3 |
| `kanban-lanes-delete.js` | CORS | 3 |
| `kanban-lanes-upsert.js` | CORS | 3 |
| `media-upload.js` | CORS, err, ok | 1 |
| `ncnda-send.js` | CORS, err, ok | 16 |
| `netlify-proxy.js` | CORS, err, ok | 16 |
| `notion-connection-status.js` | CORS, err, ok | 1, 2, 16, 29, 32 |
| `notion-disconnect.js` | CORS, err, ok | 1, 2, 16, 20 |
| `notion-oauth-start.js` | CORS, err, ok | 1, 2, 3, 4, 5, 6, 8, 15, 22, 23, 33, 37 |
| `platforms-save.js` | CORS, err, ok | 1 |
| `playbook-links-delete.js` | CORS, err, ok | 2 |
| `playbook-links-list.js` | CORS, err, ok | 1, 4 |
| `playbook-links-upsert.js` | CORS, err, ok | 1, 3, 21 |
| `playbook-tree.js` | CORS, err, ok | 2, 3, 4, 6, 7, 17, 21, 24, 38, 39, 42, 50 |
| `posts-csv-import.js` | CORS, err, ok | 17 |
| `posts-list.js` | CORS, err, ok | 2 |
| `posts-publish.js` | CORS, err, ok | 1 |
| `posts-upsert.js` | CORS, err, ok | 2 |
| `references-pin.js` | CORS, err, ok | 5 |
| `references-unpin.js` | CORS, err, ok | 3 |
| `resource-comments-create.js` | CORS, err, ok | 4 |
| `resource-comments-delete.js` | CORS, err, ok | 4 |
| `resource-comments-list.js` | CORS, err, ok | 6 |
| `resource-comments-update.js` | CORS, err, ok | 4 |
| `resources-delete.js` | CORS, err, ok | 3 |
| `resources-list.js` | CORS, err, ok | 9 |
| `resources-upsert.js` | CORS, err, ok | 20 |
| `send-email.js` | CORS, err, ok | 6 |
| `social-ai-campaign.js` | CORS, err, ok | 34 |
| `social-ai.js` | CORS, err, ok | 2 |
| `team-calendar-events.js` | CORS, err, ok | 2 |
| `team-list.js` | CORS, err, ok | 4 |
| `voice-parse.js` | CORS, err, ok | 4, 74 |
| `voice-transcribe.js` | CORS, err, ok | 9 |

## C. env/config reference  (3 files)

| File | Imports / refs | Lines |
|---|---|---|
| `UI.jsx` | NOTION_OAUTH_CLIENT_ID | 3, 6, 7, 11, 18, 28, 30, 34, 35, 46, 50, 59 |
| `_notion.js` | NOTION_OUTREACH_DB_ID, NOTION_TOKEN | 1, 3, 5, 15 |
| `notion-oauth-callback.js` | NOTION_OAUTH_CLIENT_ID, NOTION_OAUTH_CLIENT_SECRET | 1, 2, 3, 22, 26, 34, 36, 39, 43, 44, 46, 51 |

## D. mention only (comment/string)  (13 files)

| File | Imports / refs | Lines |
|---|---|---|
| `CardExtras.jsx` | text only | 81, 91, 159, 165, 170, 171, 172, 173 |
| `CompanyView.jsx` | text only | 446 |
| `Opportunities.jsx` | text only | 19, 169 |
| `Overview.jsx` | text only | 21, 35 |
| `PublicBookingPage.jsx` | text only | 268 |
| `References.jsx` | text only | 693, 709 |
| `Signature.jsx` | text only | 501 |
| `Tasks.jsx` | text only | 2, 10, 14, 36, 37, 39, 163, 237, 239, 411, 413 |
| `TeamGoals.jsx` | text only | 2, 466, 556, 925, 937, 1027, 1110, 1111, 1115 |
| `access.js` | text only | 112, 114 |
| `load.js` | text only | 60, 214, 1028 |
| `smoke.js` | text only | 4, 136, 137 |
| `useTabState.js` | text only | 83, 94, 108, 109, 180, 181, 182, 183 |

---

## Re-run this against your local tree

Save as `scripts/notion-audit.py`, run from the repo root:

```bash
python3 scripts/notion-audit.py > docs/notion-inventory.md
```
```python
import os, re, collections

client_pat = re.compile(r'\bnotion\.(pages|databases|blocks|users|search|comments)\b')
db_pat     = re.compile(r'\bDB\.([A-Z_]+)')
helpers    = {'ok','err','CORS','corsFor','originHeaders'}

rows = []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist')]
    for f in sorted(files):
        if not f.endswith(('.js','.jsx','.ts','.tsx')): continue
        path = os.path.join(root, f)
        txt  = open(path, encoding='utf-8', errors='ignore').read()
        if 'notion' not in txt.lower(): continue
        imports = set()
        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'[^']*_notion\.js'", txt):
            imports |= {n.strip().split(' as ')[0].strip() for n in m.group(1).split(',') if n.strip()}
        calls = sorted({m.group(0) for m in client_pat.finditer(txt)})
        dbs   = sorted({m.group(1) for m in db_pat.finditer(txt)})
        env   = sorted(set(re.findall(r'NOTION_[A-Z0-9_]+', txt)))
        if imports and imports.issubset(helpers) and not calls: cat = 'A helpers-only'
        elif calls or dbs:                                      cat = 'B migrate'
        elif env:                                               cat = 'C env'
        else:                                                   cat = 'D mention'
        rows.append((cat, path, sorted(imports), dbs, calls, env))

for cat, n in sorted(collections.Counter(r[0] for r in rows).items()):
    print(f'{cat}: {n}')
print()
for cat, path, imports, dbs, calls, env in sorted(rows):
    print(f'{cat}\t{path}\t{",".join(imports)}\t{",".join(dbs)}\t{",".join(calls)}\t{",".join(env)}')
```
