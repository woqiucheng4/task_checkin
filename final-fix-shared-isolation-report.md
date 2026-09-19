# Final fix D — shared-account isolation

Scope: the five blockers in final review round 2, on top of `d3e730c`. Existing A/B/C commits are preserved. All verification below is local; no deployment, cloud operation, or external network request was performed.

## Changes

- **D1:** `SUBMIT_TASK`, `SUPPLEMENT_SUBMISSION`, evidence intent/upload/attachment, late challenge, and child tree writes bypass generic account command receipts. Submission authorization, `(childId, assignmentId, requestId)` replay lookup, revision selection, evidence links, and writes execute in one repository transaction. Same-child retry creates one submission; a sibling sharing the account receives `FORBIDDEN`, with no original assignment/text response. Upload intents own resource-scoped replay records. Tree start/rename/harvest use child/resource-authorized service replay; harvest checks ownership before replay.
- **D2:** intent creation and upload confirmation authorize by purpose. Evidence permits the selected child or its active adult guardian, validates assignment/task/family and current group/member consent, and checks intent uploader and scope. Source images require the adult uploader and an active family or organization scope; organization staff require an active teacher/assistant group binding. Confirmation rechecks authorization inside the activation transaction after storage upload, including withdrawal during the upload await.
- **D3:** `AccessPolicy.requireGroupAccess` supplies common authorization for assignment detail, review queue, media reads, and group publishing: active adult organization membership, active organization/group, plus organization-admin authority or a matching teacher/assistant binding. Residual binding, residual staff membership, non-adult membership, and inactive containers are rejected before private content or signed URLs are returned. Active admins, teachers and assistants remain supported.
- **D4:** both source and evidence cleanup inspect every referenced assignment, including evidence intent assignment and legacy evidence links. Any nonterminal assignment retains the asset. Expiry is at least 90 days after the latest terminal assignment update; unassociated assets use upload time (legacy fallback: creation time). Storage deletion still follows a committed `DELETING` claim; failed deletion remains unreadable and retryable.
- **D5:** manual group publishing runs authorization, active recipient membership, organization child member and guardian re-reads, source validation, and task/assignment persistence in one repository transaction. Draft publishing reuses that same transaction. Withdrawal before transaction entry omits the withdrawn child; loss of the guardian relation fails publication atomically; revoked publisher membership prevents publication.

## Red evidence

Before implementation, `npx vitest run tests/api/shared-account-isolation.test.ts` ran 12 valid regression cases: **11 failed, 1 passed**. Failures reproduced sibling submit/supplement receipt disclosure, two concurrent same-request submissions, sibling upload-intent receipt replay, withdrawn/inactive institution content reads, evidence deletion at day 92 while PENDING/SUBMITTED/REVIEWING, and assignment creation after the recipient withdrew just before publication transaction entry. The staff-without-binding read case already passed.

The suite was then expanded to **26 cases**, covering direct Core API responses, no leaked text/assignment/name/signed URL, legal retries, tree and attachment replay, valid role matrix, Promise-controlled withdrawal during upload/draft publication, guardian/member withdrawal, every linked assignment's retention, 89/91-day boundaries, unassociated upload-time retention and failed-delete retry. `REVIEWING` is an intentionally injected legacy/future stored value (not currently in the TypeScript task-state union); cleanup retains every nonterminal state defensively.

Two existing fixtures were adjusted without weakening their intended assertions: the AI staff fixture uploads while authorized and loses authority before invoking AI; the media cleanup acceptance fixture completes its assignment before expecting eventual deletion.

## Verification

- `npm test -- --run`: **91 files, 419 tests passed**.
- `npm run typecheck`: passed.
- Biome lint over all 11 changed TypeScript files: passed, no warnings.
- `git diff --check`: passed.
- Existing source-retention tests still cover multiple pending recipients, last-completion retention, abandoned intents and deletion failure.

No device, live CloudBase, external provider or production runtime verification is claimed.

## D review fix round 1 — physical upload compensation

The reviewer found that bytes could be uploaded before final authorization failed, while the asset remained `PENDING_UPLOAD` without its file ID. The old metadata-only pending-intent cleanup could then claim deletion without deleting those bytes.

The upload state machine is now `PENDING_UPLOAD -> UPLOADING -> QUARANTINED -> ACTIVE`. A transaction claims `UPLOADING` before storage I/O, excluding another physical write or cleanup of the same key. After storage returns its file ID, a separate transaction persists that ID and upload time in unreadable `QUARANTINED` state before final authorization and activation. Activation authorization or transaction failure leaves the file durably tracked and unavailable for user reads, further uploads, or attachments. Transient staging persistence/commit-response errors are retried without re-uploading. An unresolved in-flight upload remains fail-closed and is never marked deleted by the metadata-only branch.

Expired quarantine cleanup checks actual task/draft/submission/evidence references in its claim transaction. The original upload-intent assignment alone is not a committed reference. Unreferenced quarantined objects are reclaimed 90 days after upload, using the persisted file ID: `DELETING -> storage.delete(fileId) -> DELETED`. A failed deletion retains `DELETING` and the file ID for retry. A committed active upload is never demoted by an activation-response error; legitimate references continue to protect its physical object. Truly abandoned intents that never began physical upload retain the existing metadata-only expiration behavior.

The verified storage fake now actually removes its stored bytes. Before this fix, the targeted red run had **3 failures and 1 pass**: revoked upload and failed activation both lacked the returned file ID, and no durable staging retry existed. Six new regression cases verify revoked-confirm `FORBIDDEN` followed by one successful physical deletion and object disappearance, activation-write failure plus failed-delete retry, transient staging failure recovery, lost activation response after a legitimate submission reference commits, single physical upload while in flight, and conservative protection of referenced quarantine records.

Round 1 verification:

- `npm test -- --run`: **92 files, 425 tests passed**.
- `npm run typecheck`: passed.
- Biome lint over the five changed TypeScript files: passed, no warnings.
- `git diff --check`: passed.
- No deployment, cloud operation, external network request, or production runtime validation.
