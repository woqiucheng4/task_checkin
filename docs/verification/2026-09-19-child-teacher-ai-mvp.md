# 孩子—老师协作 AI MVP 验证记录

日期：2026-09-19

## 本地已验证

| 项目 | 证据 |
| --- | --- |
| 端到端 sibling 隔离 | `tests/acceptance/child-teacher-ai-mvp.test.ts` 用内存仓储和本地 fake storage/provider 验证教师激活、工作区/分组、仅 child A 入组、私有题图、可编辑 AI 草稿、child A 提交、教师单次批准与奖励；child B 无任务、奖励、AI 操作和图片读取权限。 |
| 全量自动化/静态质量门 | 以本次工作树实际命令输出为准，见 Task 11 报告。 |
| 本地部署工件 | `npm run build:deploy` 只构建本地 manifest 与函数工件；不代表远端资源已创建或配置。 |
| AI 编辑器竞态与字段 | 延迟 Promise 回归复现过 `RECOGNIZE → PUBLISH_FAMILY → PUBLISH_DRAFT` 双发；修复后识别与发布互斥、发布字段/目标/来源快照固定。验证四种提交方式的 WXML 绑定到 state/payload，以及 AI 开始时间回填和修改。 |
| AI 成本保险丝 | 本地事务仓储验证并发多实例、跨成人全局限额、每账号上限、默认/非法/零限额、跨日、同 requestId 并发/完成/失败重试、输入失败脱敏和 API DI。成功失败均保留追加审计，失败不退额。 |
| 发布 secret 门禁 | 构建产物要求 `TEACHER_ACTIVATION_PEPPER` 名称，列出两个 AI 日限额配置名称；不生成 secret 值。轮换使未消费激活码失效的影响已写入 runbook。 |

## 云端、真机和生产：未验证

以下均为 `NOT RUN`，不能由 mock、单元测试或本地构建替代：目标 AppID 与 CloudBase 环境/owner 确认、集合/索引/权限 dry run、`task-checkin/` 私有存储规则、环境变量和 secret 配置、CloudBase 部署、微信开发者工具、真机题图上传/读取、受控 DeepSeek 草稿、AI 失败手工回退、生产日志脱敏和生产数据隔离。

发布前需要由环境 owner 使用测试账号完成：教师激活并创建分组；家长选择 child A 入组、教师批准；上传合规测试题图；child A 提交且教师仅批准一次；验证 child B 无任务、AI、奖励及题图读取；在真机完成相同步骤；进行一次受控 DeepSeek 草稿和一次 AI 不可用时的手工发布回退。

本记录不宣称真实云资源、AppID、环境 owner 或任何密钥已经确认。
