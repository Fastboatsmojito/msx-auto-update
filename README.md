# msx-auto-update

A shared skill that turns a Solution Engineer's evidenced weekly customer work into MSX records, with human approval:

- **HoK Tasks** on milestones
- **Forecast Comments** on opportunities or milestones
- The **team memberships** those writes require
- Optionally, **new milestones** (a per-run switch, off by default)

Flow: **draft (read-only) → review in an interactive page → Finish review → type "post to msx" → one confirmation in chat → write via `msx-write` → reconcile.**

> **Status: v1 for team pilot.** The review page is tested with demo data; the end-to-end run has not yet been exercised against live MSX. Every write still needs your "yes" in chat and the MSX confirmation prompt. See [Open items](#open-items).

## Install

Teammates need read access to this private repo.

1. Clone it: `gh repo clone Fastboatsmojito/msx-auto-update`
2. Copy the skill folder into your personal skills folder:
   - Windows: `Copy-Item -Recurse .\msx-auto-update\skills\msx-activity-review $HOME\.copilot\skills\`
   - macOS/Linux: `cp -R msx-auto-update/skills/msx-activity-review ~/.copilot/skills/`
3. Restart the GitHub Copilot app (or start a new session) and say **"run my MSX review"**.

To update later: `git pull` and copy the folder again.

## How a run looks

1. You pick the window (default: last 7 days) and whether new milestones may be created this run (default: no).
2. The agent reads your calendar, transcripts, email and Teams (read-only) and opens a **"Your week in MSX"** page in the side panel.
3. One card per piece of work. Each card shows the opportunity and milestone (name + MSX ID), an editable **HoK entry** and an optional **milestone update**, each with **Include / Skip**.
   - Wrong opportunity? **Change opportunity** and type its ID; the agent picks a best-guess milestone for you to confirm.
   - Similar HoK already on the milestone? The card says so and won't log a duplicate.
4. Click **Finish review**, then type **post to msx** in chat. The page has no write button by design.
5. The agent re-checks live MSX, shows the final list, and writes only after you say **yes** (MSX also prompts per write).

## Prerequisites

- The **`msx-mcp`** plugin (skills `msx-write`, `core`, `quota`; MSX tools), corporate VPN and MSX sign-in.
- M365 read tools for calendar, transcripts, email and Teams.
- A client with a **browser canvas** (GitHub Copilot app). Without one the skill falls back to chat-only review.

## Layout

```
skills/msx-activity-review/
  SKILL.md                     procedures (start, draft, review, confirm, write, reconcile)
  references/
    RULES.md                   evidence, categories, matching, uniqueness, comments, milestone creation
    DATA_CONTRACTS.md          state folder, review data, decisions, plan, log, ledger, config
    MSX_OPERATIONS.md          read queries and pointers to msx-write recipes
    RECOVERY.md                intent/outcome logging and reconcile procedures
    PAGE_PROTOCOL.md           how the page and the agent talk (render, autosave, read state)
  assets/
    review-template.html       the interactive review page (static, offline)
    sample-review.json         fictional data for testing the page
```

## Design decisions

| Topic | Decision |
|---|---|
| Where it runs | Interactive chat in the GitHub Copilot app; no scheduled writes |
| Evidence | Calendar, transcripts, email, Teams. Highly Confidential content stays in chat only |
| Local state | `%LOCALAPPDATA%\MSXActivityReview\`, non-synced, 90-day retention |
| Matching | Pre-select only at high confidence; otherwise the SE chooses |
| Duplicates | One Task per SE + milestone + category, any status |
| Approval | Per-item review in a simple "your week" card page: each card has an editable **HoK entry** and an optional **milestone update** (post on milestone or opportunity), each with Include / Skip. **Finish review** locks the page; the SE types "post to msx", then confirms the final plan in chat (MSX write prompts stay on). No write button on the page |
| Activity name | One sentence summarizing the work from the evidence; no customer, opportunity or milestone name |
| Wrong match | Each card shows opportunity + milestone name and MSX ID. **Change opportunity** by ID; a highlighted best-guess milestone must be confirmed before anything on the card can be included |
| Duplicates on a re-picked milestone | The agent runs the duplicate check on the new opportunity's milestones; the card blocks an existing own same-category HoK |
| Recovery | Log intent before and outcome after each write; reconcile by reading MSX, never by retrying |
| Comments | Bare new text to `msp_forecastcomments`; CRM adds attribution. Work date goes in the sentence |
| Categories | One shared list, read from `msx-write` `optionsets.md` at run time |
| Milestone creation | A switch asked at the start of every run, default off; opportunities are never created |

## Testing the page

Render the template with the demo data (Node.js), then open `review.html` in a browser:

```powershell
@'
const fs=require("fs"),a="skills/msx-activity-review/assets/";
const j=JSON.stringify(JSON.parse(fs.readFileSync(a+"sample-review.json","utf8"))).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
fs.writeFileSync("review.html",fs.readFileSync(a+"review-template.html","utf8").replace("/*__MSXR_DATA__*/",()=>j));
'@ | node -
```

Verified in the app's browser panel: the local file loads, scripts and `localStorage` work, `evaluate_javascript` can read state; approvals, collisions, resets, milestone proposals, change opportunity (known/unknown ID), best-guess confirmation, duplicate flag on a re-picked milestone, title hints, preview, and Finish review / Make more changes behave as designed.

## Open items

1. **Q6 membership query is unvalidated.** Test on a record with known membership (both cases) and record the working query in `MSX_OPERATIONS.md`.
2. **Duration.** `msx-write` shows a Duration column and example payload; v3 deliberately omitted duration. Decide the team standard.
3. **Task dates.** v3 wrote noon UTC for both start and end; `msx-write` writes `scheduledend` as a date. This skill follows `msx-write`. Confirm correct display in MSX.
4. **M365 tool names** for calendar/mail/Teams/transcripts are client-specific; confirm and name them in `SKILL.md`.
5. **Data classification (OQ-6 in v3).** Confirm that storing short work summaries in a local non-synced folder is acceptable.
6. **Rule ownership.** Distributed as a personal skill from this repo (see Install). Decide who owns changes to the rules.
7. **Unsaved-changes warning** (`beforeunload`) is untested in the app's panel; autosave makes it low risk.
8. **Chat-only fallback** is described but not exercised.
