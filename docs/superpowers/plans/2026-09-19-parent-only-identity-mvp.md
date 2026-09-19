# Parent-only identity MVP implementation plan

> **For implementation:** use `superpowers:executing-plans` (or subagent-driven development) and execute tasks in order. Preserve the existing resource, organization, media, transaction, invitation, and AI isolation rules.

**Goal:** Remove child as a login/runtime role. A person has one account (`userId`) and can be parent and/or teacher; a child is a parent-owned profile selected explicitly for every child-scoped action.

**Architecture:** Keep account authentication and guardian links. Client-side selection is only a convenience setting. Every child-scoped Core API command carries `childId`; server code resolves the caller to an account and verifies an active guardian link and the assignment/resource's child ownership before reading or changing data.

**Tech:** TypeScript Core API and services, WeChat Mini Program pages/services, Vitest.

## Global constraints

- Do not add a child login role, child PIN, or child home view.
- Do not accept a client-supplied account/user id as authority; CloudBase-authenticated account identity remains authoritative.
- Do not weaken existing assignment source binding, media ownership, organization membership, receipt/idempotency, transaction lifecycle, or AI Gateway controls.
- Do not migrate production data or alter CloudBase configuration. Legacy routes must fail safely or redirect without issuing child-mode commands.

## Task 1: Make account identity the only external actor identity

**Files:**
- Modify: `src/application/core-api.ts`
- Modify: `src/application/mvp-policy.ts`
- Modify: `src/application/core-api.test.ts`
- Modify: `src/application/mvp-policy.test.ts`

1. Change `CoreActorSelection` / `resolveActor` so public requests accept account, content-provider, and platform selections only. A `CHILD` selection must produce an explicit domain error, never an account-like context.
2. Leave the internal `ActorContext` union compile-compatible until Task 2 has converted every service. Do not make `CHILD` an available client selection during that transition.
3. Replace `CHILD_ACTIONS` feature gating with a policy that forbids child-mode requests and gives parent/teacher decisions from account relationships rather than a selected role.
4. Extend focused tests: a valid account resolves from auth; client `CHILD` is rejected; content-provider/platform behavior remains unchanged; unsupported/disallowed requests retain the same error contract.
5. Run `pnpm exec vitest run src/application/core-api.test.ts src/application/mvp-policy.test.ts`.

## Task 2: Require a guardian-authorized child target for child-scoped services

**Files:**
- Modify: `src/domain/model.ts`
- Modify: `src/application/submission-service.ts`
- Modify: `src/application/media-service.ts`
- Modify: `src/application/orchard-service.ts`
- Modify: `src/application/group-orchard-service.ts`
- Modify: `src/application/presentation-service.ts`
- Modify: `src/application/view-models.ts`
- Modify: `src/application/wish-service.ts`
- Modify: `src/application/identity-service.ts`
- Modify: `src/application/authorized-receipt.ts`
- Modify/add their existing focused tests

1. Introduce a small shared authorization helper that takes authenticated account identity plus `childId`, checks an active guardian link, and returns the canonical child scope. Keep it server-side and use it before all child reads/writes.
2. Change task detail, today, group, orchard, tree, wish, evidence upload/read, and presentation operations to receive this authorized scope rather than `actor.mode === "CHILD"`.
3. For assignment-specific commands, verify both guardian access to requested `childId` and that the assignment/submission belongs to the same child. Retain assignment-source checks on evidence media.
4. Update Core API payload wiring for `GET_CHILD_TODAY`, `GET_CHILD_GROUPS`, `GET_CHILD_ORCHARD`, task detail, tree mutations, wishes, and submission/media commands to pass `childId` explicitly.
5. Once all call sites compile, remove `CHILD` from `ActorContext` and remove successful child-mode branches. A repository search must show no production path that authenticates a child actor.
6. Add tests covering: authorized parent can operate one selected child; parent cannot read/write a different child; assigned resources cannot cross children; existing teacher/organization access remains unchanged.
7. Run the relevant service test files plus `pnpm typecheck`.

## Task 3: Make selected child an explicit parent-session context

**Files:**
- Modify: `miniprogram/services/session-runtime.ts`
- Modify: `miniprogram/store/session.ts`
- Modify: `miniprogram/services/core-client.ts` and/or child client helper modules
- Modify/add focused Mini Program service tests

1. Remove `RoleMode.CHILD`, `childClient`, and the `mode: "CHILD"` request construction.
2. Keep `selectedChildId` only for accounts with guardian-linked children. Never silently choose the first child when multiple children exist; require the parent UI to choose and show an empty-selection state.
3. Provide one account client for parent child-scoped requests, with a required `childId` payload helper. The helper must not invent authority from local storage.
4. Preserve a selected child only as a UX preference; on bootstrap refresh, clear it if the child no longer belongs to the account.
5. Add tests for no children, one child, multiple children without a selection, switching child, and stale selected-child cleanup.

## Task 4: Replace child routes with parent-operated child workflows

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/parent/home/index.ts`
- Modify: `miniprogram/pages/parent/home/index.wxml`
- Modify: `miniprogram/pages/parent/tasks/index.ts`
- Modify: `miniprogram/pages/parent/tasks/index.wxml`
- Modify: `miniprogram/pages/parent/orchard/index.ts`
- Modify: `miniprogram/pages/parent/orchard/index.wxml`
- Create/modify: parent task-detail and task-submit pages/styles as needed
- Modify: `miniprogram/pages/child/**` only to remove active behavior or provide safe redirect compatibility

1. In parent home/tasks, make the selected child visible in the page header and require selection before task, orchard, group, or submission navigation. Provide an understandable empty state when no child exists.
2. Route assignment detail to a parent-operated task-detail page, then to a parent task-submit page. Replace child-centric labels with “为孩子查看任务” and “为孩子提交完成情况”.
3. Use the selected child id in every page request/mutation. Parent task submission continues to use the existing three-image cap, private media policy, and AI image analysis pipeline.
4. Register only parent/teacher operational pages in `app.json`; unregister child home/task/submit/orchard/profile routes. If an old path is opened from local history, redirect to parent home with a safe notice rather than attempting a child-mode API call.
5. Adapt the existing parent orchard page to selected child scope and preserve reward/tree child-data isolation.
6. Add or update page/service tests for multi-child switching and parent task submission; manually compile in WeChat DevTools after automated validation.

## Task 5: Simplify entry and role switching to parent / teacher only

**Files:**
- Modify: `miniprogram/pages/bootstrap/index.ts`
- Modify: `miniprogram/pages/bootstrap/index.wxml`
- Modify: `miniprogram/components/role-switcher/**`
- Modify: `miniprogram/pages/bootstrap/index.test.ts` and relevant component tests

1. Remove “我是孩子” from entry and role switching.
2. Keep parent and teacher choices. A single account can surface both choices when its relationships permit; do not create a second account or duplicate `userId`.
3. Parent entry goes to parent home; teacher entry retains existing teacher organization/group checks and onboarding. If neither role is currently available, show the established recoverable onboarding state.
4. Update existing deep-link/legacy child role behavior to land safely in the parent flow or explain that child access is parent-operated.
5. Run focused bootstrap/component tests.

## Task 6: Regression gate, documentation, and DevTools validation

**Files:**
- Modify: `README.md` / project MVP documentation only where role instructions are stated
- Add/update: product/technical test documentation if present

1. Search for `mode: "CHILD"`, `RoleMode.CHILD`, `childClient`, and child-role labels. Remove production references or document only legacy-safe redirects; do not leave an active child actor path.
2. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
3. In WeChat DevTools, compile the current worktree and manually verify role entry, no-child/one-child/multi-child parent states, child switching, parent submission labels, teacher entry, tab switching, and page safe-area behavior. If a real cloud environment is unavailable, report the exact remote-data validation boundary rather than changing environment settings.
4. Update user-facing setup notes: AppID/environment selection remains a manual CloudBase console/DevTools operation; no function deployment is performed by this change.

## Plan review

- **Spec coverage:** parent/teacher-only identity, one `userId`, child profile-only model, explicit multi-child selection, parent-operated completion, child-role removal, server-side guardian authorization, no migration, legacy safe paths, and validation gates are all covered.
- **No placeholders:** every task names target areas, behavior, validation, and security constraints.
- **Type sequencing:** Task 1 closes public child selection while retaining temporary internal compile compatibility; Task 2 converts services before removing the `CHILD` union member.
