# Task 5 report: parent / teacher entry only

## Status

Completed.

## Changed files

- `miniprogram/pages/bootstrap/index.ts`
- `miniprogram/pages/bootstrap/index.wxml`
- `miniprogram/pages/shared/role-switcher/index.ts`
- `tests/miniprogram/navigation-ui.test.ts`

## Choices and account semantics

- Bootstrap visibly offers only **家长** and **教师／助教**. The child choice, label, and child-home destination were removed.
- Both capabilities are derived from one `accountShell(true)` response for the already authenticated account. This task neither creates an account nor reads, writes, or duplicates a `userId`; changing capability only changes the destination.
- A guardian-linked child makes the parent capability operational and routes directly to `/pages/parent/home/index`. An account that also has a `TEACHER_WORKSPACE` simultaneously exposes the teacher capability and routes it to `/pages/teacher/home/index`.
- A parent without a guardian-linked child reaches the existing recoverable family/add-child setup. A teacher without an active workspace reaches the existing teacher activation page. Eligible parent and teacher paths bypass those recovery screens.
- The role switcher now generates only parent, teacher, or recoverable onboarding entries from the same account shell. It rejects arbitrary destinations instead of forwarding them unchanged.

## Legacy behavior

- A stale bootstrap `child` role event and a stale child-path event from the role switcher redirect to `/pages/parent/home/index?legacy=child`; neither issues an account-shell request for the stale bootstrap event nor targets a child page.
- This complements Task 4's existing registered-page and missing-page child deep-link recovery. No manifest, child page, server, CloudBase, deployment, or `project.config.json` change was made.

## Tests and results

- Focused: `npm test -- --reporter=dot tests/miniprogram/navigation-ui.test.ts tests/miniprogram/legacy-child-deep-link.test.ts tests/miniprogram/manifest.test.ts tests/miniprogram/child-task-source.test.ts` — PASS, 4 files / 17 tests.
- Full: `npm test -- --reporter=dot` — PASS, 99 files / 521 tests.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- Focused `npx biome check` and `git diff --check` — PASS.

## Commit

- `fcc48ed2db963ffb5a8a597ec32ffaa6b09e4567` — `feat: limit mobile entry to parent and teacher`

## Concerns

- Automated tests verify page registration and navigation logic, not WeChat DevTools rendering, local-history lifecycle behavior, or real authenticated CloudBase relationships. Those remain manual validation boundaries.
- The pre-existing unstaged `project.config.json` modification was preserved and excluded from this task.
