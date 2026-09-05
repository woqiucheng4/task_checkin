import offline from "../../assets/orchard/scene-offline.png";
export function StatusView({
  action,
  kind,
  message,
  title,
}: {
  readonly action?: () => void;
  readonly kind: "empty" | "error" | "loading";
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
  return (
    <div className="admin-status" role={kind === "error" ? "alert" : "status"}>
      <img src={offline} alt="" />
      <h2>{title}</h2>
      <p>{message}</p>
      {action ? (
        <button type="button" className="button primary" onClick={action}>
          重试
        </button>
      ) : null}
    </div>
  );
}
