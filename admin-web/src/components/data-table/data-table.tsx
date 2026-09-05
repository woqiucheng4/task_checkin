import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: T) => ReactNode;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
}: {
  readonly caption: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
}): React.JSX.Element {
  return (
    <div className="table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex.toString()}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
