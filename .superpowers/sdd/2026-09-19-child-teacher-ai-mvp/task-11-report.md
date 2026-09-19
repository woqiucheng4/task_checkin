# Task 11 report — release gates

## 实现

- 新增本地端到端验收：激活教师、工作区/学习小组、仅 child A 入组并获批准、私有题图、本地 fake AI 草稿、child A 提交、教师重复批准仅产生一笔奖励；断言 child B 无任务、奖励、AI 操作或题图读取权限。
- `createIdentityScenario(childCount, joinedChildCount)` 仅增加可控的入组数量，默认行为保持原有“所有孩子入组”；该完整邀请/批准 fixture 要求 `joinedChildCount >= 1`，并有测试稳定拒绝 `0`。
- 发布手册改为人工发布前门禁：不声称真实 AppID、环境、owner、变量或部署已确认；限制 dry run 与变更范围；覆盖私有存储、变量名、真机、受控 DeepSeek 和手工回退。
- 隐私边界限定在当前 MVP：题图 AI 默认开启、原图私有、作业证据 90 天、成人审核后奖励；未来总结/评价/推荐需要逐 child guardian opt-in，当前未实现自动评分或奖励。

## 本地命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --run tests/acceptance/child-teacher-ai-mvp.test.ts` | PASS：1 文件、2 测试。 |
| `npm test -- --run` | PASS：84 文件、321 测试。 |
| `npm run typecheck` | PASS。 |
| `npm run lint` | PASS：266 文件，无修复。 |
| `npm run format:check` | FAIL：本任务格式化后仍有 15 个前置文件不符合 Biome 格式；未批量格式化无关文件。 |
| `npm run build:deploy` | PASS：本地构建 `taskCheckinCoreApi` 和 43 个隔离集合 manifest，`cloud configured: false`。 |
| `git diff --check` | PASS。 |

格式失败的前置文件：`cloudfunctions/coreApi/index.ts`、`miniprogram/pages/shared/invitation/index.ts`、`miniprogram/pages/shared/role-switcher/index.ts`、`miniprogram/services/teacher-runtime.ts`、`src/application/ai-gateway.ts`、`src/application/identity-service.ts`、`src/infrastructure/cloud-media-storage.ts`、`src/infrastructure/deepseek-task-draft-provider.ts`、`tests/application/ai-gateway.test.ts`、`tests/helpers/media-fakes.ts`、`tests/identity/teacher-workspace.test.ts`、`tests/infrastructure/deepseek-task-draft-provider.test.ts`、`tests/media/cloud-storage.test.ts`、`tests/miniprogram/parent-group-join.test.ts`、`tests/miniprogram/teacher-activation.test.ts`。初次检查为 17 个；仅修复本任务的 `tests/acceptance/child-teacher-ai-mvp.test.ts` 和 `tests/helpers/identity-scenario.ts` 后为 15 个。

## 未验证 / 未执行

- 未执行 CloudBase dry run、集合/索引/权限变更、部署、推送、真实 DeepSeek 调用或任何真实儿童图片上传。
- 未确认目标 AppID、CloudBase 环境 ID、环境 owner、远端变量、`DEEPSEEK_API_KEY` 或 `TASK_CHECKIN_CLOUD_FILE_AUTHORITIES`。
- 微信开发者工具、真机、受控 DeepSeek、AI 失败手工回退、生产日志脱敏和生产数据隔离均为 `NOT RUN`，须按发布手册由环境 owner 完成。
