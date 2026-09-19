# Task 3 report — parent child session context

## Status

Complete. The mini-program session/runtime and core client no longer construct a CHILD actor. Child-scoped calls now run through an authenticated ACCOUNT client with an explicit `childId` resource payload.

## Changed files

- `miniprogram/services/core-api.ts`
- `miniprogram/services/session-runtime.ts`
- `miniprogram/store/session.ts`
- `tests/api/client-boundary.test.ts`
- `tests/api/session.test.ts`
- `tests/miniprogram/editor-selection-snapshot.test.ts`
- `tests/miniprogram/session-runtime.test.ts` (new)

`project.config.json` was already modified in the worktree and was not changed or staged.

## Decisions

- `selectedChildId` is a local, untrusted UX preference. It is reconciled only with child IDs returned by the authenticated account shell; the server remains the authority for every child-scoped action.
- A sole guardian-linked child is selected automatically: this is the only deterministic option and preserves the existing create-family/add-child flow, whose parent home immediately needs a child context. With zero children the state is empty; with multiple children and no valid preference, it remains empty and the parent must choose.
- A refreshed shell clears an invalid stored/in-memory preference. A changed account with exactly one remaining child uses that deterministic single option; otherwise `selectedChild()` raises `请选择孩子`.
- `AccountChildApiClient` always adds a non-empty `childId` payload and uses `{ mode: "ACCOUNT" }`; it does not turn local selection into a request identity or permission claim.

## Tests

- `npm test -- tests/api/session.test.ts tests/api/client-boundary.test.ts tests/miniprogram/session-runtime.test.ts tests/miniprogram/editor-selection-snapshot.test.ts` — passed, 17 tests.
- `npm test` — 468 passed, 4 skipped; one deployment-runtime suite is blocked because `npm run build:deploy` invokes the current failing typecheck.
- `npm run typecheck` — blocked only by the eight Task 4 page migrations listed below.
- `git diff --check` — passed.

## Commit

- `dbd0807 feat: make child selection parent scoped`

## Concerns / Task 4 handoff

The deliberate CHILD client/actor removal leaves these exact UI migration errors for Task 4:

1. `miniprogram/pages/child/group/index.ts(16,17)`: `"CHILD"` is not assignable to `"ACCOUNT" | "CONTENT_PROVIDER" | "PLATFORM"`.
2. `miniprogram/pages/child/orchard/index.ts(5,3)`: no exported member `childClient`.
3. `miniprogram/pages/child/orchard/index.ts(19,72)`: `"CHILD"` is not assignable to `"ACCOUNT" | "CONTENT_PROVIDER" | "PLATFORM"`.
4. `miniprogram/pages/child/profile/index.ts(20,11)`: `"CHILD"` is not assignable to `"ACCOUNT" | "CONTENT_PROVIDER" | "PLATFORM"`.
5. `miniprogram/pages/child/submit/index.ts(2,10)`: no exported member `childClient`.
6. `miniprogram/pages/child/task/index.ts(14,9)`: `{ mode: "CHILD"; childId: string }` is not assignable to `CoreActorSelection`.
7. `miniprogram/pages/child/task/index.ts(38,13)`: `{ mode: "CHILD"; childId: string }` is not assignable to `CoreActorSelection`.
8. `miniprogram/pages/parent/orchard/index.ts(28,11)`: `"CHILD"` is not assignable to `"ACCOUNT" | "CONTENT_PROVIDER" | "PLATFORM"`.
