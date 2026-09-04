# 儿童成长打卡小程序 V1 规格

> 产品名称为“律果”（自律结果实）；完整产品路线与公众号内容运营口径见 [儿童成长打卡产品总规划](儿童成长打卡产品总规划.md)。

## 1. 目标

在微信内提供一个由家长创建、孩子完成、家长确认的成长打卡闭环：任务 → 打卡 → 审核 → 积分账本 → 愿望兑换。产品用于真实家庭内测，不做公开社交或教师协作。

## 2. 固定技术决策

- 客户端：原生微信小程序 + TypeScript。
- 后端：微信云开发 CloudBase；小程序仅通过 `wx.cloud.callFunction` 访问业务逻辑。
- 数据：CloudBase 文档型数据库；所有业务集合仅管理端可读写。
- 文件：V1 不上传孩子照片、视频、音频或作业附件。
- 域名：不是 V1 运行前置条件；仅在品牌保护用途购买，不接入 V1 API。
- 运营入口：V1 注册并认证公司主体的**订阅号**，用于每日内容推广并关联小程序；服务号仅在需要公众号内客户服务、支付或服务通知时另行评估。
- 不购买独立服务器、不使用阿里云后端、不做 Web 管理后台、不做 AI、不做支付。

## 3. 用户与权限

| 身份 | V1 能力 |
| --- | --- |
| 家长 | 建立家庭与孩子档案，创建任务与愿望，审核打卡，调整积分，查看账本，确认兑换。 |
| 孩子视图 | 仅查看所选孩子的今日任务、提交打卡、查看积分与愿望、提交兑换申请。 |

V1 使用同一个微信账号的双视图。家长 PIN 仅是同设备防误触的交互保护，不能被描述为独立身份认证或针对技术攻击的安全边界。老师、机构、多个微信账号协作进入 V2。

## 4. V1 页面

1. 首次设置：创建家庭、家长昵称、孩子昵称、设置 6 位 PIN。
2. 首页：今日任务、完成数量、待审核数、孩子积分。
3. 任务页：按学习、运动、习惯、生活四类查看；家长可创建/编辑/停用，孩子可打卡。
4. 愿望池：显示积分、可兑换愿望、兑换状态。
5. 家长中心：审核队列、积分账本、任务管理、愿望管理、PIN 验证与孩子视图切换。

## 5. 业务规则

- 任务类型：`LEARNING`、`EXERCISE`、`HABIT`、`LIFE`；学习任务可选来源 `SCHOOL` 或 `HOME`。
- 周期：每日、指定星期、一次性。V1 不支持复杂 RRULE。
- 打卡状态：`PENDING`、`SUBMITTED`、`APPROVED`、`REJECTED`、`EXPIRED`。
- 只有家长审核 `SUBMITTED` 打卡；审批通过在同一事务创建一条不可修改的积分账本记录。
- 同一任务、同一孩子、同一天只允许一个有效打卡；云函数以事务与唯一业务键拒绝重复请求。
- 家长不能直接修改积分余额；只能“人工加/扣积分”，必须填写原因并生成账本记录。
- 愿望状态：`ACTIVE`、`REQUESTED`、`FULFILLED`、`CANCELLED`。申请兑换时冻结/扣除积分；取消时原路退还积分；兑现不再扣第二次。
- 未完成、被拒绝或过期的打卡不发积分；不做惩罚性扣分、公开比较或排行榜。

## 6. 数据集合

| 集合 | 关键字段 |
| --- | --- |
| `families` | `_id`, `ownerOpenId`, `name`, `pinHash`, `createdAt` |
| `children` | `_id`, `familyId`, `nickname`, `avatarKey`, `active` |
| `tasks` | `_id`, `familyId`, `childId`, `title`, `category`, `learningSource`, `schedule`, `points`, `active` |
| `checkins` | `_id`, `familyId`, `taskId`, `childId`, `occurredOn`, `status`, `submittedAt`, `reviewedAt`, `reviewNote` |
| `point_ledgers` | `_id`, `familyId`, `childId`, `delta`, `reasonType`, `referenceId`, `note`, `createdAt` |
| `wishes` | `_id`, `familyId`, `childId`, `title`, `cost`, `active` |
| `redemptions` | `_id`, `familyId`, `childId`, `wishId`, `cost`, `status`, `requestedAt`, `fulfilledAt` |
| `audit_logs` | `_id`, `familyId`, `actorOpenId`, `action`, `targetType`, `targetId`, `createdAt` |

所有集合设置为“仅管理端可读写”；云函数通过当前 `OPENID` 查家庭所有权后再查询或写入。

## 7. 非功能要求

- 每个命令带 `requestId`；同一 `requestId` 必须幂等。
- 事务覆盖审核发分、人工调分、愿望申请、愿望取消。
- 所有时间按 `Asia/Shanghai` 计算日期，数据库仍存 UTC 时间戳。
- 默认只存孩子昵称，不采集真实姓名、学校、定位、照片或联系方式。
- 云函数不得向日志写入 PIN、完整孩子档案或云端密钥。
- 上线前提供隐私政策、儿童个人信息规则、家长删除入口与导出需求登记入口。

## 8. V1 验收

- 新家长在 3 分钟内能完成家庭、孩子、PIN 和 3 个任务的创建。
- 孩子只能提交当日应完成且未有效打卡的任务。
- 重复提交、重复审核、重复兑换均不重复增加或扣减积分。
- 孩子视图无法执行家长审核、任务编辑、积分调整或愿望兑现。
- V1 不出现教师、分组、外部 HTTP API、付费、AI、附件上传和排行榜入口。

## 9. 后续阶段，不纳入本计划

- V2：多个家长/孩子微信账号、教师白名单、学习组、作业发布。
- V3：Web 管理后台、导出任务、统计投影、机构 SaaS。
- V4：经监护人授权的结构化数据 AI 周建议与未来 App。
