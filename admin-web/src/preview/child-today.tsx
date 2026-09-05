import { Icon } from "tdesign-icons-react";
import { useState } from "react";
import appleTree from "../assets/orchard/apple-mature.png";
import seedling from "../assets/orchard/apple-seedling.png";
import { MobileShell } from "./mobile-shell";
import "./preview.css";

interface TodayTask {
  readonly id: string;
  readonly source: string;
  readonly tone: "school" | "family";
  readonly title: string;
  readonly description: string;
  readonly deadline: string;
  readonly icon: string;
}
const todayTasks: readonly TodayTask[] = [
  {
    id: "reading",
    source: "学校",
    tone: "school",
    title: "语文 · 朗读《秋天的雨》",
    description: "认真朗读课文，录音 2 分钟",
    deadline: "今天 20:00",
    icon: "book-open",
  },
  {
    id: "math",
    source: "学校",
    tone: "school",
    title: "数学 · 完成练习题 5 道",
    description: "拍照上传作业结果",
    deadline: "今天 21:00",
    icon: "calculation",
  },
  {
    id: "desk",
    source: "家庭",
    tone: "family",
    title: "整理自己的书桌",
    description: "分类摆放书本和文具，保持整洁",
    deadline: "今天 22:00",
    icon: "home",
  },
];

export function ChildTodayPreview(): React.JSX.Element {
  const [activeTask, setActiveTask] = useState<TodayTask | null>(null);
  const [protectedIds, setProtectedIds] = useState<readonly string[]>(["desk"]);
  return (
    <MobileShell
      active="今日"
      navItems={[
        { icon: "sprout", label: "今日" },
        { icon: "tree-round-dot-vertical", label: "果园" },
        { icon: "user", label: "我的" },
      ]}
    >
      <section className="child-today">
        <header className="journal-date">
          <span>2026年9月5日</span>
          <span>星期六</span>
        </header>
        <section className="orchard-intro">
          <div className="orchard-copy">
            <h1>果园日计划</h1>
            <p>
              完成任务，收集阳光，
              <br />
              让小树快快长大！
            </p>
            <div className="sun-progress">
              <h2>阳光进度</h2>
              <p>
                <strong>18</strong>
                <b>/ 30</b>
                <span>阳光</span>
                <Icon name="sunny" size="34px" />
              </p>
              <progress max="30" value="18" />
              <small>
                再收集 <b>12</b> 阳光就能长大啦！
              </small>
            </div>
          </div>
          <div className="tree-visual">
            <img src={appleTree} alt="结着红苹果的苹果树" />
            <div className="wood-label">
              苹果树
              <br />
              <b>LV.1</b>
            </div>
          </div>
        </section>
        <section className="growth-guide">
          <h2>
            <Icon name="sprout" />
            小树成长指南
          </h2>
          <div>
            <img src={seedling} alt="苹果树幼苗" />
            <p>
              第一棵小树结果时间<strong>1 天后</strong>
            </p>
            <span />
            <img src={appleTree} alt="普通苹果树" />
            <p>
              普通小树结果时间<strong>3–5 天</strong>
            </p>
          </div>
        </section>
        <section className="today-section">
          <h2>今日任务</h2>
          <p>来自学校和家庭的 3 项任务</p>
          <div className="mobile-task-list">
            {todayTasks.map((task) => {
              const isProtected = protectedIds.includes(task.id);
              return (
                <article className="mobile-task" key={task.id}>
                  <div className={`task-icon ${task.tone}`}>
                    <Icon name={task.icon} size="36px" />
                  </div>
                  <div className="task-copy">
                    <h3>
                      <span className={`source ${task.tone}`}>{task.source}</span>
                      {task.title}
                    </h3>
                    <p>{task.description}</p>
                    <small>截止时间&nbsp;&nbsp;{task.deadline}</small>
                  </div>
                  {isProtected ? (
                    <div className="protected-state">
                      <strong>
                        {task.id === "desk" ? "已提交 · 等待家长确认" : "待确认 · 阳光已保护"}
                      </strong>
                      <span>已提交 09:48</span>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setActiveTask(task)}>
                      去完成
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <aside className="sun-tip">
          <Icon name="sunny" size="28px" />
          <span>任务被家长确认后，阳光会自动存入小树，助力成长！</span>
          <img src={seedling} alt="正在成长的小树" />
        </aside>
      </section>
      {activeTask ? (
        <div className="mobile-sheet-backdrop">
          <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label="完成任务">
            <button
              className="sheet-close"
              type="button"
              aria-label="关闭"
              onClick={() => setActiveTask(null)}
            >
              ×
            </button>
            <span className={`source ${activeTask.tone}`}>{activeTask.source}</span>
            <h2>{activeTask.title}</h2>
            <p>{activeTask.description}</p>
            <label>
              完成记录
              <textarea defaultValue="我已经认真完成，准备请家长确认。" />
            </label>
            <div className="photo-placeholder">
              <Icon name="image-add" size="30px" />
              <span>添加照片或录音</span>
            </div>
            <button
              className="mobile-primary"
              type="button"
              onClick={() => {
                setProtectedIds((items) => [...items, activeTask.id]);
                setActiveTask(null);
              }}
            >
              确认提交
            </button>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
