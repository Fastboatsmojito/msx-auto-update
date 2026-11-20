# MSX operations

Tool names: `msx_auth_status`, `dataverse_query`, `dataverse_fetchxml`, `dataverse_write`, `open_msx_record`.
Resolve schema with `msxdata://schema/{entity}` / `dataverse_metadata` when unsure. GUIDs lowercase.
`<owner>` = verified `systemuserid`.

## Reads

**Q1 Identity**: `msx_auth_status`; fallback `WhoAmI` via `dataverse_query`. Must equal the review owner in § 3.3 onward.

**Q2 Catalog**
- Opportunities: `opportunities`, `select=opportunityid,name,msp_opportunitynumber,_parentaccountid_value,statecode` (`msp_opportunitynumber` is the "MSX ID" shown to the SE as the opportunity ID).
- Milestones: `msp_engagementmilestones`, `filter=_msp_opportunityid_value eq <oppId>`,
  `select=msp_engagementmilestoneid,msp_name,msp_milestonenumber,msp_milestonestatus,_msp_opportunityid_value`
  (use `@OData.Community.Display.V1.FormattedValue` for the status label).

**Q2b Opportunity by ID (SE override)**: first re-check the value matches `^\d-[A-Z0-9]{4,20}$` (uppercase it; reject anything else —
never put unvalidated text into a filter). Then `opportunities`, `filter=msp_opportunitynumber eq '<id>'`, same select as Q2. Accept
exactly one active (`statecode eq 0`) result; then load its milestones with the Q2 milestone query. Zero, several, or inactive → report to the SE.
- Also see the `msx-mcp` references (`accounts.md`, `opportunities.md`, `milestones-and-activities.md`) for deal-team scoped recipes.

**Q3 Milestone Tasks (all owners, all statuses, all pages)**: `dataverse_fetchxml` on `task`, paginate, high `max_records`:

```xml
<fetch>
  <entity name="task">
    <attribute name="activityid"/><attribute name="subject"/><attribute name="msp_taskcategory"/>
    <attribute name="ownerid"/><attribute name="statecode"/><attribute name="statuscode"/>
    <attribute name="scheduledend"/><attribute name="actualend"/><attribute name="createdon"/>
    <filter><condition attribute="regardingobjectid" operator="eq" value="{milestoneId}"/></filter>
    <order attribute="createdon" descending="true"/>
  </entity>
</fetch>
```

`complete = true` only if no truncation was reported. Map `statecode` 0→open, 1→completed, 2→cancelled; map category codes to names via `optionsets.md`; unknown codes stay raw and count as distinct.

**Q4 Own recent Tasks (semantic context)**: same fetch filtered by `ownerid eq {owner}` and `createdon` within 180 days; compare subject/description with candidates.

**Q5 Record comments**: `dataverse_query` on `opportunities(<id>)` or `msp_engagementmilestones(<id>)`, `select=msp_forecastcomments,modifiedon`; capture `@odata.etag` if returned. Field is `msp_forecastcomments` for **both**. Store only length/etag in files; full text lives in chat memory only.

**Q6 Team membership**: `dataverse_fetchxml` on `team`:

```xml
<fetch top="1">
  <entity name="team">
    <attribute name="teamid"/>
    <filter>
      <condition attribute="regardingobjectid" operator="eq" value="{recordId}"/>
      <condition attribute="teamtemplateid" operator="eq" value="{templateId}"/>
    </filter>
    <link-entity name="teammembership" from="teamid" to="teamid" intersect="true">
      <filter><condition attribute="systemuserid" operator="eq" value="{owner}"/></filter>
    </link-entity>
  </entity>
</fetch>
```

1 row → `member`; 0 → `missing`; error/denied → `unknown`. **Unvalidated draft query**: validate on a record with known membership (both cases) before relying on it, and record the working form here. Team template IDs come from `msx-write` `constants.md`.

**Q7 Task readback**: `tasks(<activityid>)`, `select=activityid,subject,statecode,statuscode,actualend,scheduledend,msp_taskcategory,_ownerid_value,_regardingobjectid_value`.

**Q8 Workload lookup** (milestone creation): `msp_workloads`, `filter=contains(msp_name,'<name>')`.

## Writes

Only in § 3.5 after confirmation, via `dataverse_write`, following `msx-write`. Do not copy payloads from here; use these pointers.

| Step | `msx-write` recipe |
|------|--------------------|
| Add team member | § 3.8 / § 3.9 (`AddUserToRecordTeam`; never `RemoveUserFromRecordTeam`) |
| Parent start-date PATCH | `MILESTONES.md` Create milestone pre-flight |
| Create milestone | § 3.3 and `MILESTONES.md` |
| Create Task, then complete | § 3.5 and `ACTIVITIES.md` (two writes for past dates) |
| Comment | § 3.1 / § 3.2 (bare new text to `msp_forecastcomments`) |

After each write, read back (Q7 for Tasks, Q5 for comments, an `msp_engagementmilestones` read for milestones, Q6 for memberships).
Comment readback may show a flattened string with generated attribution; that is not a duplicate. If readback cannot confirm, mark `unknown` with "verify in MSX UI" and do **not** post a corrective comment.
