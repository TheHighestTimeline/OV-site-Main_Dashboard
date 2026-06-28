# AIRTABLE SETUP GUIDE
# OVMG Dashboard

---

## 1. Create an Airtable Personal Access Token

1. Go to https://airtable.com/create/tokens
2. Click **Create new token**
3. Name it: `OVMG Dashboard`
4. Set scopes:
   - ✅ `data.records:read`
   - ✅ `data.records:write`
   - ✅ `schema.bases:read`
5. Under **Access**, select your OVMG base
6. Click **Create token** and copy the token — you won't see it again
7. Add to Netlify: `AIRTABLE_TOKEN=patXXXXXXX.XXXXXX...`

---

## 2. Find Your Airtable Base ID

1. Open your Airtable base in a browser
2. Look at the URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`
3. The `appXXXXXXXXXXXXXX` part is your Base ID
4. Add to Netlify: `AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX`

---

## 3. Find Table IDs (Optional but Recommended)

Using table IDs instead of names prevents breakage if someone renames a table.

1. Open the Airtable API docs for your base: `https://airtable.com/developers/web/api/introduction`
2. Select your base from the dropdown
3. Each table shows its ID in the format `tblXXXXXXXXXXXXXX`
4. Use these IDs in your env vars, e.g.:
   ```
   AIRTABLE_TABLE_TASKS=tblXXXXXXXXXXXXXX
   ```

If you don't set these, the functions fall back to the default table names (e.g., "Master Action Board").

---

## 4. Add Netlify Environment Variables

In Netlify → Site configuration → Environment variables, add:

```
# Required
AIRTABLE_TOKEN=patXXXXXXXXXXXXXX.XXXXXXXX...
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX

# Table names or IDs (use names if you don't have IDs yet)
AIRTABLE_TABLE_CONTACTS=CRM Contacts
AIRTABLE_TABLE_TASKS=Master Action Board
AIRTABLE_TABLE_OPPORTUNITIES=Opportunities
AIRTABLE_TABLE_COMPANIES=Companies
AIRTABLE_TABLE_NOTES=Notes
AIRTABLE_TABLE_OUTREACH=Outreach
AIRTABLE_TABLE_GOALS=Goals
AIRTABLE_TABLE_FINANCIAL=Financial

```

---

## 5. Create Missing Airtable Tables

Before migrating, create these tables in your Airtable base. The easiest way is to use Airtable's UI:

### Goals table
Primary field: `Goal` (Single line text)

Additional fields:
| Field | Type |
|-------|------|
| Owner | Single line text |
| Status | Single select (Not Started / In Progress / Done / Blocked) |
| Priority | Single select (High Priority / Medium Priority / Low Priority) |
| Quarter | Single select (Q1 2026 / Q2 2026 / Q3 2026 / Q4 2026) |
| Progress | Number (0–100) |
| Notes | Long text |
| Category | Multiple select |
| Notion Page ID | Single line text |
| Source Database | Single line text |

### Financial table
Primary field: `Goal` (Single line text)

Additional fields:
| Field | Type |
|-------|------|
| Type | Single select (Revenue / Cost / Savings / Other) |
| Target | Currency |
| Current Amount | Currency |
| Notion Page ID | Single line text |
| Source Database | Single line text |

### Outreach table
Primary field: `Lead / Business Name` (Single line text)

Additional fields:
| Field | Type |
|-------|------|
| Status | Single select (No Status / Assigned / Contacted / Founder Outreach / Negotiations / Won / Lost / Archived / Additional Outreach) |
| Contact Name | Single line text |
| Business Type | Single select |
| City / State | Single line text |
| Contact Email | Email |
| Phone | Phone number |
| Website | URL |
| Instagram | URL |
| LinkedIn | URL |
| Assigned Partner / Owner | Single line text |
| Email Sent | Checkbox |
| Instagram DM Sent | Checkbox |
| Lead Quality | Single select (Hot / Warm / Cold) |
| Priority | Single select (High / Medium / Low) |
| Source | Single select |
| Notes | Long text |
| Next Action | Single line text |
| Next Follow-Up Date | Date |
| Recommended Offer | Single line text |
| Notion Page ID | Single line text |
| Source Database | Single line text |
| Original Notion URL | URL |

### Notes table
Primary field: `Title` (Single line text)

Additional fields:
| Field | Type |
|-------|------|
| Notes | Long text |
| AI Summary | Long text |
| Type | Single select (Note / Call / Meeting / Voice Note) |
| Linked Contact ID | Single line text |
| Notion Page ID | Single line text |
| Source Database | Single line text |

### Add to existing tables
Add `Notion Page ID` (Single line text) and `Source Database` (Single line text) to:
- CRM Contacts
- Master Action Board
- Opportunities
- Companies

---

## 6. Run the Health Check

The health check endpoint confirms everything is connected before you switch functions:

```bash
# From the dashboard (Settings tab or browser devtools):
GET /.netlify/functions/airtable-health

# Or with curl (needs a Clerk session token):
curl -H "Authorization: Bearer <your-clerk-token>" \
  https://ovmgdashboard.netlify.app/.netlify/functions/airtable-health
```

A passing check returns:
```json
{
  "ready": true,
  "summary": "All checks passed. Base \"OVMG\" is accessible and all required tables are present."
}
```

To also test write access (creates + immediately deletes a test record):
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"testWrite": true}' \
  https://ovmgdashboard.netlify.app/.netlify/functions/airtable-health
```

---

## 7. Run Migration — Dry Run First

```bash
# Install dependencies if needed
npm install

# Make sure env vars are available (copy from Netlify or .env.local)
source .env.local  # or set vars manually

# Dry run — reads Notion, prints what would be migrated, writes nothing
node scripts/migrate-notion-to-airtable.mjs

# Dry run for one database only
node scripts/migrate-notion-to-airtable.mjs --db CRM
node scripts/migrate-notion-to-airtable.mjs --db TASKS
node scripts/migrate-notion-to-airtable.mjs --db OUTREACH
```

---

## 8. Run Live Migration

```bash
# Live migration — writes to Airtable
# Safe to re-run — deduplicates by Notion Page ID
node scripts/migrate-notion-to-airtable.mjs --live

# Or migrate one database at a time
node scripts/migrate-notion-to-airtable.mjs --db CRM --live
node scripts/migrate-notion-to-airtable.mjs --db TASKS --live
node scripts/migrate-notion-to-airtable.mjs --db OPPORTUNITIES --live
node scripts/migrate-notion-to-airtable.mjs --db GOALS --live
node scripts/migrate-notion-to-airtable.mjs --db FINANCIAL --live
node scripts/migrate-notion-to-airtable.mjs --db NOTES --live
node scripts/migrate-notion-to-airtable.mjs --db OUTREACH --live
```

---

## 9. Convert Netlify Functions to Airtable

After confirming migration is correct, convert each function group. The new `_airtable.js` adapter is ready — each function just needs to swap `_notion.js` imports for `_airtable.js` ones.

### Conversion order (safest first):
1. `contacts-list`, `contacts-create`, `contacts-update` → uses `CONTACTS_MAP`
2. `tasks-list`, `tasks-create`, `tasks-update`, `tasks-delete` → uses `TASKS_MAP`
3. `opportunities-list`, `opportunities-create`, `opportunities-update`, `opportunities-delete` → uses `OPPORTUNITIES_MAP`
4. `outreach-list`, `outreach-create`, `outreach-update`, `outreach-delete` → uses `OUTREACH_MAP`
5. `goals-list`, `goals-create` → uses `GOALS_MAP`
6. `financial-list` → uses `FINANCIAL_MAP`
7. `notes-list`, `notes-create`, `notes-update`, `notes-delete` → uses `NOTES_MAP`

**Tell me when you're ready for this step** and I'll convert each group one at a time so you can test between each one.

---

## 10. Smoke Test Checklist

After converting each function group:

- [ ] Contacts tab loads and shows existing contacts
- [ ] Can create a new contact
- [ ] Can edit a contact
- [ ] Tasks tab loads and shows tasks grouped by company
- [ ] Can create a task
- [ ] Can update task status
- [ ] Can delete a task
- [ ] Opportunities tab loads
- [ ] Can create/update/delete opportunities
- [ ] Outreach tab loads leads
- [ ] Can create/update a lead
- [ ] Team Goals tab loads
- [ ] Financial tab loads
- [ ] Contacts tab shows notes for each contact

---

## 11. Notes on What Stays Notion

Even after full migration, two things still use Notion:

1. **Playbook** — Reads Notion pages via personal OAuth. Completely independent of the DB migration. Leave as-is.
2. **`tasks-notes-list` / `outreach-notes-list`** — These read Notion block children (callout notes). In Airtable v1, these will return an empty array. Historical notes stay in Notion. New notes will write to the `Notes` long text field on the parent record.
