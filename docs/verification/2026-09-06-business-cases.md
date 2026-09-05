# 成长果园业务验收用例报告

> 交付日期：2026-09-06
>
> 本地执行日期：2026-09-05（Asia/Shanghai）
>
> 验证对象：`feature/growth-orchard-business`

## 1. 结论

本地业务与页面验收结果：**PASS**。

- 根工程 53 个测试文件、190 个自动化用例全部通过；Web 工程 7 个测试文件、10 个自动化用例全部通过，无失败、跳过或待办用例。
- 总覆盖率：语句 93.10%、分支 86.31%、函数 96.28%、行 93.18%。
- 应用层覆盖率：语句 92.71%、分支 85.20%、函数 95.93%、行 92.81%。
- 领域层覆盖率：语句 97.29%、分支 94.28%、函数 100%、行 97.24%。
- 格式、静态检查、严格 TypeScript 类型检查、根工程构建、Web 测试与 Web 生产构建均通过。

这表示业务、原生页面结构、Web 页面和同构预览已经通过本地自动化与视觉验收；不表示 CloudBase 生产环境、小程序开发者工具/真机、真实 OCR/存储服务或正式 Web 身份已经验收。相关项目列在第 6 节。

## 2. 端到端业务验收

下列用例全部通过统一 `coreApi` 命令边界和真实内存事务仓库执行，不绕过到服务内部直接写数据。

| 用例 ID | 场景与关键断言 | 自动化证据 | 结果 |
|---|---|---|---|
| AC-FAMILY-001 | 家长创建家庭和孩子，发布 3 个任务；孩子逐项提交、家长审核，准确获得 6 阳光；新手苹果树成熟并采摘；水果只在家庭内关联愿望 | `tests/acceptance/family-orchard.test.ts` | PASS |
| AC-ORG-001 | 家长同意邀请、教师审批入组；分组任务自动分发并进入今日任务；学习审核与家庭奖励状态独立；个人阳光和分组贡献各只产生一次；机构投影不含 `childId` | `tests/acceptance/institution-collaboration.test.ts` | PASS |
| AC-ORG-002 | 其他机构无法读取成员；家长撤销后停止机构访问和新任务接收，同时个人果园资产完整保留 | `tests/acceptance/institution-collaboration.test.ts` | PASS |
| AC-MEDIA-001 | 成人上传照片并 OCR 后只得到可编辑草稿；未经成人确认不会自动发布，确认后才形成任务 | `tests/acceptance/media-governance.test.ts` | PASS |
| AC-MEDIA-002 | 作业证据按角色和空间授权读取；到期资产触发存储删除并记录删除状态 | `tests/acceptance/media-governance.test.ts` | PASS |
| AC-GOV-001 | 客服默认无法读取儿童内容；只有精确范围、带工单且未过期的临时授权可读取，并留下审计 | `tests/acceptance/commercial-boundaries.test.ts` | PASS |
| AC-COMM-001 | 套餐配额重复请求只计费一次；第三方内容方只能查看自己的模板和工作区 | `tests/acceptance/commercial-boundaries.test.ts` | PASS |

## 3. 模块验证矩阵

| 能力 | 已验证内容 | 主要测试文件 | 结果 |
|---|---|---|---|
| 时间与公共契约 | 上海日历、晚发布规则、安全错误结果、严格请求标识 | `tests/shared/time.test.ts`, `tests/shared/result.test.ts` | PASS |
| 事务与集合 | 事务回滚、唯一记录、只追加限制、41 集合与索引清单 | `tests/shared/repository.test.ts`, `tests/api/cloudbase-adapter.test.ts` | PASS |
| 身份与租户 | 家庭/机构平行空间、多角色、分组角色、监护授权、跨租户拒绝 | `tests/identity/identity.test.ts`, `tests/identity/permissions.test.ts` | PASS |
| 邀请与退出 | 过期/消耗邀请、披露同意、教师审批、席位认领、撤销与匿名化 | `tests/identity/invitations.test.ts`, `tests/identity/withdrawal.test.ts` | PASS |
| 任务发布 | 模板归档、家庭/分组发布、成员扇出、孩子实例隔离、取消 | `tests/tasks/schedule.test.ts`, `tests/tasks/publication.test.ts`, `tests/tasks/isolation.test.ts` | PASS |
| 今日重点 | 自动必做、未来任务、家庭重点、额外挑战、请假/取消、18:00 后规则 | `tests/tasks/today.test.ts` | PASS |
| 提交和订正 | 提交版本、重复提交、补充证据、请假、订正完成、到期回流事件 | `tests/tasks/submissions.test.ts`, `tests/application/workflow-boundaries.test.ts` | PASS |
| 双状态审核 | 家庭审核、教师学习审核、自动奖励、需订正、不追回已入账阳光 | `tests/rewards/reviews.test.ts` | PASS |
| 阳光账本 | 正数、来源可追溯、幂等发放、不可变、溢出进度不丢失 | `tests/rewards/sunlight.test.ts`, `tests/rewards/idempotency.test.ts` | PASS |
| 个人果园 | 目录阈值、快速树成长、阶段变化、命名、成熟、采摘和收藏 | `tests/orchard/growth.test.ts`, `tests/orchard/harvest.test.ts` | PASS |
| 家庭愿望 | 创建/更新/归档、果实关联/解除/兑现、教师和机构不可见 | `tests/wishes/wishes.test.ts`, `tests/wishes/privacy.test.ts` | PASS |
| 分组共育 | 教师首次通过时贡献、家庭任务不贡献、幂等、集体进度和隐私 | `tests/orchard/group-tree.test.ts`, `tests/orchard/group-privacy.test.ts` | PASS |
| 媒体与 OCR 草稿 | 上传意图、归属/可见范围、编辑后发布、证据读取、保存期限与删除 | `tests/media/drafts.test.ts`, `tests/media/evidence.test.ts`, `tests/media/retention.test.ts` | PASS |
| 治理与导出 | 临时客服授权、过期/撤销、审计、家庭/机构导出申请和审批 | `tests/governance/support-access.test.ts`, `tests/governance/exports.test.ts` | PASS |
| 商业能力 | 套餐、权益开关、配额、幂等计量、第三方注册/模板/租户隔离 | `tests/governance/entitlements.test.ts`, `tests/governance/providers.test.ts` | PASS |
| 云函数 API | 63 个动作白名单、可信 OPENID、孩子/内容方/平台身份、错误脱敏、回执重放 | `tests/api/contracts.test.ts`, `tests/api/authorization.test.ts` | PASS |
| 小程序页面 | 27 个原生路由、五类页面状态、低/高年级密度、最小触控尺寸与资源完整性 | `tests/miniprogram/*.test.ts`, `tests/presentation/assets.test.ts` | PASS |
| Web 页面 | 机构、平台、内容方与三类移动预览路由、主交互、键盘焦点和异常状态 | `admin-web/src/**/*.test.tsx` | PASS |
| UI 解耦 | 统一调用客户端、角色会话、ViewModel 和设计令牌不承载业务规则 | `tests/api/client-boundary.test.ts`, `tests/api/session.test.ts` | PASS |
| 视觉对照 | 与确认稿同视口并排比较，修复全部 P0/P1/P2；代表性成人和桌面页面通过 | `design-qa.md`, `artifacts/design-qa/` | PASS |
| 异常边界 | 非法状态、空值、重复操作、越权、配额和输入边界 | `tests/domain/boundaries.test.ts`, `tests/application/*.test.ts` | PASS |

## 4. 规格章节覆盖

| 规格章节 | 实现落点 | 验证或边界 |
|---|---|---|
| 2. 核心原则 | `src/domain`, `src/application` | 家庭、机构、阳光、隐私和禁用能力测试 |
| 3. 空间与身份 | `identity-service.ts`, `policy.ts`, `view-models.ts` | 身份、权限和机构投影测试 |
| 4. 邀请、授权与退出 | `invitation-service.ts` | 邀请、席位、同意、审批和退出测试 |
| 5. 任务模型 | `tasks.ts`, `task-service.ts` | 周期、模板、发布扇出和实例隔离测试 |
| 6. 今日重点 | `task-service.ts`, `view-models.ts` | 今日、未来、重点、挑战和晚发布测试 |
| 7. 提交与双状态审核 | `submission-service.ts`, `review-service.ts` | 提交版本、家庭/学业审核与订正测试 |
| 8. 阳光账本 | `rewards.ts`, `sunlight-service.ts` | 正数、不可变、幂等、资格保护和回流事件测试 |
| 9. 个人成长果园 | `orchard.ts`, `orchard-service.ts` | 阈值、阶段、溢出、成熟、命名和采摘测试 |
| 10. 分组共育 | `group-orchard.ts`, `group-orchard-service.ts` | 一次贡献、无排名、集体进度和纪念测试 |
| 11. 权限矩阵 | `policy.ts` 及各应用服务 | 监护、教师、助教、机构、平台和内容方越权测试 |
| 12. 数据与服务架构 | `ports.ts`, 两个仓库、`core-api.ts` | 事务、41 集合、63 动作、可信身份和 CloudBase 合约测试 |
| 13. UI 解耦 | `miniprogram`, `admin-web`, `view-models`, `theme` | 客户端边界、会话、路由、交互、状态和视觉验收 |
| 14. 隐私、安全与治理 | `media-service.ts`, `governance-service.ts` | 媒体、支持授权、审计、导出和本文档 |
| 15. 商业化预留 | `commercial-service.ts`, `entitlements.ts` | 套餐、配额、功能开关和内容方隔离测试 |
| 16. 分阶段实施 | 阶段 A-D 的服务与全角色页面均已实现 | 7 个业务端到端场景、全页面矩阵和视觉质检 |
| 17. 首个开发切片 | 家庭、任务、审核、阳光和果园服务 | AC-FAMILY-001 |
| 18. 验收标准 | 全部应用服务、ViewModel、原生页面与 Web 页面 | 第 2、3 节与全页面矩阵；真实部署/真机项列为 NOT RUN |
| 19. 不纳入范围 | 无好友、排名、聊天、交易、扣阳光等接口或模型 | 禁用能力审计和隐私边界文档 |
| 20. 后续确认事项 | 设计令牌和适配器端口保留 | UI、OCR/媒体、价格与内容规则明确列为外部门禁 |

## 5. 执行环境与命令

执行环境：macOS 26.3.1、Apple Silicon arm64、Node.js v25.8.0、npm 11.11.0、TypeScript 7.0.2、Vitest 4.1.11。

最终质量门命令：

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

覆盖率阈值由 `vitest.config.ts` 强制执行：全局四项不低于 85%，应用层分支不低于 85%，领域层四项不低于 90%。任何低于阈值的运行均以失败退出。

## 6. 尚未执行的外部验收

这些项目依赖外部环境、正式配置或待确认 UI，不能由本地自动化替代，因此状态为 **NOT RUN**，不是本地失败：

| 外部用例 ID | 待验证项目 | 进入条件 |
|---|---|---|
| EXT-CB-001 | 在真实 CloudBase 开发环境创建 41 个集合、唯一/查询索引并验证安全规则阻止客户端直连 | 提供开发环境 ID 并完成建库 |
| EXT-CB-002 | 真实云数据库并发下验证事务、唯一索引和相同 `requestId` 重放 | 部署云函数和代表性测试数据 |
| EXT-CB-003 | 验证生产日志不包含 OPENID、儿童资料、任务/愿望正文、媒体地址和完整请求体 | 接入实际云函数日志系统 |
| EXT-WX-001 | 微信开发者工具编译、登录授权、角色切换、网络失败重试和真机兼容 | 提供小程序 AppID、环境 ID 和体验版 |
| EXT-MEDIA-001 | 真实对象存储上传/下载/删除、OCR 识别质量、超时和供应商故障降级 | 确认 OCR 与存储供应方、保存期限 |
| EXT-EXPORT-001 | 审批后的实际导出文件生成、加密下载、过期失效和下载留痕 | 接入导出文件适配器与管理端 |
| EXT-SEC-001 | 云函数依赖供应链门禁 | `wx-server-sdk@4.0.2` 子包当前审计出现 1 个中危、5 个高危上游依赖问题；升级、替代或风险接受后复验 |
| EXT-UI-001 | 微信开发者工具与真机上的字体、安全区、低/高年级密度、触控和果树动效接受度 | 提供小程序 AppID、环境 ID 和体验版；本地同构视觉已 PASS |
| EXT-WEB-001 | 正式 Web 身份、History API 回退、会话过期和三个工作区的线上权限 | 提供 HTTPS 站点、认证服务和测试账号 |
| EXT-PAY-001 | 套餐支付、退款与真实内容方结算 | 确认支付/结算供应方和财务规则 |

## 7. 发布判断

- **完整产品本地交付：通过。** 已确认的主体架构、业务规则、原生页面、Web 后台和视觉风格具备自动化与截图证据。
- **CloudBase 开发环境部署：有条件可进入。** 需先配置集合、索引、安全规则和外部适配器。
- **生产发布：暂不通过。** 第 6 节的 CloudBase、微信真机、Web 身份、媒体、支付和供应链外部验收尚未执行。

上线步骤与回滚要求见[CloudBase 发布与回滚手册](../runbooks/cloudbase-release.md)，数据边界见[儿童数据与权限边界](../privacy/child-data-boundary.md)。
