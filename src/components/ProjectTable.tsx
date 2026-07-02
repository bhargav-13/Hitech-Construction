import { ArrowDown, Calendar, LayoutList, Maximize2, MoreVertical, Type } from "lucide-react";
import type { Project } from "@/lib/types";
import { healthTableLabel, statusTableLabel } from "@/lib/types";

interface Column {
  key: keyof Project | "progress";
  label: string;
  icon: "text" | "date";
  sortable?: boolean;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Project Name", icon: "text", sortable: true },
  { key: "category", label: "Project Category", icon: "text" },
  { key: "keyPersonnel", label: "Key Personnel", icon: "text" },
  { key: "status", label: "Project Status", icon: "text" },
  { key: "health", label: "Project Health", icon: "text" },
  { key: "startDate", label: "Start Date", icon: "date" },
  { key: "endDate", label: "End Date", icon: "date" },
  { key: "progress", label: "Progress", icon: "text" },
  { key: "customerName", label: "Customer Name", icon: "text" },
  { key: "stage", label: "Project Stage", icon: "text" },
];

function cellValue(project: Project, key: Column["key"]): string {
  if (key === "status") return statusTableLabel(project.status);
  if (key === "health") return healthTableLabel(project.health);
  if (key === "progress") return `${project.progress.toFixed(2)}%`;
  const value = project[key as keyof Project];
  return value ? String(value) : "";
}

export function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Project Operational Summary Dashboard
        </h3>
        <div className="flex items-center gap-3 text-gray-400">
          <Maximize2 size={15} />
          <MoreVertical size={15} />
        </div>
      </div>
      <div className="w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-teal-100 bg-gray-50 text-left text-gray-500">
              <th className="border-r border-teal-100 px-3 py-2 w-10">
                <LayoutList size={13} className="text-teal-300" />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className="border-r border-teal-100 px-3 py-2 font-medium whitespace-nowrap last:border-r-0"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.icon === "date" ? (
                      <Calendar size={13} className="text-teal-300" />
                    ) : (
                      <Type size={13} className="text-teal-300" />
                    )}
                    {col.label}
                    {col.sortable && <ArrowDown size={12} className="text-gray-400" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((project, i) => (
              <tr key={project.id} className="border-b border-teal-50">
                <td className="border-r border-teal-50 px-3 py-2 text-gray-400">{i + 1}</td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.label}
                    className={`border-r border-teal-50 px-3 py-2 whitespace-nowrap last:border-r-0 ${
                      col.key === "stage" || col.key === "name" ? "text-teal-600" : "text-gray-700"
                    }`}
                  >
                    {cellValue(project, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
