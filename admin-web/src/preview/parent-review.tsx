import { Icon } from "tdesign-icons-react";
import { useState } from "react";
import apple from "../assets/orchard/apple-fruit-growing.png";
import { MobileShell, MobileTopbar } from "./mobile-shell";
import "./preview.css";

export function ParentReviewPreview(): React.JSX.Element {
  const [reviewed, setReviewed] = useState(false);
  const [reward, setReward] = useState(12);
  return (
    <MobileShell
      active="待办"
      navItems={[
        { icon: "task-checked", label: "待办" },
        { icon: "add-circle", label: "布置" },
        { icon: "tree-round-dot-vertical", label: "成长" },
        { icon: "user", label: "我的" },
      ]}
    >
      <MobileTopbar account="晨曦妈妈 · 当前孩子：晨曦" title="今天还有 2 件事需要你" />
      <section className="parent-summary">
        <div>
          <span>待审核</span>
          <strong>{reviewed ? 1 : 2}</strong>
        </div>
        <div>
          <span>今日完成</span>
          <strong>{reviewed ? 4 : 3}</strong>
        </div>
        <img src={apple} alt="正在结果的苹果树" />
      </section>
      <section className="mobile-section">
        <header>
          <h2>等待你的确认</h2>
          <button type="button">
            切换孩子 <Icon name="chevron-right" />
          </button>
        </header>
        {reviewed ? (
          <div className="mobile-success" role="status">
            <Icon name="check-circle" size="28px" />
            <div>
              <b>朗读任务已确认</b>
              <span>12 阳光已进入晨曦的小树</span>
            </div>
          </div>
        ) : (
          <article className="review-card">
            <div className="review-heading">
              <span className="task-icon school">
                <Icon name="book-open" size="32px" />
              </span>
              <div>
                <span className="source school">学校 · 三年级一班</span>
                <h3>语文 · 朗读《秋天的雨》</h3>
                <small>陈老师发布 · 今天 09:48 提交</small>
              </div>
            </div>
            <div className="evidence">
              <Icon name="play-circle" size="36px" />
              <div>
                <b>朗读录音 · 02:06</b>
                <span>已完成上传，点击试听</span>
              </div>
            </div>
            <div className="reward-control">
              <div>
                <b>本次阳光</b>
                <small>采用家庭默认规则</small>
              </div>
              <button
                type="button"
                aria-label="减少阳光"
                onClick={() => setReward((value) => Math.max(0, value - 1))}
              >
                −
              </button>
              <strong>{reward}</strong>
              <button
                type="button"
                aria-label="增加阳光"
                onClick={() => setReward((value) => value + 1)}
              >
                ＋
              </button>
            </div>
            <p className="role-note">家长确认只影响家庭阳光；教师的学习评价会单独记录。</p>
            <div className="review-actions">
              <button type="button">请补充</button>
              <button className="mobile-primary" type="button" onClick={() => setReviewed(true)}>
                确认完成
              </button>
            </div>
          </article>
        )}
        <article className="review-card compact">
          <div className="review-heading">
            <span className="task-icon family">
              <Icon name="home" size="32px" />
            </span>
            <div>
              <span className="source family">家庭</span>
              <h3>整理自己的书桌</h3>
              <small>已提交照片 · 等待确认</small>
            </div>
          </div>
          <button className="mobile-link" type="button">
            查看并审核 <Icon name="chevron-right" />
          </button>
        </article>
      </section>
    </MobileShell>
  );
}
