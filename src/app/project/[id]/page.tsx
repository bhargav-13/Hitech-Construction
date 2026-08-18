"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChevronLeft,
  Settings,
  AlertTriangle,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ListTodo,
  MapPin,
  HardHat,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProjectSettingModal } from "@/components/ProjectSettingModal";
import { TaskWorkspace } from "@/components/task/TaskWorkspace";
import { ProjectMembers } from "@/components/ProjectMembers";
import { ProjectAttendance } from "@/components/project/ProjectAttendance";
import { ProjectTransactions } from "@/components/project/ProjectTransactions";
import { ProjectParties } from "@/components/project/ProjectParties";
import { ProjectMaterials } from "@/components/project/ProjectMaterials";
import { ProjectStaff } from "@/components/project/ProjectStaff";
import { ProjectSite } from "@/components/project/ProjectSite";
import { ProjectTender } from "@/components/project/ProjectTender";
import { ProjectActivity } from "@/components/project/ProjectActivity";
import * as api from "@/lib/api";
import type { ProjectResponse, ProjectSummary } from "@/lib/api";
import { projectInitials } from "@/lib/projectHelpers";
import { inr } from "@/lib/format";

export const runtime = "edge";

/**
 * The project workspace.
 *
 * <p>Every tab here renders the owning module's own surface, scoped to this project — a project
 * doesn't store transactions, staff or materials, it's a lens onto the modules that do. Tabs fetch
 * on activation rather than on mount, so opening a project is one request, not fourteen.
 *
 * <p>Tabs that had nothing behind them ("Subcon", "Equipment", "Files", "MOM", "Inspection") have
 * been removed rather than left as "coming soon" panels: seven placeholders were the main reason
 * the module read as unfinished. They come back when they have data.
 */
const TABS = [
  "Dashboard",
  "Site",
  "Transaction",
  "Party",
  "Material",
  "Task",
  "Staff",
  "Attendance",
  "Members",
  "Tender",
  "Activity",
] as const;
type Tab = (typeof TABS)[number];

const STATUS_DISPLAY: Record<ProjectResponse["status"], string> = {
  NOT_STARTED: "Not Started",
  ONGOING: "Ongoing",
  ONHOLD: "On Hold",
  COMPLETED: "Completed",
};
const HEALTH_DISPLAY: Record<ProjectResponse["health"], string> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
};
const STATUS_CHIP: Record<ProjectResponse["status"], string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  ONGOING: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  ONHOLD: "bg-amber-50 text-amber-700 ring-amber-600/20",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};
const HEALTH_CHIP: Record<ProjectResponse["health"], string> = {
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  AT_RISK: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [editing, setEditing] = useState(false);

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProject(await api.getProjectById(projectId));
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Couldn't load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  if (loading) {
    return (
      <AppShell title="Projects">
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell title="Projects">
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 py-16 text-center">
          <AlertTriangle size={24} className="mb-2 text-rose-500" />
          <p className="text-sm font-medium text-rose-700">{error ?? "Project not found."}</p>
          <Link href="/project" className="mt-3 text-sm font-medium text-brand-accent hover:underline">
            Back to projects
          </Link>
        </div>
      </AppShell>
    );
  }

  const address = [project.address, project.city].filter(Boolean).join(", ");

  return (
    <AppShell title="Projects">
      <Link href="/project" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-accent">
        <ChevronLeft size={15} />
        Back to Projects
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-lg font-bold text-white shadow-sm">
            {projectInitials(project.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{project.name}</h2>
              <span className="font-mono text-xs text-slate-400">{project.projectCode}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} className="text-slate-400" />
              {address || "No address set"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_CHIP[project.status]}`}>
            {STATUS_DISPLAY[project.status]}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${HEALTH_CHIP[project.health]}`}>
            {HEALTH_DISPLAY[project.health]}
          </span>
          <button
            onClick={() => setEditing(true)}
            title="Project settings"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className="mb-5 flex gap-6 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-1 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Each tab mounts only when opened, so a project page is one request rather than fourteen. */}
      {tab === "Dashboard" && <ProjectDashboard project={project} />}
      {tab === "Site" && <ProjectSite project={project} />}
      {tab === "Transaction" && <ProjectTransactions projectId={projectId} />}
      {tab === "Party" && <ProjectParties projectId={projectId} />}
      {tab === "Material" && <ProjectMaterials projectId={projectId} />}
      {tab === "Task" && (
        // TaskWorkspace reads query params, which needs a boundary for the production build.
        <Suspense fallback={null}>
          <TaskWorkspace projectId={params.id} />
        </Suspense>
      )}
      {tab === "Staff" && <ProjectStaff projectId={projectId} />}
      {tab === "Attendance" && <ProjectAttendance projectId={params.id} />}
      {tab === "Members" && <ProjectMembers projectId={params.id} />}
      {tab === "Tender" && <ProjectTender projectId={projectId} />}
      {tab === "Activity" && <ProjectActivity projectId={projectId} />}

      {editing && (
        <ProjectSettingModal project={project} onClose={() => setEditing(false)} onSaved={loadProject} />
      )}
    </AppShell>
  );
}

/**
 * The Dashboard tab. Every number comes from `/projects/{id}/summary`, which each module computes
 * from its own records — previously these tiles read `projects.in_amount`, `out_amount` and
 * `todo_count`, which were free-text fields on the settings modal and so could never disagree with
 * whatever someone last typed.
 */
function ProjectDashboard({ project }: { project: ProjectResponse }) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getProjectSummary(project.id)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof api.ApiError ? e.message : "Couldn't load this project's figures.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const trend = useMemo(
    () =>
      (summary?.manpower?.trend ?? []).map((d) => ({
        date: d.date.slice(5), // MM-DD is enough on an axis
        workers: d.workers,
      })),
    [summary]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const finance = summary?.finance ?? null;
  const tasks = summary?.tasks ?? null;
  const manpower = summary?.manpower ?? null;
  const progress = summary?.progress;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Activity size={16} />}
          tint="bg-cyan-50 text-cyan-600"
          label="Progress (reported)"
          value={`${project.progress}%`}
          note={progress && tasks ? `${progress.derivedFromTasks}% of tasks done` : undefined}
          warn={progress?.diverges}
        />
        <StatCard
          icon={<ArrowDownRight size={16} />}
          tint="bg-emerald-50 text-emerald-600"
          label="Billed to client"
          value={finance ? inr(finance.billed) : "—"}
          note={finance ? `${inr(finance.outstanding)} still to collect` : "No Vyapar access"}
        />
        <StatCard
          icon={<ArrowUpRight size={16} />}
          tint="bg-rose-50 text-rose-600"
          label="Spent on site"
          value={finance ? inr(finance.spent) : "—"}
          note={finance ? `${inr(finance.payable)} still to pay` : "No Vyapar access"}
        />
        <StatCard
          icon={<ListTodo size={16} />}
          tint="bg-amber-50 text-amber-600"
          label="Open tasks"
          value={tasks ? String(tasks.open) : "—"}
          note={tasks ? `${tasks.overdue} overdue · ${tasks.dueThisWeek} due this week` : "No Taskopad access"}
          warn={!!tasks && tasks.overdue > 0}
        />
      </div>

      {manpower && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<HardHat size={16} />}
            tint="bg-indigo-50 text-indigo-600"
            label="On site (latest day)"
            value={String(manpower.presentToday)}
            note={`${manpower.assignedMembers} assigned to this project`}
          />
          <StatCard
            icon={<HardHat size={16} />}
            tint="bg-indigo-50 text-indigo-600"
            label="Man-days"
            value={manpower.manDays.toFixed(1)}
            note={`${summary?.from} → ${summary?.to}`}
          />
          <StatCard
            icon={<ArrowUpRight size={16} />}
            tint="bg-slate-100 text-slate-600"
            label="Labour cost (allocated)"
            value={inr(manpower.labourCost)}
            note={manpower.costIncomplete ? "Some workers have no pay rate on file" : "From attendance × day rate"}
            warn={manpower.costIncomplete}
          />
          <StatCard
            icon={<Activity size={16} />}
            tint="bg-amber-50 text-amber-600"
            label="Overtime hours"
            value={manpower.overtimeHours.toFixed(1)}
          />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Overall progress (as reported by the site)</span>
          <span className="font-semibold text-slate-900">{project.progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${project.progress}%` }} />
        </div>
        {progress?.diverges && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
            <TriangleAlert size={13} />
            Tasks say {progress.derivedFromTasks}% complete. Percent-complete on site is a judgement
            call, but a gap this wide is worth a second look.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm md:grid-cols-3">
        <InfoRow label="Status" value={STATUS_DISPLAY[project.status]} />
        <InfoRow label="Health" value={HEALTH_DISPLAY[project.health]} />
        <InfoRow label="Stage" value={project.stage || "—"} />
        <InfoRow label="Category" value={project.category || "—"} />
        <InfoRow label="Start Date" value={project.startDate || "—"} />
        <InfoRow label="End Date" value={project.endDate || "—"} />
        <InfoRow label="Contract Value" value={inr(project.projectValue)} />
        <InfoRow label="Client" value={project.customerName || "—"} />
        <InfoRow label="Key Personnel" value={project.keyPersonnel || "—"} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Headcount on site {summary ? `(${summary.from} → ${summary.to})` : ""}
        </h3>
        {trend.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No attendance has been recorded against this project in this period.
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid vertical={false} stroke="#eef2f1" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="workers" fill="#0891b2" radius={[5, 5, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  tint,
  label,
  value,
  note,
  warn,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
      {note && <div className={`mt-1 text-[11px] ${warn ? "text-amber-600" : "text-slate-400"}`}>{note}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 font-medium text-slate-800">{value}</div>
    </div>
  );
}
