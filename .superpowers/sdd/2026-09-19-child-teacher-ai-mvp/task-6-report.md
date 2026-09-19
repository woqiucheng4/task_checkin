# Task 6 report

## TDD record

- RED: `npm test -- --run tests/infrastructure/deepseek-task-draft-provider.test.ts tests/media/cloud-storage.test.ts` failed as expected because `src/infrastructure/deepseek-task-draft-provider.ts` did not exist.
- GREEN: the same targeted command passed after adding the strict provider and private CloudBase byte-read coverage.

## Implementation

- Added `DeepSeekTaskDraftProvider`: it sends only gateway-provided image bytes as a data URL, caps response bytes, requires a single strict JSON object, validates text, enums, canonical UTC timestamps, and confidence, and maps all provider/timeout/parse failures to the manual-entry `CONFLICT` message without logging request or response bodies.
- `DEEPSEEK_BASE_URL` accepts only the canonical HTTPS `api.deepseek.com` origin, eliminating custom-host, credential, port, query, hash, and path routing.
- `CloudMediaStorage.read` now requires `downloadFile`, validates the `cloud://.../task-checkin/...` namespace before downloading, and returns private file bytes without creating a temp URL.
- The cloud function creates the DeepSeek provider only with a nonempty runtime key; otherwise it uses the unavailable provider. `AI_TASK_DRAFT_ENABLED !== "false"` remains the runtime feature switch. Deployment output declares only the variable names.

## Verification

- `npm test -- --run tests/infrastructure/deepseek-task-draft-provider.test.ts tests/media/cloud-storage.test.ts tests/application/ai-gateway.test.ts tests/api/cloudbase-adapter.test.ts` — PASS (19 tests).
- `npm run typecheck` — PASS.
- `npm run build:deploy` — PASS; manifest inspection found `DEEPSEEK_API_KEY` only as a variable name, with no value.
- `npm test -- --run` — PASS (79 files, 294 tests).
- `git diff --check` — PASS.

## Residual risk

- No external DeepSeek request, CloudBase deployment, or runtime cloud-function invocation was performed; production credentials, provider model availability, and cloud runtime `fetch` behavior still need an authorized environment check.

## Commit

- `feat: configure DeepSeek task draft provider`

## Review fix round 1

- RED regression tests showed that a same-path `cloud://other-env.bucket/task-checkin/...` file could be downloaded, invalid optional DeepSeek base configuration threw during setup, and equal start/due timestamps were accepted.
- `CloudMediaStorage` now requires an exact, injected `TASK_CHECKIN_CLOUD_FILE_AUTHORITIES` allowlist. A missing or nonmatching authority fails closed before `downloadFile`, `deleteFile`, or temp-URL access. This environment is intentionally explicit because a CloudBase fileID authority can include both the environment and bucket; only an exact configured authority is accepted.
- DeepSeek optional configuration now falls back to the stable unavailable provider on an absent key or any constructor/base-URL validation failure, so manual task APIs continue to initialize. Response validation requires `startsAt < dueAt`.
- AI audit field counting now includes a recognized `submissionMode`.
- Verification after the correction: focused adapter/storage/gateway/API tests PASS (21 tests); `npm test -- --run` PASS (79 files, 296 tests); `npm run typecheck`, `npm run build:deploy`, and `git diff --check` PASS.
