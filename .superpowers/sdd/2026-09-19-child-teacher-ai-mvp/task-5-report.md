# Task 5 report — audited AI task-draft gateway

## TDD record

- Added `tests/application/ai-gateway.test.ts` before implementation.
- Ran `npm test -- --run tests/application/ai-gateway.test.ts tests/media/drafts.test.ts`.
- Initial result: failed as expected because `src/application/ai-gateway.ts` did not exist.

## Implementation

- Replaced storage-key OCR with `TaskDraftProvider.generateTaskDraft({ image, mimeType, requestId })` and mandatory private `MediaStorage.read(fileId)`.
- Added `AiGateway`: adult/scope authorization, `TASK_SOURCE`/active/private-storage validation, default-enabled feature switch, byte-size validation, category normalization, SHA-256-only audit metadata, and atomic invocation-plus-draft persistence.
- Routed `RECOGNIZE_TASK_DRAFT` through the gateway while retaining the edit/publish gates; the gateway creates only `DRAFT` records and never tasks.
- Added immutable `AiInvocation` collection and CloudBase/in-memory wiring. Updated storage/test wiring so recognition requires a server-readable private file ID.

## Verification

- `npm test -- --run tests/application/ai-gateway.test.ts tests/media/drafts.test.ts tests/media/evidence.test.ts` — PASS (11 tests).
- `npm test -- --run` — PASS (78 files, 287 tests).
- `npm run typecheck` — PASS.
- `git diff --check` — PASS.

## Commit

- `feat: add audited AI task draft gateway`.

## Remaining risk

- This task deliberately contains no network provider, secret handling, or remote deployment work. The runtime currently uses an unavailable local provider until Task 6 supplies the DeepSeek adapter; manual task creation and publishing remain independent of that provider.

## Fix round 1 — publisher authorization hardening

- Added red tests for a same-organization different teacher's image and an unbound STAFF member's own image. Before the fix, both incorrectly produced drafts.
- Organization images now require the uploader to match the actor and require either an active organization-admin membership or an active `TEACHER`/`ASSISTANT` group-role binding for an active group in the organization. These checks complete before storage reads or provider calls.
- Family images retain the adult family-role path, with uploader ownership required; child actors remain rejected.
- `npm test -- --run tests/application/ai-gateway.test.ts tests/media/drafts.test.ts tests/media/evidence.test.ts` — PASS (14 tests).
- `npm test -- --run` — PASS (78 files, 289 tests).
- `npm run typecheck` and `git diff --check` — PASS.
- Commit: `fix: enforce AI task draft publisher authorization`.
