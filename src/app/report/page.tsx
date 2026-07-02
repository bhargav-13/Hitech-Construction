import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReportCategoryIcon } from "@/components/ReportCategoryIcon";
import { REPORT_CATEGORIES, slugify } from "@/lib/reports";

export default function ReportsPage() {
  return (
    <AppShell title="Reports">
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {REPORT_CATEGORIES.map((category) => (
          <div
            key={category.name}
            className="mb-4 break-inside-avoid rounded-xl border border-gray-200 bg-white"
          >
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              <ReportCategoryIcon icon={category.icon} className="text-brand-accent" />
              <h3 className="text-sm font-semibold text-brand-accent">{category.name}</h3>
            </div>
            <ul>
              {category.reports.map((report) => {
                const slug = slugify(report.name);
                return (
                  <li
                    key={report.name}
                    className="flex items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                  >
                    <Link
                      href={`/report/${slug}`}
                      className="flex-1 text-sm text-gray-700 hover:text-brand-accent"
                    >
                      {report.name}
                    </Link>
                    <div className="flex items-center gap-3 text-gray-400">
                      {report.hasDownload && <Download size={15} />}
                      <Link href={`/report/${slug}`}>
                        <Eye size={15} className="hover:text-brand-accent" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
