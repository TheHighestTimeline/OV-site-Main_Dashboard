# OneVibe Internal Hub — Deploy Guide

## What you just got

A production-ready internal dashboard:
- **Auth**: Netlify Identity (admin invite-only, @onevibemediagroup.com accounts only)
- **Data**: All 6 Notion databases wired up with live read/write
- **Voice**: Real mic → OpenAI Whisper transcription → GPT-4o-mini parsing → Notion write
- **CI/CD**: Push to GitHub → Netlify auto-builds and deploys

---

## Step 1 — Push to your OVMGDASHBOARD repo

```bash
cd "C:\Users\STRIX MB\Documents\Claude\Projects\OneVibe"
git init
git add .
git commit -m "Initial commit — OneVibe Internal Hub"
git remote add origin https://github.com/YOUR_USERNAME/OVMGDASHBOARD.git
git push -u origin main
```

---

## Step 2 — Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Choose GitHub → select your `OVMGDASHBOARD` repo
3. Build settings (should auto-detect):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`
4. Click **Deploy site**

---

## Step 3 — Add environment variables

In Netlify → **Site configuration** → **Environment variables**, add:

| Key | Value |
|-----|-------|
| `NOTION_TOKEN` | Your Notion integration token (starts with `secret_`) |
| `OPENAI_API_KEY` | Your OpenAI key (starts with `sk-`) |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` (optional) |
| `OPENAI_PARSE_MODEL` | `gpt-4o-mini` (optional) |

After adding, trigger a redeploy: **Deploys** → **Trigger deploy**.

---

## Step 4 — Enable Netlify Identity

1. Netlify → your site → **Identity** tab → **Enable Identity**
2. Under **Registration**, set to **Invite only**
3. Under **External providers**, leave Google/GitHub off (email+password only)
4. Under **Emails**, you can customize the invite email template

---

## Step 5 — Make yourself admin

1. Click **Invite users** → enter your email (`tannersouth23@gmail.com` or your OVMG email)
2. Accept the email invite and set your password
3. In Netlify → Identity → click your user → **Edit user** → set `app_metadata` to:
   ```json
   {"roles": ["admin"]}
   ```
4. Sign in — you'll see the **Admin** tab in the sidebar

---

## Step 6 — Wire up Notion databases

Share each database with your Notion integration:
1. Open the database in Notion
2. Click **⋯** (top right) → **Connections** → add your integration

Databases to share (all 6):

| Database | ID |
|----------|-----|
| CRM (Contacts) | `311ec2c4-6428-81c2-af03-f92bb583f4ba` |
| Tasks (Master) | `311ec2c4-6428-817a-9cb8-c18ea82101b0` |
| Team Goals | `5baaa13a-ba09-464a-a686-122518fd63e8` |
| Financial Goals | `20eec2c4-6428-8160-8f64-f87fd778f27e` |
| Companies | `312ec2c4-6428-80ae-a5fa-cc7396fb9327` |
| Calls/Notes | `314ec2c4-6428-80e2-8bd2-000b1bc2224d` |

---

## Step 7 — Invite your team

From the **Admin** tab in the dashboard:
1. Click **+ Invite user**
2. Enter their `@onevibemediagroup.com` email
3. They get an email to set their password
4. They sign in and see their personal tasks (filtered by their name)

---

## Auto-deploy workflow

Every `git push` to `main` triggers a Netlify rebuild. Takes ~60 seconds.

```bash
# Make changes, then:
git add .
git commit -m "Your message"
git push
```

---

## Notion property names

The app looks for these property names in your databases. If yours are named differently, update the lookup calls in `netlify/functions/tasks-list.js` (and similar files):

**Tasks**: `Task` (title), `Status`, `Priority`, `Owner`, `Due Date`, `Deal Category`, `Company Names`  
**CRM**: `Name` (title), `Company`, `Role`, `Email`, `Phone`, `Website`, `Status`, `Type`, `Relates To`  
**Goals**: `Goal` (title), `Owner`, `Status`, `Priority`, `Quarter`, `Progress`, `Notes`, `Category`  
**Financial**: `Goal` (title), `Type`, `Target`, `Current Amount`  
**Notes**: `Title`, `Body`, `Type`, `Contact` (relation), `Summary`

---

## Voice costs

| Feature | Model | Cost |
|---------|-------|------|
| Transcription | gpt-4o-mini-transcribe | ~$0.006/min |
| Parsing | gpt-4o-mini | ~$0.001/call |

5-person team doing daily My Day + occasional voice notes: **under $10/month**.

---

## Local dev

```bash
npm install
netlify dev   # runs Vite + Functions together on port 8888
```

Requires [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`  
Create a `.env` file from `.env.example` with your keys.
