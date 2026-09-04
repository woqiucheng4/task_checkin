# Growth Orchard Business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify all approved Growth Orchard business logic, CloudBase command boundaries, and UI-independent view models for family, institution, task, review, sunlight, orchard, media-draft, governance, and commercial-entitlement workflows.

**Architecture:** A strict TypeScript domain package owns all state transitions and policies. Application services invoke repository and transaction ports; CloudBase adapters persist those records and the native mini-program reads typed view models without embedding business rules in pages. Tests run against a real in-memory transactional repository, while contract tests pressure-test the CloudBase adapter and command router boundary.

**Tech Stack:** TypeScript, Node.js, Vitest, native WeChat Mini Program contracts, CloudBase Node SDK adapter, npm.

**Spec:** `docs/superpowers/specs/2026-09-05-growth-orchard-platform-design.md`

## Global Constraints

- Family and school/tutoring organizations are parallel top-level tenant spaces; groups belong to exactly one organization.
- One internal `childId` connects authorized relationships and personal assets, but organizations only receive an organization-scoped `organizationMemberId`.
- Clients access business data only through cloud commands; management-only CloudBase collections are never mutated directly by pages.
- Every command carries a non-empty `requestId`; writes are idempotent and audit their actor and scope.
- Calendar rules use `Asia/Shanghai`; persisted timestamps are UTC ISO strings.
- Submitted work keeps its reward eligibility while waiting for adult review.
- Granted sunlight is append-only, never negative, never clawed back, and never exchanged for cash.
- Task instance, academic review, and family reward are separate state fields.
- Family task activity never contributes to an institution group tree.
- UI presentation reads view models and design tokens; no permission, reward, or orchard rule lives in page components.
- No child leaderboard, chat, like, public activity feed, sunlight purchase, advertising reward, punitive sunlight deduction, tree decay, or unauthorized institution binding.
- OCR remains a provider port: recognition creates an editable draft and never publishes a task automatically.
- Platform support cannot read child content without a valid, scoped, time-limited support access grant.

---

## File Structure

```text
package.json                                      # scripts and dependency versions
package-lock.json                                 # reproducible dependency graph
tsconfig.json                                     # strict shared compiler configuration
vitest.config.ts                                  # test discovery and coverage gates
biome.json                                        # formatting and static-analysis rules
project.config.json                               # native mini-program project metadata
src/
  shared/
    ids.ts                                        # injected id generation
    time.ts                                       # UTC and Asia/Shanghai calendar helpers
    errors.ts                                     # stable domain error codes
    result.ts                                     # command result envelope
  domain/
    model.ts                                      # shared records and enums
    policy.ts                                     # role, tenant, and child authorization policies
    tasks.ts                                      # schedule, assignment, and state rules
    rewards.ts                                    # reward selection and append-only ledger rules
    orchard.ts                                    # individual tree growth and harvest rules
    wishes.ts                                     # family-private wishes and fruit linking
    group-orchard.ts                              # group contribution and maturity rules
    media.ts                                      # media visibility, retention, and draft rules
    entitlements.ts                               # plans, quotas, and feature gates
  application/
    ports.ts                                      # repository, transaction, OCR, clock, and id ports
    identity-service.ts                           # accounts, families, children, guardians, organizations
    invitation-service.ts                         # invitations, consent, membership, and withdrawal
    task-service.ts                               # templates, publication, assignment, today projection
    submission-service.ts                         # submit, supplement, excuse, and revision workflows
    review-service.ts                             # academic/family review orchestration
    sunlight-service.ts                           # idempotent ledger and orchard projection
    orchard-service.ts                            # select, name, and harvest trees
    wish-service.ts                               # family wish lifecycle and fruit redemption
    group-orchard-service.ts                      # contribution and group memorial workflows
    media-service.ts                              # upload metadata, OCR drafts, evidence, deletion
    governance-service.ts                         # audit, support access, and export approval
    commercial-service.ts                         # plans, entitlements, usage, content providers
    core-api.ts                                   # authenticated action router and validation
    view-models.ts                                # child, parent, teacher, and institution projections
  infrastructure/
    in-memory-repository.ts                       # transactional executable test repository
    cloudbase-repository.ts                       # CloudBase collection adapter
    collections.ts                                # fixed collection and index manifest
cloudfunctions/coreApi/
  index.ts                                        # wx-server-sdk entry point and OPENID context
  package.json                                    # deployable cloud-function dependencies
miniprogram/
  app.ts                                          # CloudBase initialization only
  app.json                                        # minimal route registration
  config/env.ts                                   # one CloudBase environment identifier
  services/core-api.ts                            # typed wx.cloud.callFunction client
  store/session.ts                                # selected workspace, role mode, and child
  view-models/types.ts                            # re-exported client-safe projections
  theme/tokens.ts                                 # replaceable design-token contract
tests/
  helpers/harness.ts                              # real in-memory application fixture
  shared/*.test.ts
  identity/*.test.ts
  tasks/*.test.ts
  rewards/*.test.ts
  orchard/*.test.ts
  wishes/*.test.ts
  media/*.test.ts
  governance/*.test.ts
  api/*.test.ts
  acceptance/*.test.ts
docs/
  architecture/collection-indexes.md              # CloudBase collections, indexes, and permissions
  privacy/child-data-boundary.md                   # data inventory, retention, deletion, export
  runbooks/cloudbase-release.md                    # deployment and rollback verification
  verification/2026-09-06-business-cases.md        # executed case report with evidence
```

## Task 1: Bootstrap the strict TypeScript and test workspace

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `biome.json`, `project.config.json`
- Create: `src/shared/errors.ts`, `src/shared/result.ts`, `src/shared/ids.ts`, `src/shared/time.ts`
- Test: `tests/shared/time.test.ts`, `tests/shared/result.test.ts`

**Interfaces:**
- Produces: `DomainError`, `CommandResult<T>`, `Clock`, `IdGenerator`, `shanghaiDateAt(instant)` and `isLateSameDayPublication(startAt, publishedAt)`.

- [ ] **Step 1: Write failing shared-contract tests**

```ts
it('maps 2026-09-05T16:30Z to the next Shanghai calendar day', () => {
  expect(shanghaiDateAt('2026-09-05T16:30:00.000Z')).toBe('2026-09-06');
});

it('returns stable error codes without exposing internal stack text', () => {
  expect(commandFailure(new DomainError('FORBIDDEN', 'scope denied'))).toEqual({
    ok: false,
    error: { code: 'FORBIDDEN', message: 'scope denied' },
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/shared/time.test.ts tests/shared/result.test.ts`

Expected: FAIL because the shared modules do not exist.

- [ ] **Step 3: Add the minimal strict workspace and shared primitives**

Use ESM, `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. Configure Biome as the single formatter/linter and include `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, and `build` scripts. Implement clock and ID generation as injected ports so tests never rely on wall-clock time or random values.

- [ ] **Step 4: Run compiler and tests and verify GREEN**

Run: `npm run typecheck && npm test -- tests/shared`

Expected: all shared tests pass with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts biome.json project.config.json src/shared tests/shared
git commit -m "chore: bootstrap growth orchard business workspace"
```

## Task 2: Define records and a transactional repository port

**Files:**
- Create: `src/domain/model.ts`, `src/application/ports.ts`
- Create: `src/infrastructure/in-memory-repository.ts`, `src/infrastructure/collections.ts`
- Create: `tests/helpers/harness.ts`
- Test: `tests/shared/repository.test.ts`

**Interfaces:**
- Produces: `Repository.read`, `Repository.query`, `Repository.transaction`, `Transaction.insert`, `Transaction.update`, `Transaction.get`, and `Transaction.appendAudit`.
- Produces immutable record types for every collection named in section 12.3 of the specification.

- [ ] **Step 1: Write failing transaction tests**

```ts
it('rolls back every write when a transaction fails', async () => {
  const repo = new InMemoryRepository();
  await expect(repo.transaction(async tx => {
    await tx.insert('families', familyFixture);
    throw new DomainError('CONFLICT', 'forced');
  })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await repo.read('families', familyFixture.id)).toBeUndefined();
});

it('rejects insertion of a duplicate immutable ledger id', async () => {
  const repo = new InMemoryRepository({ sunlightLedgers: [ledgerFixture] });
  await expect(repo.transaction(tx => tx.insert('sunlightLedgers', ledgerFixture)))
    .rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/shared/repository.test.ts`

Expected: FAIL because repository types and implementation are missing.

- [ ] **Step 3: Implement records and the in-memory transaction boundary**

All records include `id`, `createdAt`, and `updatedAt` when mutable. Add `wishes`, `fruit_wish_links`, `join_requests`, `roster_seats`, `group_memorials`, and `export_requests` for workflows stated in the specification but not expanded in its summary collection table. Ledger, audit, contribution, consent, and fruit-wish link records are append-only. Transactions clone state, commit atomically, and discard the clone on error.

- [ ] **Step 4: Publish the exact collection manifest**

`COLLECTIONS` must enumerate all specification collections, and `CLOUDBASE_INDEXES` must include tenant/scope lookup, assignment/today lookup, request idempotency, ledger reference uniqueness, invitation-code uniqueness, and active membership indexes.

- [ ] **Step 5: Run compiler and repository tests**

Run: `npm run typecheck && npm test -- tests/shared/repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/model.ts src/application/ports.ts src/infrastructure tests/helpers tests/shared/repository.test.ts
git commit -m "feat: add transactional domain repository"
```

## Task 3: Implement identity, top-level spaces, and scoped permissions

**Files:**
- Create: `src/domain/policy.ts`, `src/application/identity-service.ts`
- Test: `tests/identity/identity.test.ts`, `tests/identity/permissions.test.ts`

**Interfaces:**
- Consumes: repository, `Clock`, and `IdGenerator`.
- Produces: `IdentityService.createAccount`, `createFamily`, `addChild`, `linkGuardian`, `createOrganization`, `createGroup`, and `bindGroupRole`.
- Produces: `AccessPolicy.requireGuardian`, `requireOrganizationRole`, `requireGroupRole`, and `canReadChildScope`.

- [ ] **Step 1: Write failing identity and isolation tests**

```ts
it('allows one account to be both guardian and teacher without mixing scopes', async () => {
  const { identity, repo } = harness();
  const account = await identity.createAccount(actor('wx-1'), request('account-1'));
  const family = await identity.createFamily(accountActor(account.id), request('family-1', { name: '晨光家' }));
  const org = await identity.createOrganization(platformActor(), request('org-1', { name: '青禾学校', type: 'SCHOOL' }));
  expect(await repo.query('familyMembers', { accountId: account.id, familyId: family.id })).toHaveLength(1);
  expect(await repo.query('organizationMembers', { accountId: account.id, organizationId: org.id })).toHaveLength(0);
});

it('never returns the global child id to an organization projection', async () => {
  const projection = await teacherChildProjection(seed.teacher, seed.organizationMemberId);
  expect(projection).toEqual(expect.objectContaining({ organizationMemberId: seed.organizationMemberId }));
  expect(projection).not.toHaveProperty('childId');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/identity/identity.test.ts tests/identity/permissions.test.ts`

Expected: FAIL because identity and policy services are absent.

- [ ] **Step 3: Implement identity creation and role binding**

Use account roles only as relationships, never as a single global role flag. Family creation adds the actor as `FAMILY_ADMIN`; organization creation is platform-authorized; each group stores exactly one `organizationId`.

- [ ] **Step 4: Implement server-side scope policy**

Every child read resolves through an active guardian link or organization membership plus active child-group membership. Organization callers can resolve a child only through `organizationMemberId`; policy rejects caller-supplied global child identifiers.

- [ ] **Step 5: Run identity, permission, and full regression tests**

Run: `npm run typecheck && npm test -- tests/identity tests/shared`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/policy.ts src/application/identity-service.ts tests/identity
git commit -m "feat: add tenant identity and permission boundaries"
```

## Task 4: Implement invitations, consent, membership approval, and withdrawal

**Files:**
- Create: `src/application/invitation-service.ts`
- Test: `tests/identity/invitations.test.ts`, `tests/identity/withdrawal.test.ts`

**Interfaces:**
- Produces: `InvitationService.createGroupInvitation`, `claimInvitation`, `approveJoinRequest`, `rejectJoinRequest`, `withdrawChild`, and `claimRosterSeat`.

- [ ] **Step 1: Write failing invitation and consent tests**

```ts
it('requires guardian consent before creating a child group membership', async () => {
  const join = await invitations.claimInvitation(guardian, request('join-1', {
    code: seed.invitation.code,
    childId: seed.child.id,
    disclosure: { displayName: true, grade: true, avatar: false },
  }));
  expect(join.status).toBe('PENDING_APPROVAL');
  expect(await repo.query('childGroupMemberships', { childId: seed.child.id })).toHaveLength(0);
  expect(await repo.query('consentRecords', { childId: seed.child.id })).toHaveLength(1);
});

it('rejects an expired or previously consumed invitation', async () => {
  await expect(invitations.claimInvitation(guardian, expiredClaim)).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/identity/invitations.test.ts tests/identity/withdrawal.test.ts`

Expected: FAIL because the invitation service is missing.

- [ ] **Step 3: Implement secure invitation and approval transitions**

Invitation codes are hashed at rest, single-purpose, scoped, expiring, and capacity-limited. Claiming appends a consent record and pending join request; only a teacher/assistant with group permission can approve it and allocate a random organization-scoped member id.

- [ ] **Step 4: Implement withdrawal and roster-seat claiming**

Withdrawal deactivates the membership and future task delivery, appends consent revocation, and anonymizes institution-facing historical identity according to retention policy. It never alters personal sunlight, trees, or fruit.

- [ ] **Step 5: Run all identity tests**

Run: `npm run typecheck && npm test -- tests/identity`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/invitation-service.ts tests/identity
git commit -m "feat: add consented group membership lifecycle"
```

## Task 5: Implement task templates, publication, assignment, and recurrence

**Files:**
- Create: `src/domain/tasks.ts`, `src/application/task-service.ts`
- Test: `tests/tasks/schedule.test.ts`, `tests/tasks/publication.test.ts`, `tests/tasks/isolation.test.ts`

**Interfaces:**
- Produces: `isScheduledOn`, `materializeOccurrence`, `TaskService.createTemplate`, `publishFamilyTask`, `publishGroupTask`, `cancelTask`, and `archiveTemplate`.

- [ ] **Step 1: Write failing schedule and fan-out tests**

```ts
it.each([
  ['DAILY', '2026-09-07', true],
  ['WEEKLY_MON_WED', '2026-09-07', true],
  ['WEEKLY_MON_WED', '2026-09-08', false],
  ['ONCE_0909', '2026-09-09', true],
])('evaluates %s in Asia/Shanghai', (fixture, date, expected) => {
  expect(isScheduledOn(scheduleFixtures[fixture], date)).toBe(expected);
});

it('publishes one independent assignment per active group child', async () => {
  const task = await tasks.publishGroupTask(teacher, groupTaskRequest);
  const assignments = await repo.query('taskAssignments', { taskId: task.id });
  expect(assignments.map(item => item.organizationMemberId).sort()).toEqual(['member-a', 'member-b']);
  expect(new Set(assignments.map(item => item.id)).size).toBe(2);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/tasks/schedule.test.ts tests/tasks/publication.test.ts`

Expected: FAIL because task rules and service are absent.

- [ ] **Step 3: Implement templates and immutable publications**

Validate source space, publisher, subject/life category, start/deadline/reminder, recurrence, importance, estimated minutes, submission mode, late policy, academic review flag, and reward-rule reference. Published content is immutable; cancellation and archival are state changes.

- [ ] **Step 4: Implement assignment fan-out and recurrence materialization**

Family publication resolves selected guardian-linked children. Group publication resolves active group memberships. Each assignment has independent task, academic, and reward states plus a unique `(taskId, recipient, occurrenceDate)` key.

- [ ] **Step 5: Test tenant and child isolation**

Verify one child changing state never changes a sibling; a teacher cannot publish into another organization; and family publication does not create organization identifiers or group contributions.

- [ ] **Step 6: Run compiler and task regressions**

Run: `npm run typecheck && npm test -- tests/tasks tests/identity`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/tasks.ts src/application/task-service.ts tests/tasks
git commit -m "feat: add task publication and assignment model"
```

## Task 6: Implement today projection and submission lifecycle

**Files:**
- Create: `src/application/submission-service.ts`, `src/application/view-models.ts`
- Test: `tests/tasks/today.test.ts`, `tests/tasks/submissions.test.ts`

**Interfaces:**
- Produces: `SubmissionService.submit`, `supplement`, `markExcused`, `expireUnsubmitted`.
- Produces: `buildChildTodayView`, `buildParentTaskCenterView`, and `buildTeacherReviewQueueView`.

- [ ] **Step 1: Write failing today projection tests**

```ts
it('automatically includes due institution tasks without a guardian action', async () => {
  const view = await buildChildTodayView(childActor, '2026-09-06');
  expect(view.mustDo.map(item => item.assignmentId)).toContain(seed.institutionAssignment.id);
});

it('does not count a mandatory task published after 18:00 toward same-day completion', async () => {
  const view = await buildChildTodayView(childActor, '2026-09-06');
  expect(view.allDoneRequiredAssignmentIds).not.toContain(seed.lateAssignment.id);
  expect(view.lateNoticeAssignmentIds).toContain(seed.lateAssignment.id);
});
```

- [ ] **Step 2: Run today tests and verify RED**

Run: `npm test -- tests/tasks/today.test.ts`

Expected: FAIL because projections are missing.

- [ ] **Step 3: Implement today classification**

Return `mustDo`, `familyFocus`, `upcoming`, and `challenges`. Exclude excused/cancelled assignments from all-done. Treat submitted assignments as fulfilled while review remains pending. Support guardian promotion of one to three focus items and explicit acceptance of a late task as a challenge.

- [ ] **Step 4: Write failing submission-state tests**

```ts
it('protects reward eligibility immediately after a valid submission', async () => {
  const result = await submissions.submit(childActor, request('submit-1', { assignmentId: seed.assignment.id, text: '完成' }));
  expect(result).toMatchObject({ taskState: 'SUBMITTED', rewardState: 'PROTECTED' });
});

it('does not duplicate a submission when the same request is retried', async () => {
  await submissions.submit(childActor, submissionRequest);
  await submissions.submit(childActor, submissionRequest);
  expect(await repo.query('submissions', { assignmentId: seed.assignment.id })).toHaveLength(1);
});
```

- [ ] **Step 5: Run submission tests and verify RED**

Run: `npm test -- tests/tasks/submissions.test.ts`

Expected: FAIL because submission commands are missing.

- [ ] **Step 6: Implement submit, supplement, excuse, and expiry transitions**

Validate required evidence mode. `PENDING -> SUBMITTED`, `REVISION_REQUIRED -> SUBMITTED`, `PENDING -> EXCUSED`, and unsubmitted due items to `EXPIRED` are legal. Expiry creates one public-pool animation event and never creates a negative ledger.

- [ ] **Step 7: Run all task tests**

Run: `npm run typecheck && npm test -- tests/tasks`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/application/submission-service.ts src/application/view-models.ts tests/tasks
git commit -m "feat: add today and submission workflows"
```

## Task 7: Implement dual review and the immutable sunlight ledger

**Files:**
- Create: `src/domain/rewards.ts`, `src/application/review-service.ts`, `src/application/sunlight-service.ts`
- Test: `tests/rewards/reviews.test.ts`, `tests/rewards/sunlight.test.ts`, `tests/rewards/idempotency.test.ts`

**Interfaces:**
- Produces: `ReviewService.familyReview`, `academicReview`, and `completeRevision`.
- Produces: `SunlightService.grantForAssignment`, `ledgerForChild`, and `balanceForChild`.

- [ ] **Step 1: Write failing family and academic review tests**

```ts
it('family approval completes a family assignment and grants configured sunlight', async () => {
  const result = await reviews.familyReview(guardian, request('review-1', {
    assignmentId: familyAssignment.id,
    decision: 'APPROVE',
  }));
  expect(result.assignment).toMatchObject({ taskState: 'COMPLETED', rewardState: 'GRANTED' });
  expect(await sunlight.balanceForChild(familyAssignment.childId)).toBe(2);
});

it('academic revision never claws back sunlight already granted by a guardian', async () => {
  await reviews.familyReview(guardian, guardianApproval);
  await reviews.academicReview(teacher, request('academic-1', { assignmentId: institutionAssignment.id, decision: 'REVISION_REQUIRED' }));
  expect(await sunlight.balanceForChild(institutionAssignment.childId)).toBe(2);
});
```

- [ ] **Step 2: Run review tests and verify RED**

Run: `npm test -- tests/rewards/reviews.test.ts`

Expected: FAIL because review services are missing.

- [ ] **Step 3: Implement separate state transitions**

Family review can approve, request supplement, or excuse. Academic review can approve, require revision, or excuse. Teacher approval auto-grants only when the family setting enables it; otherwise reward becomes `PENDING_CONFIRMATION`. Neither path mutates the other actor's review record.

- [ ] **Step 4: Write failing ledger idempotency tests**

```ts
it('creates one positive ledger entry for repeated approval commands', async () => {
  await reviews.familyReview(guardian, approvalRequest);
  await reviews.familyReview(guardian, approvalRequest);
  expect(await repo.query('sunlightLedgers', { referenceId: assignment.id, reason: 'TASK_COMPLETED' })).toHaveLength(1);
});

it('rejects every negative sunlight amount', async () => {
  await expect(sunlight.grantForAssignment(systemActor, { ...grant, amount: -1 }))
    .rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
```

- [ ] **Step 5: Run ledger tests and verify RED**

Run: `npm test -- tests/rewards/sunlight.test.ts tests/rewards/idempotency.test.ts`

Expected: FAIL because the ledger service is missing.

- [ ] **Step 6: Implement append-only grants and request replay**

One transaction updates reward state, inserts a unique positive ledger entry, updates the orchard projection, and writes an audit record. A repeated `requestId` returns the prior command result; a different request for the same reward reference returns the existing grant without duplication.

- [ ] **Step 7: Run reward and task regressions**

Run: `npm run typecheck && npm test -- tests/rewards tests/tasks`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/rewards.ts src/application/review-service.ts src/application/sunlight-service.ts tests/rewards
git commit -m "feat: add dual review and sunlight ledger"
```

## Task 8: Implement individual orchard growth, carry-over, harvest, and collection

**Files:**
- Create: `src/domain/orchard.ts`, `src/application/orchard-service.ts`
- Test: `tests/orchard/growth.test.ts`, `tests/orchard/harvest.test.ts`

**Interfaces:**
- Produces: `growthStageFor`, `applySunlight`, `OrchardService.startTree`, `renameTree`, `harvestTree`, and `orchardForChild`.

- [ ] **Step 1: Write failing growth tests**

```ts
it('matures the starter apple at six sunlight and carries excess forward', () => {
  expect(applySunlight(starterTreeAt(5), 3)).toEqual(expect.objectContaining({
    progress: 6,
    status: 'MATURE',
    carryOver: 2,
  }));
});

it('maps every effective grant to a perceptible stage or progress change', () => {
  const next = applySunlight(ordinaryTreeAt(8), 2);
  expect(next.progress).toBeGreaterThan(8);
  expect(next.visualEvent.kind).toBe('TREE_PROGRESS');
});
```

- [ ] **Step 2: Run growth tests and verify RED**

Run: `npm test -- tests/orchard/growth.test.ts`

Expected: FAIL because orchard rules are missing.

- [ ] **Step 3: Implement configurable catalog and projection**

Seed catalog records for starter apple threshold 6, ordinary tree threshold 24, and rare tree threshold 60. Stages are derived from configured stage boundaries, not hard-coded page logic. Sunlight ledger remains the source of truth; tree progress is a rebuildable projection.

- [ ] **Step 4: Write failing harvest and preservation tests**

```ts
it('harvests one mature tree into permanent tree and fruit collections', async () => {
  const result = await orchard.harvestTree(childActor, request('harvest-1', { treeId: matureTree.id, name: '小勇气' }));
  expect(result.tree.status).toBe('HARVESTED');
  expect(result.fruit.quantity).toBe(1);
});

it('preserves trees and fruit after institution withdrawal', async () => {
  await invitations.withdrawChild(guardian, withdrawalRequest);
  expect(await orchard.orchardForChild(childActor)).toMatchObject({ lifetimeSunlight: 6, harvestedTrees: expect.any(Array) });
});
```

- [ ] **Step 5: Run harvest tests and verify RED**

Run: `npm test -- tests/orchard/harvest.test.ts`

Expected: FAIL because orchard service is missing.

- [ ] **Step 6: Implement selection, carry-over application, naming, and idempotent harvest**

Starting the next tree consumes no ledger value; it applies stored carry-over to the new tree projection. Harvest creates exactly one fruit collection record and one growth card. Historical trees never decay or lose progress.

- [ ] **Step 7: Run orchard and reward regressions**

Run: `npm run typecheck && npm test -- tests/orchard tests/rewards`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/orchard.ts src/application/orchard-service.ts tests/orchard
git commit -m "feat: add persistent personal orchard"
```

## Task 9: Implement family-private wishes and fruit linking

**Files:**
- Create: `src/domain/wishes.ts`, `src/application/wish-service.ts`
- Test: `tests/wishes/wishes.test.ts`, `tests/wishes/privacy.test.ts`

**Interfaces:**
- Produces: `WishService.createWish`, `updateWish`, `archiveWish`, `linkFruit`, `unlinkFruit`, `fulfillWish`, and `familyWishView`.

- [ ] **Step 1: Write failing wish lifecycle and privacy tests**

```ts
it('lets a guardian link harvested fruit and fulfill a family wish', async () => {
  const wish = await wishes.createWish(guardian, request('wish-1', { childId: child.id, title: '周末去动物园' }));
  await wishes.linkFruit(guardian, request('wish-link-1', { wishId: wish.id, fruitCollectionId: fruit.id, quantity: 1 }));
  const fulfilled = await wishes.fulfillWish(guardian, request('wish-fulfill-1', { wishId: wish.id }));
  expect(fulfilled.status).toBe('FULFILLED');
});

it('never exposes family wishes in teacher or organization projections', async () => {
  const teacherView = await buildTeacherReviewQueueView(teacher, group.id);
  expect(JSON.stringify(teacherView)).not.toMatch(/wish|愿望|fruitLink/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/wishes/wishes.test.ts tests/wishes/privacy.test.ts`

Expected: FAIL because wish modules are missing.

- [ ] **Step 3: Implement family-scoped wishes and fruit reservations**

Only active guardians and the linked child can read a wish; only guardians can create, edit, archive, link fruit, or fulfill it. Linking reserves harvested fruit quantity without deleting the permanent collection record. Fulfillment is an audited family event and does not create cash value or expose the wish outside the family.

- [ ] **Step 4: Run wish, orchard, and permission regressions**

Run: `npm run typecheck && npm test -- tests/wishes tests/orchard tests/identity/permissions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/wishes.ts src/application/wish-service.ts tests/wishes
git commit -m "feat: add private fruit wish linking"
```

## Task 10: Implement group co-growing trees without competition

**Files:**
- Create: `src/domain/group-orchard.ts`, `src/application/group-orchard-service.ts`
- Test: `tests/orchard/group-tree.test.ts`, `tests/orchard/group-privacy.test.ts`

**Interfaces:**
- Produces: `GroupOrchardService.startGroupTree`, `contributeForAcademicApproval`, `groupProgressForChild`, and `harvestGroupTree`.

- [ ] **Step 1: Write failing contribution and privacy tests**

```ts
it('adds one group contribution on the first academic approval only', async () => {
  await reviews.academicReview(teacher, approvalRequest);
  await reviews.academicReview(teacher, approvalRequest);
  expect(await repo.query('groupContributions', { assignmentId: assignment.id })).toHaveLength(1);
});

it('child group progress contains no contributor identity or ranking', async () => {
  const view = await groupOrchard.groupProgressForChild(childActor, group.id);
  expect(view).toEqual({ treeId: expect.any(String), stage: expect.any(String), progress: 2, threshold: 100 });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/orchard/group-tree.test.ts tests/orchard/group-privacy.test.ts`

Expected: FAIL because group orchard modules are missing.

- [ ] **Step 3: Implement group tree and idempotent contribution events**

Only institution assignments with first academic `APPROVED` produce a contribution. Personal sunlight is not consumed. Group trees expose aggregate progress to children; teacher detail uses the existing task review scope and is never transformed into public rankings.

- [ ] **Step 4: Implement maturity memorial**

One mature group tree creates one group memorial card and optional badge/theme unlock. No inter-group comparison fields exist in the model or view model.

- [ ] **Step 5: Run orchard, review, and privacy regressions**

Run: `npm run typecheck && npm test -- tests/orchard tests/rewards tests/identity/permissions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/group-orchard.ts src/application/group-orchard-service.ts tests/orchard
git commit -m "feat: add private group co-growing orchard"
```

## Task 11: Implement media assets, OCR task drafts, and submission evidence

**Files:**
- Create: `src/domain/media.ts`, `src/application/media-service.ts`
- Test: `tests/media/drafts.test.ts`, `tests/media/evidence.test.ts`, `tests/media/retention.test.ts`

**Interfaces:**
- Consumes: `OcrProvider.recognize(asset): Promise<RecognizedTaskFields>`.
- Produces: `MediaService.createUploadIntent`, `recordUpload`, `recognizeTaskDraft`, `editDraft`, `publishDraft`, `attachSubmissionEvidence`, and `deleteExpiredAssets`.

- [ ] **Step 1: Write failing OCR safety tests**

```ts
it('stores OCR output as an editable draft and never publishes automatically', async () => {
  const draft = await media.recognizeTaskDraft(teacher, request('ocr-1', { assetId: seed.asset.id }));
  expect(draft.status).toBe('DRAFT');
  expect(await repo.query('tasks', { draftId: draft.id })).toHaveLength(0);
});

it('requires an adult to confirm title, dates, category, and submission mode', async () => {
  await expect(media.publishDraft(teacher, incompleteDraftRequest)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
```

- [ ] **Step 2: Run draft tests and verify RED**

Run: `npm test -- tests/media/drafts.test.ts`

Expected: FAIL because media modules are missing.

- [ ] **Step 3: Implement provider-independent OCR workflow**

Upload intents bind actor, tenant, purpose, mime allowlist, size limit, visibility roles, and expiry before any file is accepted. OCR output records provider/version/confidence and remains untrusted draft content until an authorized adult edits and confirms all required fields.

- [ ] **Step 4: Implement evidence scope and retention deletion**

Child evidence can be read only by active guardians and authorized assignment reviewers. Expiry marks the asset deleted, invokes a storage deletion port, removes content references, and preserves only non-content audit metadata.

- [ ] **Step 5: Run media and permission regressions**

Run: `npm run typecheck && npm test -- tests/media tests/identity/permissions.test.ts tests/tasks/submissions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/media.ts src/application/media-service.ts tests/media
git commit -m "feat: add governed media task drafts"
```

## Task 12: Implement governance, commercial entitlements, and content providers

**Files:**
- Create: `src/domain/entitlements.ts`, `src/application/governance-service.ts`, `src/application/commercial-service.ts`
- Test: `tests/governance/support-access.test.ts`, `tests/governance/exports.test.ts`, `tests/governance/entitlements.test.ts`, `tests/governance/providers.test.ts`

**Interfaces:**
- Produces: `GovernanceService.grantSupportAccess`, `readWithSupportGrant`, `requestExport`, `approveExport`, and `revokeSupportAccess`.
- Produces: `CommercialService.definePlan`, `assignPlan`, `checkEntitlement`, `consumeQuota`, `registerContentProvider`, and `publishProviderTemplate`.

- [ ] **Step 1: Write failing support and export tests**

```ts
it('denies platform support access to child content by default', async () => {
  await expect(governance.readWithSupportGrant(platformSupport, seed.assignment.id))
    .rejects.toMatchObject({ code: 'SUPPORT_GRANT_REQUIRED' });
});

it('allows only approved, unexpired, purpose-scoped support access and audits the read', async () => {
  const content = await governance.readWithSupportGrant(scopedSupportActor, seed.assignment.id);
  expect(content.id).toBe(seed.assignment.id);
  expect(await repo.query('auditLogs', { action: 'SUPPORT_CONTENT_READ' })).toHaveLength(1);
});
```

- [ ] **Step 2: Run governance tests and verify RED**

Run: `npm test -- tests/governance/support-access.test.ts tests/governance/exports.test.ts`

Expected: FAIL because governance service is missing.

- [ ] **Step 3: Implement support grants and export approval**

Support grants require ticket id, approver, exact tenant/resource scope, purpose, and expiry. Organization exports require organization-admin request, approval record, download expiry, and audit entries; family export resolves only guardian-linked records.

- [ ] **Step 4: Write failing entitlement and provider tests**

```ts
it('blocks a group creation after the tenant plan quota is exhausted', async () => {
  await commercial.consumeQuota(orgAdmin, { feature: 'GROUPS', amount: 10 });
  await expect(commercial.consumeQuota(orgAdmin, { feature: 'GROUPS', amount: 1 }))
    .rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
});

it('provider projections never contain child, submission, or family wish data', async () => {
  const view = await commercial.providerWorkspace(providerActor);
  expect(view).toEqual(expect.objectContaining({ templates: expect.any(Array), settlement: expect.any(Object) }));
  expect(JSON.stringify(view)).not.toMatch(/childId|submission|wish/);
});
```

- [ ] **Step 5: Run entitlement tests and verify RED**

Run: `npm test -- tests/governance/entitlements.test.ts tests/governance/providers.test.ts`

Expected: FAIL because commercial service and policies are missing.

- [ ] **Step 6: Implement feature gates, quotas, and isolated provider workspace**

Plans provide named entitlements and integer limits; usage changes are transactional and idempotent. Content providers publish only versioned templates/theme metadata and settlement records. Their repository scope excludes child, family, task assignment, submission, media, and wish collections.

- [ ] **Step 7: Run all governance tests**

Run: `npm run typecheck && npm test -- tests/governance tests/identity/permissions.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/entitlements.ts src/application/governance-service.ts src/application/commercial-service.ts tests/governance
git commit -m "feat: add governance and commercial boundaries"
```

## Task 13: Implement the authenticated core API and CloudBase persistence adapter

**Files:**
- Create: `src/application/core-api.ts`, `src/infrastructure/cloudbase-repository.ts`
- Create: `cloudfunctions/coreApi/index.ts`, `cloudfunctions/coreApi/package.json`
- Create: `docs/architecture/collection-indexes.md`, `docs/runbooks/cloudbase-release.md`
- Test: `tests/api/contracts.test.ts`, `tests/api/authorization.test.ts`, `tests/api/cloudbase-adapter.test.ts`

**Interfaces:**
- Produces: `createCoreApi(dependencies).handle(rawCommand, authContext)`.
- Produces: CloudBase handler `exports.main(event, context)` that obtains `OPENID` from trusted runtime context and never accepts it from the event payload.

- [ ] **Step 1: Write failing command validation and authentication tests**

```ts
it('rejects a write command without requestId before invoking a service', async () => {
  expect(await api.handle({ action: 'CREATE_FAMILY', payload: {} }, auth('wx-1')))
    .toEqual({ ok: false, error: { code: 'INVALID_COMMAND', message: expect.any(String) } });
});

it('ignores a payload openId and authenticates with the CloudBase context openId', async () => {
  const result = await api.handle(command({ payload: { openId: 'attacker' } }), auth('trusted-openid'));
  expect(result.ok && result.data.actorAccountId).toBe(seed.trustedAccount.id);
});
```

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm test -- tests/api/contracts.test.ts tests/api/authorization.test.ts`

Expected: FAIL because the router is missing.

- [ ] **Step 3: Implement schema validation, action routing, and idempotent result replay**

Create an allowlisted action union covering every public service method. Validate payloads at the boundary, derive actor from trusted auth context, check role/scope inside the service, and return client-safe errors without stacks or internal identifiers.

- [ ] **Step 4: Write failing CloudBase adapter contract tests**

```ts
it('uses one database transaction for a transactional repository callback', async () => {
  await cloudRepo.transaction(async tx => tx.insert('auditLogs', auditFixture));
  expect(fakeDb.runTransactionCalls).toBe(1);
});

it('maps the logical sunlightLedgers collection to sunlight_ledgers', () => {
  expect(COLLECTIONS.sunlightLedgers).toBe('sunlight_ledgers');
});
```

- [ ] **Step 5: Run adapter tests and verify RED**

Run: `npm test -- tests/api/cloudbase-adapter.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 6: Implement CloudBase repository and runtime entry point**

Map repository transactions to the SDK transaction API, translate duplicate/index errors to domain errors, and configure management-only collections. The deployable function imports the compiled core, initializes the SDK once, extracts trusted runtime identity, and invokes `createCoreApi`.

- [ ] **Step 7: Document indexes, permissions, deployment, rollback, and live checks**

The release runbook must include development and production environment placeholders supplied at deployment time, collection creation, management-only rules, index creation, function deployment, direct-client access denial check, authorization smoke test, backup, rollback, and log redaction review.

- [ ] **Step 8: Run API, compiler, and full regression tests**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/application/core-api.ts src/infrastructure/cloudbase-repository.ts cloudfunctions docs/architecture docs/runbooks tests/api
git commit -m "feat: add authenticated cloudbase business API"
```

## Task 14: Add native mini-program client boundaries and replaceable view layer contracts

**Files:**
- Create: `miniprogram/app.ts`, `miniprogram/app.json`, `miniprogram/config/env.ts`
- Create: `miniprogram/services/core-api.ts`, `miniprogram/store/session.ts`
- Create: `miniprogram/view-models/types.ts`, `miniprogram/theme/tokens.ts`
- Test: `tests/api/client-boundary.test.ts`, `tests/api/session.test.ts`

**Interfaces:**
- Produces: `callCoreApi<A extends CoreAction>`, `SessionStore.selectWorkspace`, `selectRoleMode`, `selectChild`, and immutable theme-token types.

- [ ] **Step 1: Write failing client boundary tests**

```ts
it('generates a request id for every write and never sends caller identity', async () => {
  await client.execute('CREATE_FAMILY', { name: '晨光家' });
  expect(fakeCloud.lastPayload.requestId).toMatch(/^[a-zA-Z0-9-]{16,}$/);
  expect(fakeCloud.lastPayload).not.toHaveProperty('openId');
});

it('clears a stale child selection when switching workspaces', () => {
  session.selectWorkspace({ kind: 'FAMILY', id: 'family-1' });
  session.selectChild('child-1');
  session.selectWorkspace({ kind: 'ORGANIZATION', id: 'org-1' });
  expect(session.current().childId).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/api/client-boundary.test.ts tests/api/session.test.ts`

Expected: FAIL because client modules are absent.

- [ ] **Step 3: Implement the typed client and local session boundary**

Reads and writes use only `wx.cloud.callFunction`. The selected role mode, child, and workspace may persist locally as navigation preferences but never as authorization proof. Child-mode commands identify the selected child while the server verifies that the authenticated account has an active guardian link; switching workspace clears incompatible selections.

- [ ] **Step 4: Define view-model and theme contracts without final UI**

Re-export only client-safe view models. Define semantic tokens for color roles, spacing, type scale, radius, elevation, and motion duration without selecting final brand values or embedding component-library classes.

- [ ] **Step 5: Run client, API, compiler, and regression tests**

Run: `npm run typecheck && npm test -- tests/api && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram tests/api
git commit -m "feat: add ui-independent mini program client"
```

## Task 15: Prove end-to-end business cases and publish the verification report

**Files:**
- Create: `tests/acceptance/family-orchard.test.ts`
- Create: `tests/acceptance/institution-collaboration.test.ts`
- Create: `tests/acceptance/media-governance.test.ts`
- Create: `tests/acceptance/commercial-boundaries.test.ts`
- Create: `docs/privacy/child-data-boundary.md`
- Create: `docs/verification/2026-09-06-business-cases.md`
- Modify: `README.md`

**Interfaces:**
- Consumes every application service through `createCoreApi` and the real in-memory transaction repository.
- Produces a dated case matrix containing case id, requirement, test name, command, result, and current environment limitation.

- [ ] **Step 1: Write the failing family orchard acceptance case**

```ts
it('AC-FAMILY-001 completes three tasks and harvests the first apple tree', async () => {
  const family = await scenario.createFamilyWithChild();
  const assignments = await scenario.publishThreeOrdinaryTasks(family);
  for (const assignment of assignments) {
    await scenario.childSubmits(assignment);
    await scenario.guardianApproves(assignment);
  }
  expect(await scenario.childOrchard()).toMatchObject({
    lifetimeSunlight: 6,
    currentTree: { status: 'MATURE', threshold: 6 },
  });
  await scenario.harvestCurrentTree('第一棵苹果树');
  expect((await scenario.childOrchard()).harvestedTrees).toHaveLength(1);
});
```

- [ ] **Step 2: Run family acceptance and verify RED**

Run: `npm test -- tests/acceptance/family-orchard.test.ts`

Expected: FAIL until all preceding services are correctly integrated.

- [ ] **Step 3: Add institution, privacy, media, and commercial acceptance cases**

Cover group invitation and consent; automatic institution task delivery; guardian/teacher dual review; one group contribution; withdrawal preserving personal assets; family-private fruit wish linking; cross-tenant denial; OCR draft confirmation; evidence retention; support grant expiry; provider data isolation; quota rejection; request replay; and direct negative-ledger rejection.

- [ ] **Step 4: Run focused acceptance suites**

Run: `npm test -- tests/acceptance`

Expected: all acceptance cases pass.

- [ ] **Step 5: Run the full verification gate**

Run: `npm ci && npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build`

Expected: every command exits 0; no skipped or todo tests; branch coverage is at least 90% for `src/domain` and at least 85% for `src/application`.

- [ ] **Step 6: Generate the dated case report from executed test output**

Record only cases actually executed in this checkout. Separate `PASS`, `FAIL`, and `NOT_RUN`. State that local adapter/contract tests do not prove a real CloudBase deployment or real-device mini-program behavior; list those as deployment verification gates until credentials and environment ids are supplied.

- [ ] **Step 7: Update product entry documentation**

README must identify the new approved specification, commands, architecture, implemented scope, deferred visual UI, deployment prerequisites, and verification report link. Historical V1 documents remain labeled as historical.

- [ ] **Step 8: Re-run the complete gate after documentation changes**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build && git diff --check`

Expected: PASS with the same test count and no whitespace errors.

- [ ] **Step 9: Commit**

```bash
git add tests/acceptance docs/privacy docs/verification README.md
git commit -m "test: verify growth orchard business cases"
```

## Final Completion Audit

- [ ] Re-read every item in specification sections 2 through 20 and map it to an implementation file and at least one behavioral test or an explicitly documented external deployment gate.
- [ ] Confirm no application service accepts trusted actor, tenant, role, balance, progress, or internal `childId` values from an unvalidated client payload.
- [ ] Confirm ledger, audit, consent, and contribution records are append-only in both repository implementations.
- [ ] Confirm every state-changing public command has request replay coverage.
- [ ] Confirm child-facing projections contain no ranking, contributor identity, other child data, support metadata, global child id, or family wishes in institution scope.
- [ ] Confirm `rg -n "TODO|FIXME|TBD|\.skip\(|\.todo\(" src tests cloudfunctions miniprogram` returns no matches.
- [ ] Confirm the full verification gate is fresh and its exact result is recorded in `docs/verification/2026-09-06-business-cases.md`.
- [ ] Use `superpowers:finishing-a-development-branch` before presenting integration options.
