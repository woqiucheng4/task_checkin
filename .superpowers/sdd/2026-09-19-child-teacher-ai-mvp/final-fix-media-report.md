# Final fix batch A — task source delivery, ownership, publication and retention

## Scope and result

Addressed final review items 2, 3, 4, 6 and 9. No cloud, provider, deployment, invitation/review, AI budget or editor enum changes were made.

- Assignment detail and parent task projections include `sourceAssetIds`. The child task page now reads its single assignment with an explicit CHILD actor and retrieves every image through `READ_MEDIA_ASSET` using the same actor. WXML renders only the authorized temporary download URLs; no public storage URL or raw file-ID fallback was added.
- Published TASK_SOURCE reads require an actual task reference and assignment recipient relationship. The assigned child (with an active guardian session), that child's active guardian and the assignment group's currently authorized teacher can read. Teacher access additionally checks the active group/workspace, adult organization membership, child group membership and child organization membership. A sibling cannot inherit an adult uploader's access through the shared account ID. Unpublished sources are readable only by their adult uploader with current space authority. Withdrawal removes teacher access to the former child's assignment, including the uploader shortcut; the child and guardian retain their own historical access.
- Draft editing and publishing require ACCOUNT mode, the actual draft creator, the matching TASK_SOURCE uploader and matching owner scope. Staff membership or administrator status does not permit changing another creator's draft. The edit state check is inside the edit transaction.
- Draft ownership/state validation, task and assignment insertion, draft linkage, published status and audit all run in one transaction. Nested TaskService calls reuse that transaction and its reads. A published draft returns its existing task even when retried with a different request ID. An injected failure while marking the draft published rolls all task/assignment writes back.
- TASK_SOURCE upload retention is fixed to 90 days. Unpublished active images and abandoned upload intents expire 90 days after upload intent creation. Referenced sources are preserved while any referenced assignment is nonterminal; after all assignments finish, retention is computed from the latest terminal assignment `updatedAt` plus 90 days (COMPLETED, EXCUSED, CANCELLED or EXPIRED). Additional updates to terminal assignments can conservatively extend retention. Storage deletion is claimed atomically using DELETING, then performed outside the transaction; failures remain retryable. Publication revalidates source availability within its transaction, so a cleanup claim cannot leave a newly published task referencing a deleted source.

## Validation

- `npm run typecheck`: passed.
- `npm test -- --run`: 85 files / 335 tests passed.
- `git diff --check`: passed.
- Added real service tests for family/group recipient authorization, child A allowed / child B denied under the same account, parent allowed, other-group teacher denied, authorized same-group teacher allowed, revoked staff denied and withdrawn-child teacher denial.
- Added real projection and child page/WXML checks, concurrent different-request-ID draft publication, stable retries, publication rollback, creator/source-uploader ownership checks, fixed retention input, pending and partial-completion retention, last-completion + 90 days, orphan intent cleanup, storage retry and cleanup/publication interleaving.
- Existing TASK_SOURCE fixtures using 1/10/30 days were updated to the fixed 90-day contract, including three fixture values in `tests/application/ai-gateway.test.ts`; no AI behavior changed.

## Evidence boundary

Validation is local TypeScript, in-memory real-service tests, page handler tests and WXML assertions. No live CloudBase transaction, storage deletion/temporary URL, device rendering or provider call was performed. DELETING is a new internal media status and must remain non-readable/non-publishable in subsequent changes.
