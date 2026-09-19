# 成长果园业务平台

面向小学生、家长、学校与辅导机构的任务协作和正向成长激励平台。当前 MVP 只允许家长和教师／助教作为微信登录与页面入口；孩子保留独立业务档案和 `childId`，由已授权家长在选中孩子后代表其操作。当前分支已经完成业务主体、微信小程序页面、机构/平台/内容方 Web 后台和同构浏览器预览。UI 全面采用已确认的暖纸、水彩果树、墨绿与番茄红视觉体系。

## 核心闭环

`成人布置任务 → 家长代表所选孩子提交完成情况 → 家长/教师按权限审核 → 阳光入账 → 果树成长 → 成熟采摘 → 水果收藏或关联家庭愿望`

机构任务还会在教师首次确认完成时，为所属分组的共育果树生成一次幂等贡献；不会扣除孩子个人阳光，也不展示孩子排名。

## 已实现范围

- 家庭、机构两个平行一级空间；机构下的分组、教师与助教角色。
- 多孩子、多监护人、邀请/认领/审批/撤销授权，以及机构内匿名成员编号。
- 家庭与分组任务、模板、周期、独立任务实例、今日重点、提交、补交与免除。
- 机构任务的学习审核和家庭奖励双状态；已提交任务的奖励资格保护。
- 只增不减、可追溯且幂等的阳光账本。
- 个人果树成长、溢出阳光接续、成熟采摘、果园收藏和家庭私密愿望。
- 分组共育果树、集体进度和纪念成果，不含公开比较。
- 受控媒体上传、OCR 可编辑草稿、作业证据、访问范围和到期删除。
- 客服临时授权、数据导出审批、套餐权益、配额和第三方内容隔离。
- 统一 `coreApi` 云函数边界：运行时微信身份鉴权、动作白名单、写命令幂等回执和安全错误结构。
- 原生微信小程序调用客户端、会话状态、页面 ViewModel、家长/教师入口与设计令牌；孩子不是客户端角色。
- 机构管理、平台运营和第三方内容服务方三个隔离的 Web 工作区。
- 家长为所选孩子查看任务、家长审核和教师工作台同构浏览器预览，便于在没有微信开发者工具时验收视觉和主交互。

## 目录

```text
src/domain/                  领域规则与不可变约束
src/application/             业务服务、权限、命令路由与 ViewModel
src/infrastructure/          内存事务仓库与 CloudBase 仓库适配器
cloudfunctions/coreApi/      云函数入口和独立运行时依赖
miniprogram/                 原生小程序客户端、页面、组件与主题
admin-web/                   机构、平台、内容方后台与移动同构预览
artifacts/design-qa/         最终设计对照与代表性页面截图
tests/                       单元、契约、边界和端到端业务验收测试
docs/                        规格、架构、隐私、发布与验证文档
```

## 本地页面预览

安装依赖并启动 Web：

```bash
npm ci
npm run admin:dev -- --host 127.0.0.1 --port 4173 --strictPort
```

常用入口：

- 家长审核：`http://127.0.0.1:4173/preview/parent-review`
- 教师工作台：`http://127.0.0.1:4173/preview/teacher-home`
- 机构管理：`http://127.0.0.1:4173/institution`
- 平台运营：`http://127.0.0.1:4173/platform`
- 内容服务方：`http://127.0.0.1:4173/provider`

旧的 `/preview/child-today` 地址会重定向到家长审核预览，不保留孩子独立查看任务或提交完成情况的浏览器流程。

Web 测试、类型检查和生产构建：

```bash
npm run admin:test
npm --prefix admin-web run typecheck
npm run admin:build
```

## 微信小程序

使用微信开发者工具导入**仓库根目录**，不要单独导入 `miniprogram/`。根目录的 `project.config.json` 已将小程序目录指向 `dist/miniprogram/`、云函数目录指向 `dist/deploy/`。当前 `miniprogram/app.json` 只注册公共、家长和教师／助教页面；孩子档案不作为页面或登录角色。不要让客户端直接访问业务集合。

### 在另一台电脑继续开发

当前开发分支统一使用共享 CloudBase 环境 `zufang`。首次在另一台电脑运行时执行：

```bash
git clone --branch feature/growth-orchard-business --single-branch \
  https://github.com/woqiucheng4/task_checkin.git
cd task_checkin
npm ci
cp .task-checkin.local.example.json .task-checkin.local.json
npm run build:deploy
```

`.task-checkin.local.example.json` 已包含当前共享环境配置：

```json
{
  "envId": "zufang-9g5z3mbf127882aa",
  "appId": "wx7f63176424216ee8",
  "resourceAppId": "wx0d22b0cfcfa8f232",
  "mode": "shared"
}
```

构建完成后，在微信开发者工具中导入克隆得到的 `task_checkin` 根目录。AppID 和 CloudBase 环境的实际选择仍是开发者工具与 CloudBase 控制台中的人工操作；本次家长/教师身份 MVP 不会修改它们，也不会部署云函数。登录微信必须拥有 AppID `wx7f63176424216ee8` 的开发权限；环境 ID 和 AppID 不是登录凭据，CloudBase 仍会校验调用方身份和白名单。

本机文件 `.task-checkin.local.json` 已被 Git 忽略，不会随提交覆盖其他开发者的本地配置。若以后更换 CloudBase 环境，只修改本地文件并重新运行 `npm run build:deploy`。该命令仅在本地生成导入产物，不会部署 `coreApi`；任何云函数部署仍须按发布手册在目标环境人工执行。

原生页面和 Web 同构预览共享业务 ViewModel、语义设计令牌和以下果园资产体系：

- 苹果树从种子、发芽、幼苗、树干、花苞、开花、小果到成熟的连续成长素材。
- 苹果、梨、橙三类成熟果树。
- 空任务、离线、邀请过期、浇水、采摘和分组共育场景。

完整资产登记与占位校验由 `src/presentation/asset-manifest.ts` 和 `tests/presentation/assets.test.ts` 负责。

## 本地验证

本次使用 Node.js 25、npm 11 验证。完整质量门：

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

当前质量门槛为全局语句/分支/函数/行覆盖率均不低于 85%；领域层要求不低于 90%。详细结果见[业务验收用例报告](docs/verification/2026-09-06-business-cases.md)、[全页面验收矩阵](docs/verification/2026-09-06-ui-pages.md)和[视觉质检记录](design-qa.md)。

## CloudBase 发布前置条件

1. 按[集合与索引清单](docs/architecture/collection-indexes.md)创建 41 个集合及索引，并禁止小程序端直接读写业务集合。
2. 配置开发/生产环境 ID、平台运营白名单以及正式媒体、OCR、导出适配器。
3. 部署 `coreApi` 后，在开发环境执行身份伪造、跨租户、重复请求、事务并发和日志脱敏测试。
4. 使用微信开发者工具和真机验证小程序工程、字体与安全区、授权、上传与网络异常重试。
5. 处理或书面接受 `wx-server-sdk@4.0.2` 当前上游依赖审计风险后再进入生产发布。

具体步骤见[CloudBase 发布与回滚手册](docs/runbooks/cloudbase-release.md)。

## 设计与约束文档

- [当前产品规格](docs/superpowers/specs/2026-09-05-growth-orchard-platform-design.md)
- [业务实施计划](docs/superpowers/plans/2026-09-05-growth-orchard-business.md)
- [儿童数据与权限边界](docs/privacy/child-data-boundary.md)
- [业务验收用例报告](docs/verification/2026-09-06-business-cases.md)
- [全页面验收矩阵](docs/verification/2026-09-06-ui-pages.md)
- [视觉质检记录](design-qa.md)

仓库内较早的“单家庭积分打卡 V1”文档仅作为历史方案保留；后续开发以“成长果园平台总体设计”为准。

## 生产边界

本地交付不等于已发布。真实 CloudBase 数据库与索引、微信身份、开发者工具和真机、OCR/对象存储、支付、导出文件、生产日志和云函数依赖安全门仍须在目标环境验证；当前状态统一记录为 `NOT RUN`，详见发布手册和验收报告。
