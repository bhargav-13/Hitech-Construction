import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp,
  Calendar,
  ChevronLeft,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Search,
  SortAsc,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { findReport } from "@/lib/reports";
import { getReportColumns, getReportFilters } from "@/lib/reportSchema";
import { generateReportRows } from "@/lib/reportData";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = findReport(slug);
  if (!found) notFound();

  const { category, report } = found;
  const columns = getReportColumns(report.name, category.name);
  const filters = getReportFilters(report.name, category.name);
  const rows = generateReportRows(slug, report.name, columns);

  return (
    <AppShell title="Reports">
      <Link
        href="/report"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-accent"
      >
        <ChevronLeft size={15} />
        Back to Reports
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">{report.name}</h2>
        <div className="flex items-center gap-2">
          <ToolbarIconButton icon={RefreshCw} />
          <ToolbarTextButton icon={Filter} label="Filter" />
          <ToolbarTextButton icon={SortAsc} label="Sort" />
          <ToolbarTextButton icon={MoreHorizontal} label="More" />
          <ToolbarIconButton icon={Upload} />
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Search size={15} className="text-gray-400" />
            <input
              placeholder="Search Data"
              className="w-40 text-sm text-gray-600 outline-none"
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        {filters.map((filter) => (
          <div key={filter.label}>
            <label className="mb-1 block text-xs text-gray-500">{filter.label}:</label>
            {filter.type === "date" ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-400">
                <Calendar size={14} />
                - Select -
              </div>
            ) : (
              <select className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700">
                <option>All</option>
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-teal-500 text-left text-white">
              <th className="w-10 border-r border-white/20 px-3 py-2" />
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className="border-r border-white/20 px-3 py-2 font-semibold whitespace-nowrap last:border-r-0"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.type === "date" && <Calendar size={13} />}
                    {col.label}
                    {i === 0 && <ArrowUp size={12} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 even:bg-gray-50">
                <td className="border-r border-gray-100 px-3 py-2 text-gray-400">{i + 1}</td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="border-r border-gray-100 px-3 py-2 whitespace-nowrap text-gray-700 last:border-r-0"
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function ToolbarIconButton({ icon: Icon }: { icon: React.ComponentType<{ size?: number }> }) {
  return (
    <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
      <Icon size={16} />
    </button>
  );
}

function ToolbarTextButton({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
      <Icon size={15} />
      {label}
    </button>
  );
}
