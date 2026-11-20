# Recovery

MSX writes are not transactional across records. Partial success is possible and is never rolled back automatically.

## Principles

1. Log `intent` **before** each MSX call and `outcome` **after**, with the returned MSX ID.
2. An `intent` with no `outcome` (crash, timeout, closed chat) is **unknown**. Resolve it only by **reading MSX**, never by repeating the write.
3. If Task creation succeeded but completion failed, retry **only the completion**, on the same `activityid`.
4. Never repeat a create or comment write inside reconcile without a **new confirmation** that shows the exact action.
5. Memberships are never removed, including after a downstream failure.

## Reconcile table

| Action / step | Procedure |
|---|---|
| membership `add` unknown/failed | Q6: member → log `succeeded`; missing → offer one new add after explicit confirmation; still unknown → leave and report |
| milestone `create` unknown | Read milestones on the parent opportunity by name/workload and `createdon ≥ intent time − 5 min`: exactly one match → log `succeeded` with its ID; none → `failed` ("verified absent"), re-creation needs a new confirmation; several → leave `unknown`, list for manual decision |
| task `create` unknown | Q3 filtered to owner + category + `createdon ≥ intent time − 5 min`: exactly one match with matching subject → `succeeded` with that ID, then continue to `complete`; none → `failed` ("verified absent"); several → leave `unknown` |
| task `complete` unknown/failed | Q7: completed with correct `actualend` → `succeeded`; still open → after confirmation, retry the completion PATCH on the **same** ID |
| comment `write` unknown | Q5: contains the new text and prior history intact → `succeeded`; clearly absent and history unchanged → `failed` ("verified absent"), re-run only via a new confirmation; anything else → stays `unknown`, ask the user to inspect the MSX UI |

## Derived state per action

Last `outcome` per `actionId`+`step`; an `intent` without a later outcome is `unknown`. Action state is `completed` when all steps are `succeeded`/`already`; otherwise the worst of
`unknown > failed > blocked > skipped > pending`.

## Cleanup gate

Customer-content files are deleted only when no action is `unknown` or `failed`. Otherwise keep them and say "Reconcile my MSX review".
