"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown, FolderKanban, UserCircle } from "lucide-react";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";

export function Topbar({ title }: { title: string }) {
  const pathname = usePathname();
  // The project scope dropdown sits beside every page title — compulsory across modules, except the
  // Projects screens themselves (they already are the project list / a single project).
  const showProjectScope = !pathname.startsWith("/project");

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-black/5 bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        {showProjectScope && <ProjectScopePicker />}
      </div>
      <div className="flex items-center gap-5 text-sm text-brand-accent">
        <button className="text-gray-500 hover:text-gray-700">
          <Bell size={20} />
        </button>
        <button className="text-orange-500 hover:text-orange-600">
          <UserCircle size={26} />
        </button>
      </div>
    </header>
  );
}

function ProjectScopePicker() {
  const { projects } = useProjects();
  const projectId = useProjectScope((s) => s.projectId);
  const setProjectId = useProjectScope((s) => s.setProjectId);

  return (
    <div className="relative flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 pl-2.5 pr-1.5 py-1.5 text-sm transition-colors duration-150 hover:border-gray-300">
      <FolderKanban size={15} className="shrink-0 text-brand-accent" />
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="max-w-[220px] cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium text-gray-700 outline-none"
        title="Filter this page by project"
      >
        <option value="all">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-gray-400" />
    </div>
  );
}
