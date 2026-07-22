"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Download,
  Gauge,
  History,
  Save,
  Users2,
  ChevronLeft,
  FolderKanban,
  Repeat,
  Building2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { PriorityChip, StatusChip, UserAvatar, ProgressBar } from "@/components/task/TaskBits";
import { Select as UiSelect } from "@/components/Select";
import { recurrenceLabel } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useTaskStore } from "@/lib/taskStore";
import { TASK_STATUSES, formatTaskDate, isDueToday, isOverdue } from "@/lib/taskTypes";
import type { Task, TaskStatus } from "@/lib/taskTypes";

type ReportId =
  | "user-wise"
  | "project-wise"
  | "status-wise"
  | "user-activity"
  | "user-performance"
  | "daily"
  | "recurring"
  | "department-wise";

const REPORTS: {
  id: ReportId;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  tint: string;
}[] = [
  { id: "user-wise", title: "User Wise Report", desc: "Tasks grouped by assignee", icon: Users2, tint: "bg-blue-50 text-blue-600" },
  { id: "project-wise", title: "Project Wise Report", desc: "Tasks grouped by project", icon: FolderKanban, tint: "bg-rose-50 text-rose-600" },
  { id: "status-wise", title: "Status Wise Report", desc: "Tasks grouped by status", icon: BarChart3, tint: "bg-amber-50 text-amber-600" },
  { id: "user-activity", title: "User Activity Report", desc: "Recent activity per user", icon: Activity, tint: "bg-violet-50 text-violet-600" },
  { id: "user-performance", title: "User Wise Performance", desc: "Completion rate & overdue", icon: Gauge, tint: "bg-cyan-50 text-brand-accent" },
  { id: "daily", title: "Daily Report", desc: "What is due and done today", icon: CalendarDays, tint: "bg-sky-50 text-sky-600" },
  { id: "recurring", title: "Recurring Tasks Report", desc: "Repeat series, occurrences & next due", icon: Repeat, tint: "bg-emerald-50 text-emerald-600" },
  { id: "department-wise", title: "Department Wise Report", desc: "Workload and completion per team", icon: Building2, tint: "bg-indigo-50 text-indigo-600" },
];

export default function TaskopadReportsPage() {
  const [open, setOpen] = useState<ReportId | null>(null);
  const report = REPORTS.find((r) => r.id === open);

  return (
    <TaskopadShell>
      {!open ? (
        <div className="animate-fade-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpen(r.id)}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${r.tint}`}>
                <r.icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">{r.title}</div>
                <div className="mt-0.5 text-xs text-gray-400">{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <ReportDetail report={report!} onBack={() => setOpen(null)} />
      )}
    </TaskopadShell>
  );
}

function ReportDetail({
  report,
  onBack,
}: {
  report: (typeof REPORTS)[number];
  onBack: () => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const { users } = useUsers();
  const { departments } = useDepartments();
  const { projects } = useProjects();
  const projectScope = useProjectScope((s) => s.projectId);

  useEffect(() => {
    load();
  }, [load]);

  const [userFilter, setUserFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ran, setRan] = useState(true);
  const [saved, setSaved] = useState(false);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "No project");

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => !t.isDraft);
    // Header project dropdown scopes the whole report.
    if (projectScope !== "all") list = list.filter((t) => t.projectId === projectScope);
    if (userFilter !== "All") list = list.filter((t) => t.assigneeId === userFilter);
    if (projectFilter !== "All") list = list.filter((t) => t.projectId === projectFilter);
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (from) list = list.filter((t) => t.dueDate >= from);
    if (to) list = list.filter((t) => t.dueDate <= to);
    return list;
  }, [tasks, projectScope, userFilter, projectFilter, statusFilter, from, to]);

  function download() {
    const rows = [
      ["Code", "Task", "Project", "Assignee", "Due Date", "Priority", "Status", "Progress"],
      ...filtered.map((t) => [
        t.code,
        t.title,
        projectName(t.projectId),
        userName(t.assigneeId),
        t.dueDate,
        t.priority,
        t.status,
        `${t.progress}%`,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.id}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-all duration-150 hover:bg-gray-50 active:scale-90"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-base font-semibold text-gray-800">{report.title}</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1400);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <Save size={14} /> {saved ? "Saved ✓" : "Save Report"}
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95">
            <History size={14} /> History
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <FilterSelect
          label="Project"
          value={projectFilter}
          onChange={setProjectFilter}
          options={[
            { value: "All", label: "All projects" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <FilterSelect
          label="User"
          value={userFilter}
          onChange={setUserFilter}
          options={[
            { value: "All", label: "All users" },
            ...users.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as TaskStatus | "All")}
          options={[
            { value: "All", label: "All statuses" },
            ...TASK_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <button
          onClick={() => setRan(true)}
          className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          Search
        </button>
      </div>

      {!ran || filtered.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
            <BarChart3 size={24} />
          </div>
          <div className="text-base font-semibold text-gray-700">No report found</div>
          <p className="mt-1 text-sm text-gray-400">Adjust the filters to generate this report.</p>
        </div>
      ) : (
        <>
          {/* Every report leads with a chart of its own data, then the detail table below. */}
          <ReportChart
            id={report.id}
            tasks={filtered}
            users={users}
            userName={userName}
            projectName={projectName}
            projects={projects}
            departments={departments}
          />
          <ReportBody
            id={report.id}
            tasks={filtered}
            users={users}
            userName={userName}
            projectName={projectName}
            projects={projects}
            departments={departments}
          />
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      <UiSelect value={value} onChange={onChange} options={options} className="min-w-[150px]" />
    </label>
  );
}

/**
 * The headline chart for each report. Uses the same filtered rows as the table underneath, so the
 * picture and the numbers always agree.
 */
function ReportChart({
  id,
  tasks,
  users,
  projects,
  departments,
}: {
  id: ReportId;
  tasks: Task[];
  users: { id: string; name: string; role: string }[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
  projects: { id: string; name: string }[];
  departments: { id: number; name: string; memberCount: number }[];
}) {
  const short = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

  let title = "";
  let chart: React.ReactNode = null;

  if (id === "status-wise") {
    const data = TASK_STATUSES.map((s) => ({
      name: s,
      value: tasks.filter((t) => t.status === s).length,
    })).filter((d) => d.value > 0);
    title = "Tasks by status";
    chart = (
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2} stroke="#fff" strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={STATUS_HEX[d.name as TaskStatus]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    );
  } else if (id === "user-performance") {
    const data = users
      .map((u) => {
        const mine = tasks.filter((t) => t.assigneeId === u.id);
        const done = mine.filter((t) => t.status === "Completed").length;
        return { name: short(u.name), rate: mine.length ? Math.round((done / mine.length) * 100) : 0 };
      })
      .filter((d) => d.rate > 0 || tasks.length > 0)
      .slice(0, 10);
    title = "Completion rate by user (%)";
    chart = (
      <BarChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Completion"]} />
        <Bar dataKey="rate" fill="#0891b2" radius={[5, 5, 0, 0]} maxBarSize={38} />
      </BarChart>
    );
  } else if (id === "project-wise") {
    const data = projects
      .map((p) => ({ name: short(p.name), total: tasks.filter((t) => t.projectId === p.id).length }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    title = "Tasks per project";
    chart = (
      <BarChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="total" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={38} />
      </BarChart>
    );
  } else if (id === "department-wise") {
    const data = departments
      .map((d) => {
        const mine = tasks.filter((t) => t.departmentId === String(d.id));
        return {
          name: d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name,
          Open: mine.filter((t) => t.status !== "Completed").length,
          Completed: mine.filter((t) => t.status === "Completed").length,
        };
      })
      .filter((d) => d.Open + d.Completed > 0);
    title = "Workload by department";
    chart = (
      <BarChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Open" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Completed" stackId="a" fill="#0ca30c" radius={[5, 5, 0, 0]} maxBarSize={40} />
      </BarChart>
    );
  } else if (id === "recurring") {
    const recurring = tasks.filter((t) => t.recurrenceRule && t.recurrenceRule !== "NONE");
    const byRule = ["CUSTOM", "WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY"].map((r) => ({
      name: recurrenceLabel(r as RecurrenceRule),
      value: recurring.filter((t) => t.recurrenceRule === r).length,
    })).filter((d) => d.value > 0);
    title = "Recurring tasks by frequency";
    chart = (
      <BarChart data={byRule} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={44} />
      </BarChart>
    );
  } else if (id === "daily") {
    const data = [
      { name: "Due today", value: tasks.filter((t) => isDueToday(t)).length },
      { name: "Overdue", value: tasks.filter((t) => isOverdue(t)).length },
      { name: "Completed", value: tasks.filter((t) => t.status === "Completed").length },
    ];
    title = "Today at a glance";
    chart = (
      <BarChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={54}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.name === "Overdue" ? "#d03b3b" : d.name === "Completed" ? "#0ca30c" : "#eda100"} />
          ))}
        </Bar>
      </BarChart>
    );
  } else {
    // user-wise and user-activity both read as "volume per user".
    const data = users
      .map((u) => ({
        name: short(u.name),
        total:
          id === "user-activity"
            ? tasks.reduce((n, t) => n + t.activity.filter((a) => a.userId === u.id).length, 0)
            : tasks.filter((t) => t.assigneeId === u.id).length,
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    title = id === "user-activity" ? "Activity events per user" : "Tasks per user";
    chart = (
      <BarChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f1ef" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#898781" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="total" fill="#0891b2" radius={[5, 5, 0, 0]} maxBarSize={38} />
      </BarChart>
    );
  }

  return (
    <div className="animate-fade-in mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #eee", fontSize: 12 } as const;
const STATUS_HEX: Record<TaskStatus, string> = {
  Pending: "#eda100",
  "In Progress": "#8b5cf6",
  "On Hold": "#3b82f6",
  Stuck: "#f97316",
  Completed: "#0ca30c",
};

function ReportBody({
  id,
  tasks,
  users,
  userName,
  projectName,
  projects,
  departments,
}: {
  id: ReportId;
  tasks: Task[];
  users: { id: string; name: string; role: string }[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
  projects: { id: string; name: string }[];
  departments: { id: number; name: string; memberCount: number }[];
}) {
  if (id === "department-wise") {
    const rows = departments
      .map((d) => {
        const mine = tasks.filter((t) => t.departmentId === String(d.id));
        const done = mine.filter((t) => t.status === "Completed").length;
        const overdue = mine.filter((t) => isOverdue(t)).length;
        return {
          id: d.id,
          name: d.name,
          members: d.memberCount,
          total: mine.length,
          done,
          overdue,
          rate: mine.length ? Math.round((done / mine.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">People</th>
              <th className="px-4 py-2 font-medium">Tasks</th>
              <th className="px-4 py-2 font-medium">Completed</th>
              <th className="px-4 py-2 font-medium">Overdue</th>
              <th className="w-44 px-4 py-2 font-medium">Completion rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.name}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.members}</td>
                <td className="px-4 py-2.5 text-gray-700">{r.total}</td>
                <td className="px-4 py-2.5 text-gray-700">{r.done}</td>
                <td className={`px-4 py-2.5 ${r.overdue ? "font-medium text-rose-600" : "text-gray-400"}`}>
                  {r.overdue}
                </td>
                <td className="px-4 py-2.5">
                  <ProgressBar value={r.rate} />
                  <div className="mt-1 text-[10px] text-gray-400">{r.rate}%</div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No departments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === "recurring") {
    // Group every occurrence under its series so a repeat rule reads as one row.
    const recurring = tasks.filter((t) => t.recurrenceRule && t.recurrenceRule !== "NONE");
    const groups = new Map<string, Task[]>();
    for (const t of recurring) {
      const key = t.seriesId ?? t.id;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const rows = [...groups.values()]
      .map((occurrences) => {
        const sorted = [...occurrences].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const head = sorted[sorted.length - 1];
        const done = sorted.filter((t) => t.status === "Completed").length;
        const next = sorted.find((t) => t.status !== "Completed");
        return {
          key: head.seriesId ?? head.id,
          title: head.title,
          rule: recurrenceLabel(head.recurrenceRule as RecurrenceRule, head.recurrenceInterval),
          assignee: userName(head.assigneeId),
          project: projectName(head.projectId),
          occurrences: sorted.length,
          done,
          nextDue: next ? next.dueDate : null,
          until: head.recurrenceUntil,
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences);

    if (rows.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
          <div className="text-sm font-medium text-gray-600">No recurring tasks yet</div>
          <p className="mt-1 text-xs text-gray-400">
            Turn on “Recurring Tasks” in a task&apos;s due-date picker to start a series.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Repeats</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Occurrences</th>
              <th className="px-4 py-2 font-medium">Completed</th>
              <th className="px-4 py-2 font-medium">Next due</th>
              <th className="px-4 py-2 font-medium">Ends</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.title}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-medium text-brand-accent">
                    <Repeat size={10} /> {r.rule}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r.project}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.assignee}</td>
                <td className="px-4 py-2.5 text-gray-700">{r.occurrences}</td>
                <td className="px-4 py-2.5 text-gray-700">
                  {r.done}
                  <span className="ml-1 text-xs text-gray-400">
                    ({Math.round((r.done / r.occurrences) * 100)}%)
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {r.nextDue ? formatTaskDate(r.nextDue) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-500">
                  {r.until ? formatTaskDate(r.until) : <span className="text-gray-400">Never</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === "user-performance") {
    const rows = users
      .map((u) => {
        const mine = tasks.filter((t) => t.assigneeId === u.id);
        const done = mine.filter((t) => t.status === "Completed").length;
        const overdue = mine.filter((t) => isOverdue(t)).length;
        const rate = mine.length ? Math.round((done / mine.length) * 100) : 0;
        return { ...u, total: mine.length, done, overdue, rate };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.rate - a.rate);

    return (
      <Table head={["User", "Total", "Completed", "Overdue", "Completion rate"]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <UserAvatar id={r.id} name={r.name} size={26} />
                <div>
                  <div className="font-medium text-gray-800">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.role}</div>
                </div>
              </div>
            </td>
            <td className="px-4 py-2.5 text-gray-600">{r.total}</td>
            <td className="px-4 py-2.5 text-green-600">{r.done}</td>
            <td className={`px-4 py-2.5 ${r.overdue > 0 ? "text-rose-600" : "text-gray-400"}`}>{r.overdue}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ProgressBar value={r.rate} className="w-24" />
                <span className="text-xs font-medium text-gray-700">{r.rate}%</span>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    );
  }

  if (id === "status-wise") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {TASK_STATUSES.map((s) => {
            const n = tasks.filter((t) => t.status === s).length;
            return (
              <div key={s} className="rounded-xl border border-gray-200 bg-white p-4">
                <StatusChip status={s} />
                <div className="mt-2 text-2xl font-semibold text-gray-800">{n}</div>
              </div>
            );
          })}
        </div>
        <TaskTable tasks={tasks} userName={userName} projectName={projectName} />
      </div>
    );
  }

  if (id === "user-activity") {
    const rows = tasks
      .flatMap((t) => t.activity.map((a) => ({ ...a, task: t.title, code: t.code })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40);
    return (
      <Table head={["User", "Activity", "Task", "Date"]}>
        {rows.map((a) => (
          <tr key={a.id + a.task} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <UserAvatar id={a.userId} name={userName(a.userId)} size={24} />
                <span className="text-gray-700">{userName(a.userId)}</span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-gray-600">{a.text}</td>
            <td className="px-4 py-2.5 text-gray-600">{a.task}</td>
            <td className="px-4 py-2.5 text-gray-500">{formatTaskDate(a.at)}</td>
          </tr>
        ))}
      </Table>
    );
  }

  if (id === "project-wise") {
    const groups = projects
      .map((p) => ({ ...p, list: tasks.filter((t) => t.projectId === p.id) }))
      .filter((g) => g.list.length > 0);
    const orphan = tasks.filter((t) => !t.projectId);
    return (
      <div className="space-y-4">
        {groups.map((g) => (
          <GroupCard key={g.id} title={g.name} count={g.list.length}>
            <TaskTable tasks={g.list} userName={userName} projectName={projectName} hideProject />
          </GroupCard>
        ))}
        {orphan.length > 0 && (
          <GroupCard title="No project" count={orphan.length}>
            <TaskTable tasks={orphan} userName={userName} projectName={projectName} hideProject />
          </GroupCard>
        )}
      </div>
    );
  }

  if (id === "user-wise") {
    const groups = users
      .map((u) => ({ ...u, list: tasks.filter((t) => t.assigneeId === u.id) }))
      .filter((g) => g.list.length > 0);
    return (
      <div className="space-y-4">
        {groups.map((g) => (
          <GroupCard key={g.id} title={g.name} count={g.list.length} subtitle={g.role}>
            <TaskTable tasks={g.list} userName={userName} projectName={projectName} />
          </GroupCard>
        ))}
      </div>
    );
  }

  // daily
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const due = tasks.filter((t) => t.dueDate === iso);
  const overdue = tasks.filter((t) => isOverdue(t));
  return (
    <div className="space-y-4">
      <GroupCard title="Due today" count={due.length}>
        {due.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nothing due today.</p>
        ) : (
          <TaskTable tasks={due} userName={userName} projectName={projectName} />
        )}
      </GroupCard>
      <GroupCard title="Overdue" count={overdue.length}>
        {overdue.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nothing overdue. </p>
        ) : (
          <TaskTable tasks={overdue} userName={userName} projectName={projectName} />
        )}
      </GroupCard>
    </div>
  );
}

function GroupCard({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <div>
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {subtitle && <span className="ml-2 text-xs text-gray-400">{subtitle}</span>}
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function TaskTable({
  tasks,
  userName,
  projectName,
  hideProject,
}: {
  tasks: Task[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
  hideProject?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-4 py-2 font-medium">Task</th>
            {!hideProject && <th className="px-4 py-2 font-medium">Project</th>}
            <th className="px-4 py-2 font-medium">Assignee</th>
            <th className="px-4 py-2 font-medium">Due</th>
            <th className="px-4 py-2 font-medium">Priority</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
              <td className="px-4 py-2">
                <div className="font-medium text-gray-800">{t.title}</div>
                <div className="text-xs text-gray-400">{t.code}</div>
              </td>
              {!hideProject && <td className="px-4 py-2 text-gray-600">{projectName(t.projectId)}</td>}
              <td className="px-4 py-2 text-gray-600">{userName(t.assigneeId)}</td>
              <td className={`px-4 py-2 ${isOverdue(t) ? "font-medium text-rose-600" : "text-gray-600"}`}>
                {formatTaskDate(t.dueDate)}
              </td>
              <td className="px-4 py-2">
                <PriorityChip priority={t.priority} />
              </td>
              <td className="px-4 py-2">
                <StatusChip status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
