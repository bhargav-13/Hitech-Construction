"use client";

import { usePathname } from "next/navigation";
import { Bell, FolderKanban, UserCircle } from "lucide-react";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { GlobalSearch } from "./GlobalSearch";
import { Select } from "./Select";

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
      <div className="flex items-center gap-4 text-sm text-brand-accent">
        <GlobalSearch />
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
    <Select
      value={projectId}
      onChange={setProjectId}
      title="Filter this page by project"
      icon={<FolderKanban size={15} className="shrink-0 text-brand-accent" />}
      className="w-[240px]"
      buttonClassName="font-medium"
      options={[
        { value: "all", label: "All Projects" },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
      ]}
    />
  );
}
