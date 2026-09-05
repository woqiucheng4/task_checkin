export interface MetricItem {
  readonly label: string;
  readonly value: string | number;
  readonly note?: string;
}
export function MetricSummary({
  items,
}: {
  readonly items: readonly MetricItem[];
}): React.JSX.Element {
  return (
    <div className="metric-summary">
      {items.map((item) => (
        <section key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note ? <small>{item.note}</small> : null}
        </section>
      ))}
    </div>
  );
}
