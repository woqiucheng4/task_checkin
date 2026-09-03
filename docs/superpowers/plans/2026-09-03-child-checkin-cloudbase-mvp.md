# Child Check-in CloudBase MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, parent-approved child growth check-in mini program that runs entirely on WeChat Cloud Development without a custom domain or standalone server.

**Architecture:** The mini program is a TypeScript presentation client. It calls one CloudBase `coreApi` cloud function for every private read and write; the function gets the caller's WeChat `OPENID`, enforces family ownership, and performs all sensitive database mutations. The document database is management-only and uses transactions for points and redemptions.

**Tech Stack:** Native WeChat Mini Program, TypeScript, CloudBase `wx.cloud.callFunction`, CloudBase cloud function Node.js runtime, CloudBase document database, Node built-in test runner.

**Spec:** `docs/product/child-checkin-v1-spec.md`

## Global Constraints

- V1 uses WeChat Cloud Development only; do not provision a domain, HTTP API, Alibaba Cloud resource, ECS, RDS, Web admin console, payment, teacher/group feature, AI feature, or file upload feature.
- Every private database collection is management-only. The mini program must never call `wx.cloud.database()` for business data.
- Use the authenticated CloudBase `OPENID` as the parent account identifier; never accept a caller-supplied owner id.
- A parent PIN is a same-device UI safeguard, not an independent identity. Never log or persist the plaintext PIN.
- Store only child nicknames. Do not collect real name, school, contact information, location, media, or free-form child profile text.
- Every command includes a client-generated `requestId`; successful mutations write a matching audit entry and repeat requests return the original result.
- Use `Asia/Shanghai` to calculate the task occurrence date; store timestamps in UTC.
- Do not expose a public leaderboard, social feed, teacher entry point, external HTTP endpoint, or any form of AI advice.

---

## File Structure

```text
package.json                         # typecheck and test scripts
tsconfig.json                        # shared strict TypeScript compiler options
project.config.json                  # WeChat developer-tool project configuration
miniprogram/
  app.ts                             # initializes CloudBase environment
  app.json                           # tab/page registration
  core/models.ts                     # client-safe domain types
  core/date.ts                       # Shanghai occurrence-date helpers
  services/core-api.ts               # typed wx.cloud.callFunction wrapper
  store/session.ts                   # selected child and local parent-unlock timer
  pages/setup/*                      # first family setup
  pages/home/*                       # child-safe today's task list
  pages/tasks/*                      # parent task management and child check-in
  pages/wishes/*                     # child redemption requests
  pages/parent/*                     # PIN entry, review queue, ledger and settings
cloudfunctions/coreApi/
  package.json                       # function runtime dependencies
  src/index.ts                       # action dispatcher
  src/context.ts                     # OPENID and family ownership resolution
  src/contracts.ts                   # validated command/result shapes
  src/repository.ts                  # collection names and database access helpers
  src/schedule.ts                    # task-due calculation
  src/pin.ts                         # salted PIN hash and verify helpers
  src/handlers/family.ts             # bootstrap/read family actions
  src/handlers/tasks.ts              # task CRUD, due list and submit action
  src/handlers/reviews.ts            # review and manual ledger actions
  src/handlers/wishes.ts             # wish and redemption actions
  src/handlers/audit.ts              # idempotency and audit log helpers
  tests/*.test.ts                    # pure rule and handler tests with mocked repository
docs/product/child-checkin-v1-spec.md
docs/privacy/child-data-v1.md        # published data inventory and deletion route
docs/runbooks/cloudbase-v1-release.md # environment, indexes, backups and release checklist
```

### Task 1: Bootstrap a strict mini-program and cloud-function workspace

**Files:**
- Create: `package.json`, `tsconfig.json`, `project.config.json`, `miniprogram/app.ts`, `miniprogram/app.json`, `miniprogram/core/models.ts`
- Create: `cloudfunctions/coreApi/package.json`, `cloudfunctions/coreApi/src/contracts.ts`
- Test: `cloudfunctions/coreApi/tests/contracts.test.ts`

**Interfaces:**
- Produces `Action`, `CoreCommand`, `CoreResult`, `TaskCategory`, `CheckinStatus`, `RedemptionStatus` shared by every client and function module.

- [ ] **Step 1: Write the failing contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCoreCommand } from '../src/contracts';

test('rejects a command without a request id', () => {
  assert.equal(isCoreCommand({ action: 'GET_HOME', payload: {} }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- contracts.test.ts`

Expected: FAIL because `isCoreCommand` does not exist.

- [ ] **Step 3: Implement the minimal contract surface**

```ts
export type Action = 'BOOTSTRAP_FAMILY' | 'GET_HOME' | 'CREATE_TASK' | 'SUBMIT_CHECKIN';

export interface CoreCommand {
  action: Action;
  requestId: string;
  payload: Record<string, unknown>;
}

export function isCoreCommand(value: unknown): value is CoreCommand {
  return typeof value === 'object' && value !== null
    && typeof (value as CoreCommand).action === 'string'
    && typeof (value as CoreCommand).requestId === 'string'
    && (value as CoreCommand).requestId.length >= 16;
}
```

- [ ] **Step 4: Configure the project and CloudBase initialization**

`miniprogram/app.ts` must call `wx.cloud.init({ env: '<DEPLOYMENT_ENV_ID>' })` once during launch. Keep the environment id in one build-time configuration file; do not duplicate it in pages.

- [ ] **Step 5: Run compiler and test gates**

Run: `npm run typecheck && npm test`

Expected: PASS with strict TypeScript enabled and the contract test green.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json project.config.json miniprogram cloudfunctions/coreApi
git commit -m "chore: bootstrap cloudbase checkin workspace"
```

### Task 2: Provision CloudBase safely before writing feature code

**Files:**
- Create: `docs/runbooks/cloudbase-v1-release.md`
- Create: `cloudfunctions/coreApi/src/repository.ts`
- Test: `cloudfunctions/coreApi/tests/repository.test.ts`

**Interfaces:**
- Consumes: `CoreCommand` from Task 1.
- Produces: one `DEVELOPMENT` CloudBase environment, one `PRODUCTION` environment, management-only collections, documented indexes, and `Repository` methods.

- [ ] **Step 1: Write a failing collection-name test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS } from '../src/repository';

test('uses a fixed allowlist of private collections', () => {
  assert.deepEqual(Object.keys(COLLECTIONS).sort(), [
    'auditLogs', 'checkins', 'children', 'families', 'pointLedgers', 'redemptions', 'tasks', 'wishes'
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repository.test.ts`

Expected: FAIL because `COLLECTIONS` does not exist.

- [ ] **Step 3: Implement the fixed collection map**

```ts
export const COLLECTIONS = {
  families: 'families', children: 'children', tasks: 'tasks', checkins: 'checkins',
  pointLedgers: 'point_ledgers', wishes: 'wishes', redemptions: 'redemptions', auditLogs: 'audit_logs'
} as const;
```

- [ ] **Step 4: Configure CloudBase collections and indexes manually**

In both environments create each collection with “management-only read/write” permissions. Create compound indexes: `tasks(familyId, childId, active)`, `checkins(taskId, childId, occurredOn)`, `checkins(familyId, status, submittedAt)`, `point_ledgers(childId, createdAt)`, and `audit_logs(actorOpenId, requestId)`. Document exact console steps, environment ids, release owner, backup cadence and rollback owner in the runbook.

- [ ] **Step 5: Verify permissions rather than trusting the UI**

From a mini-program test page, attempt a direct `wx.cloud.database().collection('families').get()`. It must return `UNAUTHORIZED`. Then call the read-only cloud function action and verify it succeeds only for the owner's family.

- [ ] **Step 6: Commit**

```bash
git add docs/runbooks cloudfunctions/coreApi/src/repository.ts cloudfunctions/coreApi/tests/repository.test.ts
git commit -m "chore: provision private cloudbase data boundary"
```

### Task 3: Implement pure schedule and state-transition rules

**Files:**
- Create: `miniprogram/core/date.ts`, `cloudfunctions/coreApi/src/schedule.ts`
- Create: `cloudfunctions/coreApi/src/domain.ts`
- Test: `cloudfunctions/coreApi/tests/schedule.test.ts`, `cloudfunctions/coreApi/tests/domain.test.ts`

**Interfaces:**
- Produces `isTaskDue(task, occurrenceDate)`, `makeCheckinKey(taskId, childId, occurrenceDate)`, and `assertCheckinTransition(from, to)`.

- [ ] **Step 1: Write failing schedule and state tests**

```ts
test('weekly task is due only on configured Shanghai weekdays', () => {
  assert.equal(isTaskDue({ schedule: { kind: 'WEEKLY', weekdays: [1, 3] } }, '2026-09-03'), true);
  assert.equal(isTaskDue({ schedule: { kind: 'WEEKLY', weekdays: [1, 3] } }, '2026-09-04'), false);
});

test('approved check-in cannot be approved a second time', () => {
  assert.throws(() => assertCheckinTransition('APPROVED', 'APPROVED'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- schedule.test.ts domain.test.ts`

Expected: FAIL because schedule and transition functions do not exist.

- [ ] **Step 3: Implement the allowed schedule and transitions**

Support only `DAILY`, `WEEKLY` with weekday array, and `ONCE` with a single `occurredOn` date. Allow transitions only `PENDING → SUBMITTED`, `SUBMITTED → APPROVED`, `SUBMITTED → REJECTED`, and `PENDING → EXPIRED`.

- [ ] **Step 4: Add Shanghai boundary tests**

Test midnight in `Asia/Shanghai`, repeated `SUBMIT_CHECKIN` for one business key, and a one-time task after its date. Do not rely on the developer machine timezone.

- [ ] **Step 5: Run all pure-rule tests**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/core cloudfunctions/coreApi/src cloudfunctions/coreApi/tests
git commit -m "feat: add deterministic task schedule rules"
```

### Task 4: Build family bootstrap, child selection and parent PIN safeguards

**Files:**
- Create: `cloudfunctions/coreApi/src/context.ts`, `src/pin.ts`, `src/handlers/family.ts`
- Create: `miniprogram/services/core-api.ts`, `miniprogram/store/session.ts`, `miniprogram/pages/setup/*`
- Test: `cloudfunctions/coreApi/tests/family.test.ts`, `cloudfunctions/coreApi/tests/pin.test.ts`

**Interfaces:**
- Consumes: repository and contracts from Tasks 1–2.
- Produces actions `BOOTSTRAP_FAMILY`, `GET_FAMILY`, `VERIFY_PARENT_PIN`, `SET_PIN`; `ParentUnlockState` exists only in local session memory.

- [ ] **Step 1: Write failing ownership and PIN tests**

```ts
test('returns a family only when context OPENID is its owner', async () => {
  await assert.rejects(() => getOwnedFamily(repo, 'other-openid', 'family-1'), /FORBIDDEN/);
});

test('does not store the plaintext PIN', async () => {
  const hash = await hashPin('123456');
  assert.equal(hash.includes('123456'), false);
  assert.equal(await verifyPin('123456', hash), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- family.test.ts pin.test.ts`

Expected: FAIL because ownership and PIN helpers do not exist.

- [ ] **Step 3: Implement secure bootstrap**

The handler obtains `OPENID` from CloudBase context, validates a 1–20 character family name and child nickname, creates `families` and first `children` records, and logs `FAMILY_BOOTSTRAPPED` in one transaction. Hash a six-digit PIN with a per-family random salt using the cloud-function runtime crypto implementation. Never return the hash to the client.

- [ ] **Step 4: Implement the client session boundary**

The selected child id may be stored locally. Parent unlock starts only after successful `VERIFY_PARENT_PIN`, expires after 10 minutes, and is cleared on app hide. Parent-only pages must redirect to PIN entry when it has expired. Every sensitive cloud command still re-verifies an unlock proof; client routing alone is insufficient.

- [ ] **Step 5: Verify a real device flow**

Create a family, close and reopen the mini program, enter child view, attempt to navigate to parent review, verify PIN, then wait for expiry and retry. Confirm neither PIN nor family records appear in developer logs.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/services miniprogram/store miniprogram/pages/setup cloudfunctions/coreApi/src cloudfunctions/coreApi/tests
git commit -m "feat: add family bootstrap and parent safeguard"
```

### Task 5: Deliver task creation, due-task display and child check-in submission

**Files:**
- Create: `cloudfunctions/coreApi/src/handlers/tasks.ts`
- Create: `miniprogram/pages/home/*`, `miniprogram/pages/tasks/*`
- Test: `cloudfunctions/coreApi/tests/tasks.test.ts`

**Interfaces:**
- Produces actions `CREATE_TASK`, `UPDATE_TASK`, `ARCHIVE_TASK`, `GET_HOME`, `SUBMIT_CHECKIN`.
- `GET_HOME` returns `{ child, occurrenceDate, tasks: Array<{ task, checkinStatus }> }`.

- [ ] **Step 1: Write failing task validation tests**

```ts
test('rejects a learning task with an invalid source', async () => {
  await assert.rejects(() => createTask(ctx, { category: 'LEARNING', learningSource: 'OTHER' }), /INVALID_INPUT/);
});

test('creates only one submitted check-in for a task occurrence', async () => {
  await submitCheckin(ctx, { taskId: 't1', occurredOn: '2026-09-03', requestId: 'a'.repeat(16) });
  await assert.rejects(() => submitCheckin(ctx, { taskId: 't1', occurredOn: '2026-09-03', requestId: 'b'.repeat(16) }), /ALREADY_EXISTS/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tasks.test.ts`

Expected: FAIL because task handlers are absent.

- [ ] **Step 3: Implement task commands in the cloud function**

Allow parent-unlocked commands to create, edit and archive a task only inside the owned family. Validate title length, category, 1–99 point value and schedule. `SUBMIT_CHECKIN` requires only family ownership, verifies the task is active and due, and writes a deterministic check-in key in a transaction. It must not grant points.

- [ ] **Step 4: Build the task pages**

Child home shows only due tasks and their check-in state. Parent task management shows active and archived task templates. A child click calls `SUBMIT_CHECKIN` once, disables while pending, then refreshes from `GET_HOME`; never optimistically add points.

- [ ] **Step 5: Run device and duplicate-request acceptance**

On a real device, tap the same task rapidly with weak network simulation. Exactly one check-in must exist and the parent review queue must show one item.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/home miniprogram/pages/tasks cloudfunctions/coreApi/src/handlers/tasks.ts cloudfunctions/coreApi/tests/tasks.test.ts
git commit -m "feat: add tasks and child checkins"
```

### Task 6: Implement parent review and immutable point ledger

**Files:**
- Create: `cloudfunctions/coreApi/src/handlers/reviews.ts`, `src/handlers/audit.ts`
- Create: `miniprogram/pages/parent/reviews/*`, `miniprogram/pages/parent/ledger/*`
- Test: `cloudfunctions/coreApi/tests/reviews.test.ts`

**Interfaces:**
- Produces `REVIEW_CHECKIN`, `ADJUST_POINTS`, `GET_LEDGER`.
- `REVIEW_CHECKIN` returns `{ checkinId, status, ledgerEntry?: PointLedger }`.

- [ ] **Step 1: Write transaction-boundary tests**

```ts
test('approving a submitted check-in creates one immutable ledger entry', async () => {
  const result = await reviewCheckin(ctx, { checkinId: 'c1', decision: 'APPROVE', requestId: 'a'.repeat(16) });
  assert.equal(result.status, 'APPROVED');
  assert.equal(await repo.countLedgers({ referenceId: 'c1' }), 1);
});

test('rejecting a check-in creates no ledger entry', async () => {
  await reviewCheckin(ctx, { checkinId: 'c2', decision: 'REJECT', requestId: 'b'.repeat(16) });
  assert.equal(await repo.countLedgers({ referenceId: 'c2' }), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- reviews.test.ts`

Expected: FAIL because review handlers do not exist.

- [ ] **Step 3: Implement all point mutations as transactions**

In one database transaction, re-read the check-in, require `SUBMITTED`, change it once, add exactly one `point_ledgers` entry when approved, and write the audit record. `ADJUST_POINTS` requires a non-empty reason, has a bounded delta, and creates a ledger row; it must never update a stored balance field.

- [ ] **Step 4: Build parent review and ledger pages**

Show pending reviews first. Review controls require active parent unlock. Ledger shows newest-first entries, signed delta, source and date; it does not offer edit or delete controls.

- [ ] **Step 5: Test race and retry behavior**

Issue two approval commands for the same check-in with distinct request ids. One succeeds, the other returns `INVALID_STATE`, and ledger count remains one. Repeat the exact successful request id and verify it returns the original response.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/parent cloudfunctions/coreApi/src/handlers cloudfunctions/coreApi/tests/reviews.test.ts
git commit -m "feat: add reviewed checkins and point ledger"
```

### Task 7: Implement wishes and atomic redemption lifecycle

**Files:**
- Create: `cloudfunctions/coreApi/src/handlers/wishes.ts`
- Create: `miniprogram/pages/wishes/*`, `miniprogram/pages/parent/wishes/*`
- Test: `cloudfunctions/coreApi/tests/wishes.test.ts`

**Interfaces:**
- Produces `CREATE_WISH`, `UPDATE_WISH`, `REQUEST_REDEMPTION`, `FULFILL_REDEMPTION`, `CANCEL_REDEMPTION`, `GET_WISHES`.

- [ ] **Step 1: Write failing balance and refund tests**

```ts
test('does not request a wish when ledger balance is insufficient', async () => {
  await assert.rejects(() => requestRedemption(ctx, { wishId: 'w1', requestId: 'a'.repeat(16) }), /INSUFFICIENT_POINTS/);
});

test('cancelling a request restores exactly its cost once', async () => {
  await cancelRedemption(ctx, { redemptionId: 'r1', requestId: 'b'.repeat(16) });
  assert.equal(await repo.sumLedger('child-1', 'REDEMPTION_REFUND'), 20);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- wishes.test.ts`

Expected: FAIL because wish handlers are absent.

- [ ] **Step 3: Implement redemption state machine**

Parent creates active wishes. Child requests an active wish only if balance, calculated from ledger entries inside the transaction, covers the cost. The transaction creates `REQUESTED` redemption plus one negative `REDEMPTION_REQUEST` ledger row. Parent can fulfil it, or cancel it once; cancellation creates a single positive refund ledger row.

- [ ] **Step 4: Build child and parent wish pages**

Child view displays current balance, active wishes and request status. Parent view creates/edits/disables wishes and fulfils/cancels requests. No wish represents cash, a third-party purchase, or an external order in V1.

- [ ] **Step 5: Verify the full loop on device**

Approve enough tasks, request a wish, cancel it, request it again, then fulfil it. Verify ledger total and request history at every transition.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/wishes miniprogram/pages/parent/wishes cloudfunctions/coreApi/src/handlers/wishes.ts cloudfunctions/coreApi/tests/wishes.test.ts
git commit -m "feat: add family wish redemption lifecycle"
```

### Task 8: Add privacy controls, retention behavior and release artifacts

**Files:**
- Create: `docs/privacy/child-data-v1.md`, `miniprogram/pages/parent/privacy/*`
- Modify: `cloudfunctions/coreApi/src/handlers/family.ts`, `docs/runbooks/cloudbase-v1-release.md`
- Test: `cloudfunctions/coreApi/tests/privacy.test.ts`

**Interfaces:**
- Produces `DELETE_CHILD_DATA_REQUEST` and `GET_DATA_INVENTORY`; deletion requests are audited and require parent PIN.

- [ ] **Step 1: Write a failing data-inventory test**

```ts
test('data inventory excludes media, location, school and real name fields', () => {
  const fields = getV1DataInventory().flatMap((item) => item.fields);
  for (const prohibited of ['realName', 'school', 'location', 'photoUrl', 'videoUrl']) {
    assert.equal(fields.includes(prohibited), false);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- privacy.test.ts`

Expected: FAIL because the inventory function does not exist.

- [ ] **Step 3: Implement privacy inventory and deletion request**

Publish a plain-language list of every V1 field, purpose, retention rule and deletion path. `DELETE_CHILD_DATA_REQUEST` must create an auditable pending request, disable the child profile immediately, and show the support/processing status; it must not silently delete ledger data in the client.

- [ ] **Step 4: Add a parent privacy page**

Show the data inventory, the “no photo/video/location” promise, and the deletion request entry. Parent PIN is required before submitting the request.

- [ ] **Step 5: Complete the release runbook**

Add pre-release checks: verified company mini-program account, production CloudBase env separated from development, management-only collection permissions, index verification, manual backup test, privacy policy URL/configuration, tested delete-request path, and a rollback procedure. Explicitly exclude production release until each check is recorded.

- [ ] **Step 6: Commit**

```bash
git add docs/privacy docs/runbooks miniprogram/pages/parent/privacy cloudfunctions/coreApi/src/handlers/family.ts cloudfunctions/coreApi/tests/privacy.test.ts
git commit -m "docs: add v1 child data protection controls"
```

### Task 9: Perform end-to-end acceptance and controlled family beta

**Files:**
- Modify: `docs/runbooks/cloudbase-v1-release.md`
- Create: `docs/runbooks/family-beta-script.md`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: signed release checklist, reproducible beta script, and a go/no-go decision based on evidence.

- [ ] **Step 1: Run automated checks**

Run: `npm run typecheck && npm test`

Expected: all rule, ownership, idempotency, redemption and privacy tests pass.

- [ ] **Step 2: Run an isolated family journey**

On a real WeChat device: create a family; create learning, exercise and habit tasks; submit one task in child view; verify that parent PIN is required; approve it; request and fulfil a wish; then inspect the ledger and audit log. Record timestamps and expected/actual states in `family-beta-script.md`.

- [ ] **Step 3: Run failure journeys**

Verify direct database read is denied, duplicate check-in is denied, double approval adds no points, insufficient redemption is denied, a PIN failure does not unlock parent mode, and no page exposes a teacher, AI, payment or attachment feature.

- [ ] **Step 4: Verify CloudBase production configuration**

Verify the app is associated with the intended production CloudBase environment. Verify no HTTP access service/custom domain is enabled. Verify production data is not in the development environment and that the documented backup procedure completes.

- [ ] **Step 5: Run a 5–10 family closed beta**

Invite only known families. Collect only task-creation friction, completion rate, parent review latency and redemption completion; do not collect child free-text stories or media. Do not buy advertising or open teacher groups during this beta.

- [ ] **Step 6: Commit the evidence, not user data**

```bash
git add docs/runbooks
git commit -m "docs: record cloudbase v1 beta acceptance"
```

## Post-V1 Decision Gates

- Create a separate V2 plan only after 20 families have completed at least three weeks of use and at least 40% return in week three. V2 can add invited parent accounts and teacher white-list design; it must not reuse V1 PIN as cross-account authorization.
- Create a separate V3 plan only after a paid institution explicitly needs exports or an operations user cannot complete work in the mini program. V3 introduces Web admin, custom domain and filed HTTP access; it requires a new privacy impact review.
- Create a separate V4 plan only after structured reports are trusted. It introduces opt-in AI suggestions; no raw child media or personal identifiers may be sent to a model.
- Evaluate a standalone App only after the mini program has demonstrated retained usage and a documented WeChat-platform limitation blocks a core workflow.

## Self-Review

- Spec coverage: Tasks 1–7 implement all V1 entities and the task → review → ledger → wish loop. Task 8 covers data-minimization and deletion support. Task 9 supplies device, security and beta acceptance. V2–V4 are explicitly excluded and gated.
- Placeholder scan: No task relies on an unspecified feature, service or data source; every command and state transition is named in the spec and tasks.
- Type consistency: `CoreCommand.requestId`, `OPENID` ownership, `CheckinStatus`, `RedemptionStatus`, and ledger reference ids are used consistently across Tasks 1–9.
