# Rules

Normative: **MUST**, **MUST NOT**, **SHOULD**, **MAY**. Codes, payloads and team
templates are **not** repeated here; read them from the `msx-write` references
at run time (`optionsets.md`, `constants.md`, `ACTIVITIES.md`, `MILESTONES.md`).
If anything here disagrees with `msx-write`, **`msx-write` wins**.

## Evidence

- Window default: 7 days, end-exclusive; custom windows honored exactly.
- Sources default: calendar, transcripts, email, Teams. Report the window, sources searched, caps and gaps.
- A candidate MUST have evidence of **your own contribution** and **completed work**. Invitations, accepted/elapsed meetings and scheduled duration alone are not evidence.
- Preparation-only work, scheduling, chatter and future commitments are not candidates.
- Store short references only (type, date, title/subject, max 200 chars). No bodies, transcripts or attachments.
- Highly Confidential content (or uncertain storage permission) stays in chat only.

## Candidates

- One candidate per discrete deliverable, decision or intervention; combine related meetings/emails, even across weeks.
- Subject (the activity name) is **one sentence summarizing the work actually done, as found in the evidence** — no customer,
  opportunity or milestone name (those are shown alongside and can change when the SE re-maps the card). Max 200. Description states contribution, topic and evidenced outcome.
- Facts that cannot be evidenced (date, category, outcome) are flagged `null`, never invented.
- Held candidates carry forward with edits; rejected ones are not re-proposed for the same work.

## Categories

- Read the category list **and each category's hands-on criteria** from `msx-write` `optionsets.md` (Task Activity Categories). Use only categories marked as HoK.
- Classify by the **work done**, not the meeting title. If the work does not meet a category's hands-on criteria, leave the category `null` (Task cannot be approved).
- Briefing is valid but **not HoK**; never offer it for HoK Tasks.
- Business Case work maps to Technical Close/Win Plan unless `msx-write` says otherwise.
- Same list for every user. Do not hardcode codes in this skill's output; resolve them at run time.

## Matching

- Match on substantive content, participants and outcomes, not titles alone.
- Every offered opportunity/milestone MUST be verified in MSX (name, GUID, parent relationship).
- Choices are restricted to the candidate's own customer.
- **SE override by opportunity ID**: the SE may type any opportunity ID on the page. The agent treats it as untrusted, validates the
  format, looks it up (Q2b), and offers it only if it is open and readable. A different customer is allowed but flagged on the card;
  the SE must still confirm the milestone themselves (a highlighted best guess is fine; nothing is written until confirmed).
- Pre-select a match only at **high confidence and unambiguous**. Otherwise leave unselected and show alternatives and rationale.
- Selecting an opportunity MUST NOT silently select a milestone. Opportunity-only matches are allowed (for opportunity comments).
  When the SE **changes** the opportunity, a best-guess open milestone may be pre-selected, but it is highlighted and blocks both
  sections until the SE confirms it or picks another (`matchGuess`).
- Show milestone status when known; status alone does not prove the work belongs there.

## Tasks

- Tasks link to a **milestone**, never directly to an opportunity (an opportunity-bound task is not HoK).
- Owner = the verified SE. Date = the evidenced completion date, written per `msx-write` (`scheduledend`; completion `actualend` equals `scheduledend`).
- Created On is never backdated; create then complete (two writes) for past dates.
- No `statecode`, `statuscode` or `actualend` on create.
- **Uniqueness key = SE user ID + milestone ID + category.** Any own Task with the same key (any status, any date) blocks a new one. Other SEs' Tasks never block but are shown as context.
- Duplicate checks MUST try to retrieve **all** Tasks for the milestone (all pages). An incomplete check is a **warning**, not a block: the SE may include the Task, and the live check in § 3.3 and immediately before create must then **complete**; if it still can't, or finds an own same-category Task, the Task is dropped (shown under "Changed since your review" / blocked), never written on a guess.
- Two approved candidates sharing a key collide; at most one may be approved.
- Re-run the duplicate check against live MSX immediately before each create.
- Never modify, append to or close existing Tasks.

## Comments

- Target field is **Forecast Comments** (`msp_forecastcomments`) for both opportunities and milestones, **not** `msp_milestonecomments`.
- Submit **only new bare text**. CRM adds attribution and keeps history. Do not add initials, a date prefix or prior history; do not rewrite `msp_forecastcommentsjsonfield`.
- Put the work date **in the sentence** when it matters (e.g. "On 11/18, led ...").
- State what was done, the evidenced result and any caveat. Never claim customer acceptance, deployment or next steps that are not evidenced. Work progress only; no private calendar or email details.
- Destination is chosen by the SE per card: **Milestone (default)** or Opportunity. With no milestone it falls back to the opportunity. An update is optional; empty text writes nothing.
- The HoK entry and the milestone update are separate decisions: either can be written without the other.
- Text shown for approval MUST be exactly the text written.
- Approved comments for the same record are **grouped into one write** (joined, newest work first).
- Block comments already present (exact or equivalent) and any write where the record's comments changed between check and write.

## Team membership

- Opportunity comment requires the SE on the opportunity deal team.
- Milestone comment, milestone Task, or Task on a newly created milestone requires the opportunity deal team **and** the milestone team.
- Computed only from approved actions, deduplicated, shown in the plan. At execution: already a member → no change; missing/unknown → one add attempt; failure blocks only dependents.
- Memberships are never removed automatically.

## Milestone creation

Only when the user answered **Yes** to "Allow milestone creation this run?"

- Default is **No**: a candidate with no matching milestone is reported as "Needs milestone" and kept with its customer and date.
- When on, propose a milestone only if a **verified parent opportunity** exists. **Never create opportunities**; if none exists, report it and stop for that item.
- Follow `msx-write` `MILESTONES.md` "Create milestone": required fields, workload lookup (exact `msp_WorkloadlkId` casing), parent `msp_eststartdate` pre-flight (propose the PATCH as a separate confirmed step if null).
- Search first: never create a milestone that already exists for the same opportunity and workload/purpose.
- **Quota/capacity milestones are out of scope here**; route to the `quota` skill (one request ID = one milestone).
- Each proposed milestone is shown in full (name, category, date, workload, parent) and approved like any other item, and appears in its own section of the plan.
- A proposed milestone is created **only if** an approved Task or an approved milestone update uses it.
- Order: memberships → milestones → Tasks → comments. A Task or update that depends on a new milestone is posted on that milestone after it is created, and is blocked (never redirected to the opportunity) if creation fails or is skipped.

## Authorization and execution

- Writes only after the exact plan is confirmed in the current interactive chat.
- The MSX write tool's own confirmations stay on; never bypass them.
- A subset may be approved; stopping at any point leaves the rest pending.
