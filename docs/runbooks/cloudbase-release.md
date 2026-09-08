# CloudBase 发布与回滚手册

## 与租房小程序的边界

本项目只部署 `taskCheckinCoreApi`，只访问 `task_checkin_` 开头的 41 个集合，文件只写入 `task-checkin/`。不复用租房账号表、函数、集合或文件。禁止对整个环境执行批量删除、覆盖全部函数或覆盖全局存储规则。

同一 CloudBase 环境中的这些措施是**逻辑隔离**，不是独立管理员权限边界：云函数服务端权限可能绕过客户端数据库规则，配额和故障域也仍共享。若要求任一应用的高权限后端即使失陷也不能影响另一应用，必须使用独立云环境与相应最小权限凭据。不要把命名前缀表述成强安全隔离。

## 前置变量

发布人员在本机或 CI 中提供，不写入仓库：

- 开发环境：`<CLOUDBASE_DEV_ENV_ID>`
- 生产环境：`<CLOUDBASE_PROD_ENV_ID>`
- 平台运营微信身份白名单：`PLATFORM_OPERATOR_OPENIDS`
- 云函数调用方 AppID 白名单：`ALLOWED_CALLER_APPIDS`

## 首次建库

1. 按本次 `npm run build:deploy` 生成的 `dist/deploy/manifest.json` 创建 41 个**物理集合**和索引。源码唯一映射为 `src/infrastructure/collections.ts`；旧设计文档中的无前缀集合名不是部署目标。
2. 所有集合安全规则设置为客户端不可读、不可写，只允许云函数服务端身份访问。
3. 确认只追加集合没有面向客户端的更新或删除规则。
4. 先在开发环境部署；禁止将开发环境 ID 写死到源码。

## 构建与部署

1. 执行完整本地质量门：

   ```bash
   npm ci
   npm --prefix cloudfunctions/coreApi ci
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

   云函数目录的依赖也必须本地安装：SDK 契约测试直接加载锁定的 `wx-server-sdk`，只替换网络传输，不用自造 SDK 方法。仓储插入使用 `collection.add({ data: { ...record, _id } })`；微信 SDK 的文档引用没有 `create()`，不能与底层 CloudBase SDK 混用。

2. 参考 `.task-checkin.local.example.json` 新建已被 Git 忽略的 `.task-checkin.local.json`，填写本小程序的 `appId` 和 `envId`。直接使用自己的环境选 `mode: "direct"`；资源共享调用选 `mode: "shared"` 并填写 `resourceAppId`（资源提供方，而非本小程序 AppID）。在运行前确认开发者工具的 `project.config.json` AppID 与 `appId` 一致。
3. 执行 `npm run build:deploy` 和 `node scripts/build-deployment.mjs --require-config`。部署目录为 `dist/deploy/taskCheckinCoreApi/`；入口已打包为独立 CommonJS，不需要上传 `src/`，也不要上传 `dist/cloudfunctions/coreApi/`。开发者工具云函数根目录只指向 `dist/deploy/`。
4. 在目标环境先确认没有不属于本项目的同名函数；首次创建 `taskCheckinCoreApi`，以后只更新这个函数。可使用开发者工具的右键“上传并部署：云端安装依赖”，或官方 CLI 的 `cloud functions deploy --env <ENV_ID> --paths <项目绝对路径>/dist/deploy/taskCheckinCoreApi --project <项目绝对路径> --remote-npm-install`。不要更新任何已有 `coreApi` 或租房函数。
5. 在目标云函数中安装锁定版本 `wx-server-sdk@4.0.2`。
6. 仅有运营管理需求时配置 `PLATFORM_OPERATOR_OPENIDS`；默认留空，普通账号不会因首次注册自动成为平台管理员。
7. 配置 `ALLOWED_CALLER_APPIDS` 为**已确认的本小程序 AppID**，未配置即拒绝调用。用户已于 2026-09-07 确认 `wx7f63176424216ee8` 属于新打卡小程序。共享调用取可信运行时 `FROM_APPID + FROM_OPENID` 配对，直连取 `APPID + OPENID`；缺任一字段都拒绝，不回退到资源方身份。
8. 部署后仅通过小程序 SDK 调用；不为业务接口开放匿名 HTTP 入口。共享调用使用已初始化的 `wx.cloud.Cloud` 实例。

媒体上传已接入服务端存储适配器：客户端创建上传申请，将小于 1 MB 的图片内容交给 `UPLOAD_MEDIA_CONTENT`；服务端核对实际字节长度、文件头类型、上传人和所属空间，再写入专属路径，业务提交保存 `mediaAsset.id` 而非云文件 ID。`RECORD_UPLOAD` 不能通过客户端自报类型/大小把真实存储记录激活。OCR 识别和正式导出文件生成仍需实现并验证对应适配器；当前未配置时安全失败，不能以演示结果替代。

存储路径前缀本身不限制客户端访问。真实上传验收前还必须确认**仅本路径**的客户端读写权限；不能为了本项目把共享存储桶全局规则改成公开或禁止，从而影响租房业务。尚未核实规则前，不上传真实儿童作业图片。

## 客户端与后台发布

### 微信小程序

1. 在微信开发者工具中导入**项目根目录**，不要导入源码 `miniprogram/`。根配置指向构建后的 `dist/miniprogram/`；每次源码修改后重新执行 `npm run build:deploy`。
2. 确认 `app.json` 中 27 个页面全部可以编译；分别以孩子、家长、教师/助教身份完成一次主流程。
3. 在低年级和高年级密度下检查字号、触控区域、横向溢出、导航栏安全区和减少动态效果设置。
4. 使用真机验证拍照、录音、弱网重试、前后台切换和授权撤销；模拟器通过不能替代真机通过。

### Web 后台

1. 执行 `npm run admin:build`，部署 `admin-web/dist/` 到启用 HTTPS 和 History API 回退的静态站点。
2. 生产身份必须由服务端会话提供；不能使用本地 fixture 中的角色或租户值作为鉴权依据。
3. 在机构、平台、内容方三个入口分别执行权限冒烟；平台客服必须在精确临时授权前看不到儿童内容。
4. 内容方接口和日志只允许模板、主题、素材、聚合用量与结算字段，不得添加儿童、家庭、提交、媒体或愿望投影。

### 本地视觉复查

执行 `npm run admin:dev -- --host 127.0.0.1 --port 4173 --strictPort` 后，按照 `design-qa.md` 和 `docs/verification/2026-09-06-ui-pages.md` 复查移动预览和三个桌面工作区。生产发布前需重新记录目标浏览器、微信开发者工具和真机证据。

## 上线验证

1. 用小程序端直接读取任一业务集合，预期被安全规则拒绝。
2. 调用 `BOOTSTRAP_ACCOUNT`，确认账号只取运行时身份；共享调用使用 `FROM_OPENID`，不混用资源方 `OPENID`。
3. 在事件体伪造 `openId`、`childId` 和 `PLATFORM`，预期不能越权。
4. 用相同 `requestId` 重复创建家庭，预期返回同一个结果且只新增一条家庭记录。
5. 以家庭、教师、机构管理员、孩子、内容方五种身份执行最小权限冒烟测试。
6. 检查云函数日志：不得出现 openId、孩子姓名、作业图片地址、愿望内容或完整请求体。
7. 检查 `task_checkin_audit_logs` 中高权限读取、导出审批、套餐变更均有记录。
8. 检查 Web 路由刷新、未登录跳转、会话过期、键盘焦点和错误恢复。
9. 检查内容方接口与页面响应不包含儿童、家庭、提交、媒体和愿望字段。

## 当前外部门禁

在真实环境执行前，下列状态必须写为 `NOT RUN`：CloudBase 建库与事务、生产身份、微信开发者工具、真机、真实 OCR/对象存储、导出文件、支付结算、生产日志和云函数依赖安全审计。不得用本地 mock、截图或单元测试替代这些结果。

## 备份与回滚

### 迁移到独立环境

以下命令在项目根目录运行。先 `npm run build:deploy`，并确保 `cloudfunctions/coreApi` 的锁定依赖已安装。管理凭据仅通过 `TENCENTCLOUD_SECRETID`、`TENCENTCLOUD_SECRETKEY`、临时凭据配套的 `TENCENTCLOUD_SESSIONTOKEN` 提供；禁止写进仓库或分享给聊天。迁移期间仅暂停本小程序写入，不暂停租房业务。

1. 在新环境创建 manifest 列出的专属集合、索引与安全规则，部署同名新函数；保留原环境。
2. `node scripts/migrate-data.mjs export <SOURCE_ENV> artifacts/private/snapshot.json`：只读导出本项目的 41 个集合，保留业务文档 ID 并计算校验和；输出不能覆盖已有文件。
3. `node scripts/migrate-files.mjs <SOURCE_ENV> <TARGET_ENV> artifacts/private/snapshot.json artifacts/private/file-map.json`：预检源环境与专属文件路径，不联网写入。确认后加 `--apply`，逐一复制到目标 `task-checkin/migrations/<本次唯一ID>/`，重新下载验证字节 SHA-256，再输出旧 fileID 到新 fileID 的映射。源文件不删除；中断可能留下本次独立目录中的副本，不会覆盖其他文件，需人工核对后单独清理。
4. `node scripts/migrate-data.mjs import <TARGET_ENV> artifacts/private/snapshot.json --file-map artifacts/private/file-map.json`：预检所有目标集合必须存在且为空，并要求文件引用映射完整；确认后加 `--apply` 才写入。发生错误即停止，禁止盲目覆盖非空目标重跑。
5. `node scripts/migrate-data.mjs verify <TARGET_ENV> artifacts/private/snapshot.json --file-map artifacts/private/file-map.json`：比较全部文档 ID、内容与映射后的文件引用。
6. 将本机 `envId` 切到目标环境；若目标为自己的环境，将 `mode` 改为 `direct` 并清空 `resourceAppId`。重新构建小程序与部署函数，保持消费方 AppID 不变，账户 OpenID 不需要改写。
7. 用独立测试账号完成创建家庭、发布任务、提交图片、审核、阳光入账、种树/采摘及刷新持久化验收，确认无旧 fileID，再开放本产品写入。
8. 回滚只切回保留的旧环境和旧版本，不删除源数据。切换后如果新环境已产生业务写入，必须先处理增量，不能直接回切造成数据丢失。

这些脚本目前只完成本地测试，不代表已在真实两个环境完成迁移演练。

### 应用版本回滚

1. 发布前导出生产集合结构、索引配置和增量数据快照，并记录当前云函数版本号。
2. 新版本先灰度到开发环境，再切换生产别名或版本。
3. 若授权、事务或数据一致性检查失败，立即把流量切回上一云函数版本；不要删除新版本产生的审计或流水。
4. 对业务数据只做前向修复。任何补偿都以新记录表达，禁止改写阳光流水、同意记录、审核记录或审计日志。
5. 回滚后复跑身份伪造、重复请求、跨租户读取和阳光非负四项检查。
