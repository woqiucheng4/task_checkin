import { Icon } from "tdesign-icons-react";
import { useState } from "react";
import groupTree from "../assets/orchard/scene-group-tree.png";
import { MobileShell, MobileTopbar } from "./mobile-shell";
import "./preview.css";

export function TeacherHomePreview(): React.JSX.Element {
  const [group, setGroup] = useState("三年级一班");
  const [created, setCreated] = useState(false);
  return (
    <MobileShell
      active="工作台"
      navItems={[
        { icon: "dashboard", label: "工作台" },
        { icon: "task", label: "任务" },
        { icon: "check-circle", label: "审核" },
        { icon: "usergroup", label: "分组" },
      ]}
    >
      <MobileTopbar account="陈老师 · 教师工作台" title="上午好，先处理今天的重点" />
      <section className="group-switch">
        <label>
          当前分组
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option>三年级一班</option>
            <option>周末阅读营</option>
          </select>
        </label>
        <img src={groupTree} alt="班级共同成长树" />
      </section>
      <section className="teacher-metrics">
        <div>
          <span>待审核</span>
          <strong>12</strong>
        </div>
        <div>
          <span>今日截止</span>
          <strong>3</strong>
        </div>
        <div>
          <span>需订正</span>
          <strong>5</strong>
        </div>
      </section>
      <section className="mobile-section">
        <header>
          <h2>按任务处理提交</h2>
          <button type="button">查看全部</button>
        </header>
        <article className="teacher-task-card">
          <div>
            <span className="source school">语文</span>
            <h3>朗读《秋天的雨》</h3>
            <p>{group} · 今天 20:00 截止</p>
          </div>
          <div className="submission-progress">
            <span>
              <b>32</b> / 36 已提交
            </span>
            <progress max="36" value="32" />
          </div>
          <button className="mobile-link" type="button">
            审核 8 条新记录 <Icon name="chevron-right" />
          </button>
        </article>
        <article className="teacher-task-card">
          <div>
            <span className="source school">数学</span>
            <h3>完成练习题 5 道</h3>
            <p>{group} · 今天 21:00 截止</p>
          </div>
          <div className="submission-progress">
            <span>
              <b>28</b> / 36 已提交
            </span>
            <progress max="36" value="28" />
          </div>
          <button className="mobile-link" type="button">
            审核 4 条新记录 <Icon name="chevron-right" />
          </button>
        </article>
      </section>
      <button className="teacher-create" type="button" onClick={() => setCreated(true)}>
        <Icon name="add" size="24px" />
        布置集体任务
      </button>
      {created ? (
        <div className="mobile-sheet-backdrop">
          <section
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="布置集体任务"
          >
            <button
              className="sheet-close"
              type="button"
              aria-label="关闭"
              onClick={() => setCreated(false)}
            >
              ×
            </button>
            <h2>布置集体任务</h2>
            <label>
              任务名称
              <input defaultValue="每日朗读 10 分钟" />
            </label>
            <label>
              发布到
              <input value={group} readOnly />
            </label>
            <label>
              完成要求
              <textarea defaultValue="完成朗读并上传录音，家长可协同确认阳光。" />
            </label>
            <button className="mobile-primary" type="button" onClick={() => setCreated(false)}>
              确认发布
            </button>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
