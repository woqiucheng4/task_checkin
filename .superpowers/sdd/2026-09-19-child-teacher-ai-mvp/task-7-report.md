# Task 7 Report: Teacher activation and group onboarding

## Scope delivered

- Added the teacher workspace activation page and registered its route.
- Teacher home and the role switcher route accounts without a `TEACHER_WORKSPACE` to activation.
- Teacher group runtime now limits visible groups to the account's teacher workspace.
- The group page displays all workspace learning groups, supports selection, and creates `LEARNING_GROUP` groups before selecting the created result and opening the existing member/invitation flow.
- No activation-code issuance or revocation controls, and no platform, institution, provider, or commercial-role links, were added to the Mini Program.

## Test-first evidence

Initial command, before implementation:

```text
npm test -- --run tests/miniprogram/teacher-activation.test.ts
FAIL (3): activation page module was absent; group page had no createGroup runtime method.
```

Focused verification after implementation:

```text
npm test -- --run tests/miniprogram/teacher-activation.test.ts tests/miniprogram/teacher-pages.test.ts tests/miniprogram/manifest.test.ts tests/miniprogram/teacher-runtime.test.ts tests/miniprogram/live-teacher-pages.test.ts
PASS (5 files, 17 tests)
```

Final verification:

```text
npm test -- --run
PASS (80 files, 299 tests)
npm run typecheck
PASS
git diff --check
PASS
```

## Commit

`feat: add teacher activation and group onboarding` (the atomic commit containing this report)

## Residual risk

- These checks exercise the Mini Program page runtime with mocked `wx` and command responses. No actual WeChat client or Mini Program deployment was performed.
- Client-side workspace routing is only an onboarding guard. Authorization remains enforced by the server commands and policies implemented in earlier tasks.
