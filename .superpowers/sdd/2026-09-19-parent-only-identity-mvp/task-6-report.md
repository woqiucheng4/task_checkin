# Task 6 report — regression gate and MVP documentation

## Status

Complete for local regression and documentation. No WeChat DevTools, device, CloudBase environment, AppID, or cloud-function deployment operation was performed.

## Production identity scan

Scanned `miniprogram`, `src`, and `cloudfunctions` source files (excluding tests, docs, generated output, and dependencies) for the former child actor surface.

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
- Describe the submission loop as parent-operated for the selected child and mark the browser child-today URL as a historical visual preview, not a child login entry.
- Correct the registered-page description to public/parent/teacher pages only.
- Clarify that AppID and CloudBase environment selection remain manual DevTools/CloudBase-console work; this MVP neither changes them nor deploys a cloud function.
- Clarify that `npm run build:deploy` builds local import artifacts only. Any `coreApi` deployment remains a manual release step.

No product/history documents were changed because their child references describe historical scope or child data rather than the current mini-program identity setup.

## Local validation

The repository has `package-lock.json` and npm script aliases, with no pnpm lockfile or pnpm-specific scripts. The required validation commands were therefore run through the proved npm aliases:

| Command | Result |
| --- | --- |
| `npm test -- --reporter=dot` | PASS — 99 files, 521 tests. |
| `npm run typecheck` | PASS — `tsc --noEmit`. |
| `npm run build` | PASS — `tsc -p tsconfig.build.json`. |
| `git diff --check` | PASS. |

The final source scan and README diff were self-reviewed. The pre-existing `project.config.json` missing-final-newline change remained unstaged and untouched.

## Commit

- `docs: clarify parent teacher MVP setup`

Only `README.md` and this report are included. The pre-existing `project.config.json` edit is not staged or committed.

## Limitations

The local checks do not prove WeChat DevTools compilation, WXML/WXSS rendering, safe-area behavior, real device flows, authenticated remote CloudBase data, guardian revocation in an environment, media/OCR providers, or cloud-function deployment. Those remain controller/manual validation boundaries; no remote configuration was changed here.
