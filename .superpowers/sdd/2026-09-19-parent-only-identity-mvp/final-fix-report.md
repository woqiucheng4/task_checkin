# Parent-only identity MVP: final fix report

Status: completed. All four confirmed final-review findings are addressed in one repair wave.

Base: `0fbab1e` on `codex/child-teacher-ai-mvp`.

Binding documents reviewed:

- `docs/superpowers/specs/2026-09-19-parent-only-identity-mvp-design.md`
- `docs/superpowers/plans/2026-09-19-parent-only-identity-mvp.md`
- The four confirmed whole-branch findings supplied in the final-fix task.

## Findings addressed

### 1. Family review ignored the selected child

`ReviewService.familyReview` now requires `childId`. Inside its existing transaction it calls the shared server `requireChildScope` policy, compares the supplied child with the canonical assignment child, and verifies the guardian's family. These checks occur before `findRepeatedReview` and before any review/reward mutation.

The legacy parent controller now also includes its selected `childId` when invoking family review. The active review-detail page already supplied this field. Academic review, teacher authorization, sunlight deduplication, and service-owned review replay remain intact.

Added API regressions cover all four family decisions with a same-guardian sibling mismatch, no mutation on rejection, successful same-child replay, denial of the same request ID with another child, and denial after the guardian link is withdrawn. Missing, empty, and null child IDs are rejected.

### 2. Withdrawal ignored the selected child

`InvitationService.withdrawChild` now requires `childId`. The active guardian scope check and membership read both occur inside the transaction. Membership child ownership is compared before updating the membership, organization member, or consent record.

The existing authorized-receipt wrapper remains in place: identical valid replay succeeds, changing `childId` with the same request ID conflicts, and failed sibling requests create no withdrawal receipt. Tests verify that sibling mismatches preserve the original membership, organization records, and consent records. Transaction-entry changes to either membership ownership or guardian status cause rejection without a withdrawal.

### 3. Existing parents could not add another child

The existing parent profile / family settings page now has an add-child nickname form. The reachable path is parent home → 我的 / profile → 添加孩子. It calls `ADD_CHILD` for the displayed existing family, refreshes and reconciles the real account shell, and returns to parent home, where both children are selectable. The previous selection is retained until the parent selects the new child.

The page prevents duplicate in-flight submissions. If child creation succeeds but the account-shell refresh fails, it retains the creation result and offers a refresh retry without issuing another `ADD_CHILD`.

The integration test executes the actual home/profile page methods, session runtime, Core API client, and in-memory Core API. It creates the second child, confirms the new guardian link, verifies that account records are unchanged, reloads the home selector, and selects the new child using an ACCOUNT request. A second case covers the failed-refresh retry. Only the cloud transport is replaced with the local API; no child login identity or client authority is introduced.

### 4. Task lists erased status labels

Home and task-center rows now use `buildParentTaskRow`, which changes only the ordinary pending task action label. Existing status and revision actions are retained. The shared mapping explicitly labels completed, expired, cancelled, and excused tasks and prioritizes revision state over protected-reward status.

Page tests cover pending, awaiting confirmation with and without protected sunlight, revision, completed, expired, cancelled, and excused rows on both home and tasks. They verify visible action labels and that every row still routes to the selected child's task details. The existing task-row component already renders clickable status rows.

## Files changed

Production:

- `src/application/review-service.ts`
- `src/application/invitation-service.ts`
- `miniprogram/controllers/parent-controller.ts`
- `miniprogram/presentation/page-models.ts`
- `miniprogram/pages/parent/home/index.ts`
- `miniprogram/pages/parent/tasks/index.ts`
- `miniprogram/pages/parent/profile/index.ts`
- `miniprogram/pages/parent/profile/index.wxml`
- `miniprogram/pages/parent/profile/index.wxss`

New or extended regressions:

- `tests/rewards/reviews.test.ts`
- `tests/identity/withdrawal.test.ts`
- `tests/miniprogram/parent-add-child.test.ts` (new)
- `tests/miniprogram/parent-child-workflows.test.ts`
- `tests/miniprogram/parent-pages.test.ts`

Existing test callers updated with explicit child IDs to match the strengthened service contracts:

- `tests/acceptance/family-orchard.test.ts`
- `tests/acceptance/institution-collaboration.test.ts`
- `tests/api/shared-account-isolation.test.ts`
- `tests/application/atomic-transitions-disclosure.test.ts`
- `tests/application/membership-boundaries.test.ts`
- `tests/application/membership-replay.test.ts`
- `tests/application/workflow-boundaries.test.ts`
- `tests/media/evidence.test.ts`
- `tests/media/task-source-images.test.ts`
- `tests/media/upload-compensation.test.ts`
- `tests/orchard/group-tree.test.ts`
- `tests/presentation/teacher-access.test.ts`
- `tests/rewards/membership-review-boundaries.test.ts`
- `tests/tasks/submission-detail.test.ts`

This report is the only documentation addition. `project.config.json` was already modified on entry and was neither edited nor staged.

## Validation and output

Focused command:

```sh
pnpm exec vitest run tests/rewards/reviews.test.ts tests/identity/withdrawal.test.ts tests/miniprogram/parent-add-child.test.ts tests/miniprogram/parent-child-workflows.test.ts tests/miniprogram/parent-pages.test.ts tests/miniprogram/live-family-pages.test.ts tests/miniprogram/page-models.test.ts tests/application/atomic-transitions-disclosure.test.ts tests/rewards/membership-review-boundaries.test.ts
```

Final focused output:

```text
Test Files  9 passed (9)
     Tests  88 passed (88)
Duration 305ms
```

The initial focused run found two mistakes in new test setup: existing fixture receipts were incorrectly assumed absent, and a generated request ID contained a forbidden underscore. Both test setup issues were corrected; no assertion was weakened around child authorization or state changes.

Full required checks, after formatting:

```text
pnpm test
Test Files  100 passed (100)
     Tests  538 passed (538)
Duration 1.58s

pnpm typecheck
> tsc --noEmit
exit 0

pnpm build
> tsc -p tsconfig.build.json
exit 0

git diff --check
no output; exit 0

git diff --cached --check
no output; exit 0
```

Existing teacher review, membership revocation, atomic review, receipt, media, orchard, and acceptance tests all remain in the passing full suite.

## Commits

- `f2bdd2c990e68d4a3207f6cf632e6de721b4917d` — `fix: enforce selected child boundaries and complete parent workflows` (28 production/test files).
- This report follows in a documentation-only commit titled `docs: record parent identity final repair verification`.

## Residuals and verification boundary

- No known unaddressed finding from the supplied four-item review remains.
- This wave verifies automated page logic, WXML binding/status markup, server behavior against the in-memory repository, type checking, and the repository build. It does not establish fresh WeChat DevTools/simulator rendering, real-device interaction, CloudBase behavior, media upload, or AI-provider acceptance.
- No push, deployment, CloudBase change, production data mutation, environment change, or project-config edit was performed.
- The pre-existing unstaged `project.config.json` change remains for its owner.
