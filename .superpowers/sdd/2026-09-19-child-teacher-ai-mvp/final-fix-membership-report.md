# 最终修复批次 B：审核与邀请码边界

范围：原最终审查项 5、7、8。基于 `bd62a9e`，保留批次 A 和前序提交；只做本地修复及验证，未调用云端、部署或安装依赖。

## B1 分组任务必须由教师审核

- 教师任务编辑页移除可关闭审核的 switch，改为说明“提交后由教师审核；通过后自动发放一次任务阳光”。手动、模板及草稿发布都传 `requiresAcademicReview: true`。
- 服务端对 `LEARNING_GROUP` 任务强制启用审核；机构模板也强制启用。选择兼容旧调用方的归一化方案：旧客户端或旧模板传 `false` 仍可发布，但产出的 task 是 `true`、assignment 是 `PENDING`。
- 真实页面/服务/API 集成测试覆盖：`false` 输入发布 → 孩子提交 → 教师队列 → 审核详情 `canReview` → 页面 approve → `COMPLETED/APPROVED/GRANTED`；重复调用仍只有一笔阳光，任务退出审核队列。

## B2 事务内重新核验学习审核权限

- `academicReview` 在同一事务中读取 assignment、task、family，校验 task/assignment 的分组及机构一致、分组/机构有效、孩子对应机构成员的当前 ACTIVE 分组关系、教师当前 ACTIVE 机构成员及对应组 TEACHER/ASSISTANT binding。
- 不再允许仅凭机构管理员角色绕过分组教师绑定。新建分组时原子建立创建者 TEACHER binding；重复 bind 更新现有绑定并记录审计，避免同人同组重复绑定。
- 权限核验先于审核幂等返回。撤回成员、停用分组/机构、撤回老师绑定/机构成员后，直接审核返回 `FORBIDDEN`，不写奖励。合法老师/助教的重复审核仍返回原批准结果，只发放一次奖励。
- `ACADEMIC_REVIEW`、`COMPLETE_REVISION`、`CLAIM_INVITATION` 在 Core API 交由服务自行核验和幂等，绕过通用旧 receipt 快捷回放；其他动作保持原有 receipt 行为。回归测试显式插入旧 receipt，确认撤权后无法由旧回执绕过。
- 旧数据若只有机构管理员身份、没有对应组有效绑定，将按要求拒绝审核；本批不迁移数据库，可通过已有绑定流程恢复合法老师权限。

## B3 邀请码并发与审批

- claim 的监护关系、邀请码读取、状态/有效期/余量、重复申请及当前成员检查，均移入事务；claimCount、申请、授权记录及审计在同一事务中提交。
- 同一个家长、孩子及邀请码的已有有效申请返回原结果，已消耗的邀请码也可安全重试，不再追加计数/授权。另一位家长不会得到前一位家长的申请记录；即使两人都有监护权限，也只能产生一份该孩子的待审申请。
- approve/reject 在事务内重新读取待审申请和操作者权限；approve 另查孩子有效性、原申请家长当前监护关系、邀请/名册有效性、重复 ACTIVE 成员，避免用事务外快照审批。邀请码耗尽允许审批其既有申请；撤销/过期邀请不能审批。
- 并发测试使用同一真实内存 Repository 和 `Promise.all/Promise.allSettled` 发出竞争请求：maxClaims=1 两个孩子只有一个成功；同孩子同家长双请求返回相同申请、计数 1；同孩子两家长只允许一个成功且不返回他人记录；同时审批只创建一份成员关系。
- 事务入口注入撤回/过期/满额/拒绝等变化，确认操作使用进入事务后的状态，并验证失败后没有授权、审核、奖励或成员副作用。

## 验证

- `npm test -- --reporter=dot`：89 个文件、359 个测试全部通过（新增 24 个用例）。
- `npm run typecheck`：通过。
- 修改文件的 Biome 格式/静态检查：通过。
- `git diff --check`：通过。
- 额外尝试 `npm run admin:test -- --reporter=dot`：未启动，工作树缺少 `@vitejs/plugin-react`，报 `ERR_MODULE_NOT_FOUND`；本批无 admin-web 修改，未安装依赖。此项不算通过。
- 以上为本地服务及模拟小程序运行环境验证；不代表 CloudBase 实际事务、微信开发者工具或真机验收。
