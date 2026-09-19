# 最终修复批次 C：AI 编辑器与发布控制

日期：2026-09-19。范围：原最终审查项 1、10、11 与 WARNING 12。提交标题：`fix: harden AI editing and release controls`。

## 修复结果

| 项目 | 结果与实现 |
| --- | --- |
| C1 发布竞态 | 家长、教师编辑器的识别/上传与发布互斥，重复发布互斥；点击发布在首个 await 前复制 draftId、字段、sourceAssetIds。目标 child/family/group 只解析一次，选择器在等待刷新前捕获当前选择；原选中教师分组失效时拒绝，避免悄悄改投其他分组。草稿分支固定为 EDIT 后 PUBLISH_DRAFT，普通分支只发布普通任务；异常恢复锁。 |
| C2 表单契约 | 家长补齐 TEXT_AND_PHOTO。双端四种 radio 的 checked 表达式、绑定方法、state 和发布 payload 有联合回归。AI 开始时间原来丢失，现回填上海日期/时间并提供独立编辑控件；标题、说明、类别、开始/截止与提交方式均可编辑。AI 未返回类别时保持家长端类别显示与实际值一致。 |
| C3 调用预算 | 复用 usageCounters 和只追加 aiInvocations；不新增集合。以事务一次完成全局与成人账号日计数预留以及 RESERVED 审计；之后才读图/调用 provider。默认全局每日 100 次、每上传成人账号 5 次（上海自然日），可配置非负整数，非法值回退默认，0 禁用新调用。跨家庭/教师角色共享成人账号预算，儿童仍在读图前被拒绝。 |
| C3 幂等与审计 | 账号 + requestId 哈希作为永久预留键，同请求完成后返回已有草稿，处理中/失败重试不重调、不再扣额；换 assetId 使用同 key 被拒绝。终态另追加 SUCCEEDED/FAILED；成功审计与草稿同事务保存。失败固定分类 INPUT_UNAVAILABLE / PROVIDER_FAILURE / PERSISTENCE_FAILURE，无原始异常、provider 完整响应、secret 或图片 bytes。 |
| C3 失败结算 | 所有已经预留的尝试均不退款，上游超时也可能收费；连续失败受全局/成人限额约束。进程崩溃或终态写入不可用时保留 RESERVED，禁止自动重发/退款；运维核对或熔断，手动填写/发布可用。 |
| C4 发布门禁 | manifest 的 requiredSecrets 明列 TEACHER_ACTIVATION_PEPPER；runbook 要求稳定 secret，说明轮换会使未消费激活码失效。两个 AI 限额环境变量进入 optional 名称清单，安全默认写入说明。无值写入 manifest，无远程密钥变更。 |

AI 审计新增唯一索引 `actorAccountId, requestId, status`，预算按固定文档 ID 读写。domain、collections、API DI、云函数配置、构建 manifest、runbook、隐私与验证文档已同步。现有生产/内存仓储均将 aiInvocations 视为只追加，故无需新增 fake 集合；新增 fake 仓储回归验证预留/终态记录不可更新和删除。

## TDD 与回归证据

- 初次执行编辑器时序测试出现 4 个预期失败；家长用例实际记录到 `PUBLISH_FAMILY_TASK` 和 `PUBLISH_TASK_DRAFT` 两次发布，教师用例在识别未结束时发布普通任务。修复后通过。
- 初次预算测试出现 7 个预期失败：12 个并发请求全部穿透原无限制实现、同 key 产生新草稿、并发重试重复调用、失败无审计/泄漏原始错误、非法配置无默认上限。修复后通过。
- 提交方式/开始时间/类别和目标选择快照回归先观察到缺失或错误行为，再补实现。测试使用真实延迟 Promise、实际 Page 方法和事务仓储，外部 provider/storage 使用本地 fake。
- 预算覆盖跨实例并发、跨成人全局上限、成人限额、零额度 API DI、默认/非法配置、跨日重置、成功/处理中/失败重试、换图复用 key、输入读取失败、结果保存失败、只追加记录保护。

## 最终验证

| 命令 | 结果 |
| --- | --- |
| `npm test` | PASS：复审轮次 2 后 90 个测试文件、393 条用例 |
| `npm run typecheck` | PASS |
| `npx biome lint`（本批修改的 16 个 TS/MJS 文件） | PASS，无警告；未以此冒充整个仓库 lint |
| `npx biome format --write`（本批修改的 TS/MJS 文件） | 已格式化 |
| `npm run build:deploy` | PASS，构建 taskCheckinCoreApi 与 43 个隔离集合 manifest；cloud configured: false |
| `git diff --check` | PASS |

## 复审修复轮次 1：API 通用成功回执绕过 Gateway

复审发现原 C3 的 Gateway 幂等防线仍可被 `createCoreApi` 的通用 `commandReceipts` 成功缓存绕过：相同 requestId 换图或撤销发布权限后，API 直接返回缓存草稿。

- 将 `RECOGNIZE_TASK_DRAFT` 加入 service-owned idempotency 分流；该动作不再查询或写入通用成功回执，旧回执保留但永不参与识别返回。
- Gateway 在成人身份检查后校验原 requestId 与 assetId 的绑定，换成不存在的假 assetId 也返回 `CONFLICT`；原图重试仍先按当前成员/角色鉴权，再读取草稿终态，因此撤权返回 `FORBIDDEN`，不泄露原草稿。
- 新增 5 条直接 `createCoreApi` 回归，均先 RED 复现后 GREEN：成功后换假图、撤销 organization membership、撤销 teacher binding、合法重试不重复 provider/预算且不写通用回执、忽略已有旧成功回执。
- 复审验证：AI 测试 22 条通过；全量 90 文件/391 用例通过；typecheck、3 个修改代码文件的 Biome lint、git diff --check 均通过。

本轮仅修改 core-api、AI Gateway、对应测试及本报告，单独提交；不改 media/review/invitation 服务。

## 复审修复轮次 2：组织成员撤销后残留 binding

修正组织发布者检查顺序：先调用现有组织权限策略，强制当前 `ACTIVE`、`ADULT` 的组织成员资格；管理员直接允许，其余成人 STAFF 必须另有对应有效分组的 ACTIVE TEACHER/ASSISTANT binding。移除捕获成员资格失败后继续查 binding 的回退，残留 binding 不再抵消 membership 撤销。

修正上一轮测试：撤销 membership 时明确保留 ACTIVE binding，撤销 binding 时明确保留 ACTIVE membership；两种情况下旧 requestId 和新 requestId 均返回 FORBIDDEN，不回传草稿、不再调用 provider、不增加预算。另覆盖非成人成员保留 binding 仍被拒绝、合法成人助教仍可识别；原管理员和合法教师成功路径保持通过。

本轮先观察到 membership 撤销和非成人成员两个 RED 失败，再做最小 Gateway 修复。验证：AI 24 条用例、全量 90 文件/393 用例、typecheck、两文件 Biome lint、git diff --check 全部通过。仅修改 AI Gateway、对应测试与本报告，单独提交；无部署或远端修改。

## 验证边界

这是本地实现与自动化证据；未运行远端部署、CloudBase 索引/事务并发验收、真实 provider、微信开发者工具或真机验收，也未读取/配置远程 secret。发布前仍须 owner 按 runbook 执行低限额并发测试、私有读图和人工发布回退。历史不带 status 的审计记录需先核对唯一索引兼容性。

未修改 media/review/invitation 服务边界，也未派生子代理。保留本工作树已有修复提交。
