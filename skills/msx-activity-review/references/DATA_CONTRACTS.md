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
  "coverage": { "sources": [ { "type": "calendar", "searched": true, "items": 31, "capped": false, "note": "" } ], "gaps": [] },
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

## 3. Decisions

```json
{ "reviewId": "2026-11-20", "savedAt": "...", "finished": true,
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

## 6. Cleanup and retention

- Cleanup runs only when the plan was confirmed and no action is `unknown`/`failed` (or the review was explicitly abandoned, with a logged reason).
- Delete: `review.json`, `decisions*.json`, `review.html`, `checks.fresh.json`, `plan*.json`, and **clear the page's browser storage** for the review.
- Keep: `results.jsonl`, `summary.md` for `retentionDays` (default 90), then prune.

## 7. Config (`config.json`)

```json
{ "schemaVersion": 1, "retentionDays": 90, "sources": ["calendar", "transcript", "email", "teams"], "maxCandidates": 200,
  "limits": { "subject": 200, "description": 12000, "comment": 4000 } }
```

No identity or ID is stored here; identity always comes from `msx_auth_status`.
