# CRM Cleanup — Review & Next Steps

**Date:** 2026-05-13
**Scope:** OneVibeMediaGroup → Backend → CRM database

---

## What's already done

### 1. Added `Referred By` column (self-relation)
- New property: **Referred By** — relation to CRM (self)
- Auto-created back-reference: **Referred** — shows everyone a contact has brought in
- Leave blank for now; you'll tag rows yourself

### 2. Fixed misplaced data
| Contact | Issue | Fix |
|---|---|---|
| Noel Garcia (SOLR) | Phone `+1 (813) 712-9791` was in Website field | Moved to Phone |
| Justin Runnels (SOLR) | Phone `239.452.0130` was in Website field | Moved to Phone |
| Ryan Robinson (CS) | Phone `864.316.0528` was in Website field | Moved to Phone |
| Stephen Sobel | Name typo (email is `ssoble@`) | Renamed → **Stephen Soble** (both records) |
| Noel Garcia dup | Name had markdown bold `**...**` | Cleaned |

### 3. Backfilled Internal / External (where confident)
Set based on email domain. **Internal** = anyone @onevibegroup.com, @carbonsponge.io, or your OVMG brand entities (28 records tagged across both dupes of each):
- Internal: Tanner South (OV/CS), Ryan Robinson (CS), Carsten Gauslow (OVMG/CS), Tim Sperry (OVGM/CS), Alex Cucu (CS), Nathan South
- External: Ross Myers, Peter Rosetti, Stephen Soble, Kurt Hamilton, John Thor Price, Noel Garcia, Justin Runnels, RJ Blockchain

Everything else still needs an Internal/External tag — see "What's left for you" below.

---

## Confirmed duplicates — DELETE the right-hand record after you confirm

The CRM was clearly imported twice. The **35fec batch** is the fuller version (has Company, Role, sometimes Phone); the **314ec batch** is a sparser re-import that's almost always duplicative. Recommendation: keep the 35fec record, delete the 314ec one.

| Person | KEEP (more complete) | DELETE | Notes |
|---|---|---|---|
| Ross Myers | [35fec…1cd8](https://www.notion.so/35fec2c464288043a6a4d87232ae1cd8) (ID 66) | [314ec…2ee0](https://www.notion.so/314ec2c4642880dfa5c5ea08ca052ee0) (ID 43) | Same email |
| Kurt Hamilton | [35fec…1ae74](https://www.notion.so/35fec2c4642880d3bb8ede03a3d1ae74) (ID 62) | [314ec…9816e](https://www.notion.so/314ec2c4642880c6aee8efb3ca79816e) (ID 44) | 35fec has Company + Role |
| John Thor Price | [35fec…2b88d](https://www.notion.so/35fec2c4642880d18149d2578682b88d) (ID 60) | [314ec…82195](https://www.notion.so/314ec2c4642880cc9dbbc71b00f82195) (ID 33) | 314ec has Website filled — **copy `www.gmpco.com` to the 35fec record before deleting** |
| Tanner South (OV) | [35fec…3494b8b](https://www.notion.so/35fec2c46428800e8baed338f3494b8b) (ID 71) | [314ec…b6642](https://www.notion.so/314ec2c46428805d92aaca156c8b6642) (ID 35) | Both identical |
| Tanner South (CS) | [35fec…2d4014](https://www.notion.so/35fec2c4642880a8928ec5e07b2d4014) (ID 70) | [314ec…cccf32](https://www.notion.so/314ec2c46428809fb431dae3b6cccf32) (ID 34) | Both identical |
| Stephen Soble | [35fec…1480](https://www.notion.so/35fec2c4642880fab0c4ea29b3bd1480) (ID 69) | [314ec…47a58](https://www.notion.so/314ec2c4642880fd9257f9bc1cc47a58) (ID 46) | **Copy `www.assured.enterprises` Website from 314ec → 35fec before deleting** |
| Noel Garcia (SOLR) | [35fec…39d4b55](https://www.notion.so/35fec2c46428801087eff0a7039d4b55) (ID 63) | [314ec…b54c](https://www.notion.so/314ec2c4642880858df0ebce98e4b54c) (ID 45) | 35fec has Company + Role + Phone |
| Justin Runnels (SOLR) | [35fec…81315](https://www.notion.so/35fec2c4642880449296c0eb9c881315) (ID 61) | [314ec…11c6a](https://www.notion.so/314ec2c464288060ba92d15dbbd11c6a) (ID 40) | Both have data — pick role label you prefer |
| Ryan Robinson (CS) | [35fec…b9d3f](https://www.notion.so/35fec2c464288070bb34c387cd8b9d3f) (ID 67) | [314ec…e9d51](https://www.notion.so/314ec2c464288093bac2c4395b8e9d51) (ID 41) | 35fec has Company + Phone |
| RJ Blockchain | [35fec…35aa6](https://www.notion.so/35fec2c4642880fdb080f5646e435aa6) (ID 65) | [314ec…6a7bdc](https://www.notion.so/314ec2c4642880d4a063ee4a156a7bdc) (ID 42) | Both identical |
| Peter Rosetti | [35fec…ae4460](https://www.notion.so/35fec2c4642880fba9c3d7c8e6ae4460) (ID 64) | [355ec…be0bb](https://www.notion.so/355ec2c4642880aebea4d8abf74be0bb) (ID 58) | 35fec has Role filled |

**Plus three intra-batch dupes/typos to look at:**
| Person | Notes |
|---|---|
| Carsten Gauslow | Three records: (OVG), (OVMG), (Carbon Sponge). "OVG" is almost certainly a typo for "OVMG" — same person. Decide if you want one record per company or one canonical. |
| Tim Sperry | "(OVGM)" is a typo for "(OVMG)" — but there's also a "(Carbon Sponge)" record. Same call as Carsten. |
| Austin Davis | (OVMG) and (Morgan Creek) — likely intentional (different firms) but verify. |

**Likely-same-person ambiguous cases** (single first names that may map to fuller records):
- "Ryan" → maybe Ryan Robinson?
- "Noel" → maybe Noel Garcia?
- "Stephen" → maybe Stephen Soble?
- "Michael" → maybe Michael Latimer?
- "John" → maybe John Thor Price?

---

## What's left for you

### 1. Fill in `Referred By` for each row
This is the JV-partner deliverable. Click the new **Referred By** column on each contact and pick who brought them in. The reciprocal **Referred** column will auto-populate so you can also see "who has each person brought in" at a glance.

### 2. Tag Internal/External on remaining rows
~55 records still untagged — I only filled the ones I could verify by email domain. The fastest path: group-by Select in a view, then bulk-edit the empty ones. Most of the single-first-name DJ/artist contacts (Ookay, Griz, Tape B, Decadent, Jenergy, Octeus, Riff Raff, Kobe, Caesar) are presumably **External** if you confirm.

### 3. Run the duplicate deletions
Once you've verified the table above, delete the right-hand records.

### 4. Decide on the page-title whitespace
Many of the older (35fec) records render with trailing spaces in the page title (e.g., ` Jim Adams IV          `). The Name property itself is clean, so this is cosmetic — visible only when you open the contact's page, not in the table view. Let me know if you want this scrubbed.

---

## JV partner export plan

Once Referred By is populated, the cleanest export is a filtered view:

```
FILTER "Referred By" is not empty
GROUP BY "Referred By"
SHOW Name, Company, Role, Email, Phone, Select
```

That gives the JV partner a referral map: each referrer → list of contacts they brought in. Want me to build that view directly in Notion?
