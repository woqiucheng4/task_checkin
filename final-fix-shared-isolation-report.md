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
