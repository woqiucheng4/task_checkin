# Task 9 report: editable task drafts from private images

## Delivered

- Added `uploadTaskSource`, which shares the existing byte/MIME validation and creates private `TASK_SOURCE` media with 90-day retention through `CREATE_UPLOAD_INTENT` followed by `UPLOAD_MEDIA_CONTENT`.
- Parent uploads use the selected family scope. Teacher uploads require a selected active group and use only that group's organization scope.
- Both task editors expose photo recognition by default, retain up to three local source asset IDs, prevent overlapping image operations, and display advisory recognition confidence while leaving returned fields editable.
- Recognition calls only `RECOGNIZE_TASK_DRAFT`; it never publishes. A reviewed draft is first saved with `EDIT_TASK_DRAFT` and then sent to `PUBLISH_TASK_DRAFT`. Manual family/group publication continues through its existing command and includes `sourceAssetIds`.
- Recognition and upload failures display the safe server/local message and leave manual entry usable. No public URL, image data URL, MIME metadata, or base64 is rendered or logged by the page code.

## TDD record

- RED: `npm test -- --run tests/miniprogram/task-draft-flow.test.ts tests/miniprogram/upload-evidence.test.ts` failed first because the source uploader was absent and both editor recognition handlers were placeholders.
- GREEN: focused editor, source-upload, and draft tests pass (3 files, 10 tests), including parent editable-draft/no-direct-publish, teacher organization scoping/manual fallback, reviewed edit-then-publish ordering, three-source cap, and malformed/oversized image rejection.

## Verification

- `npm test` — PASS (82 files, 311 tests).
- `npm run typecheck` — PASS.
- `git diff --check` — PASS.

## Scope note

No real mini-program image selection, remote upload, AI-provider call, deployment, or device validation was performed; tests exercise the existing SDK and Core API boundaries only.
