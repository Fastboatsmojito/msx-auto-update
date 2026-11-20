# Data contracts

All files are UTF-8 JSON (or JSONL) without BOM. Text is NFC-normalized, `\r\n` → `\n`, trimmed.
Dates are stored `YYYY-MM-DD` and displayed `M/d/yyyy`. GUIDs are lowercase hyphenated.

## 1. State folder

Root: `%LOCALAPPDATA%\MSXActivityReview\` (non-synced; MUST NOT be in OneDrive/SharePoint).

```
MSXActivityReview\
  config.json                  per-user settings (§ 7)
  ledger.jsonl                 cross-review memory (rejected / held / created)
  reviews\<reviewId>\
    review.json                draft output (customer content)       deleted at cleanup
    decisions.json             decisions read from the page          deleted at cleanup
    review.html                rendered page                         deleted at cleanup
    checks.fresh.json          pre-check results                     deleted at cleanup
    plan.json                  confirmed plan + confirmation record  deleted at cleanup
    results.jsonl              append-only intent/outcome log        retained
    summary.md                 counts, MSX IDs, failures             retained
```

`reviewId` = `YYYY-MM-DD` of the window end; suffix `-2`, `-3` for more reviews the same day.
Write files atomically (write temp, then rename). Never put Highly Confidential content in any file.

## 2. Review data

```json
{
  "schemaVersion": 1,
  "reviewId": "2026-11-20",
  "createdAt": "2026-11-20T21:00:00Z",
  "window": { "start": "2026-11-13T21:00:00Z", "end": "2026-11-20T21:00:00Z" },
  "options": { "allowMilestoneCreation": false },
  "owner": { "id": "<systemuserid>", "displayName": "...", "email": "..." },
  "accountScope": {
    "source": "My Team Accounts", "savedQueryId": "<view-guid>", "ownerId": "<systemuserid>",
    "resolvedAt": "<ISO instant>", "complete": true, "note": "",
    "restriction": null,
    "accounts": [
      { "accountId": "<account-guid>", "name": "Synthetic account", "tpid": null,
        "aliases": [], "searchStatus": "no-passages-returned", "recovery": "" }
    ]
  },
  "coverage": {
    "selectedSources": ["calendar"], "complete": false,
    "sources": [ { "type": "calendar", "searched": true, "items": 0, "capped": false, "note": "Ranked answer only" } ],
    "searches": [
      { "accountId": "<account-guid>", "type": "calendar", "start": "<window-start>",
        "end": "<window-end>", "terms": ["Synthetic account"], "tool": "<read-tool>",
        "status": "no-passages-returned", "items": 0, "capped": false,
        "exhaustive": false, "note": "Ranked answer only", "gaps": [] }
    ],
    "gaps": []
  },
  "catalog": [
    { "id": "opp-<guid>", "customer": "Contoso", "opportunityId": "<guid>", "opportunityName": "...", "opportunityNumber": "7-3ABC", "milestoneId": null, "milestoneName": null },
    { "id": "ms-<guid>",  "customer": "Contoso", "opportunityId": "<guid>", "opportunityName": "...", "opportunityNumber": "7-3ABC", "milestoneId": "<guid>", "milestoneName": "...", "milestoneNumber": "7-ABC", "milestoneStatus": "On Track" }
  ],
  "checks": [
    { "milestoneId": "<guid>", "complete": true, "checkedAt": "...",
      "records": [ { "taskId": "<guid>", "ownerId": "<guid>", "ownerName": "...", "category": "Demo", "subject": "...", "status": "completed", "date": "2026-10-02" } ] }
  ],
  "candidates": [
    { "id": "c01", "customer": "Contoso", "subject": "...", "description": "...",
      "category": "Architecture Design Session", "completionDate": "2026-11-18",
      "allowedMatchIds": ["opp-...", "ms-..."], "recommendedMatchId": "ms-...", "matchId": "ms-...",
      "confidence": "high", "rationale": "...",
      "evidence": [ { "type": "meeting", "date": "2026-11-18", "ref": "Contoso RAG design (transcript)" } ],
      "taskBlockedReason": "", "commentSummary": "...", "commentBlockedReason": "",
      "proposedMilestone": null,
      "relatedTasks": [], "flags": [], "carriedFrom": null, "keptInChat": false }
  ],
  "exclusions": [ { "summary": "...", "reason": "..." } ]
}
```

- `options.allowMilestoneCreation` records the start-of-run choice. When `false`, `proposedMilestone` MUST be `null`.
- `proposedMilestone` (when allowed): `{ "opportunityId", "name", "category", "date", "workloadId", "workloadName", "parentNeedsStartDate": false }`.
- `checks[].records` = **all** Tasks on that milestone (all owners, statuses, pages); `complete=false` if anything prevented full retrieval.
- `allowedMatchIds` contain that candidate's customer only (except an opportunity the SE added by ID, SKILL § 3.2); each milestone's opportunity-only parent MUST also be allowed.
- `keptInChat` candidates are shown in chat only and omitted from files/page.
- `accountScope.complete` covers **portfolio retrieval only**. Require a fresh
  `resolvedAt`, matching verified owner, selected view and every unique CRM account.
  Deduplicate by `accountId`, merging verified aliases; shared TPIDs retain all
  distinct CRM IDs/names. `aliases` = `[{name, ref}]` with verified provenance only.
- `restriction` is null by default. Only explicit narrower requests set
  `{request, accountIds:[<selected IDs>]}`; keep the full resolved `accounts` array
  and show the excluded accounts as explicitly out of scope. No config roster.
- `coverage.selectedSources` records the exact source choice. `searches` contains
  each account/source/time/term attempt with the exact window partition, read-tool
  name, retrieval status, items, cap, exhaustive flag, note and gaps. Allowed statuses:
  `pending | passages-returned | no-passages-returned | failed`. Unknown/missing
  statuses are gaps. Successful status does not imply eligibility or exhaustive retrieval.
- Account `searchStatus` is a producer summary: `pending | passages-returned |
  no-passages-returned | partial | failed`. Derive it from all selected sources,
  verified terms and the union of successful intervals, not one returned passage.
  The page recomputes coverage for display rather than trusting this summary.
- `coverage.complete=true` requires every selected account/source/verified term over
  the exact full window to be exhaustively retrieved, without caps, errors or gaps.
  Ranked answers MUST set `exhaustive=false`, including empty answers. Missing
  coverage in old reviews is unknown; re-draft rather than treating it as complete.
- Coverage and provenance are local customer data, not reusable package contents.
  Keep restricted metadata in chat only; serialize only a generic redacted gap.

## 3. Decisions

```json
{ "reviewId": "2026-11-20", "ownerId": "<systemuserid>", "savedAt": "...", "finished": true,
  "candidates": [ { "id": "c01", "subject": "...", "description": "...", "category": "...", "completionDate": "...", "matchId": "ms-...",
                    "oppLookup": null, "matchGuess": false,
                    "taskDecision": "approved", "commentSummary": "...", "commentDestination": "milestone",
                    "commentDestinationPref": "milestone", "commentDecision": "approved",
                    "milestoneDecision": "none" } ] }
```

Decisions: `pending | approved | rejected | held`. Destinations: `none | opportunity | milestone`.
`commentDestination` is the effective target (`none` when the update text is empty; `milestone` with no `matchId` means the
proposed new milestone). `commentDestinationPref` is the SE's Post-on toggle (`milestone` default), kept so the page can restore it.
`oppLookup` is an opportunity ID the SE typed that wasn't in this candidate's `allowedMatchIds` (`null` otherwise); while set,
`matchId` is `null` and nothing for the candidate may be written. The agent re-validates it with `^\d-[A-Z0-9]{4,20}$` before any query.
`matchGuess: true` means `matchId` is a milestone pre-selected after an opportunity change that the SE hasn't confirmed yet; the agent
MUST treat such a candidate as not approved (nothing written) even if a decision says `approved`.
`finished` is true after the SE clicks **Finish review**; it is a UI hint only and never authorizes a write (the chat "yes" does).
When the agent re-renders the page with these decisions, it sets `savedAt` to now and `finished: false`.
Every review candidate appears exactly once. **Untrusted input**: validate and ignore unknown IDs/fields.
`ownerId` must equal the freshly verified review owner. Missing or mismatched owner
provenance is not resumed. Autosave keys include owner ID and review ID; never import
legacy owner-less browser state or another owner's decisions.

## 4. Plan (built by the agent, not the page)

```json
{ "planVersion": 1, "reviewId": "...", "owner": { }, "options": { "allowMilestoneCreation": false },
  "memberships": [ { "id": "team:opportunity:<guid>", "entity": "opportunity", "recordId": "...", "requiredBy": ["task:c01"] } ],
  "milestones":  [ { "id": "milestone:new:c04", "candidateId": "c04", "opportunityId": "...", "name": "...", "category": "...", "date": "...", "workloadId": "..." } ],
  "tasks":       [ { "id": "task:c01", "candidateId": "c01", "subject": "...", "description": "...", "category": "...", "date": "...", "milestoneId": "...", "requires": [] } ],
  "comments":    [ { "id": "comment:milestone:<guid>", "targetType": "milestone", "targetId": "...", "entries": [], "text": "...", "requires": [] } ],
  "excluded":    [ { "candidateId": "c02", "kind": "task", "reasons": [ "Already logged: ..." ] } ],
  "undecided":   { "pending": 0, "held": 0, "rejected": 0 } }
```

Ordering: tasks by date then candidate; comment groups opportunity before milestone, then name. Action IDs:
`team:<entity>:<guid>`, `milestone:new:<candidateId>`, `task:<candidateId>`, `comment:<entity>:<guid>`.
A comment on a new milestone uses `comment:milestone:new:<candidateId>` with `requires: ["milestone:new:<candidateId>", …]`;
its `targetId` is filled from the create result.
`plan.json` adds `confirmedAt`, `confirmation` (the user's reply) and `confirmedBy` (verified user ID). It is written
only after confirmation and is immutable; a new confirmation writes a new file.

## 5. Results log and ledger

`results.jsonl`, one object per line:

```json
{"ts":"...","actionId":"task:c01","step":"create","phase":"intent"}
{"ts":"...","actionId":"task:c01","step":"create","phase":"outcome","state":"succeeded","msxId":"<activityid>","detail":"..."}
```

- `step`: membership `lookup|add`; milestone `create`; task `create|complete`; comment `write`.
- `state`: `succeeded | already | failed | unknown | blocked | skipped`. An `intent` with no later `outcome` is **unknown**.
- `detail` ≤ 300 chars, no customer text.

`ledger.jsonl` dispositions: `rejected` (fingerprint `customer|subject|date`), `held` (carries editable state until carried),
`task-created`, `milestone-created`. Pruned after `retentionDays`; `held.carry` after 28 days.
Every new entry includes the verified `ownerId`; read/carry/suppress only entries
matching the current owner. Legacy entries without owner provenance are not reused.
Account scope is never reconstructed from the ledger.

## 6. Cleanup and retention

- Cleanup runs only when the plan was confirmed and no action is `unknown`/`failed` (or the review was explicitly abandoned, with a logged reason).
- Delete: `review.json`, `decisions*.json`, `review.html`, `checks.fresh.json`, `plan*.json`, and **clear the page's browser storage** for the review.
- Keep: `results.jsonl`, `summary.md` for `retentionDays` (default 90), then prune.

## 7. Config (`config.json`)

```json
{ "schemaVersion": 1, "retentionDays": 90, "sources": ["calendar", "transcript", "email", "teams"], "maxCandidates": 200,
  "limits": { "subject": 200, "description": 12000, "comment": 4000 } }
```

No identity, account roster, scope restriction or ID is stored here; identity always
comes from `msx_auth_status`, and the portfolio is resolved fresh before each draft.
`maxCandidates` limits displayed candidates, never the account portfolio/search loop;
any unretrieved evidence or omitted candidates must be disclosed as gaps.
