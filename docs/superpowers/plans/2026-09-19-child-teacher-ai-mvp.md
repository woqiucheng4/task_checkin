# 孩子—老师协作 AI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the child–parent–teacher MVP with teacher activation, child-first group membership, private task/submission images, and default-on DeepSeek task-draft assistance.

**Architecture:** Keep the existing CloudBase-only command boundary. Add an MVP edition policy before command dispatch, model teacher workspaces as a restricted organization type, and keep the current task/submission/review services as the source of truth. Add an AI Gateway/provider boundary behind `MediaService`; it calls DeepSeek only from the cloud function and returns editable task drafts.

**Tech Stack:** TypeScript, native WeChat Mini Program, CloudBase, `wx-server-sdk`, Node 18 cloud function runtime, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-09-19-child-teacher-ai-mvp-design.md`

## Global Constraints

- Use `childId`, never a shared parent OpenID, as the child data and AI-result partition key.
- Keep every collection and storage path under `task_checkin_*` and `task-checkin/`; do not change other mini-program resources or global rules in the shared environment.
- Only trusted AppID/OpenID context from `cloudfunctions/coreApi/handler.ts` authenticates callers; payload identity fields are never trusted.
- Task-image drafting is default-on for authorized parent/teacher publishers; only an operator-configured emergency circuit breaker may pause it.
- Learning summaries, answer evaluation and recommendations are later capabilities: they remain disabled and require a per-child guardian setting when implemented.
- AI output is editable advice. It must never directly publish a task, finalize an academic review, or create a sunlight ledger entry.
- All write commands retain request-id idempotency and use the existing repository transaction/audit conventions.
- Images are JPG, PNG, or WebP; maximum three per attachment point and 1 MB per compressed file; access is private and time-limited.
- No deployment, collection creation, shared-environment rule change, or DeepSeek secret configuration occurs until the target CloudBase environment and owner have been explicitly confirmed.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/application/mvp-policy.ts` | One allow/deny decision for the child–teacher edition, independent of client navigation. |
| `src/application/teacher-activation-service.ts` | Hash, consume, revoke and audit one-time teacher activation codes. |
| `src/application/identity-service.ts` | Create a `TEACHER_WORKSPACE` organization only after a valid activation is consumed. |
| `src/application/ai-gateway.ts` | Authorization, circuit breaker, request audit, provider call and JSON normalization for task drafts. |
| `src/application/ports.ts` | Small provider and media-read interfaces; no vendor SDK in domain code. |
| `src/infrastructure/deepseek-task-draft-provider.ts` | DeepSeek HTTP adapter that accepts bytes, asks for strict JSON, and exposes no secret. |
| `src/domain/model.ts` | Teacher activation, AI invocation/configuration, task image and workspace schema types. |
| `src/infrastructure/collections.ts` | CloudBase names and indexes for the new records. |
| `cloudfunctions/coreApi/index.ts` | Runtime wiring from environment variables to the policy and DeepSeek adapter. |
| `miniprogram/pages/*` | Restricted MVP navigation, teacher activation/onboarding, child-first join, image source attachment and draft confirmation. |
| `tests/**` | Unit, API contract and Mini Program runtime coverage for every authority boundary and failure fallback. |

## Task 1: Enforce the MVP edition at the service boundary

**Files:**
- Create: `src/application/mvp-policy.ts`
- Modify: `src/application/core-api.ts`
- Modify: `cloudfunctions/coreApi/index.ts`
- Test: `tests/application/mvp-policy.test.ts`
- Test: `tests/api/authorization.test.ts`

**Interfaces:**
- Consumes: `CoreAction`, `ActorContext`, `DomainError`.
- Produces: `MvpPolicy.assertAllowed(action: CoreAction, actor: ActorContext): void` and `MvpPolicyConfig`.

- [ ] **Step 1: Write the failing policy tests**

```ts
expect(() => policy.assertAllowed("GET_PLATFORM_DASHBOARD", guardian)).toThrowError(
  expect.objectContaining({ code: "FEATURE_DISABLED" }),
);
expect(() => policy.assertAllowed("PUBLISH_FAMILY_TASK", guardian)).not.toThrow();
expect(() => policy.assertAllowed("CREATE_WISH", guardian)).toThrowError(
  expect.objectContaining({ code: "FEATURE_DISABLED" }),
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run tests/application/mvp-policy.test.ts`  
Expected: FAIL because `MvpPolicy` does not exist.

- [ ] **Step 3: Implement explicit allowlists, not UI-derived permissions**

```ts
export class MvpPolicy {
  constructor(private readonly enabled: boolean) {}

  assertAllowed(action: CoreAction, actor: ActorContext): void {
    if (!this.enabled) return;
    if (!MVP_ACTIONS.has(action)) {
      throw new DomainError("FEATURE_DISABLED", "该功能暂未在内测版开放");
    }
    if (actor.mode === "CHILD" && !CHILD_ACTIONS.has(action)) {
      throw new DomainError("FEATURE_DISABLED", "孩子视图暂不支持该操作");
    }
  }
}
```

Include the family, group, invitation, task, submission, review, orchard, media and teacher-activation commands required by the spec. Exclude platform dashboards, provider/commercial actions, exports, plans, wishes, fruit links and entitlement commands.

- [ ] **Step 4: Call the policy after trusted actor resolution and before dispatch**

Pass `MvpPolicy` into `createCoreApi`; call `policy.assertAllowed(command.action, actor)` after `resolveActor` and before `dispatch`. Wire `PRODUCT_EDITION=CHILD_TEACHER_MVP` in `cloudfunctions/coreApi/index.ts`; an absent value leaves legacy behavior unchanged for local regression fixtures.

- [ ] **Step 5: Verify policy and trusted AppID behavior**

Run: `npm test -- --run tests/application/mvp-policy.test.ts tests/api/authorization.test.ts`  
Expected: PASS; disabled actions fail even when invoked directly, and unapproved shared AppIDs still fail before API dispatch.

- [ ] **Step 6: Commit**

```bash
git add src/application/mvp-policy.ts src/application/core-api.ts cloudfunctions/coreApi/index.ts tests/application/mvp-policy.test.ts tests/api/authorization.test.ts
git commit -m "feat: enforce child teacher MVP actions"
```

## Task 2: Add one-time teacher activation and restricted workspaces

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `src/infrastructure/collections.ts`
- Create: `src/application/teacher-activation-service.ts`
- Modify: `src/application/identity-service.ts`
- Modify: `src/application/core-api.ts`
- Test: `tests/identity/teacher-activation.test.ts`
- Test: `tests/api/contracts.test.ts`

**Interfaces:**
- Consumes: `ActorContext`, `Repository`, `AccessPolicy`, `CryptoIdGenerator`.
- Produces: `TeacherActivationCode`, `TeacherActivationService.issue/revoke`, and `IdentityService.activateTeacherWorkspace`.

- [ ] **Step 1: Define the records and new workspace enum values in a failing compile test**

```ts
const activation: TeacherActivationCode = {
  codeHash: expect.any(String),
  expiresAt: "2026-10-01T00:00:00.000Z",
  status: "ACTIVE",
  issuedByAccountId: platform.accountId,
  redeemedByAccountId: undefined,
};
expectTypeOf<OrganizationType>().toMatchTypeOf<"TEACHER_WORKSPACE">();
```

- [ ] **Step 2: Run the identity test to verify it fails**

Run: `npm test -- --run tests/identity/teacher-activation.test.ts`  
Expected: FAIL because the activation record and service do not exist.

- [ ] **Step 3: Add `teacherActivationCodes` and a restricted workspace type**

Add `TEACHER_WORKSPACE` to `OrganizationType` and `LEARNING_GROUP` to `GroupType`. Define `TeacherActivationCode` with `codeHash`, `status`, `expiresAt`, `issuedByAccountId`, optional `redeemedByAccountId`, optional `revokedAt`, and immutable timestamps. Add it to `DomainSchema`, `CollectionName`, CloudBase collection mapping and indexes for `{ codeHash, status }` and `{ expiresAt, status }`.

- [ ] **Step 4: Implement issuance, revocation and atomic consumption**

```ts
async activateTeacherWorkspace(actor, input) {
  const code = await this.activations.consume(actor, input.code, input.requestId);
  return this.dependencies.repository.transaction(async (tx) => {
    const workspace = await this.createTeacherWorkspace(tx, actor.accountId, input.workspaceName);
    await tx.update("teacherActivationCodes", code.id, {
      redeemedByAccountId: actor.accountId,
      redeemedAt: this.dependencies.clock.now(),
      status: "REDEEMED",
    });
    return workspace;
  });
}
```

Hash codes with a server-side SHA-256 digest plus `TEACHER_ACTIVATION_PEPPER`; compare only hashes. `ISSUE_TEACHER_ACTIVATION` and `REVOKE_TEACHER_ACTIVATION` require trusted platform mode and have no public Mini Program navigation. `ACTIVATE_TEACHER_WORKSPACE` requires an active account, consumes once, creates one `TEACHER_WORKSPACE` organization and `ORGANIZATION_ADMIN` membership for the caller, and audits every state change.

- [ ] **Step 5: Prove replay, expiry, revocation and platform forgery behavior**

Run: `npm test -- --run tests/identity/teacher-activation.test.ts tests/api/contracts.test.ts`  
Expected: PASS; codes cannot be replayed, expired/revoked codes are rejected, and an event payload cannot forge platform issuance.

- [ ] **Step 6: Commit**

```bash
git add src/domain/model.ts src/infrastructure/collections.ts src/application/teacher-activation-service.ts src/application/identity-service.ts src/application/core-api.ts tests/identity/teacher-activation.test.ts tests/api/contracts.test.ts
git commit -m "feat: add teacher activation workspaces"
```

## Task 3: Make teacher-created groups and child-first joining work without platform setup

**Files:**
- Modify: `src/application/identity-service.ts`
- Modify: `src/application/invitation-service.ts`
- Modify: `src/application/presentation-service.ts`
- Modify: `tests/helpers/identity-scenario.ts`
- Test: `tests/identity/invitations.test.ts`
- Test: `tests/identity/teacher-workspace.test.ts`

**Interfaces:**
- Consumes: an activated `TEACHER_WORKSPACE` organization and `OrganizationMember` role.
- Produces: teacher-owned `Group` records and existing `claimInvitation`/`approveJoinRequest` flow scoped to a selected `childId`.

- [ ] **Step 1: Write failing group ownership and sibling-isolation tests**

```ts
const groupA = await identity.createGroup(teacher, workspaceAInput);
await expect(identity.createGroup(otherTeacher, { ...workspaceAInput, name: "越权分组" }))
  .rejects.toMatchObject({ code: "FORBIDDEN" });
expect((await presentation.childGroups(guardian, childB.id)).memberships).toEqual([]);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/identity/teacher-workspace.test.ts tests/identity/invitations.test.ts`  
Expected: FAIL until an activated teacher can create an `LEARNING_GROUP` and the scenario no longer relies on platform-created schools.

- [ ] **Step 3: Restrict existing `createGroup` to its own workspace**

Keep `createGroup` and `CREATE_GROUP`; require `ORGANIZATION_ADMIN` as today, allow `LEARNING_GROUP` only in `TEACHER_WORKSPACE`, and reject school/tutoring group types inside a teacher workspace. Preserve group invitation preview, explicit guardian consent and teacher approval. Do not add name search or direct child binding.

- [ ] **Step 4: Update fixtures to activate a teacher instead of seeding a school**

Make `createIdentityScenario` issue a test activation code as a platform actor, activate the teacher, and create the group within the resulting workspace. Keep `children[1]` out of a claimed invitation in one dedicated sibling test.

- [ ] **Step 5: Run identity suite**

Run: `npm test -- --run tests/identity/teacher-workspace.test.ts tests/identity/invitations.test.ts tests/identity/permissions.test.ts`  
Expected: PASS; parent selects a child before claiming, approval remains required, and another teacher cannot inspect or mutate the workspace.

- [ ] **Step 6: Commit**

```bash
git add src/application/identity-service.ts src/application/invitation-service.ts src/application/presentation-service.ts tests/helpers/identity-scenario.ts tests/identity/teacher-workspace.test.ts tests/identity/invitations.test.ts
git commit -m "feat: support teacher-owned learning groups"
```

## Task 4: Preserve task-source images and constrain submission evidence

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `src/application/task-service.ts`
- Modify: `src/application/media-service.ts`
- Modify: `src/application/core-api.ts`
- Modify: `miniprogram/services/upload-evidence.ts`
- Test: `tests/media/task-source-images.test.ts`
- Test: `tests/media/evidence.test.ts`
- Test: `tests/tasks/publication.test.ts`

**Interfaces:**
- Consumes: active `MediaAsset` values with `purpose: "TASK_SOURCE"` or `"SUBMISSION_EVIDENCE"`.
- Produces: `Task.sourceAssetIds: readonly string[]`; task publication accepts `sourceAssetIds`.

- [ ] **Step 1: Write failing attachment boundary tests**

```ts
await expect(tasks.publishFamilyTask(guardian, { ...input, sourceAssetIds: [otherAsset.id] }))
  .rejects.toMatchObject({ code: "FORBIDDEN" });
await expect(tasks.publishFamilyTask(guardian, { ...input, sourceAssetIds: fourIds }))
  .rejects.toMatchObject({ code: "INVALID_INPUT" });
expect((await tasks.publishGroupTask(teacher, validInput)).sourceAssetIds).toEqual([asset.id]);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/media/task-source-images.test.ts tests/tasks/publication.test.ts`  
Expected: FAIL because `Task` has no source image references.

- [ ] **Step 3: Implement owned-task image attachment validation**

Add `sourceAssetIds` to `Task`. In `MediaService`, add `assertTaskSourceAssets(actor, ownerScope, assetIds)` which requires `ACTIVE`, `TASK_SOURCE`, at most three IDs, the matching family/organization scope and the publisher as uploader. Call it from both task publication methods before the publication transaction. Reject arbitrary file IDs and cross-family/cross-workspace assets.

- [ ] **Step 4: Align evidence limits and retention**

Keep byte-level validation in `uploadContent`; make the client helper accept only JPG/PNG/WebP under 1 MB and create each submission attachment with 90-day retention. Enforce the maximum of three evidence asset IDs in `SubmissionService` and retain its reviewer/guardian-only read check.

- [ ] **Step 5: Run task and media suites**

Run: `npm test -- --run tests/media/task-source-images.test.ts tests/media/evidence.test.ts tests/media/verified-upload.test.ts tests/tasks/publication.test.ts`  
Expected: PASS; images remain private, size/type/count checks occur server-side, and authorized reviewers can read only their assignment evidence.

- [ ] **Step 6: Commit**

```bash
git add src/domain/model.ts src/application/task-service.ts src/application/media-service.ts src/application/core-api.ts miniprogram/services/upload-evidence.ts tests/media/task-source-images.test.ts tests/media/evidence.test.ts tests/tasks/publication.test.ts
git commit -m "feat: attach private images to tasks and submissions"
```

## Task 5: Define the AI Gateway, provider contract and audit records

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `src/application/ports.ts`
- Create: `src/application/ai-gateway.ts`
- Modify: `src/application/media-service.ts`
- Modify: `src/infrastructure/collections.ts`
- Test: `tests/application/ai-gateway.test.ts`
- Test: `tests/media/drafts.test.ts`

**Interfaces:**
- Consumes: `MediaAsset`, `ActorContext`, `MediaStorage.read`, `TaskDraftProvider.generateTaskDraft`.
- Produces: `AiInvocation` audit record and normalized `RecognizedTaskFields` for `TaskDraft`.

- [ ] **Step 1: Write failing authorization, circuit-breaker and non-publication tests**

```ts
await expect(gateway.generateTaskDraft(child, { assetId, requestId })).rejects.toMatchObject({
  code: "FORBIDDEN",
});
await expect(gateway.generateTaskDraft(teacher, { assetId, requestId })).rejects.toMatchObject({
  code: "FEATURE_DISABLED",
});
expect(await repository.query("tasks", { draftId: draft.id })).toHaveLength(0);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/application/ai-gateway.test.ts tests/media/drafts.test.ts`  
Expected: FAIL because no gateway or invocation record exists.

- [ ] **Step 3: Replace the storage-key OCR contract with byte-safe provider input**

```ts
export interface TaskDraftProvider {
  generateTaskDraft(input: {
    readonly image: Uint8Array;
    readonly mimeType: MediaAsset["mimeType"];
    readonly requestId: string;
  }): Promise<RecognizedTaskFields>;
}

export interface MediaStorage {
  read(fileId: string): Promise<Uint8Array>;
  // existing upload, downloadUrl, createUploadUrl and delete members
}
```

Implement `AiGateway.generateTaskDraft` to authorize the source asset, reject a disabled global `AI_TASK_DRAFT_ENABLED` circuit breaker, read private bytes, invoke the provider, normalize `category` to the declared task enum, save a minimal `AiInvocation`, and return an editable draft. Store only input SHA-256 and counts in the invocation; never persist image bytes or base64.

- [ ] **Step 4: Route `RECOGNIZE_TASK_DRAFT` through the gateway**

Keep `MediaService.recognizeTaskDraft` as the action-facing method, but inject `AiGateway` and ask it for fields. Preserve the existing `EDIT_TASK_DRAFT` and `PUBLISH_TASK_DRAFT` gates so a generated draft cannot publish itself.

- [ ] **Step 5: Verify gateway behavior**

Run: `npm test -- --run tests/application/ai-gateway.test.ts tests/media/drafts.test.ts tests/media/evidence.test.ts`  
Expected: PASS; only authorized publishers can invoke drafting, all results are auditable drafts, and a circuit break returns `FEATURE_DISABLED` while manual task publishing still works.

- [ ] **Step 6: Commit**

```bash
git add src/domain/model.ts src/application/ports.ts src/application/ai-gateway.ts src/application/media-service.ts src/infrastructure/collections.ts tests/application/ai-gateway.test.ts tests/media/drafts.test.ts
git commit -m "feat: add audited AI task draft gateway"
```

## Task 6: Implement the DeepSeek task-draft adapter and safe runtime configuration

**Files:**
- Create: `src/infrastructure/deepseek-task-draft-provider.ts`
- Modify: `src/infrastructure/cloud-media-storage.ts`
- Modify: `cloudfunctions/coreApi/index.ts`
- Modify: `cloudfunctions/coreApi/package.json`
- Modify: `cloudfunctions/coreApi/package-lock.json`
- Modify: `scripts/build-deployment.mjs`
- Test: `tests/infrastructure/deepseek-task-draft-provider.test.ts`
- Test: `tests/api/cloudbase-adapter.test.ts`

**Interfaces:**
- Consumes: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `AI_TASK_DRAFT_ENABLED`.
- Produces: `DeepSeekTaskDraftProvider implements TaskDraftProvider` and `CloudMediaStorage.read(fileId)`.

- [ ] **Step 1: Write a failing HTTP adapter test with a mocked fetch**

```ts
const result = await provider.generateTaskDraft({
  image: jpegBytes,
  mimeType: "image/jpeg",
  requestId: "ai-draft-001",
});
expect(fetch).toHaveBeenCalledWith(
  "https://api.deepseek.com/chat/completions",
  expect.objectContaining({ method: "POST" }),
);
expect(result).toMatchObject({ provider: "deepseek", title: "完成数学练习" });
```

- [ ] **Step 2: Run the provider test to verify it fails**

Run: `npm test -- --run tests/infrastructure/deepseek-task-draft-provider.test.ts`  
Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement strict JSON generation and error mapping**

Send `deepseek-flash` a `user` message with the base64 data URL and a fixed Chinese prompt requiring exactly one JSON object with `title`, `description`, `category`, `startsAt`, `dueAt`, `submissionMode`, and `confidence`. Parse only JSON, cap response size, validate allowed enum values and map malformed responses, HTTP failures and timeouts to `DomainError("CONFLICT", "图片暂时无法生成任务草稿，请手动填写")`. Do not log authorization headers, prompt image data or model response bodies.

- [ ] **Step 4: Read CloudBase content privately**

Extend the narrow `CloudStorage` interface with `downloadFile({ fileID })`; implement `CloudMediaStorage.read` only after validating the `cloud://.../task-checkin/...` file ID with existing `requireOwnPath`. Extend fakes with deterministic byte content. Do not obtain a public temp URL for the AI request.

- [ ] **Step 5: Wire environment variables without printing secrets**

Create the provider only when `DEEPSEEK_API_KEY` is nonempty. Otherwise inject an unavailable provider that causes the manual-entry fallback. Pass `AI_TASK_DRAFT_ENABLED !== "false"` into `AiGateway`. Update the deployment manifest documentation to list variable names only; never emit their values into `dist/deploy/manifest.json`.

- [ ] **Step 6: Verify adapter, cloud storage and package lock**

Run: `npm test -- --run tests/infrastructure/deepseek-task-draft-provider.test.ts tests/api/cloudbase-adapter.test.ts`  
Expected: PASS; private bytes are used, response JSON is normalized, and missing/failed credentials do not block manual entry.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/deepseek-task-draft-provider.ts src/infrastructure/cloud-media-storage.ts cloudfunctions/coreApi/index.ts cloudfunctions/coreApi/package.json cloudfunctions/coreApi/package-lock.json scripts/build-deployment.mjs tests/infrastructure/deepseek-task-draft-provider.test.ts tests/api/cloudbase-adapter.test.ts
git commit -m "feat: configure DeepSeek task draft provider"
```

## Task 7: Implement teacher activation, workspace and group Mini Program flows

**Files:**
- Create: `miniprogram/pages/teacher/activation/index.ts`
- Create: `miniprogram/pages/teacher/activation/index.wxml`
- Create: `miniprogram/pages/teacher/activation/index.wxss`
- Create: `miniprogram/pages/teacher/activation/index.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/shared/role-switcher/index.ts`
- Modify: `miniprogram/pages/teacher/groups/index.ts`
- Modify: `miniprogram/pages/teacher/groups/index.wxml`
- Test: `tests/miniprogram/teacher-activation.test.ts`
- Test: `tests/miniprogram/teacher-pages.test.ts`

**Interfaces:**
- Consumes: `ACTIVATE_TEACHER_WORKSPACE`, `CREATE_GROUP`, `GET_GROUP_WORKSPACE` commands.
- Produces: a teacher onboarding path that ends at a selected teacher-owned group.

- [ ] **Step 1: Write failing page-runtime tests**

```ts
expect(teacherRolePaths).toContain("/pages/teacher/activation/index");
await page.submitActivation();
expect(command).toHaveBeenCalledWith("ACTIVATE_TEACHER_WORKSPACE", {
  code: "ABCD-EFGH",
  workspaceName: "王老师的学习小组",
});
```

- [ ] **Step 2: Run the focused Mini Program test to verify it fails**

Run: `npm test -- --run tests/miniprogram/teacher-activation.test.ts`  
Expected: FAIL because no activation page or command flow exists.

- [ ] **Step 3: Add onboarding and multi-group creation**

When the account has no teacher workspace, the teacher home routes to activation. After activation, the teacher group page lists workspace groups and exposes “新建分组”; it calls `CREATE_GROUP` with `type: "LEARNING_GROUP"`, selects the result via existing `teacher-runtime`, and then enables the existing members/invitation flow. Never expose issuance or revocation UI.

- [ ] **Step 4: Restrict visible role choices**

Show the teacher choice only when `GET_ACCOUNT_SHELL` reports an activated teacher workspace or always route it to activation; do not add platform, institution, provider or commercial role links. Keep child and parent choices tied to active guardian links.

- [ ] **Step 5: Verify Mini Program flow**

Run: `npm test -- --run tests/miniprogram/teacher-activation.test.ts tests/miniprogram/teacher-pages.test.ts tests/miniprogram/manifest.test.ts`  
Expected: PASS; a new teacher cannot create a group before activation and an activated teacher can create/select more than one group.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/teacher/activation miniprogram/pages/shared/role-switcher/index.ts miniprogram/pages/teacher/groups tests/miniprogram/teacher-activation.test.ts tests/miniprogram/teacher-pages.test.ts tests/miniprogram/manifest.test.ts
git commit -m "feat: add teacher activation and group onboarding"
```

## Task 8: Make group joining explicitly child-first in the parent UI

**Files:**
- Modify: `miniprogram/pages/parent/groups/index.ts`
- Modify: `miniprogram/pages/parent/groups/index.wxml`
- Modify: `miniprogram/pages/shared/invitation/index.ts`
- Modify: `miniprogram/pages/shared/invitation/index.wxml`
- Test: `tests/miniprogram/parent-group-join.test.ts`
- Test: `tests/miniprogram/live-group-pages.test.ts`

**Interfaces:**
- Consumes: `selectedFamily()`, explicit `childId`, `PREVIEW_GROUP_INVITATION`, `CLAIM_INVITATION`.
- Produces: a pending request linked to exactly the child selected on the page.

- [ ] **Step 1: Write failing child-picker tests**

```ts
await page.chooseChild({ currentTarget: { dataset: { childId: childB.id } } });
await page.claim();
expect(command).toHaveBeenCalledWith("CLAIM_INVITATION", expect.objectContaining({ childId: childB.id }));
expect(command).not.toHaveBeenCalledWith("CLAIM_INVITATION", expect.objectContaining({ childId: childA.id }));
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run tests/miniprogram/parent-group-join.test.ts`  
Expected: FAIL because the invitation page silently uses the globally selected child.

- [ ] **Step 3: Pass a deliberate child selection through navigation**

Render all active family children in the parent groups page. Require one selected `childId` before navigating to the invitation page, pass it as a query parameter, validate it again through `selectedFamily()` on load, and use that `childId` in preview/claim. Do not allow child mode to open this route.

- [ ] **Step 4: Preserve consent and approval states**

Show invitation group name, teacher/workspace display name, expiry and disclosure choices before `CLAIM_INVITATION`. After submission, display `PENDING_APPROVAL`; only `APPROVE_JOIN_REQUEST` creates membership.

- [ ] **Step 5: Verify parent join behavior**

Run: `npm test -- --run tests/miniprogram/parent-group-join.test.ts tests/miniprogram/live-group-pages.test.ts tests/identity/invitations.test.ts`  
Expected: PASS; a parent with multiple children can request access for only the chosen child and no request bypasses teacher approval.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/parent/groups miniprogram/pages/shared/invitation tests/miniprogram/parent-group-join.test.ts tests/miniprogram/live-group-pages.test.ts
git commit -m "feat: require child selection for group joining"
```

## Task 9: Wire default-on task-image drafts and image attachments into both editors

**Files:**
- Modify: `miniprogram/services/upload-evidence.ts`
- Create: `miniprogram/services/upload-task-source.ts`
- Modify: `miniprogram/pages/parent/task-editor/index.ts`
- Modify: `miniprogram/pages/parent/task-editor/index.wxml`
- Modify: `miniprogram/pages/teacher/task-editor/index.ts`
- Modify: `miniprogram/pages/teacher/task-editor/index.wxml`
- Test: `tests/miniprogram/task-draft-flow.test.ts`
- Test: `tests/miniprogram/upload-evidence.test.ts`

**Interfaces:**
- Consumes: `CREATE_UPLOAD_INTENT`, `UPLOAD_MEDIA_CONTENT`, `RECOGNIZE_TASK_DRAFT`, `EDIT_TASK_DRAFT`, `PUBLISH_TASK_DRAFT`.
- Produces: manual task payloads with `sourceAssetIds` and reviewed AI drafts only.

- [ ] **Step 1: Write failing parent and teacher editor tests**

```ts
await page.recognizePhoto();
expect(command).toHaveBeenCalledWith("RECOGNIZE_TASK_DRAFT", { assetId: "task-source-1" });
expect(page.data.title).toBe("完成数学练习");
expect(command).not.toHaveBeenCalledWith("PUBLISH_TASK_DRAFT", expect.anything());
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run tests/miniprogram/task-draft-flow.test.ts`  
Expected: FAIL because both editors only show a placeholder toast.

- [ ] **Step 3: Add a shared private source-image uploader**

Implement `uploadTaskSource(client, ownerScope, base64)` by reusing byte/MIME validation, setting `purpose: "TASK_SOURCE"`, `retentionDays: 90`, then performing `CREATE_UPLOAD_INTENT` and `UPLOAD_MEDIA_CONTENT`. Parent calls it with its family scope; teacher calls it with the selected teacher group organization scope. Keep selected asset IDs in page data and limit to three.

- [ ] **Step 4: Turn photo recognition into draft editing, never direct publishing**

After source upload, call `RECOGNIZE_TASK_DRAFT`. Apply returned fields to editor controls, show confidence as advisory copy, and keep the user on the editor. On Publish, call `EDIT_TASK_DRAFT` with current fields then `PUBLISH_TASK_DRAFT`, or call the normal publish action for manual tasks; both paths include `sourceAssetIds`. If recognition fails, show the server message and keep all editable controls usable.

- [ ] **Step 5: Verify page behavior and image validation**

Run: `npm test -- --run tests/miniprogram/task-draft-flow.test.ts tests/miniprogram/upload-evidence.test.ts tests/media/drafts.test.ts`  
Expected: PASS; the AI path is visible by default to authorized publishers, photo failure falls back to manual entry, and no generated result bypasses user confirmation.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/services/upload-task-source.ts miniprogram/services/upload-evidence.ts miniprogram/pages/parent/task-editor miniprogram/pages/teacher/task-editor tests/miniprogram/task-draft-flow.test.ts tests/miniprogram/upload-evidence.test.ts
git commit -m "feat: generate editable task drafts from images"
```

## Task 10: Retain only MVP navigation and verify task-source-specific reviews

**Files:**
- Modify: `miniprogram/presentation/page-models.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/child/today/index.ts`
- Modify: `miniprogram/pages/parent/home/index.ts`
- Modify: `miniprogram/pages/teacher/home/index.ts`
- Modify: `src/application/review-service.ts`
- Test: `tests/miniprogram/mvp-navigation.test.ts`
- Test: `tests/rewards/idempotency.test.ts`
- Test: `tests/rewards/reviews.test.ts`

**Interfaces:**
- Consumes: source type on `Task`, reviewer role and `MvpPolicy`.
- Produces: source-labelled tasks and exactly one reward ledger record after the authorized review.

- [ ] **Step 1: Write failing navigation and reward-source tests**

```ts
expect(buildNavigation("parent", "home").items.map((item) => item.path)).not.toContain(
  "/pages/parent/wishes/index",
);
await reviews.academicReview(teacher, approvedInput);
expect(await repository.query("sunlightLedgers", { referenceId: assignment.id })).toHaveLength(1);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/miniprogram/mvp-navigation.test.ts tests/rewards/reviews.test.ts tests/rewards/idempotency.test.ts`  
Expected: FAIL because legacy menus remain visible and group approval does not yet follow the MVP reward rule.

- [ ] **Step 3: Hide legacy navigation and preserve server denial**

Remove wishes, commercial/provider/platform/institution, exports and advanced group-tree links from MVP navigation and route entry points. Keep only pages required by the spec in `app.json`, or make each retained legacy route immediately redirect to a permitted parent/teacher/child page. The service policy from Task 1 remains the authority boundary.

- [ ] **Step 4: Make reviewer and reward source explicit**

In `ReviewService`, retain family review for `FAMILY` tasks and academic review for group tasks. On the first approved group review, call the existing idempotent `SunlightService` with the relevant family defaults; repeat approval returns the original result without another ledger entry. Reject family review of a group task and academic review of a family task.

- [ ] **Step 5: Verify MVP navigation and rewards**

Run: `npm test -- --run tests/miniprogram/mvp-navigation.test.ts tests/rewards/reviews.test.ts tests/rewards/idempotency.test.ts tests/application/mvp-policy.test.ts`  
Expected: PASS; unsupported pages/actions are unavailable, and each approved assignment has one reward record.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/presentation/page-models.ts miniprogram/app.json miniprogram/pages/child/today/index.ts miniprogram/pages/parent/home/index.ts miniprogram/pages/teacher/home/index.ts src/application/review-service.ts tests/miniprogram/mvp-navigation.test.ts tests/rewards/reviews.test.ts tests/rewards/idempotency.test.ts
git commit -m "feat: finalize MVP navigation and review rewards"
```

## Task 11: Produce deployment safety checks and run the full local verification suite

**Files:**
- Modify: `docs/runbooks/cloudbase-release.md`
- Modify: `docs/privacy/child-data-boundary.md`
- Create: `docs/verification/2026-09-19-child-teacher-ai-mvp.md`
- Test: `tests/acceptance/child-teacher-ai-mvp.test.ts`

**Interfaces:**
- Consumes: built deployment manifest, confirmed AppID/environment, configured secret names.
- Produces: a reproducible manual acceptance checklist with no credentials recorded.

- [ ] **Step 1: Write an end-to-end acceptance test that fails before all slices land**

```ts
it("keeps sibling data private through activation, join, image task and review", async () => {
  // activated teacher -> group -> child A application -> approval -> image task
  // child A submits -> teacher approves once; child B has no task or AI record
});
```

- [ ] **Step 2: Run the acceptance test to verify it fails**

Run: `npm test -- --run tests/acceptance/child-teacher-ai-mvp.test.ts`  
Expected: FAIL until identity, media, gateway and review slices are complete.

- [ ] **Step 3: Document the exact release gates**

Update the runbook to require: target AppID confirmation; owner confirmation of the CloudBase environment; collection/index dry run only for `task_checkin_*`; private storage verification under `task-checkin/`; `ALLOWED_CALLER_APPIDS`, `PRODUCT_EDITION`, `AI_TASK_DRAFT_ENABLED` and secret-name presence checks; a physical-device image upload/read test; a controlled DeepSeek draft test; and the manual fallback test. State that the runbook never prints `DEEPSEEK_API_KEY` or changes other applications' permissions.

- [ ] **Step 4: Document data handling and future consent boundary**

State that task drafting uses publisher-provided task images and is default-on, while future learning summaries/evaluation/recommendations require a guardian per-child switch. Describe the 90-day image retention, deletion path, private access rules and the absence of automatic grading/reward.

- [ ] **Step 5: Run all local quality gates**

Run: `npm test -- --run`  
Expected: PASS.

Run: `npm run typecheck`  
Expected: PASS.

Run: `npm run lint && npm run format:check && npm run build:deploy`  
Expected: PASS; deployment artifact is built locally only and no cloud resource is changed.

- [ ] **Step 6: Commit**

```bash
git add docs/runbooks/cloudbase-release.md docs/privacy/child-data-boundary.md docs/verification/2026-09-19-child-teacher-ai-mvp.md tests/acceptance/child-teacher-ai-mvp.test.ts
git commit -m "docs: add child teacher AI MVP release gates"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1 and 10 cover server/client feature hiding; Tasks 2–3 cover activation, workspaces and invitations; Tasks 4 and 9 cover private task/submission images; Tasks 5–6 cover the provider-neutral AI foundation and DeepSeek; Task 11 covers privacy, release safety and end-to-end acceptance. Future summaries and auto-evaluation remain intentionally unimplemented but their consent/configuration boundary is specified in Tasks 5 and 11.
- **Scope:** The eleven tasks map to the three independently verifiable slices from the spec. Task 1 is required before UI hiding; Tasks 2–4 form the collaboration/evidence baseline; Tasks 5–9 add the first AI scenario; Tasks 10–11 harden and verify the release.
- **Placeholder scan:** The plan contains no deferred implementation placeholders. Each future-only AI capability is explicitly excluded from code scope while its interface and consent constraint are defined.
- **Type consistency:** `MvpPolicy`, `TeacherActivationService`, `AiGateway`, `TaskDraftProvider`, `TeacherActivationCode`, `AiInvocation`, `sourceAssetIds`, `ACTIVATE_TEACHER_WORKSPACE`, and `AI_TASK_DRAFT_ENABLED` are named consistently in their producing and consuming tasks.
