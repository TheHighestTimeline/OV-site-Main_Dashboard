# OVMG Airtable Schema Reference

**Base:** OV Dashboard `appgZ4EvfGEI4owb7`
**Verified:** 2026-08-03, live via the Airtable schema API. Nothing below is guessed.
**Tables:** 25

---

## 1. The headline finding

**The Airtable migration was already started.** Three tables carry descriptions saying so:

- **Outreach** `tblNOZrmSYspJ0sbl`: never existed in Airtable despite `Outreach.jsx` referencing it, recreated 2026-07 to match the existing `OUTREACH_MAP` field mapping exactly
- **Goals** `tblnQXPZ42nVMLulQ`: recreated 2026-07 to match the existing `GOALS_MAP` mapping exactly
- **Financial** `tblSgbrab351R5uhE`: recreated 2026-07 to match the existing `FINANCIAL_MAP` mapping exactly

Someone built Airtable targets shaped to the dashboard's existing field maps. So COO-0b is not "design a migration." It is **finish one that is already underway.** Check whether `OUTREACH_MAP`, `GOALS_MAP` and `FINANCIAL_MAP` still exist in the code; if they do, those three slices may be close to a straight repoint.

---

## 2. Table ID map

| Purpose | Airtable table | ID |
|---|---|---|
| Contacts | CRM Contacts | `tbl6MKKs3xXrYBPL4` |
| Deals and workstreams | Opportunities | `tblrYR26yf0xKlpiB` |
| Tasks | Master Action Board | `tblh8XdwnIxjYkPd9` |
| Calls, notes, transcripts | Activities | `tbldGvr7qmeuUBMA8` |
| Companies | Companies | `tbluCVKcO1yWQC68n` |
| Document registry | Documents | `tbll1FlmXHBZTP5j5` |
| Cold outreach | Outreach | `tblNOZrmSYspJ0sbl` |
| Goals | Goals | `tblnQXPZ42nVMLulQ` |
| Financial targets | Financial | `tblSgbrab351R5uhE` |
| Projects | Projects | `tblv8d2aKqTD1vsGX` |
| Project milestones | Project Timeline | `tbl0bmyqSNssENBMF` |
| Signed agreements | Signed Deals | `tbl6obmYemQd8vomP` |
| Drive folder registry | Folders | `tblwSGG8WGDXjgfRc` |
| Tags | Tags | `tblFJaitv09T8uxSh` |
| OVM clients | OVM Clients DB | `tblb0aLDqSgAG8DPU` |
| Client content | Client Posts | `tblHgZonLiX6dgp09` |
| Reference docs | Reference Library | `tblZslj0B2ULnzfrB` |
| Creative assets | Source Asset Library | `tblq1zlE6Fo8rE0Yy` |
| Inbound triage | Import Inbox | `tblyp4WW5SBAPNNmF` |
| CSV provenance | Raw CSV Index | `tblxSD3snkw9fLtKz` |
| Amplify | Amplify Projects / Tasks / All Tasks / Ambassadors | `tblDZlLdnOJnsKXQ5` / `tblaaHZd250JCCJLo` / `tbljdPnhf6wN5JHpv` / `tblzKxDbmoEkFmKsS` |
| Solar | Solar Tasks | `tbliRLg6X7lkuRsOh` |
| Unlabeled | Table 19 | `tbl29tlCmvCDw29bU` |

All of these are now hardcoded in `_airtable.js` under `TB`, with the field IDs the COO layer writes under `FLD`.

**Notion to Airtable mapping:** `DB.CRM` to CRM Contacts, `DB.TASKS` to Master Action Board, `DB.OPPORTUNITIES` to Opportunities, `DB.COMPANIES` to Companies, `DB.OUTREACH` to Outreach, `DB.GOALS` to Goals, `DB.FINANCIAL` to Financial, `DB.NOTES` to **Activities** (there is no table called Notes; Activities is the equivalent and its description confirms it is the contact timeline).

Two housekeeping items: **Table 19** is unnamed and probably scratch, and **All Amplify Tasks** duplicates **Amplify Tasks**. Confirm both before anything writes to them.

---

## 3. Corrections this forced to the handoff

### 3a. The `call-debrief` field-ID warning was wrong

Earlier handoff versions said the `call-debrief` skill writes Entity by field ID `fldG8sAUE0bgxLK3g` and `fldVDtksgeG6aambc`, and that converting Entity to a lookup would break it.

Those IDs are **Description** and **Due Date** on Master Action Board. Entity is `fldFgEX30mf5s0VfY`.

The underlying caution still holds. Entity is a writable `singleSelect` on both Opportunities (`fldmAxaulJrwo5aPv`) and Master Action Board (`fldFgEX30mf5s0VfY`), and converting either to a lookup would break writes. The specific field IDs cited were simply wrong.

### 3b. Several fields I specced already exist

Do not create these. They are live, and some carry descriptions referencing a **COO Operating Manual Part 3** that predates this build.

| Field | Table | ID | Note |
|---|---|---|---|
| `Owner` | CRM Contacts | `fld5Kq9uUeaasSnYO` | "Who at OVMG owns this relationship" |
| `Next Action` | CRM Contacts | `fldpisUnoYhsWU49C` | |
| `Next Action Date` | CRM Contacts | `fldxvtLa4nLeQsesl` | Note: **Date**, not "Due" |
| `Last Contacted` | CRM Contacts | `fldfftokgexdCO3d8` | Covers `Last Touch` |
| `Referred By` | CRM Contacts | `fldpyVajtkLK9EYhe` | Referral tree works today |
| `Related Entities` | CRM Contacts | `fldTQO9sKac1ynoQ0` | |
| `Current Summary` | CRM Contacts | `fldA4174EvkPnnWpv` | Intended to be AI-refreshed from notes and transcripts. This is the brief, already scaffolded. |
| `Data Room` | Opportunities | `fldzrc7seIPYzq0d3` | **The Drive detector reads this** instead of a new env var |
| `Kind` | Opportunities | `fldVjvHM75QQ7FPyJ` | Deal vs Workstream, already distinguishes a $20M raise from a homepage edit |
| `Next Step` | Opportunities | `fldAsZfsBxAufJNiJ` | |
| `Signed Date`, `Tags`, `Expiry Date` | Documents | `fldl1VD98Mc2FFCwz`, `fldaby2kwbOwHpH3Q`, `fldY1a0lrAf1AGOFY` | Tags include Signed/Draft/Template. The `doc_signed` detector reads these. |

`Kind` deserves attention: it already splits Deal from Workstream. That is adjacent to but **not the same as** the Program and Workstream hierarchy in Section 1a, which needs a parent link. Decide whether `Kind` gets reused or left alone, but do not build a second field that means almost the same thing.

### 3c. `COO_DATA_ROOM_FOLDER_IDS` should be derived, not configured

`coo-signals-scan-drive.js` currently reads folder ids from an env var. Better: read the `Data Room` URL off each Opportunity and extract the folder id. Then adding a workstream automatically puts its data room under watch, with nothing to configure. Keep the env var as an override.

---

## 4. What still has to be created

| Item | Where | Why |
|---|---|---|
| **`Participations` table** | new | The junction. Section 1a. The one genuinely new table. |
| `Parent Opportunity` self-link | Opportunities | Program vs Workstream. Companies already has `Parent Company` `fldf6BkU30LhVjfH7` as the precedent. |
| `Focus`, `Focus Order`, `Focus Set At` | Master Action Board | The Today list, COO-9 |
| `Resolves On`, `Participation`, `Resolved By Signal` | Master Action Board | Evidence layer, COO-11 |
| `Goal`, `Target Value` | Opportunities | Workstream digest |
| `Channels Active` | CRM Contacts | Channel chips |

Stage fields go on **Participations**, not CRM Contacts. See Section 1a of the handoff.

---

## 5. Before writing anything

1. `Status` on CRM Contacts has a description noting the dashboard filtered on Active/Benched/Unknown while **the field did not exist, so writes silently no-opped.** Confirm the select options match what the code sends. Same class of bug is worth checking on every singleSelect the COO layer touches.
2. `Type` on CRM Contacts, `Stage` on Opportunities, and `Status` on Master Action Board are all `singleSelect`. Call `get_table_schema` for their options before writing. A value outside the option list fails unless `typecast` is on, and `typecast` silently creates new options, which is its own mess.
3. Master Action Board has both `Master Action Board` and `Master Action Board 2` links on CRM Contacts. Find out which is live before wiring the task link.
