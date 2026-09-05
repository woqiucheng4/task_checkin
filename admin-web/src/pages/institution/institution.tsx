import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../../components/data-table/data-table";
import { FilterBar } from "../../components/filter-bar/filter-bar";
import { MetricSummary } from "../../components/metric-summary/metric-summary";
import orchardOverview from "../../assets/orchard/apple-mature.png";

function PageHeader({
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
        <p className="eyebrow">春芽小学 · 机构空间</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Dialog({
  children,
  label,
  onClose,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
  }, []);
  return (
    <div className="dialog-backdrop">
      <section aria-label={label} aria-modal="true" className="dialog-panel" role="dialog">
        <header>
          <h2>{label}</h2>
          <button
            ref={closeButton}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭抽屉"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

const groupRows = [
  { name: "三年级一班", lead: "陈老师", members: 36, tasks: 5, rate: "92%" },
  { name: "四年级二班", lead: "林老师", members: 34, tasks: 4, rate: "88%" },
  { name: "周末阅读营", lead: "周助教", members: 18, tasks: 3, rate: "95%" },
  { name: "五年级数学提高班", lead: "吴老师", members: 22, tasks: 6, rate: "84%" },
] as const;

export function InstitutionDashboard(): React.JSX.Element {
  return (
    <section className="page">
      <PageHeader
        title="机构工作台"
        description="先看需要处理的事项，再掌握各分组今天的完成情况。"
        action={
          <Link className="button primary" to="/institution/tasks">
            布置集体任务
          </Link>
        }
      />
      <MetricSummary
        items={[
          { label: "机构成员", value: 386, note: "本周新增 12 人" },
          { label: "活跃分组", value: 18, note: "班级与辅导分组" },
          { label: "待协同审核", value: 42, note: "家长可同步处理" },
          { label: "今日完成率", value: "89%", note: "较昨日提升 3%" },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel action-panel">
          <div>
            <p className="eyebrow">今日待办</p>
            <h2>让每一份努力及时被看见</h2>
            <ul className="plain-list">
              <li>
                <span>待审核记录</span>
                <Link to="/institution/reviews">42 条待处理</Link>
              </li>
              <li>
                <span>即将到期任务</span>
                <Link to="/institution/tasks">6 项需关注</Link>
              </li>
              <li>
                <span>成员加入申请</span>
                <Link to="/institution/members">3 人待确认</Link>
              </li>
            </ul>
          </div>
          <img src={orchardOverview} alt="结满果实的苹果树" />
        </section>
        <section className="panel">
          <h2>分组完成概览</h2>
          <div className="progress-list">
            {groupRows.slice(0, 4).map((group) => (
              <label key={group.name}>
                <span>
                  <b>{group.name}</b>
                  <small>{group.rate}</small>
                </span>
                <progress max="100" value={Number.parseInt(group.rate, 10)} />
              </label>
            ))}
          </div>
        </section>
      </div>
      <section className="panel notice-panel">
        <div>
          <span className="tag warning">提醒</span>
          <b>四年级二班还有 8 位成员未完成今日朗读</b>
        </div>
        <Link to="/institution/groups">查看分组</Link>
      </section>
    </section>
  );
}

export function InstitutionGroups(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof groupRows)[number] | null>(null);
  const rows = groupRows.filter((row) => row.name.includes(query.trim()));
  const columns: readonly DataTableColumn<(typeof groupRows)[number]>[] = [
    { key: "name", label: "分组名称", render: (row) => <strong>{row.name}</strong> },
    { key: "lead", label: "负责人", render: (row) => row.lead },
    { key: "members", label: "成员", render: (row) => `${row.members} 人` },
    { key: "tasks", label: "进行中任务", render: (row) => `${row.tasks} 项` },
    { key: "rate", label: "今日完成率", render: (row) => <span className="tag">{row.rate}</span> },
    {
      key: "action",
      label: "操作",
      render: (row) => (
        <button className="text-button" type="button" onClick={() => setSelected(row)}>
          查看成员
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PageHeader
        title="分组管理"
        description="管理班级和辅导分组，成员只以机构内别名展示。"
        action={
          <button className="button primary" type="button">
            新建分组
          </button>
        }
      />
      <MetricSummary
        items={[
          { label: "全部分组", value: 18 },
          { label: "班级", value: 12 },
          { label: "辅导分组", value: 6 },
        ]}
      />
      <FilterBar onSearch={setQuery} searchLabel="搜索分组名称">
        <select aria-label="分组类型" defaultValue="all">
          <option value="all">全部类型</option>
          <option>班级</option>
          <option>辅导分组</option>
        </select>
      </FilterBar>
      <DataTable caption={`分组列表 · ${rows.length} 个`} rows={rows} columns={columns} />
      {selected ? (
        <Dialog label="分组成员" onClose={() => setSelected(null)}>
          <p className="dialog-description">
            {selected.name} · {selected.lead}负责 · 共 {selected.members} 人
          </p>
          <ul className="member-list">
            <li>
              <span className="avatar">安</span>
              <div>
                <b>安禾 006</b>
                <small>家长已加入 · 今日完成 3/3</small>
              </div>
              <span className="tag">正常</span>
            </li>
            <li>
              <span className="avatar">小</span>
              <div>
                <b>小禾 014</b>
                <small>家长已加入 · 今日完成 2/3</small>
              </div>
              <span className="tag warning">待完成</span>
            </li>
            <li>
              <span className="avatar">星</span>
              <div>
                <b>星宇 023</b>
                <small>等待家长确认加入</small>
              </div>
              <span className="tag warning">待确认</span>
            </li>
          </ul>
          <footer className="dialog-actions">
            <button className="button" type="button" onClick={() => setSelected(null)}>
              取消
            </button>
            <button className="button primary" type="button">
              管理成员
            </button>
          </footer>
        </Dialog>
      ) : null}
    </section>
  );
}

interface TaskRow {
  readonly title: string;
  readonly group: string;
  readonly subject: string;
  readonly deadline: string;
  readonly progress: string;
  readonly status: "进行中" | "已结束" | "草稿";
}
const taskRows: readonly TaskRow[] = [
  {
    title: "朗读《秋天的雨》",
    group: "三年级一班",
    subject: "语文",
    deadline: "今天 20:00",
    progress: "32/36",
    status: "进行中",
  },
  {
    title: "口算练习 20 题",
    group: "四年级二班",
    subject: "数学",
    deadline: "今天 21:00",
    progress: "27/34",
    status: "进行中",
  },
  {
    title: "家庭阅读 15 分钟",
    group: "周末阅读营",
    subject: "阅读",
    deadline: "9月7日 19:00",
    progress: "12/18",
    status: "进行中",
  },
  {
    title: "植物观察记录",
    group: "三年级一班",
    subject: "科学",
    deadline: "9月4日 20:00",
    progress: "36/36",
    status: "已结束",
  },
];

export function InstitutionTasks(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState(false);
  const rows = taskRows.filter((row) =>
    `${row.title}${row.group}${row.subject}`.includes(query.trim()),
  );
  const columns: readonly DataTableColumn<TaskRow>[] = [
    {
      key: "title",
      label: "任务",
      render: (row) => (
        <div className="primary-cell">
          <strong>{row.title}</strong>
          <small>{row.subject}</small>
        </div>
      ),
    },
    { key: "group", label: "发布分组", render: (row) => row.group },
    { key: "deadline", label: "截止时间", render: (row) => row.deadline },
    { key: "progress", label: "提交进度", render: (row) => row.progress },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "已结束" ? "" : "warning"}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: () => (
        <button className="text-button" type="button">
          查看详情
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PageHeader
        title="集体任务"
        description="老师或机构布置任务后，分组内家长同步可见并可协同审核。"
        action={
          <button className="button primary" type="button" onClick={() => setShowCreate(true)}>
            布置任务
          </button>
        }
      />
      {created ? (
        <p className="success-message" role="status">
          任务已保存为草稿，可继续补充内容后发布。
        </p>
      ) : null}
      <FilterBar onSearch={setQuery} searchLabel="搜索任务或分组">
        <select aria-label="任务状态" defaultValue="all">
          <option value="all">全部状态</option>
          <option>进行中</option>
          <option>已结束</option>
          <option>草稿</option>
        </select>
      </FilterBar>
      <DataTable caption={`任务列表 · ${rows.length} 项`} rows={rows} columns={columns} />
      {showCreate ? (
        <Dialog label="布置集体任务" onClose={() => setShowCreate(false)}>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              setCreated(true);
              setShowCreate(false);
            }}
          >
            <label>
              任务名称
              <input required defaultValue="每日朗读 10 分钟" />
            </label>
            <label>
              发布分组
              <select defaultValue="三年级一班">
                <option>三年级一班</option>
                <option>四年级二班</option>
              </select>
            </label>
            <div className="form-row">
              <label>
                学科
                <select>
                  <option>语文</option>
                  <option>数学</option>
                  <option>英语</option>
                </select>
              </label>
              <label>
                阳光奖励
                <input type="number" defaultValue="10" min="0" />
              </label>
            </div>
            <label>
              提交说明
              <textarea defaultValue="朗读课文并上传录音，家长也可以协助确认。" />
            </label>
            <footer className="dialog-actions">
              <button className="button" type="button" onClick={() => setShowCreate(false)}>
                取消
              </button>
              <button className="button primary" type="submit">
                保存草稿
              </button>
            </footer>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

interface ReviewRow {
  readonly alias: string;
  readonly task: string;
  readonly group: string;
  readonly submitted: string;
  readonly reviewer: string;
}
const reviewRows: readonly ReviewRow[] = [
  {
    alias: "晨曦 001",
    task: "朗读《秋天的雨》",
    group: "三年级一班",
    submitted: "今天 09:48",
    reviewer: "待分配",
  },
  {
    alias: "小禾 014",
    task: "口算练习 20 题",
    group: "四年级二班",
    submitted: "今天 09:36",
    reviewer: "陈老师",
  },
  {
    alias: "星宇 023",
    task: "家庭阅读 15 分钟",
    group: "周末阅读营",
    submitted: "今天 08:55",
    reviewer: "家长优先",
  },
];

export function InstitutionReviews(): React.JSX.Element {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [done, setDone] = useState(0);
  const columns: readonly DataTableColumn<ReviewRow>[] = [
    {
      key: "select",
      label: "选择",
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`选择 ${row.alias}`}
          checked={selected.includes(row.alias)}
          onChange={(event) =>
            setSelected((current) =>
              event.target.checked
                ? [...current, row.alias]
                : current.filter((item) => item !== row.alias),
            )
          }
        />
      ),
    },
    { key: "alias", label: "机构成员", render: (row) => <strong>{row.alias}</strong> },
    { key: "task", label: "任务", render: (row) => row.task },
    { key: "group", label: "分组", render: (row) => row.group },
    { key: "submitted", label: "提交时间", render: (row) => row.submitted },
    {
      key: "reviewer",
      label: "审核人",
      render: (row) => <span className="tag warning">{row.reviewer}</span>,
    },
    {
      key: "action",
      label: "操作",
      render: () => (
        <button className="text-button" type="button">
          进入审核
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PageHeader
        title="协同审核"
        description="只展示机构任务的提交状态；家庭自建任务和家庭愿望不会出现在这里。"
      />
      <MetricSummary
        items={[
          { label: "待审核", value: 42 - done, note: "其中家长优先 16 条" },
          { label: "今日已通过", value: 108 + done },
          { label: "需补充", value: 7 },
        ]}
      />
      <FilterBar onSearch={() => undefined} searchLabel="搜索机构成员或任务">
        <button
          className="button"
          disabled={selected.length === 0}
          type="button"
          onClick={() => {
            setDone((value) => value + selected.length);
            setSelected([]);
          }}
        >
          批量通过 {selected.length > 0 ? `(${selected.length})` : ""}
        </button>
      </FilterBar>
      <DataTable
        caption="待审核记录"
        rows={reviewRows.filter((row) => !selected.includes(`done-${row.alias}`))}
        columns={columns}
      />
    </section>
  );
}

interface MemberRow {
  readonly alias: string;
  readonly number: string;
  readonly group: string;
  readonly guardian: string;
  readonly activity: string;
  readonly status: string;
}
const memberRows: readonly MemberRow[] = [
  {
    alias: "晨曦 001",
    number: "OM-001",
    group: "三年级一班",
    guardian: "家长已关联",
    activity: "今天 09:48",
    status: "正常",
  },
  {
    alias: "小禾 014",
    number: "OM-014",
    group: "四年级二班",
    guardian: "家长已关联",
    activity: "今天 09:36",
    status: "正常",
  },
  {
    alias: "星宇 023",
    number: "OM-023",
    group: "周末阅读营",
    guardian: "等待确认",
    activity: "昨天 20:10",
    status: "待确认",
  },
];

export function InstitutionMembers(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState(false);
  const rows = memberRows.filter((row) =>
    `${row.alias}${row.number}${row.group}`.includes(query.trim()),
  );
  const columns: readonly DataTableColumn<MemberRow>[] = [
    { key: "alias", label: "机构成员别名", render: (row) => <strong>{row.alias}</strong> },
    { key: "number", label: "机构成员编号", render: (row) => row.number },
    { key: "group", label: "所在分组", render: (row) => row.group },
    { key: "guardian", label: "家长关联", render: (row) => row.guardian },
    { key: "activity", label: "最近活跃", render: (row) => row.activity },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "正常" ? "" : "warning"}`}>{row.status}</span>
      ),
    },
  ];
  return (
    <section className="page">
      <PageHeader
        title="机构成员"
        description="成员通过机构内别名与编号管理；系统不会向机构暴露跨组织身份。"
        action={
          <button className="button primary" type="button" onClick={() => setInvite(true)}>
            邀请成员
          </button>
        }
      />
      <FilterBar onSearch={setQuery} searchLabel="搜索成员别名、编号或分组">
        <button className="button" type="button">
          批量导入
        </button>
      </FilterBar>
      <DataTable caption={`成员列表 · ${rows.length} 人`} rows={rows} columns={columns} />
      {invite ? (
        <Dialog label="邀请成员加入" onClose={() => setInvite(false)}>
          <div className="invite-card">
            <p>家长扫码确认后，孩子会以机构成员别名加入，不会开放家庭空间。</p>
            <p>邀请口令</p>
            <div className="invite-code">CY-3A-0921</div>
            <button className="button primary" type="button" onClick={() => setInvite(false)}>
              复制邀请口令
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

export function InstitutionAnalytics(): React.JSX.Element {
  const [period, setPeriod] = useState("近7天");
  const data = useMemo(() => (period === "近7天" ? [89, 92, 84, 95] : [86, 90, 82, 91]), [period]);
  return (
    <section className="page">
      <PageHeader
        title="学习数据"
        description="查看机构任务的参与趋势，不展示家庭私有任务和个人愿望。"
        action={
          <select
            aria-label="统计周期"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option>近7天</option>
            <option>近30天</option>
          </select>
        }
      />
      <MetricSummary
        items={[
          { label: "平均完成率", value: `${data[0]}%`, note: period },
          { label: "按时提交率", value: `${data[1]}%` },
          { label: "家长协同审核", value: "64%" },
          { label: "累计发放阳光", value: "12,680" },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel">
          <h2>分组完成率</h2>
          <div className="progress-list">
            {groupRows.map((group, index) => (
              <label key={group.name}>
                <span>
                  <b>{group.name}</b>
                  <small>{data[index]}%</small>
                </span>
                <progress value={data[index]} max="100" />
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>学科参与</h2>
          <div className="subject-grid">
            <div>
              <strong>语文</strong>
              <span>1,286 次</span>
            </div>
            <div>
              <strong>数学</strong>
              <span>986 次</span>
            </div>
            <div>
              <strong>英语</strong>
              <span>742 次</span>
            </div>
            <div>
              <strong>习惯</strong>
              <span>635 次</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

interface ExportRow {
  readonly name: string;
  readonly scope: string;
  readonly requester: string;
  readonly created: string;
  readonly status: string;
}
export function InstitutionExports(): React.JSX.Element {
  const [exports, setExports] = useState<readonly ExportRow[]>([
    {
      name: "八月任务完成汇总.xlsx",
      scope: "全机构 · 聚合数据",
      requester: "陈老师",
      created: "9月1日 10:20",
      status: "可下载",
    },
    {
      name: "三年级一班成员名单.xlsx",
      scope: "机构成员别名",
      requester: "林老师",
      created: "8月29日 16:45",
      status: "已过期",
    },
  ]);
  const columns: readonly DataTableColumn<ExportRow>[] = [
    { key: "name", label: "文件", render: (row) => <strong>{row.name}</strong> },
    { key: "scope", label: "数据范围", render: (row) => row.scope },
    { key: "requester", label: "申请人", render: (row) => row.requester },
    { key: "created", label: "申请时间", render: (row) => row.created },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "生成中" ? "warning" : ""}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: (row) => (
        <button className="text-button" disabled={row.status !== "可下载"} type="button">
          下载
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <PageHeader
        title="数据导出"
        description="导出仅包含当前机构被授权的数据，并自动记录审计日志。"
        action={
          <button
            className="button primary"
            type="button"
            onClick={() =>
              setExports((rows) => [
                {
                  name: "机构任务完成汇总.xlsx",
                  scope: "全机构 · 聚合数据",
                  requester: "陈老师",
                  created: "刚刚",
                  status: "生成中",
                },
                ...rows,
              ])
            }
          >
            新建导出
          </button>
        }
      />
      <div className="privacy-note">
        <b>导出边界</b>
        <span>不包含家庭自建任务、愿望、跨机构身份信息和非本机构提交。</span>
      </div>
      <DataTable caption="导出记录" rows={exports} columns={columns} />
    </section>
  );
}

export function InstitutionBilling(): React.JSX.Element {
  const [annual, setAnnual] = useState(true);
  return (
    <section className="page">
      <PageHeader
        title="套餐与用量"
        description="查看当前机构版本、成员额度和续费周期。暂不在后台直接支付。"
      />
      <section className="plan-hero">
        <div>
          <span className="tag">成长版</span>
          <h2>适合学校与多班级协同</h2>
          <p>当前周期至 2027年8月31日 · 由机构管理员统一续约</p>
        </div>
        <img src={orchardOverview} alt="成长中的苹果树" />
      </section>
      <MetricSummary
        items={[
          { label: "成员额度", value: "386 / 500", note: "剩余 114 名" },
          { label: "教师与助教", value: "28 / 50" },
          { label: "本月存储", value: "6.8 / 20 GB" },
        ]}
      />
      <section className="panel">
        <div className="panel-title-row">
          <h2>计费周期预估</h2>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={annual}
              onChange={(event) => setAnnual(event.target.checked)}
            />
            按年查看
          </label>
        </div>
        <p className="price">
          <strong>{annual ? "¥ 6,980" : "¥ 698"}</strong>
          <span> / {annual ? "年" : "月"}</span>
        </p>
        <p className="muted">
          最终价格与机构规模、服务范围有关。续约前会由商务人员与机构管理员确认。
        </p>
        <button className="button primary" type="button">
          联系续约顾问
        </button>
      </section>
    </section>
  );
}

export function InstitutionSettings(): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <section className="page">
      <PageHeader title="机构设置" description="配置机构资料、审核方式与成员权限。" />
      {saved ? (
        <p className="success-message" role="status">
          设置已保存。
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
          <h2>机构资料</h2>
          <div className="form-stack">
            <label>
              机构名称
              <input defaultValue="春芽小学" />
            </label>
            <label>
              对外简称
              <input defaultValue="春芽小学" />
            </label>
            <label>
              联系人
              <input defaultValue="陈老师" />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>任务与审核</h2>
          <div className="setting-list">
            <label>
              <span>
                <b>家长协同审核</b>
                <small>机构任务提交后，允许已关联家长审核</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>
                <b>默认加入今日重点</b>
                <small>家长未手动配置时，机构当天任务自动进入重点</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>
                <b>任务到期提醒</b>
                <small>截止前 2 小时提醒教师和家长</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
          </div>
        </section>
        <section className="panel full-span">
          <div className="panel-title-row">
            <div>
              <h2>角色权限</h2>
              <p className="muted">教师与助教只能管理被分配的分组，机构管理员可查看机构汇总。</p>
            </div>
            <Link to="/institution/members">管理人员</Link>
          </div>
          <div className="permission-row">
            <span>教师</span>
            <b>布置任务 · 审核提交 · 查看本分组数据</b>
          </div>
          <div className="permission-row">
            <span>助教</span>
            <b>协助审核 · 查看本分组任务</b>
          </div>
        </section>
        <footer className="settings-actions">
          <button className="button primary" type="submit">
            保存设置
          </button>
        </footer>
      </form>
    </section>
  );
}
