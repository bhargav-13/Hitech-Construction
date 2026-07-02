"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Download,
  MoreVertical,
  Search,
  Star,
  ThumbsUp,
  CheckCircle2,
  ShoppingCart,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NewProjectModal } from "@/components/NewProjectModal";
import { EditProjectModal } from "@/components/EditProjectModal";
import { useAppStore } from "@/lib/store";
import { formatRupee, projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const projects = useAppStore((s) => s.projects);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <AppShell title="Projects">
      <div className="mb-4 grid grid-cols-4 gap-4">
        <KpiCard label="Approval (Pending)" value={13} icon={ThumbsUp} tint="bg-violet-100 text-violet-500" />
        <KpiCard label="Material (Pending)" value={0} icon={ShoppingCart} tint="bg-amber-100 text-amber-600" />
        <KpiCard label="To Do (Pending)" value={91} icon={CheckCircle2} tint="bg-orange-100 text-orange-500" />
        <div className="rounded-xl bg-teal-50 p-4">
          <div className="mb-1 text-sm font-semibold text-gray-800">Our Services</div>
          <p className="text-xs text-gray-500">Introducing new services for you...</p>
          <button className="mt-1 text-xs font-medium text-brand-accent">Learn more &gt;</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            All
            <ChevronDown size={14} />
          </button>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
            {projects.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            Stage
            <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            Category
            <ChevronDown size={14} />
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <input placeholder="Search Projects" className="w-32 text-sm outline-none" readOnly />
            <Search size={15} className="text-gray-400" />
          </div>
          <button className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-500 hover:bg-gray-50">
            <Download size={16} />
          </button>
          <button
            onClick={() => setShowNewProject(true)}
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            + New Project
          </button>
        </div>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 text-center font-medium">Progress</th>
              <th className="px-4 py-3 text-center font-medium">In/Out</th>
              <th className="px-4 py-3 text-center font-medium">To Do</th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                key={project.id}
                className="relative border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${projectAvatarColor(project.id)}`}
                    >
                      {projectInitials(project.name)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/project/${project.id}`}
                        className="block truncate text-sm font-medium text-gray-800 hover:text-brand-accent"
                      >
                        {project.name}
                      </Link>
                      <div className="truncate text-xs text-gray-400">{project.address || "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="text-sm text-gray-700">{project.progress.toFixed(0)}%</div>
                  <div className="mx-auto mt-1 h-1 w-20 rounded-full bg-gray-100">
                    <div
                      className="h-1 rounded-full bg-green-500"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xs whitespace-nowrap text-gray-600">
                  {formatRupee(project.inAmount)}/{formatRupee(project.outAmount)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-medium text-teal-600">
                    {project.todoCount}
                  </span>
                </td>
                <td className="relative px-4 py-3">
                  <div className="flex items-center justify-end gap-2 text-gray-400">
                    <Star size={16} className="hover:text-amber-400" />
                    <button
                      onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                    >
                      <MoreVertical size={16} className="hover:text-gray-600" />
                    </button>
                  </div>
                  {openMenuId === project.id && (
                    <div className="absolute top-10 right-4 z-10 w-40 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                      <button
                        onClick={() => {
                          setEditing(project);
                          setOpenMenuId(null);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Edit Project Info
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {editing && <EditProjectModal project={editing} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number }>;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-gray-800">{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}
