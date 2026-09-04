# CloudBase 集合与索引

## 访问原则

全部 41 个业务集合只允许云函数和后台管理身份访问。小程序端不得直接读写数据库；所有请求统一经过 `coreApi`，由服务端根据运行时 `OPENID`、有效成员关系和角色绑定进行鉴权。

审计、命令回执、同意记录、阳光流水、审核记录、提交版本、果实愿望关联、共建贡献、成长卡片和公共阳光事件均为只追加集合。业务代码禁止更新或删除这些记录。

## 必建唯一索引

| 集合 | 字段 | 用途 |
|---|---|---|
| `accounts` | `openId` | 一个微信身份只对应一个平台账号 |
| `command_receipts` | `accountId, action, requestId` | 写命令幂等重放 |
| `submissions` | `assignmentId, requestId` | 提交重试去重 |
| `sunlight_ledgers` | `childId, idempotencyKey` | 阳光发放去重 |
| `group_contributions` | `groupTreeId, assignmentId` | 一次学业审核只贡献一次 |
| `child_group_memberships` | `childId, groupId, status` | 有效入组关系 |
| `guardian_links` | `accountId, childId, status` | 孩子身份切换鉴权 |
| `tenant_entitlements` | `tenantScope, status` | 一个租户的当前套餐 |
| `usage_counters` | `tenantScope, feature, period` | 周期配额计量 |

## 必建查询索引

| 集合 | 字段顺序 |
|---|---|
| `task_assignments` | `childId, occurrenceDate, taskState` |
| `task_assignments` | `groupId, occurrenceDate` |
| `review_records` | `assignmentId, reviewType, createdAt` |
| `sunlight_ledgers` | `childId, createdAt` |
| `child_trees` | `childId, status, createdAt` |
| `fruit_collections` | `childId, status, harvestedAt` |
| `join_requests` | `groupId, status, createdAt` |
| `support_access_grants` | `supportAccountId, status, expiresAt` |
| `media_assets` | `status, expiresAt` |
| `audit_logs` | `tenantScope, createdAt` |

索引字段名对应文档字段；集合名的完整映射以 `src/infrastructure/cloudbase-repository.ts` 中的 `COLLECTIONS` 为准。上线前须在开发环境导入代表性数据并用慢查询日志复核索引命中。
