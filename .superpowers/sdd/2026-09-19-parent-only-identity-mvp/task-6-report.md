# Task 6 report — regression gate and MVP documentation

## Status

Complete for local regression and documentation. No WeChat DevTools, device, CloudBase environment, AppID, or cloud-function deployment operation was performed.

## Production identity scan

Initial scan covered `miniprogram`, `src`, and `cloudfunctions` source files (excluding tests, docs, generated output, and dependencies) for the former child actor surface. Fix round 1 expands the shipped-source boundary to include `admin-web/src`.

| Search | Result | Classification |
| --- | --- | --- |
| `mode: "CHILD"` | No production call or object literal | No active child actor construction remains. |
| `RoleMode.CHILD` | No match | No active enum-based child role remains. |
| exact `childClient` | No match | The removed child client is not imported or called. |
| `accountChildClient` | `miniprogram/services/session-runtime.ts` | Account-scoped helper only: it calls `AccountChildApiClient`, which uses the authenticated `ACCOUNT` context and an explicit selected `childId`; it is not a child actor. |
| `value.mode === "CHILD"` | `src/application/core-api.ts` | Deliberate legacy rejection: the server returns `孩子不能作为登录或请求身份`. |
| `memberType: "CHILD"` / `resourceType: "CHILD"` | Domain/application membership and child-profile records | Child data and organization memberships, not a login, route, or request identity. |

`miniprogram/app.json` registers only bootstrap/shared, parent, and teacher pages. Every retained file under `miniprogram/pages/child/*` contains no client/session/data request and redirects on show to `/pages/parent/home/index?legacy=child` with the safe notice `请由家长选择孩子后继续操作`. Bootstrap and the role switcher expose only 家长 and 教师／助教; stale child events/paths redirect to the same parent recovery path. Child mentions in bootstrap and invitations describe a profile, guardian consent, or selected target child rather than a user-visible child role.

## Documentation

Updated `README.md` only where the user-facing setup and role description had become stale:

- State that only parent and teacher/assistant are login/page entry actors; children remain profile data identified by `childId` and are operated by an authorized parent after selection.
- Describe the submission loop as parent-operated for the selected child and remove the old browser child-today preview from documented entry points.
- Correct the registered-page description to public/parent/teacher pages only.
- Clarify that AppID and CloudBase environment selection remain manual DevTools/CloudBase-console work; this MVP neither changes them nor deploys a cloud function.
- Clarify that `npm run build:deploy` builds local import artifacts only. Any `coreApi` deployment remains a manual release step.

No product/history documents were changed because their child references describe historical scope or child data rather than the current mini-program identity setup.

## Local validation

The repository has `package-lock.json` and npm script aliases, with no pnpm lockfile or pnpm-specific scripts. The initial validation used those npm aliases:

| Command | Result |
| --- | --- |
| `npm test -- --reporter=dot` | PASS — 99 files, 521 tests. |
| `npm run typecheck` | PASS — `tsc --noEmit`. |
| `npm run build` | PASS — `tsc -p tsconfig.build.json`. |
| `git diff --check` | PASS. |

The final source scan and README diff were self-reviewed. The pre-existing `project.config.json` missing-final-newline change remained unstaged and untouched.

## Commit

- `4c1655c4b9fe9e468fd86e8a549b371b0a435316` — `docs: clarify parent teacher MVP setup`

Only `README.md` and this report are included. The pre-existing `project.config.json` edit is not staged or committed.

## Limitations

The local checks do not prove WeChat DevTools compilation, WXML/WXSS rendering, safe-area behavior, real device flows, authenticated remote CloudBase data, guardian revocation in an environment, media/OCR providers, or cloud-function deployment. Those remain controller/manual validation boundaries; no remote configuration was changed here.

## Fix round 1/5 — browser preview and prescribed pnpm gate

### Resolution

The initial scan missed shipped `admin-web/src`: `AdminRouter` exposed `/preview/child-today`, which mounted `ChildTodayPreview` and allowed local task completion/submission state changes. This was an active browser child flow and is now removed.

- Deleted `admin-web/src/preview/child-today.tsx`, including its `去完成` and `确认提交` interaction.
- Replaced the old URL route with a non-interactive `<Navigate replace>` recovery to `/preview/parent-review` in `admin-web/src/app/router.tsx`.
- Updated `admin-web/src/preview/preview.test.tsx` to assert that the legacy URL renders the parent review view, exposes `确认完成`, and does not expose `确认提交`; its parent-review interaction test now verifies the parent confirmation feedback. Explicit `afterEach(cleanup)` keeps the two route renders isolated.
- Updated README: `/preview/child-today` is no longer a normal preview entry; the document states it redirects to parent review and retains no child browsing/submission flow.

### Expanded admin-web scan

Final `admin-web/src` scan finds no `ChildTodayPreview` source, no active `去完成`/`确认提交` task-submit UI, and no child submission state. The only child-today residuals are the intentional redirect route and its regression test. Other `孩子` text is profile/privacy content or a provider-isolation negative assertion, not an entry role or actor.

### Validation

`pnpm` is available at `/Users/qc/.nvm/versions/node/v24.15.0/bin/pnpm` (`10.33.3`), so the prescribed commands were run directly rather than substituted:

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — 99 files, 521 tests. |
| `pnpm typecheck` | PASS — `tsc --noEmit`. |
| `pnpm build` | PASS — `tsc -p tsconfig.build.json`. |
| `git diff --check` | PASS. |
| `pnpm --dir admin-web test -- preview.test.tsx` | PASS — 7 files, 11 tests. |
| `pnpm --dir admin-web typecheck` | PASS. |
| `pnpm --dir admin-web build` | PASS — Vite production build. |

The first admin test invocation correctly reported `vitest: command not found` because `admin-web/node_modules` was absent. `npm ci --prefix admin-web` installed the lockfile-resolved local dependencies, after which all admin validation commands above passed. Installation emitted non-fatal Node 23 engine warnings from dependencies that require Node 20.19, 22.12, or 24+; it did not alter tracked dependency files.

### Commit

- `8616553ecf6f3f45595748af25c160703941db0e` — `fix: remove browser child submission preview` (router, deleted interactive preview, regression test, README)

### Remaining limitations

The redirect is covered in the local React router test and production build only. It is not a WeChat DevTools, real-device, CloudBase, or deployment result; no external configuration was changed. The pre-existing `project.config.json` newline-only diff remains untouched and excluded.
