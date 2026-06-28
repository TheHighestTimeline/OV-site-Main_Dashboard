# OneVibe Social (Clients tab) — Setup

The Clients tab works **immediately** in demo mode (showing 4 sample clients + sample posts) so you can click around without configuring anything. To make it real, follow the steps below.

## Environment variables (Netlify → Site settings → Environment variables)

```
ANTHROPIC_API_KEY     = sk-ant-...               # Required for AI Assistant + live Campaign Builder
NOTION_CLIENTS_DB_ID  = <Notion DB ID, see below>
NOTION_POSTS_DB_ID    = <Notion DB ID, see below>
```

If `ANTHROPIC_API_KEY` is missing the right-panel chat falls back to a per-client mock pool (still works, just not real Claude).
If the Notion DB IDs are missing the tab works in demo mode with sample data.

## Notion DB schema

Create two databases in your Notion workspace and share them with your existing Notion integration. The database IDs are the 32-character UUIDs in their URLs.

### Clients database — properties

| Property            | Type          | Notes                                     |
|---------------------|---------------|-------------------------------------------|
| Name                | Title         | Client / brand / artist name              |
| Genre               | Select        | "Alt Rock", "Food & Beverage", etc.       |
| Bio                 | Rich text     | One-sentence positioning line             |
| Brand Voice         | Rich text     | Tone description, dos & don'ts inline OK  |
| Target Audience     | Rich text     | Demographic + psychographic notes         |
| Do's                | Multi-select  | Each tag = one rule                       |
| Don'ts              | Multi-select  | Each tag = one rule                       |
| Brand Colors        | Rich text     | Comma-separated hex (`#d96b3a, #6b4423`)  |
| IG Handle           | Rich text     | `@acmecoffee`                             |
| TikTok Handle       | Rich text     | `@acme.coffee`                            |
| Facebook Handle     | Rich text     |                                           |
| YouTube Handle      | Rich text     |                                           |
| IG Followers        | Number        | optional                                  |
| TikTok Followers    | Number        | optional                                  |
| YouTube Followers   | Number        | optional                                  |
| Color               | Rich text     | Avatar color hex                          |
| Initials            | Rich text     | 2 chars; auto-generated if blank          |
| Drive Folder ID     | Rich text     | Google Drive folder ID (for v2)           |
| Last Synced         | Date          | Auto-set on create / update               |

### Posts database — properties

| Property      | Type          | Notes                                                                                  |
|---------------|---------------|----------------------------------------------------------------------------------------|
| Name          | Title         | First 60 chars of caption                                                              |
| Client        | Relation → Clients | Link to the Clients DB above                                                      |
| Platform      | Select        | `instagram`, `tiktok`, `facebook`, `youtube`, `threads`                                |
| Caption       | Rich text     |                                                                                        |
| Hashtags      | Rich text     |                                                                                        |
| Status        | Select        | `draft`, `pending_review`, `approved`, `scheduled`, `posted`, `failed`                 |
| Scheduled At  | Date          | Includes time                                                                          |
| AI Generated  | Checkbox      |                                                                                        |
| Quality       | Number        | 1–10, set by Review Agent                                                              |

After creating both databases, paste their IDs into Netlify env vars and redeploy.

## What works today vs. v2

**Today (after env setup):**
- Real client roster + post list from Notion
- Brand profile editing writes to Notion
- AI Campaign Builder (5-agent orchestration, mock OR live Anthropic mode)
- AI Assistant chat with client-voice grounding
- Calendar, Approvals, Analytics — all live against Notion data
- Onboarding wizard creates real Notion client pages

**Stubbed / v2:**
- Google Drive asset picker (button shows "coming in v2" toast)
- Encrypted platform credential storage (Supabase + key rotation)
- Real publish flow to IG/TikTok/FB/YT (the Approve→Publish button currently flips status; no platform write happens)
- Scraper for onboarding (wizard shows simulated progress)

These are intentionally stubbed so the UI is shippable today. Wire them up in v2 by replacing `posts-publish.js`, `platforms-save.js`, `media-upload.js`, and adding a scraper layer.
