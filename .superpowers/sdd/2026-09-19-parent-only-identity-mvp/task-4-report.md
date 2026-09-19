# Task 4 report — parent-operated child workflows

## Status

Complete for local implementation and automated verification. All eight former CHILD actor / missing childClient page type errors have been removed. No child operational route remains registered. Parent home/tasks consume `dashboard().selectionRequired` and render a child picker or a family-creation next action before child-scoped requests.

Manual WeChat DevTools compilation and device acceptance were not performed because this task expressly prohibits interacting with the user UI or CloudBase. The local TypeScript build succeeds; it is not a WeChat WXML/WXSS or device acceptance result.

## Implementation commit

- `ebb4f6f5506e46cfcdf0c01353f27ef423ae4907` — `feat: move child workflows to parent context`

This report is committed separately as documentation only.

## Files

- `miniprogram/app.json`
- `miniprogram/app.ts`
- `miniprogram/pages/child/group/index.ts`
- `miniprogram/pages/child/group/index.wxml`
- `miniprogram/pages/child/orchard/index.ts`
- `miniprogram/pages/child/orchard/index.wxml`
- `miniprogram/pages/child/profile/index.ts`
- `miniprogram/pages/child/profile/index.wxml`
- `miniprogram/pages/child/submit/index.ts`
- `miniprogram/pages/child/submit/index.wxml`
- `miniprogram/pages/child/task/index.ts`
- `miniprogram/pages/child/task/index.wxml`
- `miniprogram/pages/child/today/index.ts`
- `miniprogram/pages/child/today/index.wxml`
- `miniprogram/pages/parent/child-context.ts`
- `miniprogram/pages/parent/groups/index.ts`
- `miniprogram/pages/parent/groups/index.wxml`
- `miniprogram/pages/parent/home/index.ts`
- `miniprogram/pages/parent/home/index.wxml`
- `miniprogram/pages/parent/orchard/index.ts`
- `miniprogram/pages/parent/orchard/index.wxml`
- `miniprogram/pages/parent/review-detail/index.ts`
- `miniprogram/pages/parent/review-detail/index.wxml`
- `miniprogram/pages/parent/reviews/index.ts`
- `miniprogram/pages/parent/reviews/index.wxml`
- `miniprogram/pages/parent/task-detail/index.json`
- `miniprogram/pages/parent/task-detail/index.ts`
- `miniprogram/pages/parent/task-detail/index.wxml`
- `miniprogram/pages/parent/task-detail/index.wxss`
- `miniprogram/pages/parent/task-submit/index.json`
- `miniprogram/pages/parent/task-submit/index.ts`
- `miniprogram/pages/parent/task-submit/index.wxml`
- `miniprogram/pages/parent/task-submit/index.wxss`
- `miniprogram/pages/parent/tasks/index.ts`
- `miniprogram/pages/parent/tasks/index.wxml`
- `miniprogram/pages/parent/tasks/index.wxss`
- `miniprogram/platform.d.ts`
- `tests/miniprogram/child-orchard-loading.test.ts`
- `tests/miniprogram/child-task-source.test.ts`
- `tests/miniprogram/legacy-child-deep-link.test.ts`
- `tests/miniprogram/live-family-pages.test.ts`
- `tests/miniprogram/live-group-pages.test.ts`
- `tests/miniprogram/live-review-page.test.ts`
- `tests/miniprogram/live-task-page.test.ts`
- `tests/miniprogram/manifest.test.ts`
- `tests/miniprogram/mvp-navigation.test.ts`
- `tests/miniprogram/parent-child-workflows.test.ts`
- `tests/miniprogram/parent-group-join.test.ts`

The pre-existing `project.config.json` change remains unstaged and was not edited. Bootstrap, role-switcher, server services, CloudBase configuration, and deployment configuration were not modified.

## Navigation mapping

| Entry | Result |
| --- | --- |
| Parent home / task-center assignment row | `/pages/parent/task-detail/index?id=<assignmentId>&childId=<selectedChildId>`, labeled “为孩子查看任务” |
| Parent task detail submission action | `/pages/parent/task-submit/index?id=<assignmentId>&childId=<selectedChildId>`, labeled “为孩子提交完成情况” |
| Successful parent submission | Redirect to the matching parent task detail with the same assignment/child pair |
| Parent home orchard action | Registered parent orchard, selected child visibly identified, with parent planting/harvesting |
| Parent home group action | Parent groups, selected child visible, explicit child selection before invitation |
| Parent review queue row | Parent review detail with assignmentId and selected childId |
| No children | Family creation / add-child entry at bootstrap |
| Multiple children without a selection | Show account children; no child-scoped request or task/orchard/group entry until selection |
| Old child today/task/submit/orchard/profile/group page code | Redirect-only to parent home with a safe notice; no session/client import or data request |
| Unregistered `pages/child/*` deep link | Scoped `App.onPageNotFound` recovery via parent-home reLaunch; unrelated missing routes are untouched |

The child chooser uses children from the authenticated account shell, so switching remains possible across guardian-linked families rather than becoming limited to the currently selected family.

## Security and implementation decisions

- A page-local helper wraps `AccountChildApiClient` with an immutable childId snapshot. Each operation re-checks that this child remains selected, then sends the explicit childId under `{ mode: "ACCOUNT" }`. A pending request can never be retargeted to a newly selected child.
- Assignment routes carry both assignmentId and childId. Mismatched current/route child selection is rejected before assignment or asset access. Server resource/assignment matching and guardian authorization remain authoritative.
- Detail and review image reads use the authorized asset-read action and the same child snapshot. Only returned signed download URLs are rendered.
- Evidence uploads retain the existing private upload-intent/content pipeline, SUBMISSION_EVIDENCE purpose, 90-day retention, image content/type/size checks, active-upload verification, and server attachment/resource checks. The form caps evidence at three images, allows removal, and preserves valid uploaded evidence on retryable errors.
- Submission mode and revision state come from the server assignment. Revision routing cannot be forced with a query parameter. Upload and submit controls block overlapping operations.
- Selection drift during image picking, uploading, task reading, review, or submission blocks follow-up actions and clears stale task/images/text where applicable. Task/orchard/review lists clear stale data before reloading.
- Parent orchard reads, planting, and harvesting all carry selected childId. Loading/selection failures leave mutation controls disabled, with no invented harvest records. Mature-tree progress displays as complete without relying on the dashboard's growing-tree-only summary.
- Parent groups validates the chosen child against available children, updates the shared selection, pins invitation routes, and submits withdrawals with the selected child context.
- Self-review caught parent review-detail's previous childId-less assignment/image reads, which would fail under the new server policy. With the parent agent's authorization, review queue/detail were migrated to the same account/child context, preserving the teacher path and family-versus-teacher review boundary.
- Existing task-editor AI image recognition, source upload, draft editing/publication, and server matching policy were left intact and remain covered by the passing regression suite.

## Tests and results

Final code verification:

- `npm run typecheck` — PASS; full repository typecheck is green.
- `npm test -- --reporter=dot` — PASS: 99 test files, 502 tests, no failures or skips.
- `npm run build` — PASS: local TypeScript compilation.
- Focused Biome check over all changed page/runtime/type/test files — PASS: 43 supported files checked, no changes needed.
- `git diff --check` and staged diff check — PASS.

New/updated focused coverage includes:

- No-selection/no-children home, tasks, orchard, groups, review queue, assignment detail, submission, and review detail recovery.
- Two-child task switching and explicit assignment/child navigation; cross-family selector availability.
- Signed source-image reads under account child scope.
- Stale route rejection; selection drift while choosing/uploading photos and submitting.
- Three-image private upload cap and pinned submission payload.
- Server-derived revision submission; retryable errors preserve form evidence/text.
- Orchard loading failures disable mutations, and child switching changes read scope.
- Family review navigation, evidence reads and decisions remain pinned to the selected child.
- Every legacy child page is redirect-only; missing-page recovery handles only child paths.
- Manifest registers parent detail/submission/orchard and contains no child page.

## Remaining manual checks / concerns

- WeChat DevTools manual compile, WXML/WXSS layout, simulator/deep-link lifecycle, and real-device photo selection/upload require manual validation. No user UI interaction was attempted.
- Real CloudBase guardian revocation, storage signed URLs, OCR/AI provider, and cross-device behavior are not certified by local tests; no external deployment or configuration change occurred.
- Task 5 still owns removing child entry/role-switcher/navigation affordances. These files were intentionally left untouched; legacy child navigation is safe even before that task lands.
- No remaining Task 4 local code/test blocker was found during self-review.

## Fix round 1/5 — task status and submitted results

### Status / findings addressed

Both Important findings are addressed within the parent task-detail page and its focused regression tests. No bootstrap, role-switcher, server, or configuration files were edited.

1. Task detail preserves the exact server `TaskInstanceState` across all seven values. EXPIRED, CANCELLED and EXCUSED each have distinct terminal labels/descriptions; only SUBMITTED and COMPLETED use the success presentation. Only PENDING and REVISION_REQUIRED allow submission, including the imperative route handler.
2. Every home/task-center assignment row continues to reach its childId-pinned parent task detail, which now displays the latest submission text, submission time/revision, authorized signed evidence images, and teacher academic evaluation state. Group task results no longer depend on the family review queue. The page offers no teacher review mutation. Source images and evidence images use the same account/child authorization helper; all result data is cleared on selection drift or read failure.

### Changed files

- `miniprogram/pages/parent/task-detail/index.ts`
- `miniprogram/pages/parent/task-detail/index.wxml`
- `tests/miniprogram/parent-child-workflows.test.ts`

### Tests and results

- Added 15 focused cases covering all seven task states, both home/task-center entry paths for FAMILY and LEARNING_GROUP submitted results, teacher approved/revision/excused states, and revoked evidence authorization. Submitted-result tests also verify child-scoped signed reads and clearing result text/images/evaluation after switching children.
- Covering tests: `npm test -- tests/miniprogram/parent-child-workflows.test.ts tests/miniprogram/live-task-page.test.ts tests/miniprogram/live-review-page.test.ts` — PASS, 3 files / 41 tests.
- `npm run typecheck` — PASS.
- `npm test -- --reporter=dot` — PASS, 99 files / 517 tests.
- `npm run build` — PASS.
- Focused Biome check and unstaged/staged diff checks — PASS.

### Repair commit

- `8ea881ec4c0733e414dcd9a805d2650299b519c8` — `fix: preserve parent task status and results`

### Remaining boundaries

- The existing detail API returns `academicState`, but does not return free-text teacher review notes. The page displays the returned evaluation state accurately; no server change or invented review note was introduced.
- WeChat manual compilation, real-device layout and CloudBase verification remain unperformed, as required by this task's local-only boundary.
- The pre-existing `project.config.json` edit remains untouched and unstaged.
