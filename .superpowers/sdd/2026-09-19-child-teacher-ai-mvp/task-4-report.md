# Task 4 report: private task images and submission evidence

## Delivered

- Tasks now persist `sourceAssetIds`; family and group publication validates each attachment is active, private under `task-checkin/`, in the publication scope, and uploaded by the publisher. The server rejects more than three images.
- OCR draft publication retains the draft's verified source image as the published task attachment.
- Submission evidence is capped at three IDs server-side, must request exactly 90-day retention, and can be read only by an account-mode guardian or an authorized active group reviewer.
- The mini-program upload helper accepts only its existing JPEG/PNG/WebP and 1 MB boundary, and now requests 90-day evidence retention.

## Verification

- Red phase: `npm test -- --run tests/media/task-source-images.test.ts tests/tasks/publication.test.ts` failed because task source image IDs were ignored and absent from `Task`.
- Focused green phase: 13 tests passed across source images, evidence, verified upload, publication, and mini-program evidence upload.
- `npm run typecheck` passed.
- Full suite: `npm test` passed, 77 files / 278 tests.
- `git diff --check` passed.

## Concern

- Repository-wide `npm run format:check` still reports pre-existing formatting drift in `src/application/identity-service.ts` and `tests/identity/teacher-workspace.test.ts`; Task 4 files were formatted and were not the cause.

## Review fix round 1

- Submission-evidence assets now retain their immutable upload `assignmentId`. Both submission creation and the public attachment action require an active, private, uploader-owned evidence asset whose assignment and tenant scope match the target assignment.
- The public attachment action queries links inside its transaction, returns an existing link idempotently for the same asset, and rejects a fourth distinct attachment before insert. Submission creation rejects duplicate IDs and persists the same normalized IDs it validates; task source IDs are likewise validated as an array of unique nonempty strings before use.
- Added adversarial tests for malformed and duplicate source IDs, assignment reuse within a group, cross-group reviewer denial, and the public attachment action's three-image limit.
- Verification: focused media/submission/acceptance suites passed (21 tests); full suite passed (77 files / 283 tests); typecheck and `git diff --check` passed.

## Review fix round 2

- Added a runtime boundary check for public `ATTACH_SUBMISSION_EVIDENCE`: `assetId` must be a nonblank string and is trimmed before any repository access. Null, objects, and whitespace-only input now produce `INVALID_INPUT` without writing links.
- Commands run: focused `npm test -- --run tests/acceptance/media-governance.test.ts tests/media/evidence.test.ts`; `npm run typecheck`; `git diff --check`; full `npm test`.
- Results: focused suites passed (7 tests), typecheck and diff check passed, full suite passed (77 files / 283 tests).
- Commit: current HEAD, `fix: validate evidence attachment asset ids`.
- Remaining issue: repository-wide format drift outside Task 4 remains noted above; no production configuration or remote resource was changed.
