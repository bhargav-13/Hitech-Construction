interface Column {
  key: string;
  label: string;
}

export function SimpleTable({
  columns,
  rows,
}: {
  columns: Column[];
  rows: Record<string, string | number>[];
}) {
  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2 font-medium whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2 whitespace-nowrap text-gray-700">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
