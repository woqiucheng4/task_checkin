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
- `AI_TASK_DRAFT_GLOBAL_DAILY_LIMIT`、`AI_TASK_DRAFT_ACCOUNT_DAILY_LIMIT`：可选非负整数调用限额，缺失/非法配置分别回退到每天全局 100 次、每成人账号 5 次；`0` 拒绝新增调用。按上海自然日计数，成人账号跨家庭/教师身份共享额度。按预计调用单价核准上限后方可启用真实 provider；此限额不是货币金额或精确 token 计费。
- `TEACHER_ACTIVATION_PEPPER`：必需且保持稳定的服务端 secret，只核对名称和配置状态，不输出值。轮换会使所有尚未消费的教师激活码失效；须先协调作废与重新签发，不能把随机值作为每次发布的默认值。
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
7. 使用低限额测试配置，以两个独立成人账号并发识别，确认全局与成人账号上限均在 provider 调用前生效；重复 requestId 只能返回既有草稿或处理中/已失败错误，不能再次扣额和调用。识别期间发布按钮禁用，发布期间不能启动识别；验证全部四种提交方式、开始与截止时间可修改。

### AI 额度结算与故障处理

`task_checkin_usage_counters` 的全局/成人日计数和 `task_checkin_ai_invocations` 的 `RESERVED` 记录在同一数据库事务中提交，之后才读取私有图片并调用 provider；按固定文档 ID 读写，不能用先查询后异步扣额替代。审计终态另追加 `SUCCEEDED` 或 `FAILED`，不得更新或删除预留记录；成功终态与草稿同事务保存。

读取失败、provider 拒绝/超时、结果保存失败均占用一次额度且不退款，因为无法证明上游未收费；同 requestId 失败重试不再次调用。每账号与全局日上限共同约束连续失败。进程崩溃或数据库无法记录终态时保留 `RESERVED`，不得自动重发或退额；按 requestId/状态人工核对并在必要时熔断 AI，手动发布仍可用。日切只开启新日额度，旧请求的幂等记录仍保留，不能通过删除计数或审计重置预算。

新增审计唯一索引 `actorAccountId, requestId, status` 必须包含在本项目集合 dry run 中。原有不带状态的历史成功记录需先核对索引兼容性，不能在共享环境盲目建索引。真实 CloudBase 并发事务行为仍须执行上述受控验收，本地内存测试不代表远端已验证。

## 4. 发布、回滚与证据

只有前述干跑、范围核对和受控验收均由环境 owner 签字后，才可按 CloudBase 官方界面/CLI 的已批准操作部署 `dist/deploy/taskCheckinCoreApi/`。发布后再次验证调用方 AppID 拒绝、伪造身份拒绝、child B 隔离和日志脱敏。

回滚仅切回已验证的上一函数版本；不得删除审计、奖励流水、同意记录、`task-checkin/` 对象或其他应用资源。若新版本已有写入，先做前向补偿与数据核对，不能直接覆盖或删除数据。
