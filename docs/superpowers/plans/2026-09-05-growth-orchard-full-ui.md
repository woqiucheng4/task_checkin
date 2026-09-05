# Growth Orchard Full UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every approved child, parent, teacher, institution, platform, and content-provider page in the confirmed watercolor orchard style, connect each page to authenticated presentation APIs, and verify the finished mobile and desktop experiences visually and behaviorally.

**Architecture:** Keep the existing TypeScript domain and application services as the only source of business truth. Add page-specific, permission-scoped read models to `coreApi`; implement the high-frequency roles as native WeChat Mini Program pages and the management roles as a React/Vite desktop app. Both clients consume shared semantic design tokens and real API contracts, while local preview fixtures implement the same client interfaces for deterministic visual QA.

**Tech Stack:** TypeScript 7, Vitest 4, native WeChat Mini Program (WXML/WXSS), React 19.2, Vite 8.2, React Router 7.18, Testing Library, TDesign MiniProgram 1.16, TDesign React 1.18, TDesign Icons React 0.6, CloudBase `coreApi`, and ImageGen-produced raster assets. Version choices were checked against the npm registry on 2026-09-05.

**Spec:** `docs/superpowers/specs/2026-09-05-growth-orchard-full-ui-design.md`

## Global Constraints

- The exact selected visual source is `/Users/sophia/.codex/generated_images/01a067e5-d213-76c2-8f68-8cf18d7ec0d0/exec-dc35be47-db79-49e5-a552-d73b45b9a1ba.png`.
- Use warm paper backgrounds, watercolor fruit trees, forest green text, tomato-red primary actions, restrained cards, and generous whitespace.
- Do not use gradients, glassmorphism, emoji, CSS drawings, placeholder boxes, inline handcrafted SVG, or generic AI-style floating cards.
- Child, parent, teacher, and assistant experiences remain native Mini Program pages.
- Institution admin, platform operator, and content-provider experiences live in a desktop-oriented Web app.
- Pages consume client-safe view models and commands only; they never compute permissions, rewards, sunlight, tree growth, membership, or tenant scope.
- Organization-facing models never expose global `childId`; platform and content-provider projections never expose child content by default.
- Every primary CTA, tab, menu, filter, form, dialog, upload state, empty state, error state, and success state must work in local preview.
- Low-grade and high-grade density modes change presentation only, never business behavior.
- Existing 140 business tests must remain green throughout implementation.
- All generated raster assets must be cataloged, inspected, placed in the product, and licensed/owned for product use.
- Production CloudBase, Web authentication, OCR/storage providers, WeChat DevTools, and real-device checks remain explicit external gates until their environments are available.

---

## File Structure

```text
src/application/
  presentation-service.ts               # authenticated role and workspace page projections
  presentation-models.ts                # client-safe UI read models only
src/application/core-api.ts              # GET_* presentation actions
miniprogram/
  app.json                               # all mobile routes and tab shells
  app.wxss                               # paper background and global typography
  assets/orchard/*.png                   # generated watercolor orchard assets
  assets/icons/*                         # selected open-source line icons
  components/app-shell/*                 # page header, role and child switchers
  components/bottom-nav/*                # role-aware mobile navigation
  components/orchard-hero/*              # tree, sunlight progress, growth copy
  components/task-row/*                  # task source, state and CTA
  components/status-view/*               # loading, empty, error and success states
  presentation/page-models.ts            # pure mapping from API models to page data
  presentation/fixtures.ts               # deterministic local preview states
  pages/shared/role-switcher/*
  pages/shared/invitation/*
  pages/child/{today,task,submit,orchard,group,profile}/*
  pages/parent/{home,tasks,task-editor,reviews,review-detail,orchard,wishes,groups,profile}/*
  pages/teacher/{home,groups,tasks,task-editor,reviews,review-detail,group-tree,members,profile}/*
admin-web/
  index.html
  package.json
  vite.config.ts
  src/main.tsx
  src/app/router.tsx
  src/api/{types,client,fixture-client}.ts
  src/design/{tokens.css,global.css}
  src/assets/orchard/*.png
  src/components/{admin-shell,data-table,filter-bar,metric-summary,status-view}/*
  src/pages/institution/{dashboard,groups,tasks,reviews,members,analytics,exports,billing,settings}.tsx
  src/pages/platform/{dashboard,tenants,plans,providers,support,access,exports,audit,settings}.tsx
  src/pages/provider/{dashboard,templates,themes,assets,usage,settlement,settings}.tsx
  src/preview/child-today.tsx              # same-viewport visual reference harness
tests/presentation/*.test.ts
tests/miniprogram/{manifest,page-models,interactions}.test.ts
admin-web/src/**/*.test.tsx
design-qa.md
```

## Task 1: Add authenticated presentation read models

**Files:**
- Create: `src/application/presentation-models.ts`
- Create: `src/application/presentation-service.ts`
- Modify: `src/application/core-api.ts`
- Test: `tests/presentation/projections.test.ts`
- Test: `tests/presentation/privacy.test.ts`

**Interfaces:**
- Produces `AccountShellView`, `ParentDashboardView`, `ParentTaskCenterView`, `ReviewQueueView`, `TeacherDashboardView`, `GroupWorkspaceView`, `InstitutionDashboardView`, `PlatformDashboardView`, and `ProviderDashboardView`.
- Produces `PresentationService.accountShell`, `parentDashboard`, `parentTaskCenter`, `reviewQueue`, `teacherDashboard`, `groupWorkspace`, `institutionDashboard`, `platformDashboard`, and `providerDashboard`.
- Adds read actions `GET_ACCOUNT_SHELL`, `GET_PARENT_DASHBOARD`, `GET_PARENT_TASK_CENTER`, `GET_REVIEW_QUEUE`, `GET_TEACHER_DASHBOARD`, `GET_GROUP_WORKSPACE`, `GET_INSTITUTION_DASHBOARD`, `GET_PLATFORM_DASHBOARD`, and `GET_PROVIDER_DASHBOARD`.

- [ ] **Step 1: Write failing projection and privacy tests**

```ts
it("returns a parent dashboard containing all authorized child task sources", async () => {
  const view = await presentation.parentDashboard(seed.guardian, { childId: seed.child.id });
  expect(view.children[0]?.selected).toBe(true);
  expect(view.today.items.map((item) => item.source)).toEqual(["FAMILY", "ORGANIZATION"]);
});

it("never exposes childId or family wishes in an organization projection", async () => {
  const view = await presentation.groupWorkspace(seed.teacher, { groupId: seed.group.id });
  expect(JSON.stringify(view)).not.toMatch(/childId|wish/i);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/presentation`
Expected: FAIL because the presentation models and service do not exist.

- [ ] **Step 3: Implement the models and service**

Use existing repositories and `AccessPolicy` for every projection. Return display-ready labels, counts, dates, states, and organization member aliases, but no trusted permission flags that bypass the command layer.

- [ ] **Step 4: Route all nine read actions through `coreApi`**

Add the actions to `CORE_ACTIONS` and `CORE_READ_ACTIONS`. Require strings for selected IDs and derive actor identity from authenticated context exactly as current commands do.

- [ ] **Step 5: Run projection, API, and regression tests**

Run: `npm run typecheck && npm test -- tests/presentation tests/api && npm test`
Expected: PASS with every existing business test still green.

- [ ] **Step 6: Commit**

```bash
git add src/application tests/presentation tests/api
git commit -m "feat: add authenticated UI presentation models"
```

## Task 2: Establish shared visual tokens and asset manifest

**Files:**
- Create: `src/presentation/design-tokens.ts`
- Create: `src/presentation/asset-manifest.ts`
- Modify: `miniprogram/theme/tokens.ts`
- Create: `miniprogram/app.wxss`
- Create: `admin-web/src/design/tokens.css`
- Test: `tests/presentation/design-system.test.ts`

**Interfaces:**
- Produces `DESIGN_TOKENS`, `AGE_DENSITY`, `ORCHARD_ASSETS`, and `resolveOrchardAsset(key)`.
- Exports exact paper, ink, forest, leaf, tomato, sun, family-blue, divider, focus, spacing, type, radius, elevation, and motion values.

- [ ] **Step 1: Write the failing token contract test**

```ts
it("keeps the confirmed watercolor palette and both age densities", () => {
  expect(DESIGN_TOKENS.color).toMatchObject({ paper: "#FAF7EE", forest: "#174E2A", tomato: "#D93A22" });
  expect(Object.keys(AGE_DENSITY)).toEqual(["LOWER_PRIMARY", "UPPER_PRIMARY"]);
  expect(ORCHARD_ASSETS).toHaveProperty("apple.mature");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/presentation/design-system.test.ts`
Expected: FAIL because shared presentation tokens do not exist.

- [ ] **Step 3: Implement tokens and manifests**

Keep semantic names identical across TypeScript, WXSS, and CSS. The asset manifest must reject unknown keys instead of returning placeholders.

- [ ] **Step 4: Run tests and static checks**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test -- tests/presentation/design-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation miniprogram/theme miniprogram/app.wxss admin-web/src/design tests/presentation
git commit -m "feat: add watercolor orchard design tokens"
```

## Task 3: Produce and verify watercolor raster assets

**Files:**
- Create: `design-assets/source/*.png`
- Create: `miniprogram/assets/orchard/*.png`
- Create: `admin-web/src/assets/orchard/*.png`
- Create: `docs/design/asset-register.md`
- Test: `tests/presentation/assets.test.ts`

**Interfaces:**
- Produces individually generated and inspected assets for apple growth stages, pear/orange mature trees, watering hint, group tree, harvest, and empty/error scenes.
- Every file is referenced by `ORCHARD_ASSETS` with intended slot dimensions and alt text.

- [ ] **Step 1: Write the failing asset completeness test**

```ts
it.each(requiredAssetKeys)("ships a non-empty raster file for %s", (key) => {
  const path = resolveOrchardAsset(key);
  expect(statSync(path).size).toBeGreaterThan(10_000);
});
```

- [ ] **Step 2: Generate each asset from the confirmed reference style**

Use ImageGen with the selected screenshot as the art-direction reference. Generate separate assets for each listed slot, inspect every output, remove the uniform background when transparency is required, and preserve full-resolution sources.

- [ ] **Step 3: Register ownership and use**

Record generated date, source reference, output paths, intended component, dimensions, background handling, and “generated for this product” rights status in `docs/design/asset-register.md`.

- [ ] **Step 4: Run image and manifest verification**

Run: `npm test -- tests/presentation/assets.test.ts && npm run typecheck`
Expected: PASS with no missing or zero-byte assets.

- [ ] **Step 5: Commit**

```bash
git add design-assets miniprogram/assets admin-web/src/assets docs/design tests/presentation src/presentation/asset-manifest.ts
git commit -m "feat: add watercolor orchard illustration assets"
```

## Task 4: Build Mini Program shell and reusable components

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/bootstrap/*`
- Create: `miniprogram/components/app-shell/*`
- Create: `miniprogram/components/bottom-nav/*`
- Create: `miniprogram/components/orchard-hero/*`
- Create: `miniprogram/components/task-row/*`
- Create: `miniprogram/components/status-view/*`
- Create: `miniprogram/presentation/page-models.ts`
- Test: `tests/miniprogram/manifest.test.ts`
- Test: `tests/miniprogram/page-models.test.ts`

**Interfaces:**
- Produces role-aware page shells, navigation items, orchard hero states, task-row actions, and global loading/empty/error/success views.
- Produces pure builders `buildChildTodayPage`, `buildParentHomePage`, and `buildTeacherHomePage`.

- [ ] **Step 1: Write failing route and page-model tests**

```ts
it("registers every approved mobile page", () => {
  expect(readAppPages()).toEqual(expect.arrayContaining(REQUIRED_MOBILE_ROUTES));
});

it("maps protected submissions to a non-destructive status", () => {
  expect(buildTaskRow(protectedTask).action).toEqual({ kind: "STATUS", label: "待确认 · 阳光已保护" });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/miniprogram/manifest.test.ts tests/miniprogram/page-models.test.ts`
Expected: FAIL because the routes and components do not exist.

- [ ] **Step 3: Implement shared components and page builders**

Use WXML/WXSS components backed by plain serializable page data. Convert the existing bootstrap placeholder into a real role/workspace entry route. All click handlers emit navigation or command events; components do not calculate permissions or rewards.

- [ ] **Step 4: Run checks**

Run: `npm run typecheck && npm test -- tests/miniprogram`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/bootstrap miniprogram/components miniprogram/presentation tests/miniprogram
git commit -m "feat: add native mini program UI foundation"
```

## Task 5: Build all child pages and interactions

**Files:**
- Create: `miniprogram/pages/child/today/*`
- Create: `miniprogram/pages/child/task/*`
- Create: `miniprogram/pages/child/submit/*`
- Create: `miniprogram/pages/child/orchard/*`
- Create: `miniprogram/pages/child/group/*`
- Create: `miniprogram/pages/child/profile/*`
- Test: `tests/miniprogram/child-pages.test.ts`

**Interfaces:**
- Consumes `GET_CHILD_TODAY`, `GET_CHILD_ORCHARD`, `GET_GROUP_PROGRESS`, `SUBMIT_TASK`, `SUPPLEMENT_SUBMISSION`, `START_TREE`, `RENAME_TREE`, and `HARVEST_TREE`.
- Produces the complete child journey from today list through submit, protected state, revision, sunlight result, harvest, group progress, and settings.

- [ ] **Step 1: Write failing child-state tests**

```ts
it.each(["loading", "empty", "ready", "offline", "error"])("renders child today %s", (state) => {
  expect(buildChildTodayPage(childFixtures[state]).screenState).toBe(state);
});

it("submits the selected mode and shows protected sunlight", async () => {
  await childController.submit({ assignmentId: "a1", mode: "PHOTO", mediaAssetIds: ["m1"] });
  expect(childController.current().notice).toBe("已提交，阳光已保护");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/miniprogram/child-pages.test.ts`
Expected: FAIL because child routes and controllers are missing.

- [ ] **Step 3: Implement all six child routes**

Match the reference proportions on the today page. Use real generated assets and source/status labels; add working task CTA, submission mode, retry, harvest, next-tree, group tree, density switch, and role switch interactions.

- [ ] **Step 4: Run child and regression tests**

Run: `npm run typecheck && npm test -- tests/miniprogram tests/acceptance/family-orchard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/child tests/miniprogram
git commit -m "feat: build complete child mini program experience"
```

## Task 6: Build all parent pages and interactions

**Files:**
- Create: `miniprogram/pages/parent/home/*`
- Create: `miniprogram/pages/parent/tasks/*`
- Create: `miniprogram/pages/parent/task-editor/*`
- Create: `miniprogram/pages/parent/reviews/*`
- Create: `miniprogram/pages/parent/review-detail/*`
- Create: `miniprogram/pages/parent/orchard/*`
- Create: `miniprogram/pages/parent/wishes/*`
- Create: `miniprogram/pages/parent/groups/*`
- Create: `miniprogram/pages/parent/profile/*`
- Test: `tests/miniprogram/parent-pages.test.ts`

**Interfaces:**
- Consumes parent presentation reads and family task, review, focus, wish, invitation, withdrawal, and export commands.
- Produces multi-child switching, all-source task center, manual/template/photo draft task creation, review, orchard, wish, authorization, and settings flows.

- [ ] **Step 1: Write failing parent journey tests**

```ts
it("switches children without retaining the previous child task state", () => {
  expect(parentController.selectChild("child-b").selectedChildId).toBe("child-b");
  expect(parentController.current().taskItems.every((item) => item.childLabel === "小禾")).toBe(true);
});

it("keeps academic review separate from family sunlight confirmation", () => {
  expect(buildParentReviewPage(institutionSubmission).sections.map((section) => section.kind))
    .toEqual(["ACADEMIC_STATUS", "FAMILY_REWARD"]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/miniprogram/parent-pages.test.ts`
Expected: FAIL because parent pages do not exist.

- [ ] **Step 3: Implement all nine parent routes**

Provide functioning child switcher, review actions, task form validation, OCR draft confirmation, wish-fruit selection, invitation disclosure toggles, withdrawal confirmation, and export request status.

- [ ] **Step 4: Run parent, API, and acceptance tests**

Run: `npm run typecheck && npm test -- tests/miniprogram/parent-pages.test.ts tests/acceptance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/parent tests/miniprogram
git commit -m "feat: build complete parent mini program experience"
```

## Task 7: Build all teacher and assistant pages

**Files:**
- Create: `miniprogram/pages/teacher/home/*`
- Create: `miniprogram/pages/teacher/groups/*`
- Create: `miniprogram/pages/teacher/tasks/*`
- Create: `miniprogram/pages/teacher/task-editor/*`
- Create: `miniprogram/pages/teacher/reviews/*`
- Create: `miniprogram/pages/teacher/review-detail/*`
- Create: `miniprogram/pages/teacher/group-tree/*`
- Create: `miniprogram/pages/teacher/members/*`
- Create: `miniprogram/pages/teacher/profile/*`
- Create: `miniprogram/pages/shared/invitation/*`
- Create: `miniprogram/pages/shared/role-switcher/*`
- Test: `tests/miniprogram/teacher-pages.test.ts`

**Interfaces:**
- Consumes teacher dashboard/group presentation reads and publish, academic review, group tree, invitation, join approval, seat, and role commands.
- Produces teacher/assistant workbench, group switching, task drafting/publishing, submission review, members, invitations, group tree, and role switching.

- [ ] **Step 1: Write failing teacher journey tests**

```ts
it("orders the teacher workbench by review urgency", () => {
  expect(buildTeacherHomePage(queue).sections.map((item) => item.kind))
    .toEqual(["REVISION", "PENDING_REVIEW", "DUE_TODAY"]);
});

it("never renders contribution ranking data", () => {
  expect(JSON.stringify(buildGroupTreePage(groupView))).not.toMatch(/rank|contributor|childId/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/miniprogram/teacher-pages.test.ts`
Expected: FAIL because teacher pages do not exist.

- [ ] **Step 3: Implement all teacher/shared routes**

Use one shell with role-specific action availability supplied by presentation models. Teacher and assistant layouts stay identical; unsupported actions are absent rather than client-authorized.

- [ ] **Step 4: Run teacher and institution acceptance tests**

Run: `npm run typecheck && npm test -- tests/miniprogram/teacher-pages.test.ts tests/acceptance/institution-collaboration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/teacher miniprogram/pages/shared tests/miniprogram
git commit -m "feat: build teacher and assistant mini program experience"
```

## Task 8: Create the Web admin foundation

**Files:**
- Create: `admin-web/package.json`
- Create: `admin-web/index.html`
- Create: `admin-web/vite.config.ts`
- Create: `admin-web/src/main.tsx`
- Create: `admin-web/src/app/router.tsx`
- Create: `admin-web/src/api/types.ts`
- Create: `admin-web/src/api/client.ts`
- Create: `admin-web/src/api/fixture-client.ts`
- Create: `admin-web/src/design/global.css`
- Create: `admin-web/src/components/admin-shell/*`
- Create: `admin-web/src/components/data-table/*`
- Create: `admin-web/src/components/filter-bar/*`
- Create: `admin-web/src/components/metric-summary/*`
- Create: `admin-web/src/components/status-view/*`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Test: `admin-web/src/app/router.test.tsx`

**Interfaces:**
- Produces `AdminApiClient`, a deterministic `FixtureAdminApiClient`, protected role routes, desktop shell, table/filter/metric/status primitives, and `npm run admin:dev|admin:build|admin:test`.

- [ ] **Step 1: Write failing shell and route tests**

```tsx
it.each(["institution", "platform", "provider"])("opens the %s workspace", async (role) => {
  renderAdminAt(`/${role}`);
  expect(await screen.findByTestId(`${role}-workspace`)).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run admin:test -- router.test.tsx`
Expected: FAIL because the Web app does not exist.

- [ ] **Step 3: Scaffold the React/Vite app and shared components**

Use React Router role roots, semantic CSS variables, a fixed desktop sidebar, responsive main content, accessible focus states, and fixture/API dependency injection. Do not add production credentials or bypass authentication.

- [ ] **Step 4: Run Web and root checks**

Run: `npm run admin:test && npm run admin:build && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web package.json package-lock.json tsconfig.json
git commit -m "feat: add orchard web administration foundation"
```

## Task 9: Build all institution administration pages

**Files:**
- Create: `admin-web/src/pages/institution/dashboard.tsx`
- Create: `admin-web/src/pages/institution/groups.tsx`
- Create: `admin-web/src/pages/institution/tasks.tsx`
- Create: `admin-web/src/pages/institution/reviews.tsx`
- Create: `admin-web/src/pages/institution/members.tsx`
- Create: `admin-web/src/pages/institution/analytics.tsx`
- Create: `admin-web/src/pages/institution/exports.tsx`
- Create: `admin-web/src/pages/institution/billing.tsx`
- Create: `admin-web/src/pages/institution/settings.tsx`
- Test: `admin-web/src/pages/institution/institution.test.tsx`

**Interfaces:**
- Consumes `GET_INSTITUTION_DASHBOARD`, `GET_GROUP_WORKSPACE`, export, entitlement, quota, group, seat, and role commands.
- Produces nine distinct institution routes with working filters, pagination, dialogs, batch selections, permission states, and export approval status.

- [ ] **Step 1: Write failing route behavior tests**

```tsx
it("filters groups and opens the member drawer", async () => {
  renderAdminAt("/institution/groups");
  await user.type(screen.getByRole("searchbox"), "三年级");
  expect(screen.getByText("三年级一班")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查看成员" }));
  expect(screen.getByRole("dialog", { name: "分组成员" })).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run admin:test -- institution.test.tsx`
Expected: FAIL because the institution routes are missing.

- [ ] **Step 3: Implement the nine institution pages**

Use compact watercolor accents only in summaries and empty states. Tables expose organization member aliases, never global child IDs or family-private information.

- [ ] **Step 4: Run institution UI and privacy tests**

Run: `npm run admin:test -- institution.test.tsx && npm test -- tests/presentation/privacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/institution admin-web/src/app/router.tsx
git commit -m "feat: build institution administration pages"
```

## Task 10: Build all platform operations pages

**Files:**
- Create: `admin-web/src/pages/platform/dashboard.tsx`
- Create: `admin-web/src/pages/platform/tenants.tsx`
- Create: `admin-web/src/pages/platform/plans.tsx`
- Create: `admin-web/src/pages/platform/providers.tsx`
- Create: `admin-web/src/pages/platform/support.tsx`
- Create: `admin-web/src/pages/platform/access.tsx`
- Create: `admin-web/src/pages/platform/exports.tsx`
- Create: `admin-web/src/pages/platform/audit.tsx`
- Create: `admin-web/src/pages/platform/settings.tsx`
- Test: `admin-web/src/pages/platform/platform.test.tsx`

**Interfaces:**
- Consumes platform presentation reads and plan, support access, export approval, and provider commands.
- Produces nine platform routes with default-redacted child content, scoped access grant forms, expiry/revoke actions, audit timeline, and tenant/plan management.

- [ ] **Step 1: Write failing governance UI tests**

```tsx
it("blocks child content until an exact support grant is active", async () => {
  renderAdminAt("/platform/support/ticket-001");
  expect(screen.getByText("尚未获得儿童内容访问权限")).toBeVisible();
  expect(screen.queryByText("任务正文")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run admin:test -- platform.test.tsx`
Expected: FAIL because platform routes are missing.

- [ ] **Step 3: Implement the nine platform pages**

Keep sensitive values masked in tables and dialogs. Access requests require ticket, resource type, resource IDs, purpose, and expiry before submit.

- [ ] **Step 4: Run platform and governance acceptance tests**

Run: `npm run admin:test -- platform.test.tsx && npm test -- tests/acceptance/commercial-boundaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/platform admin-web/src/app/router.tsx
git commit -m "feat: build platform operations pages"
```

## Task 11: Build all content-provider pages

**Files:**
- Create: `admin-web/src/pages/provider/dashboard.tsx`
- Create: `admin-web/src/pages/provider/templates.tsx`
- Create: `admin-web/src/pages/provider/themes.tsx`
- Create: `admin-web/src/pages/provider/assets.tsx`
- Create: `admin-web/src/pages/provider/usage.tsx`
- Create: `admin-web/src/pages/provider/settlement.tsx`
- Create: `admin-web/src/pages/provider/settings.tsx`
- Test: `admin-web/src/pages/provider/provider.test.tsx`

**Interfaces:**
- Consumes provider dashboard/workspace reads and provider template commands.
- Produces seven content-provider routes with template editing, theme/asset catalog, usage summaries, settlement information, and no child/family entry points.

- [ ] **Step 1: Write failing provider isolation test**

```tsx
it("contains no child, family, submission, or wish navigation", () => {
  renderAdminAt("/provider");
  expect(screen.queryByText(/孩子|家庭|提交记录|愿望/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run admin:test -- provider.test.tsx`
Expected: FAIL because provider routes are missing.

- [ ] **Step 3: Implement the seven provider pages**

Template forms expose only provider-owned content fields. Usage and settlement fixtures contain aggregate template metrics, never raw child events.

- [ ] **Step 4: Run provider and commercial tests**

Run: `npm run admin:test -- provider.test.tsx && npm test -- tests/governance/providers.test.ts tests/acceptance/commercial-boundaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/provider admin-web/src/app/router.tsx
git commit -m "feat: build content provider administration pages"
```

## Task 12: Add mobile visual preview and primary interaction demo

**Files:**
- Create: `admin-web/src/preview/child-today.tsx`
- Create: `admin-web/src/preview/mobile-shell.tsx`
- Create: `admin-web/src/preview/parent-review.tsx`
- Create: `admin-web/src/preview/teacher-home.tsx`
- Modify: `admin-web/src/app/router.tsx`
- Test: `admin-web/src/preview/preview.test.tsx`

**Interfaces:**
- Produces `/preview/child-today`, `/preview/parent-review`, and `/preview/teacher-home` using the same semantic tokens, image assets, copy, fixtures, and interaction states as the native pages.

- [ ] **Step 1: Write failing preview interaction tests**

```tsx
it("moves a child task from ready to protected after submission", async () => {
  renderAdminAt("/preview/child-today");
  await user.click(screen.getAllByRole("button", { name: "去完成" })[0]);
  await user.click(screen.getByRole("button", { name: "确认提交" }));
  expect(screen.getByText("待确认 · 阳光已保护")).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run admin:test -- preview.test.tsx`
Expected: FAIL because preview routes are missing.

- [ ] **Step 3: Implement preview routes and interactions**

Match the selected 853×1851 reference viewport for child today, preserve desktop browser scroll behavior, and keep all primary controls functional.

- [ ] **Step 4: Run preview tests and build**

Run: `npm run admin:test -- preview.test.tsx && npm run admin:build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/preview admin-web/src/app/router.tsx
git commit -m "feat: add verified mobile UI preview routes"
```

## Task 13: Complete accessibility, error states, and age density

**Files:**
- Modify: all Mini Program and Web page/component files created in Tasks 4–12
- Create: `tests/miniprogram/accessibility.test.ts`
- Create: `admin-web/src/accessibility.test.tsx`
- Create: `admin-web/src/error-states.test.tsx`

**Interfaces:**
- Produces keyboard/focus behavior, semantic labels, minimum mobile target sizing, non-color status labels, reduced-motion support, lower/upper primary density, and complete loading/empty/offline/error/success states.

- [ ] **Step 1: Write failing accessibility and state coverage tests**

```ts
it("keeps every mobile primary target at least 88rpx", () => {
  expect(scanPrimaryTargetSizes()).toEqual([]);
});
```

```tsx
it("allows keyboard navigation through the admin sidebar and dialog", async () => {
  renderAdminAt("/institution/groups");
  await user.tab();
  expect(screen.getByRole("link", { name: "工作台" })).toHaveFocus();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/miniprogram/accessibility.test.ts && npm run admin:test -- accessibility.test.tsx error-states.test.tsx`
Expected: FAIL on missing states or accessibility contracts.

- [ ] **Step 3: Implement all missing states and both age modes**

Use static feedback when reduced motion is enabled. Keep state copy actionable and free of internal error details.

- [ ] **Step 4: Run complete client test suites**

Run: `npm test -- tests/miniprogram tests/presentation && npm run admin:test && npm run admin:build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram admin-web tests/miniprogram tests/presentation
git commit -m "feat: complete UI states age modes and accessibility"
```

## Task 14: Run visual QA against the selected reference

**Files:**
- Create: `design-qa.md`
- Create: `docs/verification/2026-09-06-ui-pages.md`
- Modify: UI files and assets required to resolve P0/P1/P2 findings

**Interfaces:**
- Produces same-viewport reference/prototype captures, severity-ranked findings, a final `passed` result, and a full page verification matrix.

- [ ] **Step 1: Start the local Web preview**

Run: `npm run admin:dev -- --host 0.0.0.0 --port 4173 --strictPort`
Expected: Vite serves the admin and preview routes without console errors.

- [ ] **Step 2: Capture matching visual states**

Open the exact selected reference and `/preview/child-today` at 853×1851. Capture institution, platform, provider, parent review, and teacher workbench representative states at their intended viewports.

- [ ] **Step 3: Compare reference and implementation together**

Record fidelity, spacing, asset crop, typography, color, icon, interaction, responsive, and accessibility findings in `design-qa.md`. Set `final result: failed` until every P0/P1/P2 item is fixed.

- [ ] **Step 4: Fix P0/P1/P2 and repeat capture**

Repeat browser inspection and comparison until `design-qa.md` contains `final result: passed`. Leave only optional P3 polish notes.

- [ ] **Step 5: Write the page verification matrix**

For every registered Mini Program and Web route, record role, page, loading/empty/ready/error coverage, primary interaction, automated test, visual capture status, and external-device gate.

- [ ] **Step 6: Commit**

```bash
git add design-qa.md docs/verification miniprogram admin-web
git commit -m "test: pass full UI visual and page acceptance"
```

## Task 15: Run final full-product verification

**Files:**
- Modify: `README.md`
- Modify: `docs/runbooks/cloudbase-release.md`
- Modify: `docs/verification/2026-09-06-business-cases.md`
- Modify: `docs/verification/2026-09-06-ui-pages.md`

**Interfaces:**
- Produces an exact final verification record and run instructions for native Mini Program, Web admin, preview, CloudBase gates, and dependency security.

- [ ] **Step 1: Update entry documentation**

Document every role route, `admin:dev`, `admin:test`, `admin:build`, Mini Program import path, asset register, design QA, and external deployment requirements.

- [ ] **Step 2: Run the complete clean gate**

Run:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run admin:test
npm run admin:build
git diff --check
npm audit --omit=dev
```

Expected: every command exits 0, all business and UI tests pass, no skipped/todo tests exist, coverage thresholds hold, and the root dependency audit reports zero known vulnerabilities.

- [ ] **Step 3: Verify page and asset completeness**

Run:

```bash
npm test -- tests/miniprogram/manifest.test.ts tests/presentation/assets.test.ts
rg -n "TODO|FIXME|TBD|\\b(it|test|describe)\\.skip\\(|\\b(it|test)\\.todo\\(" src tests miniprogram admin-web
```

Expected: route/asset tests pass and the search returns no matches.

- [ ] **Step 4: Record external gates honestly**

List real CloudBase/Web authentication, WeChat DevTools, real device, real OCR/storage, production logs, and cloud-function dependency audit as `NOT RUN` until those exact environments are exercised.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/runbooks docs/verification
git commit -m "docs: publish complete UI verification results"
```

## Final Completion Audit

- [ ] Every page named in specification sections 5.1–5.6 exists as a registered native or Web route.
- [ ] Every page uses the confirmed paper, forest, tomato, typography, spacing, icon, and watercolor illustration system.
- [ ] Every primary CTA and main workflow is interactive and has automated behavioral evidence.
- [ ] Every route has loading, empty, ready, error, permission, and success coverage where applicable.
- [ ] All organization views omit global `childId` and family wishes.
- [ ] Platform child content remains redacted until a valid scoped support grant exists.
- [ ] Provider navigation and data contain no child, family, submission, media, or wish access.
- [ ] Low- and high-grade modes preserve behavior while changing density and copy.
- [ ] No business rule is duplicated in WXML, WXSS, React components, or fixture clients.
- [ ] Every asset manifest entry resolves to an inspected non-placeholder file used by at least one component.
- [ ] `design-qa.md` exists and says `final result: passed` after same-state visual comparison.
- [ ] The full page matrix and clean verification gate reflect the exact final checkout.
- [ ] Production-only checks remain `NOT RUN` unless verified in their real environment.
- [ ] Use `superpowers:finishing-a-development-branch` before offering merge, PR, or keep-branch options.
