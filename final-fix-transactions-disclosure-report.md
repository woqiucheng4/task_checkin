# Final fix E — transactions and disclosure

Scope: final round 3's six blockers and adjacent replay/projection paths. All preceding changes are preserved. No remote actions, provider calls, deployment, device operations or live index migration were performed.

## E1 — current authorization before receipts

`CoreApi` no longer has an unguarded generic write-receipt shortcut. Ordinary writes run the service, its authorization reads, mutation and receipt persistence in one repository transaction. A recorder captures all read and mutated resource rows, including the actor account, selected child's guardian relation, organization/member/role rows, draft/source asset and target resource. Receipts bind the full actor selection and payload; the recorder stores the committed dependency snapshots. A retry must validate every current dependency and expiry in the same transaction before returning the result. Different actor/payload receives `CONFLICT`; changed dependencies receive `FORBIDDEN`, with no cached result or duplicate write.

Unknown/historical receipts without proof are not returned. They enter the current service authorization path; if authorization succeeds but would repeat an old mutation, the operation returns `CONFLICT` before any write. This is an intentional fail-closed migration boundary: historical receipts cannot be trusted as current authorization evidence. The user must inspect current resource state and start a new operation. Receipt collections remain append-only. Same-context retries of new ordinary writes remain idempotent.

The complete action classification has no unguarded fallback:

- All `CORE_READ_ACTIONS` dispatch directly and never create command receipts.
- `BOOTSTRAP_ACCOUNT` only returns the account belonging to the trusted OpenID and now rejects a disabled account before replay.
- Service-owned idempotency: the three teacher activation actions; family/academic review and revision completion; manual family/group publication and draft publication; invitation claim; AI recognition; submit/supplement/late challenge; upload intent/content/confirmation/evidence attachment; expired-media cleanup; child tree start/rename/harvest. These paths authorize in their services before replay, and external provider/storage work stays outside the generic transaction wrapper. Activation replay additionally requires the active adult workspace administrator.
- Guarded transactional receipts: family/child/organization/group creation, group-role binding, invitation/roster creation, join approval/rejection/roster claim/withdrawal, template create/archive, task cancellation/focus/excusal/expiry, draft editing, all wish writes, group tree start/harvest, support grant/revoke, export request/approval, plan definition/assignment, quota consumption, content-provider registration/template publication. Every future write defaults to this path unless explicitly added to the service-owned set with its own authorization and retry contract. Group harvest was also corrected to authorize its current group before returning its service-level memorial replay.

## E2 — publication atomicity

Manual family and group publication use stable hashed `(actor account, action, requestId)` keys. Authorization, active family/child/guardian/group/organization/recipient checks, source validation, task/assignment writes, audit and business receipt share one transaction. Two simultaneous identical requests return one task and its one assignment set. A different request ID explicitly permits another publication. Reusing a request for different content conflicts. Replays validate the original recipients, not only the group's remaining members.

Draft publication retains its existing single transaction and published-draft uniqueness, and validates access to the already-published task's original group and recipients before returning it. Recipient withdrawal or loss of publisher authority cannot use a historical Core receipt to recover that task.

The local CloudBase receipt index definition is now `accountId, action, requestId`. The release runbook requires the environment owner to assess historical data and replace the former `actor_request_unique` index before deployment, scoped only to `task_checkin_*`. This change has **not** been applied remotely.

## E3 / E5 — reviews

Family review now loads its published task/active family, requires the current adult guardian, checks source, reads idempotency records, validates current assignment status and writes review/assignment/sunlight/audit within the same transaction. Concurrent approve versus revision has one winner; the loser receives a state conflict. A stale authorization receipt cannot return the first result after guardian withdrawal.

Academic review additionally requires an ACTIVE CHILD organization member matching the assignment's organization, child and organizationMemberId before both new review and replay. An active residual childGroupMembership cannot substitute for a withdrawn organization child member.

## E4 / E6 — disclosure and teacher visibility

Group workspace member fields, submission list labels, review queue labels and assignment detail labels are gated by the current group membership's disclosure. Hidden names use `未披露昵称`; hidden grades are omitted and no avatar is emitted. Organization-child lookup considers only groups the actor can currently access and gates shared member fields by those groups' disclosure. Joining a second group with disclosure disabled cannot inherit the first group's shared OrganizationMember name or grade. Pending join projections already use the pending request's disclosure and were checked as part of this pass.

Group-role policy now requires ACCOUNT mode, an active organization/group, an active ADULT organization member with the appropriate organization role, and a matching binding. Workspace enumeration filters invalid bindings/containers individually. A withdrawn membership, inactive organization or residual binding cannot supply dashboard groups/tasks; an independent active second organization and group stay visible. Account shell filters inactive organizations, and child mode cannot enumerate teacher workspaces.

## Verification

- TDD red run: six new direct-API/concurrency/presentation cases all failed on the pre-fix code, reproducing all six blockers.
- Expanded new suite: 11 cases covering concurrent/manual retries, separate-request publication, review races, organization-child withdrawal, current/legacy draft edit receipts and one provider call, two groups with different disclosure and a group-2-only teacher across five read APIs, legacy write non-reexecution, and preservation of a second valid organization.
- Existing direct Core API shared-account tests cover submit/supplement sibling replays, upload/attachment boundaries, tree start/rename/harvest retries and sibling rejection; they remain green.
- Full `npm test`: 93 files, 436 tests passed.
- `npm run typecheck`: passed.
- Biome format/lint over changed TypeScript files and `git diff --check`: passed.

These are local repository/fake-storage/fake-provider checks. No real CloudBase transaction, physical device, production provider or deployment verification is claimed. Guarded receipts deliberately reject changed resource snapshots instead of overwriting subsequent changes or replaying stale private results; ordinary UI actions should start a new request after refreshing the affected resource.
