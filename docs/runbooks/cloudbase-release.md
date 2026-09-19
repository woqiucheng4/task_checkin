# CloudBase 发布前人工门禁

本手册是发布前的人工门禁，不是部署记录。当前仓库**没有确认**目标小程序 AppID、CloudBase 环境归属人、环境 ID、远端集合/索引/权限、远端变量或密钥；也没有部署任何资源。未完成下列确认不得发布。

## 0. 发布授权与范围锁定

1. 发布负责人书面确认目标小程序 AppID、目标 CloudBase 环境 ID、该环境的 owner，以及其有权仅维护本项目资源。
2. 负责人逐项核对本次 `npm run build:deploy` 的 `dist/deploy/manifest.json`：`application` 必须为 `task_checkin`，函数只能为 `taskCheckinCoreApi`，所有集合必须以 `task_checkin_` 开头，存储前缀只能为 `task-checkin/`。
3. 先执行只读/计划（dry run）。集合、索引和权限的操作范围只能是 manifest 中的 `task_checkin_*`；不得创建、修改或删除其他小程序的集合、索引、函数、存储对象或任何全局权限。
4. 明确本次仅部署 `taskCheckinCoreApi`。禁止批量覆盖环境函数，禁止改变共享存储桶的全局规则，禁止把存储设为公开。

## 1. 本地构建门禁

在批准的工作树中依次运行 `npm test -- --run`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build:deploy` 和 `git diff --check`。

`build:deploy` 只生成本地 `dist/deploy/` 工件，不创建或变更任何云端资源。构建后人工检查 manifest；禁止把 `.task-checkin.local.json`、AppID、环境 ID、访问令牌或任何密钥提交到仓库。

## 2. 远端变量与私有存储门禁

由目标环境 owner 在云函数配置面板中确认变量**名称存在且值按环境配置**，不在终端、日志、截图或工单中打印其值：

- `ALLOWED_CALLER_APPIDS`：仅目标小程序 AppID；未配置应拒绝调用。
- `PRODUCT_EDITION=CHILD_TEACHER_MVP`：开启本 MVP 的服务端动作白名单。
- `AI_TASK_DRAFT_ENABLED`：默认开启；仅紧急熔断时设为 `false`。
- `DEEPSEEK_API_KEY`、可选 `DEEPSEEK_BASE_URL`：仅作为环境 secret 的变量名检查。**绝不记录、打印或回传 `DEEPSEEK_API_KEY`。**
- `TASK_CHECKIN_CLOUD_FILE_AUTHORITIES`：确认可读取的 Cloud File authority 与目标环境匹配，供私有题图 AI 读取使用。
- 若平台运营功能确有批准需求，才配置 `PLATFORM_OPERATOR_OPENIDS`；不要以客户端 payload 授权平台身份。

在真实儿童图片上传前，owner 必须确认仅 `task-checkin/` 路径的私有读写策略：客户端不能直读业务集合；临时下载链接只由授权服务端流程签发；规则变更不影响同环境其他应用。路径前缀是资源范围约束，不是独立管理员安全边界；如需强隔离，使用独立环境和最小权限凭据。

## 3. 受控人工验收（开发/预发）

使用专门测试账号、合规的非真实儿童测试图片，并记录通过/失败和操作者，不记录密钥或图片内容：

1. 激活教师，创建其工作区和学习小组；家长为**选定 child A**提交入组申请，教师批准。child B 不申请、不批准。
2. 教师上传一张 JPG/PNG/WebP 题图（不超过 1 MB），确认对象路径在 `task-checkin/`，且非授权账号/child B 不能读取。
3. 在真机完成题图上传、任务展示、child A 提交与教师一次批准；确认 child B 没有任务、奖励、AI 草稿或图片访问。模拟器不能替代真机证据。
4. 仅在受控测试配置下执行一次 DeepSeek 题图草稿；确认返回的是可编辑草稿，成人补全并确认后才发布任务。不得将请求图片、完整响应或 secret 写入日志。
5. 临时关闭或移除测试环境中的 AI 可用条件，验证 AI 失败时成人能手工填写并发布任务；不得自动发布、自动评分或自动发奖励。
6. 检查云函数日志和审计：不含 `DEEPSEEK_API_KEY`、完整 OpenID、儿童姓名、题图/作业图片地址、图片字节或完整请求体。

## 4. 发布、回滚与证据

只有前述干跑、范围核对和受控验收均由环境 owner 签字后，才可按 CloudBase 官方界面/CLI 的已批准操作部署 `dist/deploy/taskCheckinCoreApi/`。发布后再次验证调用方 AppID 拒绝、伪造身份拒绝、child B 隔离和日志脱敏。

回滚仅切回已验证的上一函数版本；不得删除审计、奖励流水、同意记录、`task-checkin/` 对象或其他应用资源。若新版本已有写入，先做前向补偿与数据核对，不能直接覆盖或删除数据。
