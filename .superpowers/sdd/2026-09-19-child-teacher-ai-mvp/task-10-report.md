# Task 10 Report: MVP navigation and source-specific review rewards

## Delivered

- Removed non-MVP route registrations and internal entry points for wishes, parent orchard, child group/co-growing tree, teacher group tree, and data export. Parent navigation now contains only today, tasks, and profile; retained routes cover the child-parent-teacher collaboration loop and valid invitation/role deep links.
- Removed advanced group-tree actions from the enabled `MvpPolicy` allowlist, so a direct MVP command receives `FEATURE_DISABLED` even without a client route.
- Made group publication explicitly produce `LEARNING_GROUP` tasks. Family review accepts only `FAMILY` tasks; academic review accepts only `LEARNING_GROUP` tasks with the existing group authority checks.
- On an approved group review, writes the affected child’s family-default task reward through the existing idempotent sunlight ledger. A same-request replay and a retried approval with another request ID both return the original review/result without another ledger record. The transaction re-reads the assignment and checks the existing approved record, protecting concurrent approvals.
- Added coverage for MVP route/menu removal, unsupported group-tree action denial, cross-source review rejection, first/retried approval ledger idempotency, and two children receiving separate assignment ledger references.

## Test-first record

The initial focused command failed as expected: old parent navigation still exposed orchard, `app.json` registered hidden pages, family approval accepted a group task, and academic approval left the group reward pending. The repaired focused suite passes.

## Verification

```text
npm test -- --run tests/miniprogram/mvp-navigation.test.ts tests/rewards/reviews.test.ts tests/rewards/idempotency.test.ts tests/application/mvp-policy.test.ts
PASS — 4 files, 20 tests

npm test -- --run
PASS — 83 files, 318 tests

npm run typecheck
PASS

git diff --check
PASS
```

## Scope note

No Mini Program device operation, CloudBase deployment, or external service call was performed. The checks above validate local route registration, client navigation models, and server-side action/review boundaries.
