import type { ReactNode } from "react";

export function FilterBar({
  children,
  onSearch,
  searchLabel = "搜索",
}: {
  readonly children?: ReactNode;
  readonly onSearch: (value: string) => void;
  readonly searchLabel?: string;
}): React.JSX.Element {
  return (
    <div className="filter-bar">
      <label>
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          placeholder={searchLabel}
          onChange={(event) => onSearch(event.currentTarget.value)}
        />
      </label>
      <div className="filter-actions">{children}</div>
    </div>
  );
}
