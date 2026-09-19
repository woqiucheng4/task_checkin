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
