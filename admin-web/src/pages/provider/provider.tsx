import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../../components/data-table/data-table";
import { FilterBar } from "../../components/filter-bar/filter-bar";
import { MetricSummary } from "../../components/metric-summary/metric-summary";
import apple from "../../assets/orchard/apple-mature.png";
import orange from "../../assets/orchard/orange-mature.png";
import pear from "../../assets/orchard/pear-mature.png";
import blossom from "../../assets/orchard/apple-blossom.png";
import seedling from "../../assets/orchard/apple-seedling.png";
import watering from "../../assets/orchard/scene-watering.png";

function ProviderHeader({
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
        <p className="eyebrow">知新教育内容中心 · 内容空间</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function ProviderDashboard(): React.JSX.Element {
  return (
    <section className="page">
      <ProviderHeader
        title="内容工作台"
        description="管理自有模板、主题与素材，并查看去标识化的聚合使用趋势。"
        action={
          <Link className="button primary" to="/provider/templates">
            新建任务模板
          </Link>
        }
      />
      <MetricSummary
        items={[
          { label: "已发布模板", value: 128, note: "草稿 16 个" },
          { label: "模板使用次数", value: "8,462", note: "近 30 天聚合" },
          { label: "已上线主题", value: 3, note: "1 个待审核" },
          { label: "本期预估结算", value: "¥ 12,680", note: "截至 9月5日" },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel action-panel">
          <div>
            <p className="eyebrow">内容提醒</p>
            <h2>用清楚、具体的任务支持真实成长</h2>
            <ul className="plain-list">
              <li>
                <span>待平台审核</span>
                <Link to="/provider/templates">5 个模板</Link>
              </li>
              <li>
                <span>需要补充版权材料</span>
                <Link to="/provider/assets">2 项素材</Link>
              </li>
              <li>
                <span>八月结算单</span>
                <Link to="/provider/settlement">等待确认</Link>
              </li>
            </ul>
          </div>
          <img src={apple} alt="苹果树内容主题" />
        </section>
        <section className="panel">
          <h2>近 30 天热门内容</h2>
          <ol className="ranking-list">
            <li>
              <b>每日朗读 10 分钟</b>
              <span>2,146 次使用</span>
            </li>
            <li>
              <b>口算练习 20 题</b>
              <span>1,836 次使用</span>
            </li>
            <li>
              <b>观察一株植物</b>
              <span>1,208 次使用</span>
            </li>
            <li>
              <b>整理今日书包</b>
              <span>986 次使用</span>
            </li>
          </ol>
        </section>
      </div>
    </section>
  );
}

interface TemplateRow {
  readonly title: string;
  readonly category: string;
  readonly mode: string;
  readonly reward: string;
  readonly updated: string;
  readonly status: string;
}
const templates: readonly TemplateRow[] = [
  {
    title: "每日朗读 10 分钟",
    category: "语文",
    mode: "录音",
    reward: "建议 10 阳光",
    updated: "今天 09:30",
    status: "已发布",
  },
  {
    title: "口算练习 20 题",
    category: "数学",
    mode: "照片",
    reward: "建议 12 阳光",
    updated: "昨天 16:20",
    status: "已发布",
  },
  {
    title: "观察一株植物",
    category: "科学",
    mode: "文字 + 照片",
    reward: "建议 15 阳光",
    updated: "9月3日",
    status: "审核中",
  },
];
export function ProviderTemplates(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const rows = templates.filter((row) => `${row.title}${row.category}`.includes(query.trim()));
  const columns: readonly DataTableColumn<TemplateRow>[] = [
    { key: "title", label: "模板名称", render: (row) => <strong>{row.title}</strong> },
    { key: "category", label: "分类", render: (row) => row.category },
    { key: "mode", label: "完成方式", render: (row) => row.mode },
    { key: "reward", label: "奖励建议", render: (row) => row.reward },
    { key: "updated", label: "最近更新", render: (row) => row.updated },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "审核中" ? "warning" : ""}`}>{row.status}</span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: () => (
        <button className="text-button" type="button" onClick={() => setEditing(true)}>
          编辑
        </button>
      ),
    },
  ];
  return (
    <section className="page">
      <ProviderHeader
        title="任务模板"
        description="模板只包含内容字段和建议规则，不接触使用方的业务明细。"
        action={
          <button className="button primary" type="button" onClick={() => setEditing(true)}>
            新建模板
          </button>
        }
      />
      {saved ? (
        <p className="success-message" role="status">
          模板草稿已保存。
        </p>
      ) : null}
      <FilterBar onSearch={setQuery} searchLabel="搜索模板名称或分类">
        <select aria-label="模板状态">
          <option>全部状态</option>
          <option>已发布</option>
          <option>审核中</option>
          <option>草稿</option>
        </select>
      </FilterBar>
      <DataTable caption={`自有模板 · ${rows.length} 个`} rows={rows} columns={columns} />
      {editing ? (
        <div className="dialog-backdrop">
          <section
            className="dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-label="编辑任务模板"
          >
            <header>
              <h2>编辑任务模板</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setEditing(false)}
              >
                ×
              </button>
            </header>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                setEditing(false);
                setSaved(true);
              }}
            >
              <label>
                模板名称
                <input required defaultValue="每日朗读 10 分钟" />
              </label>
              <label>
                适用分类
                <select defaultValue="语文">
                  <option>语文</option>
                  <option>数学</option>
                  <option>英语</option>
                  <option>科学</option>
                </select>
              </label>
              <label>
                任务说明
                <textarea required defaultValue="选择一篇适合当前年级的课文，认真朗读 10 分钟。" />
              </label>
              <div className="form-row">
                <label>
                  完成方式
                  <select defaultValue="录音">
                    <option>确认</option>
                    <option>录音</option>
                    <option>照片</option>
                    <option>文字 + 照片</option>
                  </select>
                </label>
                <label>
                  建议阳光
                  <input type="number" min="0" defaultValue="10" />
                </label>
              </div>
              <label>
                版权与来源说明
                <textarea required defaultValue="内容说明为本机构原创，不包含第三方课文原文。" />
              </label>
              <footer className="dialog-actions">
                <button className="button" type="button" onClick={() => setEditing(false)}>
                  取消
                </button>
                <button className="button primary" type="submit">
                  保存草稿
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

const themes = [
  { name: "丰收苹果园", stage: "完整成长阶段", status: "已上线", image: apple },
  { name: "金秋梨园", stage: "完整成长阶段", status: "已上线", image: pear },
  { name: "暖阳橙园", stage: "完整成长阶段", status: "待审核", image: orange },
];
export function ProviderThemes(): React.JSX.Element {
  const [selected, setSelected] = useState("丰收苹果园");
  return (
    <section className="page">
      <ProviderHeader
        title="果树主题"
        description="维护自有果树主题和成长阶段，视觉上线前由平台审核。"
        action={
          <button className="button primary" type="button">
            提交新主题
          </button>
        }
      />
      <div className="theme-grid">
        {themes.map((theme) => (
          <button
            className={`theme-card ${selected === theme.name ? "selected" : ""}`}
            type="button"
            key={theme.name}
            onClick={() => setSelected(theme.name)}
          >
            <img src={theme.image} alt={`${theme.name}预览`} />
            <span>
              <b>{theme.name}</b>
              <small>{theme.stage}</small>
            </span>
            <em className={`tag ${theme.status === "待审核" ? "warning" : ""}`}>{theme.status}</em>
          </button>
        ))}
      </div>
      <section className="panel theme-detail">
        <div>
          <p className="eyebrow">当前选择</p>
          <h2>{selected}</h2>
          <p>包含种子、萌芽、幼苗、开花、结果和成熟阶段，适配低年级与高年级两档密度。</p>
        </div>
        <button className="button" type="button">
          管理成长阶段
        </button>
      </section>
    </section>
  );
}

const assetItems = [
  { name: "苹果树开花", type: "成长阶段", image: blossom, status: "已通过" },
  { name: "苹果树幼苗", type: "成长阶段", image: seedling, status: "已通过" },
  { name: "浇水提示场景", type: "引导场景", image: watering, status: "材料待补充" },
  { name: "成熟苹果树", type: "成长阶段", image: apple, status: "已通过" },
];
export function ProviderAssets(): React.JSX.Element {
  return (
    <section className="page">
      <ProviderHeader
        title="素材管理"
        description="上传和管理自有插画、封面与引导场景，并登记来源和授权范围。"
        action={
          <button className="button primary" type="button">
            上传素材
          </button>
        }
      />
      <FilterBar onSearch={() => undefined} searchLabel="搜索素材名称">
        <select aria-label="素材类型">
          <option>全部类型</option>
          <option>成长阶段</option>
          <option>引导场景</option>
        </select>
      </FilterBar>
      <div className="asset-grid">
        {assetItems.map((asset) => (
          <article className="asset-card" key={asset.name}>
            <img src={asset.image} alt={asset.name} />
            <div>
              <strong>{asset.name}</strong>
              <small>{asset.type}</small>
              <span className={`tag ${asset.status === "材料待补充" ? "warning" : ""}`}>
                {asset.status}
              </span>
            </div>
            <button className="text-button" type="button">
              查看详情
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProviderUsage(): React.JSX.Element {
  return (
    <section className="page">
      <ProviderHeader
        title="授权与使用"
        description="查看自有内容的去标识化汇总，不提供使用方个体明细。"
        action={
          <select aria-label="统计周期" defaultValue="30">
            <option value="7">近7天</option>
            <option value="30">近30天</option>
          </select>
        }
      />
      <MetricSummary
        items={[
          { label: "模板使用次数", value: "8,462", note: "较上期 +12%" },
          { label: "活跃授权机构", value: 86 },
          { label: "任务完成率", value: "87.2%", note: "聚合统计" },
          { label: "素材调用次数", value: "32,680" },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel">
          <h2>模板使用趋势</h2>
          <div className="progress-list">
            <label>
              <span>
                <b>语文类</b>
                <small>3,246 次</small>
              </span>
              <progress max="4000" value="3246" />
            </label>
            <label>
              <span>
                <b>数学类</b>
                <small>2,584 次</small>
              </span>
              <progress max="4000" value="2584" />
            </label>
            <label>
              <span>
                <b>科学类</b>
                <small>1,632 次</small>
              </span>
              <progress max="4000" value="1632" />
            </label>
            <label>
              <span>
                <b>习惯类</b>
                <small>1,000 次</small>
              </span>
              <progress max="4000" value="1000" />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>授权范围</h2>
          <div className="subject-grid">
            <div>
              <strong>86</strong>
              <span>教育机构</span>
            </div>
            <div>
              <strong>3</strong>
              <span>已上线主题</span>
            </div>
            <div>
              <strong>128</strong>
              <span>已发布模板</span>
            </div>
            <div>
              <strong>0</strong>
              <span>越权访问</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

interface Settlement {
  readonly period: string;
  readonly usage: string;
  readonly amount: string;
  readonly adjustment: string;
  readonly payable: string;
  readonly status: string;
}
const settlements: readonly Settlement[] = [
  {
    period: "2026年8月",
    usage: "8,106 次",
    amount: "¥ 12,159.00",
    adjustment: "¥ 0.00",
    payable: "¥ 12,159.00",
    status: "待确认",
  },
  {
    period: "2026年7月",
    usage: "7,842 次",
    amount: "¥ 11,763.00",
    adjustment: "- ¥ 120.00",
    payable: "¥ 11,643.00",
    status: "已结算",
  },
];
export function ProviderSettlement(): React.JSX.Element {
  const [confirmed, setConfirmed] = useState(false);
  const columns: readonly DataTableColumn<Settlement>[] = [
    { key: "period", label: "结算周期", render: (row) => <strong>{row.period}</strong> },
    { key: "usage", label: "计费使用量", render: (row) => row.usage },
    { key: "amount", label: "内容服务费", render: (row) => row.amount },
    { key: "adjustment", label: "调整项", render: (row) => row.adjustment },
    { key: "payable", label: "应结金额", render: (row) => row.payable },
    {
      key: "status",
      label: "状态",
      render: (row) => (
        <span className={`tag ${row.status === "待确认" && !confirmed ? "warning" : ""}`}>
          {row.status === "待确认" && confirmed ? "已确认" : row.status}
        </span>
      ),
    },
    {
      key: "action",
      label: "操作",
      render: (row) =>
        row.status === "待确认" && !confirmed ? (
          <button className="text-button" type="button" onClick={() => setConfirmed(true)}>
            确认结算单
          </button>
        ) : (
          <button className="text-button" type="button">
            下载明细
          </button>
        ),
    },
  ];
  return (
    <section className="page">
      <ProviderHeader title="结算管理" description="结算明细按模板聚合，不包含使用方个体信息。" />
      <MetricSummary
        items={[
          { label: "本期预估", value: "¥ 12,680" },
          { label: "待确认", value: "¥ 12,159" },
          { label: "累计已结算", value: "¥ 86,420" },
        ]}
      />
      <DataTable caption="结算记录" rows={settlements} columns={columns} />
    </section>
  );
}

export function ProviderSettings(): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <section className="page">
      <ProviderHeader title="账户设置" description="维护服务方资料、版权联系人和通知偏好。" />
      {saved ? (
        <p className="success-message" role="status">
          账户设置已保存。
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
          <h2>服务方资料</h2>
          <div className="form-stack">
            <label>
              服务方名称
              <input defaultValue="知新教育内容中心" />
            </label>
            <label>
              内容品牌
              <input defaultValue="知新成长课" />
            </label>
            <label>
              内容领域
              <input defaultValue="小学语文、数学与科学素养" />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>版权与通知</h2>
          <div className="form-stack">
            <label>
              版权联系人
              <input defaultValue="内容合规负责人" />
            </label>
            <label>
              联系邮箱
              <input type="email" defaultValue="copyright@example.com" />
            </label>
          </div>
          <div className="setting-list">
            <label>
              <span>
                <b>审核结果通知</b>
                <small>模板或素材审核完成后发送邮件</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>
                <b>结算单通知</b>
                <small>新结算单生成后发送邮件</small>
              </span>
              <input type="checkbox" defaultChecked />
            </label>
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
