import empty from "../../assets/orchard/scene-empty-tasks.png";
import success from "../../assets/orchard/scene-harvest.png";
import offline from "../../assets/orchard/scene-offline.png";
export function StatusView({
  action,
  kind,
  message,
  title,
}: {
  readonly action?: () => void;
  readonly kind: "empty" | "error" | "loading" | "offline" | "success";
  readonly message: string;
  readonly title: string;
}): React.JSX.Element {
  if (kind === "loading")
    return (
      <div className="admin-status" aria-live="polite">
        <div className="skeleton" />
        <p>{message}</p>
      </div>
    );
  const illustration = kind === "empty" ? empty : kind === "success" ? success : offline;
  return (
    <div
      className="admin-status"
      role={kind === "error" || kind === "offline" ? "alert" : "status"}
    >
      <img src={illustration} alt="" />
      <h2>{title}</h2>
      <p>{message}</p>
      {action ? (
        <button type="button" className="button primary" onClick={action}>
          {kind === "offline" ? "重新加载" : "重试"}
        </button>
      ) : null}
    </div>
  );
}
