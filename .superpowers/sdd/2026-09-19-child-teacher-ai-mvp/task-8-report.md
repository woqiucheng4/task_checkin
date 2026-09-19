# Task 8 Report: Require child selection for group joining

## Scope delivered

- The parent groups page now lists the current family's eligible children and requires an explicit choice before it opens an invitation route. The chosen ID is included in the route query and is not written to or read from the global child selection.
- The invitation page revalidates `childId` against `selectedFamily()` before preview or claim. Missing and forged IDs render a clear blocked state; they cannot preview or submit.
- Preview and claim both carry the validated child ID. The server now requires that preview ID to be guardian-linked, and child-mode preview remains forbidden.
- Invitation preview retains the destination group, teacher/workspace display name, expiry, and disclosure consent. A successful claim renders `PENDING_APPROVAL` and explicitly says that membership has not yet been created.
- No deployment or real WeChat operation was performed.

## Test-first evidence

Initial focused run before implementation:

```text
npm test -- --run tests/miniprogram/parent-group-join.test.ts
FAIL: the claim for route child-b used global child-a.
```

Focused verification:

```text
npm test -- --run tests/miniprogram/parent-group-join.test.ts tests/miniprogram/live-group-pages.test.ts tests/identity/invitations.test.ts
PASS (3 files, 17 tests)
```

Final verification:

```text
npm run typecheck
PASS
npm test -- --run
PASS (81 files, 305 tests)
git diff --check
PASS
```

## Commit

`feat: require child selection for group joining` (the atomic commit containing this report)

## Residual risk

- Tests exercise page runtime and command boundaries with mocked WeChat APIs; no actual WeChat client validation was performed.
