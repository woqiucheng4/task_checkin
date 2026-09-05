import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../../components/data-table/data-table";
import { FilterBar } from "../../components/filter-bar/filter-bar";
import { MetricSummary } from "../../components/metric-summary/metric-summary";
import orchard from "../../assets/orchard/apple-mature.png";
import lockedScene from "../../assets/orchard/scene-offline.png";

function PlatformHeader({
  action,
  description,
  title,
}: {
  readonly action?: React.ReactNode;
  readonly description: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">成长果园 · 平台运营</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function PlatformDashboard(): React.JSX.Element {
  return (
    <section className="page">
      <PlatformHeader
        title="平台概览"
        description="聚焦租户运行、风险审批与服务质量，不直接呈现儿童业务内容。"
      />
      <MetricSummary
        items={[
          { label: "活跃家庭", value: "12,840", note: "近 30 天" },
          { label: "活跃机构", value: 246, note: "学校与教育机构" },
          { label: "待处理工单", value: 18, note: "高优先级 3 条" },
          { label: "有效临时授权", value: 3, note: "最晚 2 小时后过期" },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel action-panel">
          <div>
            <p className="eyebrow">治理待办</p>
            <h2>所有敏感访问先授权、再读取</h2>
            <ul className="plain-list">
              <li>
                <span>导出审批</span>
                <Link to="/platform/exports">7 项待处理</Link>
              </li>
              <li>
                <span>访问授权</span>
                <Link to="/platform/access">2 项待审批</Link>
              </li>
              <li>
                <span>内容方入驻</span>
                <Link to="/platform/providers">1 家待审核</Link>
              </li>
            </ul>
          </div>
          <img src={orchard} alt="平台成长概览果树" />
        </section>
        <section className="panel">
          <h2>服务健康度</h2>
          <div className="progress-list">
            <label>
              <span>
                <b>小程序接口可用率</b>
                <small>99.98%</small>
              </span>
              <progress max="100" value="99.98" />
            </label>
            <label>
              <span>
                <b>审核通知送达率</b>
                <small>99.4%</small>
              </span>
              <progress max="100" value="99.4" />
            </label>
            <label>
              <span>
                <b>工单及时响应</b>
                <small>96%</small>
              </span>
              <progress max="100" value="96" />
            </label>
          </div>
        </section>
      </div>
    </section>
  );
}

interface Tenant {
  readonly name: string;
  readonly type: string;
  readonly plan: string;
  readonly members: string;
  readonly active: string;
  readonly status: string;
}
const tenants: readonly Tenant[] = [
  {
    name: "春芽小学",
    type: "学校",
    plan: "成长版",
    members: "386 / 500",
    active: "今天 10:08",
    status: "正常",
  },
  {
    name: "青禾辅导中心",
    type: "机构",
    plan: "协作版",
    members: "218 / 300",
    active: "今天 09:56",
    status: "正常",
  },
  {
    name: "云帆实验学校",
    type: "学校",
    plan: "试用版",
    members: "92 / 100",
    active: "昨天 21:14",
    status: "即将到期",
  },
];
export function PlatformTenants(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const rows = tenants.filter((row) => row.name.includes(query.trim()));
  const columns: readonly DataTableColumn<Tenant>[] = [
    { key: "name", label: "租户", render: (row) => <strong>{row.name}</strong> },
    { key: "type", label: "类型", render: (row) => row.type },
    { key: "plan", label: "套餐", render: (row) => row.plan },
    { key: "members", label: "成员用量", render: (row) => row.members },
    { key: "active", label: "最近活跃", render: (row) => row.active },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "正常" ? "" : "warning"}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: () => (
        <button className="text-button" type="button">
          租户设置
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="租户管理"
        description="管理家庭与机构租户的账户状态、套餐和资源用量。"
        action={
          <button className="button primary" type="button">
            创建机构租户
          </button>
        }
      />
      <FilterBar searchLabel="搜索租户名称" onSearch={setQuery}>
        <select aria-label="租户状态">
          <option>全部状态</option>
          <option>正常</option>
          <option>即将到期</option>
        </select>
      </FilterBar>
      <DataTable caption={`租户列表 · ${rows.length} 个`} rows={rows} columns={columns} />
    </section>
  );
}

export function PlatformPlans(): React.JSX.Element {
  const [published, setPublished] = useState(false);
  return (
    <section className="page">
      <PlatformHeader
        title="套餐与权益"
        description="统一配置席位、存储、分组和协同审核能力。"
        action={
          <button className="button primary" type="button" onClick={() => setPublished(true)}>
            发布权益调整
          </button>
        }
      />
      {published ? (
        <p className="success-message" role="status">
          权益调整已发布，并记录到变更日志。
        </p>
      ) : null}
      <div className="plan-grid">
        <section className="panel plan-card">
          <span className="tag">家庭版</span>
          <h2>共同养成好习惯</h2>
          <p>多孩子管理、家庭任务、阳光与果树成长</p>
          <dl>
            <div>
              <dt>孩子席位</dt>
              <dd>3</dd>
            </div>
            <div>
              <dt>媒体存储</dt>
              <dd>2 GB</dd>
            </div>
          </dl>
          <button className="button" type="button">
            编辑权益
          </button>
        </section>
        <section className="panel plan-card featured">
          <span className="tag">成长版</span>
          <h2>学校与机构协作</h2>
          <p>班级分组、教师协作、家长协同审核与统计</p>
          <dl>
            <div>
              <dt>成员席位</dt>
              <dd>500 起</dd>
            </div>
            <div>
              <dt>媒体存储</dt>
              <dd>20 GB</dd>
            </div>
          </dl>
          <button className="button" type="button">
            编辑权益
          </button>
        </section>
        <section className="panel plan-card">
          <span className="tag">平台定制</span>
          <h2>规模化治理</h2>
          <p>专属额度、审计留存和服务级别配置</p>
          <dl>
            <div>
              <dt>成员席位</dt>
              <dd>按合同</dd>
            </div>
            <div>
              <dt>审计留存</dt>
              <dd>365 天</dd>
            </div>
          </dl>
          <button className="button" type="button">
            编辑权益
          </button>
        </section>
      </div>
    </section>
  );
}

interface Provider {
  readonly name: string;
  readonly templates: number;
  readonly usage: string;
  readonly settlement: string;
  readonly status: string;
}
const providers: readonly Provider[] = [
  {
    name: "知新教育内容中心",
    templates: 128,
    usage: "8,462 次",
    settlement: "正常",
    status: "已启用",
  },
  {
    name: "童声阅读实验室",
    templates: 46,
    usage: "3,208 次",
    settlement: "正常",
    status: "已启用",
  },
  {
    name: "小小科学家工作室",
    templates: 12,
    usage: "—",
    settlement: "资料待核验",
    status: "待审核",
  },
];
export function PlatformProviders(): React.JSX.Element {
  const columns: readonly DataTableColumn<Provider>[] = [
    { key: "name", label: "内容服务方", render: (row) => <strong>{row.name}</strong> },
    { key: "templates", label: "已发布模板", render: (row) => row.templates },
    { key: "usage", label: "近30天使用", render: (row) => row.usage },
    { key: "settlement", label: "结算状态", render: (row) => row.settlement },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "待审核" ? "warning" : ""}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: (row) => (
        <button className="text-button" type="button">
          {row.status === "待审核" ? "审核入驻" : "查看配置"}
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="内容服务方"
        description="管理内容方入驻、发布权限与结算状态；不开放终端用户数据。"
      />
      <FilterBar onSearch={() => undefined} searchLabel="搜索服务方">
        <select aria-label="服务方状态">
          <option>全部状态</option>
          <option>已启用</option>
          <option>待审核</option>
        </select>
      </FilterBar>
      <DataTable caption="内容服务方列表" rows={providers} columns={columns} />
    </section>
  );
}

interface Ticket {
  readonly id: string;
  readonly tenant: string;
  readonly issue: string;
  readonly priority: string;
  readonly created: string;
  readonly status: string;
}
const tickets: readonly Ticket[] = [
  {
    id: "ticket-001",
    tenant: "春芽小学",
    issue: "提交状态与家长端不同步",
    priority: "高",
    created: "今天 09:32",
    status: "处理中",
  },
  {
    id: "ticket-002",
    tenant: "青禾辅导中心",
    issue: "成员批量导入提示格式错误",
    priority: "普通",
    created: "今天 08:46",
    status: "待响应",
  },
];
export function PlatformSupport(): React.JSX.Element {
  const { ticketId } = useParams();
  if (ticketId)
    return (
      <section className="page">
        <PlatformHeader
          title={`客服工单 · ${ticketId}`}
          description="先核对租户提供的非敏感信息；读取受保护资源必须另行申请精确授权。"
        />
        <div className="ticket-layout">
          <section className="panel">
            <h2>工单信息</h2>
            <dl className="detail-list">
              <div>
                <dt>租户</dt>
                <dd>春芽小学</dd>
              </div>
              <div>
                <dt>问题</dt>
                <dd>提交状态与家长端不同步</dd>
              </div>
              <div>
                <dt>环境</dt>
                <dd>微信小程序 8.0.62 · iOS</dd>
              </div>
              <div>
                <dt>描述</dt>
                <dd>家长反馈已操作确认，但机构列表仍显示等待同步。</dd>
              </div>
            </dl>
          </section>
          <section className="protected-panel">
            <img src={lockedScene} alt="受保护内容暂不可访问" />
            <div>
              <span className="tag warning">默认保护</span>
              <h2>尚未获得儿童内容访问权限</h2>
              <p>
                当前只可查看工单描述和脱敏诊断信息。若排障确有必要，请填写工单、资源类型、精确资源编号、用途和有效期。
              </p>
              <Link className="button primary" to={`/platform/access?ticket=${ticketId}`}>
                申请临时授权
              </Link>
            </div>
          </section>
        </div>
      </section>
    );
  const columns: readonly DataTableColumn<Ticket>[] = [
    {
      key: "id",
      label: "工单",
      render: (row) => <Link to={`/platform/support/${row.id}`}>{row.id}</Link>,
    },
    { key: "tenant", label: "租户", render: (row) => row.tenant },
    { key: "issue", label: "问题", render: (row) => row.issue },
    {
      key: "priority",
      label: "优先级",
      render: (row) => (
        <span className={`tag ${row.priority === "高" ? "danger" : ""}`}>{row.priority}</span>
      ),
    },
    { key: "created", label: "创建时间", render: (row) => row.created },
    { key: "status", label: "状态", render: (row) => row.status },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="客服工单"
        description="处理租户问题，受保护数据默认脱敏并按工单单独授权。"
      />
      <FilterBar onSearch={() => undefined} searchLabel="搜索工单号或租户">
        <select aria-label="工单状态">
          <option>全部状态</option>
          <option>待响应</option>
          <option>处理中</option>
        </select>
      </FilterBar>
      <DataTable caption="工单列表" rows={tickets} columns={columns} />
    </section>
  );
}

interface Grant {
  readonly ticket: string;
  readonly resource: string;
  readonly purpose: string;
  readonly operator: string;
  readonly expires: string;
  readonly status: string;
}
export function PlatformAccess(): React.JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const [grants, setGrants] = useState<readonly Grant[]>([
    {
      ticket: "ticket-019",
      resource: "提交记录 · sub_•••19A",
      purpose: "核对媒体转码失败",
      operator: "平台客服 007",
      expires: "11:30 后过期",
      status: "有效",
    },
    {
      ticket: "ticket-012",
      resource: "审核记录 · rev_•••882",
      purpose: "排查重复回调",
      operator: "平台客服 003",
      expires: "已于 08:00 过期",
      status: "已过期",
    },
  ]);
  const columns: readonly DataTableColumn<Grant>[] = [
    { key: "ticket", label: "关联工单", render: (row) => row.ticket },
    { key: "resource", label: "精确资源", render: (row) => row.resource },
    { key: "purpose", label: "访问用途", render: (row) => row.purpose },
    { key: "operator", label: "访问人员", render: (row) => row.operator },
    { key: "expires", label: "有效期", render: (row) => row.expires },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "有效" ? "warning" : ""}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: (row) =>
        row.status === "有效" ? (
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setGrants((items) =>
                items.map((item) =>
                  item === row ? { ...item, status: "已撤销", expires: "刚刚撤销" } : item,
                ),
              )
            }
          >
            立即撤销
          </button>
        ) : (
          "—"
        ),
    },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="临时访问授权"
        description="授权必须绑定工单与精确资源，限时生效并全程记录审计。"
      />
      <div className="access-grid">
        <form
          className="panel form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <h2>申请精确资源授权</h2>
          <label>
            关联工单
            <input required defaultValue="ticket-001" pattern="ticket-[0-9]+" />
          </label>
          <label>
            资源类型
            <select required>
              <option value="">请选择</option>
              <option value="submission">提交记录</option>
              <option value="review">审核记录</option>
              <option value="media">媒体文件</option>
            </select>
          </label>
          <label>
            精确资源编号
            <input required placeholder="例如 sub_01H…，可填写多个并换行" />
          </label>
          <label>
            访问用途
            <textarea required placeholder="说明为什么现有脱敏信息不足以完成排障" />
          </label>
          <label>
            授权有效期
            <select required defaultValue="30">
              <option value="15">15 分钟</option>
              <option value="30">30 分钟</option>
              <option value="60">1 小时</option>
              <option value="120">2 小时</option>
            </select>
          </label>
          <button className="button primary" type="submit">
            提交审批
          </button>
          {submitted ? (
            <p className="success-message" role="status">
              申请已提交，审批通过前仍不可读取受保护内容。
            </p>
          ) : null}
        </form>
        <aside className="panel">
          <h2>授权原则</h2>
          <ol className="principle-list">
            <li>先使用脱敏日志排查</li>
            <li>只申请解决当前工单所需资源</li>
            <li>最长不超过 2 小时</li>
            <li>处理完成立即撤销</li>
          </ol>
        </aside>
      </div>
      <DataTable caption="授权记录" rows={grants} columns={columns} />
    </section>
  );
}

interface ExportApproval {
  readonly id: string;
  readonly tenant: string;
  readonly scope: string;
  readonly purpose: string;
  readonly requested: string;
  readonly status: string;
}
export function PlatformExports(): React.JSX.Element {
  const [rows, setRows] = useState<readonly ExportApproval[]>([
    {
      id: "EXP-24091",
      tenant: "春芽小学",
      scope: "机构聚合完成数据",
      purpose: "学期总结",
      requested: "今天 09:18",
      status: "待审批",
    },
    {
      id: "EXP-24088",
      tenant: "青禾辅导中心",
      scope: "机构成员别名与分组",
      purpose: "成员核对",
      requested: "昨天 17:30",
      status: "已通过",
    },
  ]);
  const columns: readonly DataTableColumn<ExportApproval>[] = [
    { key: "id", label: "申请编号", render: (row) => <strong>{row.id}</strong> },
    { key: "tenant", label: "租户", render: (row) => row.tenant },
    { key: "scope", label: "数据范围", render: (row) => row.scope },
    { key: "purpose", label: "用途", render: (row) => row.purpose },
    { key: "requested", label: "申请时间", render: (row) => row.requested },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "待审批" ? "warning" : ""}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "审批",
      render: (row) =>
        row.status === "待审批" ? (
          <div className="inline-actions">
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setRows((items) =>
                  items.map((item) => (item === row ? { ...item, status: "已通过" } : item)),
                )
              }
            >
              通过
            </button>
            <button
              className="text-button danger-text"
              type="button"
              onClick={() =>
                setRows((items) =>
                  items.map((item) => (item === row ? { ...item, status: "已拒绝" } : item)),
                )
              }
            >
              拒绝
            </button>
          </div>
        ) : (
          "—"
        ),
    },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="导出治理"
        description="审批跨角色和高敏感范围的数据导出，并保留用途与处理记录。"
      />
      <div className="privacy-note">
        <b>自动拦截</b>
        <span>包含跨机构身份、家庭私有信息或未说明用途的申请不会进入生成队列。</span>
      </div>
      <DataTable caption="导出审批" rows={rows} columns={columns} />
    </section>
  );
}

interface AuditRow {
  readonly time: string;
  readonly operator: string;
  readonly event: string;
  readonly target: string;
  readonly result: string;
}
const audits: readonly AuditRow[] = [
  {
    time: "10:06:42",
    operator: "平台客服 007",
    event: "撤销临时授权",
    target: "grant_•••92B",
    result: "成功",
  },
  {
    time: "09:58:11",
    operator: "平台运营 002",
    event: "批准导出",
    target: "EXP-24088",
    result: "成功",
  },
  {
    time: "09:42:08",
    operator: "系统",
    event: "临时授权自动过期",
    target: "grant_•••21C",
    result: "成功",
  },
];
export function PlatformAudit(): React.JSX.Element {
  const columns: readonly DataTableColumn<AuditRow>[] = [
    { key: "time", label: "时间", render: (row) => `2026-09-05 ${row.time}` },
    { key: "operator", label: "操作人", render: (row) => row.operator },
    { key: "event", label: "事件", render: (row) => <strong>{row.event}</strong> },
    { key: "target", label: "对象", render: (row) => row.target },
    { key: "result", label: "结果", render: (row) => <span className="tag">{row.result}</span> },
  ];
  return (
    <section className="page">
      <PlatformHeader
        title="审计日志"
        description="检索租户、授权、导出和配置变更，敏感对象编号默认掩码。"
        action={
          <button className="button" type="button">
            导出审计摘要
          </button>
        }
      />
      <FilterBar onSearch={() => undefined} searchLabel="搜索操作人、事件或对象">
        <select aria-label="事件类型">
          <option>全部事件</option>
          <option>访问授权</option>
          <option>数据导出</option>
          <option>配置变更</option>
        </select>
      </FilterBar>
      <DataTable caption="今日审计事件" rows={audits} columns={columns} />
    </section>
  );
}

export function PlatformSettings(): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <section className="page">
      <PlatformHeader
        title="系统配置"
        description="配置平台级治理规则和服务通知，不在此修改具体租户业务。"
      />
      {saved ? (
        <p className="success-message" role="status">
          平台配置已保存并写入审计日志。
        </p>
      ) : null}
      <form
        className="settings-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <section className="panel">
          <h2>访问治理</h2>
          <div className="form-stack">
            <label>
              单次授权最长时长
              <select defaultValue="120">
                <option value="60">1 小时</option>
                <option value="120">2 小时</option>
              </select>
            </label>
            <label>
              审批复核人数
              <select defaultValue="1">
                <option value="1">1 人</option>
                <option value="2">2 人</option>
              </select>
            </label>
            <label>
              审计日志保留期
              <select defaultValue="365">
                <option value="180">180 天</option>
                <option value="365">365 天</option>
              </select>
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>风险提醒</h2>
          <div className="setting-list">
            <label>
              <span>
                <b>临时授权到期提醒</b>
                <small>到期前 5 分钟提醒操作人</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>
                <b>高敏感导出双重确认</b>
                <small>申请人不能审批自己的导出</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>
                <b>异常访问自动中止</b>
                <small>检测到超范围读取时立即撤销授权</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
          </div>
        </section>
        <footer className="settings-actions">
          <button className="button primary" type="submit">
            保存配置
          </button>
        </footer>
      </form>
    </section>
  );
}
