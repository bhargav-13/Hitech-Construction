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
import { PriorityChip, StatusRowChip, TaskStatusChip, UserAvatar, ProgressBar } from "@/components/task/TaskBits";
import { CheckList, DateTypeButton } from "@/components/task/workspace/Toolbar";
import { EMPTY_DATE_FILTER, VARIANCE_LABEL, dateFilterActive, varianceOf } from "@/components/task/workspace/taskFilters";
import type { DateTypeFilter } from "@/components/task/workspace/taskFilters";
import { useTaskStatuses } from "@/lib/useTaskStatuses";
import { todayIST } from "@/lib/datetime";
import { Select as UiSelect } from "@/components/Select";
import { recurrenceLabel } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useTaskStore } from "@/lib/taskStore";
import { TASK_STATUSES, formatTaskDate, formatTaskDateTime, isDueToday, isOverdue } from "@/lib/taskTypes";
import type { Task, TaskStatus } from "@/lib/taskTypes";
import { useAuthStore } from "@/lib/authStore";
import { getAccessSelf } from "@/lib/api";
import type { AccessSelfApi } from "@/lib/api";

type UserType = "owner" | "assignee" | "follower";
type ProjectMode = "with" | "without";

/** One saved set of report filters (Save Report) — kept in this browser, per report. */
interface SavedPreset {
  name: string;
  report: ReportId;
  projectModes: ProjectMode[];
  projectIds: string[];
  userTypes: UserType[];
  userIds: string[];
  statusIds: string[];
  date: DateTypeFilter;
  activityKinds: string[];
}
const PRESETS_KEY = "taskopad.reportPresets.v1";

/** Activity log lines, sorted into the kinds Taskopad's Activity Report filters by. */
const ACTIVITY_KINDS: { value: string; label: string; test: RegExp }[] = [
  { value: "added", label: "Added", test: /created|added|imported/i },
  { value: "assignee", label: "Assignee Added / Removed", test: /assign/i },
  { value: "attachment", label: "Attachments", test: /attach/i },
  { value: "closed", label: "Closed Task", test: /approved completion|status changed to completed|moved to completed/i },
  { value: "comment", label: "Comments", test: /comment/i },
  { value: "due", label: "Edit Due date", test: /due date/i },
  { value: "status", label: "Status Changed", test: /status|moved it to|awaiting/i },
  { value: "priority", label: "Priority Changed", test: /priority/i },
  { value: "subtask", label: "Sub-tasks", test: /sub-task|sub task/i },
  { value: "reminder", label: "Reminder", test: /reminder/i },
  { value: "recurring", label: "Recurring", test: /recurring|series/i },
  { value: "updated", label: "Task Updated", test: /task updated|pinned|unpinned|progress/i },
  { value: "bin", label: "Deleted / Restored", test: /recycle bin|restored/i },
];
function activityKind(text: string): string {
  return ACTIVITY_KINDS.find((k) => k.test.test(text))?.value ?? "updated";
}

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
  const [selected, setSelected] = useState<ReportId>("user-wise");
  const report = REPORTS.find((r) => r.id === selected)!;

  return (
    <TaskopadShell>
      <ReportDetail
        report={report}
        selected={selected}
        onSelect={setSelected}
      />
    </TaskopadShell>
  );
}

function ReportDetail({
  report,
  selected,
  onSelect,
}: {
  report: (typeof REPORTS)[number];
  selected: ReportId;
  onSelect: (id: ReportId) => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const { users: allUsers } = useUsers();
  const { departments } = useDepartments();
  // Per-person rows only for people you manage: you + everyone below you in the role ladder
  // (Super Admin: everyone). It listed the whole company before, with numbers built from just the
  // tasks you can see — partial, misleading figures about people outside your team.
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const [scope, setScope] = useState<AccessSelfApi | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAccessSelf().then((a) => { if (!cancelled) setScope(a); }).catch(() => { if (!cancelled) setScope(null); });
    return () => { cancelled = true; };
  }, []);
  const users = useMemo(() => {
    if (!scope) return allUsers.filter((u) => u.id === String(meId));
    if (scope.superAdmin) return allUsers;
    const mine = new Set([String(meId), ...(scope.teamUserIds ?? []).map(String)]);
    return allUsers.filter((u) => mine.has(u.id));
  }, [allUsers, scope, meId]);
  const { projects } = useProjects();
  const projectScope = useProjectScope((s) => s.projectId);

  useEffect(() => {
    load();
  }, [load]);

  const { rows: statusRows, rowFor } = useTaskStatuses();
  const [projectModes, setProjectModes] = useState<ProjectMode[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [date, setDate] = useState<DateTypeFilter>(EMPTY_DATE_FILTER);
  const [activityKinds, setActivityKinds] = useState<string[]>([]);
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw) as SavedPreset[]);
    } catch {
      /* no saved presets */
    }
  }, []);

  const userName = (id: string) => allUsers.find((u) => u.id === id)?.name ?? "Unknown";
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "No project");

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => !t.isDraft);
    // Header project dropdown scopes the whole report.
    if (projectScope !== "all") list = list.filter((t) => t.projectId === projectScope);
    // Project Wise: with / without a project, or particular projects.
    if (projectModes.length === 1) list = list.filter((t) => (projectModes[0] === "with" ? !!t.projectId : !t.projectId));
    if (projectIds.length) list = list.filter((t) => !!t.projectId && projectIds.includes(t.projectId));
    // Users, read through the chosen User Type (owner / assignee / follower). No type = any role.
    if (userIds.length) {
      const types: UserType[] = userTypes.length ? userTypes : ["owner", "assignee", "follower"];
      list = list.filter((t) =>
        userIds.some(
          (u) =>
            (types.includes("assignee") && t.assigneeId === u) ||
            (types.includes("owner") && t.createdBy === u) ||
            (types.includes("follower") && t.followerIds.includes(u))
        )
      );
    }
    if (statusIds.length) list = list.filter((t) => statusIds.includes(rowFor(t).id));
    if (dateFilterActive(date)) {
      const to = date.mode === "on" ? date.from : date.to || date.from;
      list = list.filter((t) =>
        date.fields.some((f) => {
          const d = f === "due" ? t.dueDate : f === "created" ? t.createdAt?.slice(0, 10) : t.closedAt?.slice(0, 10);
          return !!d && d >= date.from && d <= to;
        })
      );
    }
    return list;
    // rowFor reads statusRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projectScope, projectModes, projectIds, userTypes, userIds, statusIds, statusRows, date]);

  function savePreset() {
    const name = prompt("Name this report", `${report.title} – ${new Date().toLocaleDateString()}`);
    if (!name) return;
    const next = [
      ...presets.filter((p) => !(p.name === name && p.report === report.id)),
      { name, report: report.id, projectModes, projectIds, userTypes, userIds, statusIds, date, activityKinds },
    ];
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  function loadPreset(p: SavedPreset) {
    onSelect(p.report);
    setProjectModes(p.projectModes);
    setProjectIds(p.projectIds);
    setUserTypes(p.userTypes);
    setUserIds(p.userIds);
    setStatusIds(p.statusIds);
    setDate(p.date);
    setActivityKinds(p.activityKinds ?? []);
    setShowPresets(false);
  }
  function deletePreset(p: SavedPreset) {
    const next = presets.filter((x) => x !== p);
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  function clearFilters() {
    setProjectModes([]);
    setProjectIds([]);
    setUserTypes([]);
    setUserIds([]);
    setStatusIds([]);
    setDate(EMPTY_DATE_FILTER);
    setActivityKinds([]);
  }
  const anyFilter =
    projectModes.length + projectIds.length + userTypes.length + userIds.length + statusIds.length + activityKinds.length > 0 ||
    dateFilterActive(date);

  function download() {
    const rows = [
      ["Code", "Task", "Project", "Assignee", "Owner", "Due Date", "Closed", "Priority", "Status", "Progress", "Variance"],
      ...filtered.map((t) => {
        const v = varianceOf(t);
        return [
          t.code,
          t.title,
          projectName(t.projectId),
          userName(t.assigneeId),
          t.createdBy ? userName(t.createdBy) : "",
          t.dueDate,
          t.closedAt?.slice(0, 10) ?? "",
          t.priority,
          rowFor(t).name,
          `${t.progress}%`,
          v ? VARIANCE_LABEL[v.kind] : "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.id}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mine = presets.filter((p) => p.report === report.id);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${report.tint}`}>
            <report.icon size={18} />
          </div>
          <div className="min-w-[240px]">
            <UiSelect
              value={selected}
              onChange={(v) => onSelect(v as ReportId)}
              options={REPORTS.map((r) => ({ value: r.id, label: r.title }))}
              className="min-w-[240px]"
            />
            <div className="mt-1 pl-1 text-xs text-gray-400">{report.desc}</div>
          </div>
        </div>
        <div className="relative flex gap-2">
          <button
            onClick={savePreset}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <Save size={14} /> Save Report
          </button>
          <button
            onClick={() => setShowPresets((s) => !s)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <History size={14} /> Saved ({mine.length})
          </button>
          {showPresets && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPresets(false)} />
              <div className="animate-menu-pop absolute right-0 top-11 z-30 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                {mine.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">No saved reports yet. Set filters and press Save Report.</p>
                ) : (
                  mine.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                      <button onClick={() => loadPreset(p)} className="flex-1 truncate text-left text-sm text-gray-700">
                        {p.name}
                      </button>
                      <button onClick={() => deletePreset(p)} className="text-xs text-gray-400 hover:text-rose-600">
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>

      {/* Filter bar — the same set Taskopad's reports take */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <Pick
          label="Project Wise"
          count={projectModes.length + projectIds.length}
          options={[
            { value: "mode:with", label: "With Project", text: "With Project" },
            { value: "mode:without", label: "Without Project", text: "Without Project" },
            ...projects.map((p) => ({ value: p.id, label: p.name, text: p.name })),
          ]}
          values={[...projectModes.map((m) => `mode:${m}`), ...projectIds]}
          onChange={(vals) => {
            setProjectModes(vals.filter((v) => v.startsWith("mode:")).map((v) => v.slice(5) as ProjectMode));
            setProjectIds(vals.filter((v) => !v.startsWith("mode:")));
          }}
        />
        <Pick
          label="User Type"
          count={userTypes.length}
          searchable={false}
          options={[
            { value: "owner", label: "Owner", text: "Owner" },
            { value: "assignee", label: "Assignees", text: "Assignees" },
            { value: "follower", label: "Followers", text: "Followers" },
          ]}
          values={userTypes}
          onChange={(v) => setUserTypes(v as UserType[])}
        />
        <Pick
          label="Select User"
          count={userIds.length}
          options={users.map((u) => ({ value: u.id, label: u.name, text: u.name }))}
          values={userIds}
          onChange={setUserIds}
        />
        <Pick
          label="Select Status"
          count={statusIds.length}
          options={statusRows.map((r) => ({
            value: r.id,
            text: r.name,
            label: (
              <>
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />
                {r.name}
              </>
            ),
          }))}
          values={statusIds}
          onChange={setStatusIds}
        />
        {report.id === "user-activity" && (
          <Pick
            label="Select Activity"
            count={activityKinds.length}
            options={ACTIVITY_KINDS.map((k) => ({ value: k.value, label: k.label, text: k.label }))}
            values={activityKinds}
            onChange={setActivityKinds}
          />
        )}
        <DateTypeButton value={date} onApply={setDate} />
        {anyFilter && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-400 hover:text-rose-600">
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
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
            activityKinds={activityKinds}
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

/** A filter button that opens a searchable multi-pick list. */
function Pick({
  label,
  count,
  options,
  values,
  onChange,
  searchable = true,
}: {
  label: string;
  count: number;
  options: { value: string; label: React.ReactNode; text: string }[];
  values: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
          count || open ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
        {count > 0 && ` · ${count}`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-menu-pop absolute left-0 top-11 z-30 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
            <CheckList options={options} values={values} onChange={onChange} searchable={searchable} />
          </div>
        </>
      )}
    </div>
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
    const byRule = ["CUSTOM", "WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].map((r) => ({
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
  "Awaiting Approval": "#0891b2",
};

function ReportBody({
  id,
  activityKinds,
  tasks,
  users,
  userName,
  projectName,
  projects,
  departments,
}: {
  id: ReportId;
  activityKinds: string[];
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
        const v = mine.map(varianceOf);
        return {
          ...u,
          total: mine.length,
          done,
          overdue,
          rate,
          ontrack: v.filter((x) => x?.kind === "ontrack").length,
          before: v.filter((x) => x?.kind === "before").length,
          delayed: v.filter((x) => x?.kind === "delayed").length,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.rate - a.rate);

    return (
      <Table head={["User", "Total", "Completed", "On Track", "Before Time", "Delayed", "Overdue", "Completion rate"]}>
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
            <td className="px-4 py-2.5 text-emerald-600">{r.ontrack}</td>
            <td className="px-4 py-2.5 text-amber-600">{r.before}</td>
            <td className={`px-4 py-2.5 ${r.delayed > 0 ? "text-rose-600" : "text-gray-400"}`}>{r.delayed}</td>
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
    return <StatusWise tasks={tasks} userName={userName} projectName={projectName} />;
  }

  if (id === "user-activity") {
    const rows = tasks
      .flatMap((t) => t.activity.map((a) => ({ ...a, task: t.title, code: t.code })))
      .filter((a) => !activityKinds.length || activityKinds.includes(activityKind(a.text)))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 200);
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
            <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{formatTaskDateTime(a.at)}</td>
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
    const done = tasks.filter((t) => t.status === "Completed").length;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Total Projects" value={groups.length} tone="bg-cyan-50 text-brand-accent" />
          <SummaryTile label="Tasks Incomplete" value={tasks.length - done} tone="bg-rose-50 text-rose-600" />
          <SummaryTile label="Tasks Completed" value={done} tone="bg-emerald-50 text-emerald-600" />
        </div>
        <Table head={["Project", "Progress", "Tasks", "Completed", "Overdue"]}>
          {groups.map((g) => {
            const d = g.list.filter((t) => t.status === "Completed").length;
            const pct = g.list.length ? Math.round((d / g.list.length) * 100) : 0;
            return (
              <tr key={g.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-800">{g.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={pct} className="w-28" />
                    <span className="text-xs text-gray-500">{pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{g.list.length}</td>
                <td className="px-4 py-2.5 text-green-600">{d}</td>
                <td className="px-4 py-2.5 text-rose-600">{g.list.filter((t) => isOverdue(t)).length}</td>
              </tr>
            );
          })}
        </Table>
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

  return <DailyReport tasks={tasks} users={users} userName={userName} projectName={projectName} />;
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
                <TaskStatusChip task={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold ${tone}`}>{value}</div>
      <div className="text-sm font-medium text-gray-600">{label}</div>
    </div>
  );
}

/** Status Wise — one tile per company status, then the tasks. */
function StatusWise({
  tasks,
  userName,
  projectName,
}: {
  tasks: Task[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
}) {
  const { rows, rowFor } = useTaskStatuses();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {rows
          .filter((r) => r.active)
          .map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4" style={{ borderTop: `3px solid ${r.color}` }}>
              <StatusRowChip row={r} />
              <div className="mt-2 text-2xl font-semibold text-gray-800">{tasks.filter((t) => rowFor(t).id === r.id).length}</div>
            </div>
          ))}
      </div>
      <TaskTable tasks={tasks} userName={userName} projectName={projectName} />
    </div>
  );
}

type DailyTab = "pending" | "completed" | "morning" | "evening";

/**
 * Daily Report — Taskopad's four tabs, one row per member:
 *  - Today's Pending: what each person still has open (today / overdue / upcoming).
 *  - Today's Completed: what each person closed today.
 *  - Morning Report: the day's plan — everything due today, whatever its state.
 *  - Evening Report: how the day went — due today done vs left, plus anything else closed today.
 */
function DailyReport({
  tasks,
  users,
  userName,
  projectName,
}: {
  tasks: Task[];
  users: { id: string; name: string; role: string }[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
}) {
  const [tab, setTab] = useState<DailyTab>("pending");
  const [open, setOpen] = useState<string | null>(null);
  const today = todayIST();
  const isOpen = (t: Task) => t.status !== "Completed";
  const closedToday = (t: Task) => !!t.closedAt && t.closedAt.slice(0, 10) === today;

  const rows = users
    .map((u) => {
      const mine = tasks.filter((t) => t.assigneeId === u.id);
      const dueToday = mine.filter((t) => t.dueDate === today);
      const openToday = dueToday.filter(isOpen);
      const overdue = mine.filter((t) => isOpen(t) && !!t.dueDate && t.dueDate < today);
      const upcoming = mine.filter((t) => isOpen(t) && !!t.dueDate && t.dueDate > today);
      const doneToday = mine.filter(closedToday);
      const doneDueToday = dueToday.filter((t) => !isOpen(t));
      let cells: { label: string; value: number }[] = [];
      let list: Task[] = [];
      if (tab === "pending") {
        cells = [
          { label: "Today", value: openToday.length },
          { label: "Overdue", value: overdue.length },
          { label: "Upcoming", value: upcoming.length },
          { label: "Total", value: openToday.length + overdue.length + upcoming.length },
        ];
        list = [...overdue, ...openToday, ...upcoming];
      } else if (tab === "completed") {
        cells = [
          { label: "Completed today", value: doneToday.length },
          { label: "Of which were due today", value: doneToday.filter((t) => t.dueDate === today).length },
          { label: "Late", value: doneToday.filter((t) => !!t.dueDate && t.dueDate < today).length },
          { label: "Early", value: doneToday.filter((t) => !!t.dueDate && t.dueDate > today).length },
        ];
        list = doneToday;
      } else if (tab === "morning") {
        cells = [
          { label: "Planned today", value: dueToday.length },
          { label: "Carried over (overdue)", value: overdue.length },
          { label: "High priority", value: [...dueToday, ...overdue].filter((t) => t.priority === "High").length },
          { label: "Total to do", value: dueToday.length + overdue.length },
        ];
        list = [...overdue, ...dueToday];
      } else {
        cells = [
          { label: "Due today", value: dueToday.length },
          { label: "Done", value: doneDueToday.length },
          { label: "Left", value: openToday.length },
          { label: "Closed today (all)", value: doneToday.length },
        ];
        list = [...openToday, ...doneToday];
      }
      return { user: u, cells, list };
    })
    .filter((r) => r.cells.some((c) => c.value > 0));

  const TABS: { key: DailyTab; label: string }[] = [
    { key: "pending", label: "Today's Pending Tasks Report" },
    { key: "completed", label: "Today's Completed Tasks Report" },
    { key: "morning", label: "Morning Reports" },
    { key: "evening", label: "Evening Reports" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-5 border-b border-gray-100 px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 py-3 text-sm font-medium ${tab === t.key ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Nothing for this report today.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-2 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
            <span>Member Name</span>
            {rows[0].cells.map((c) => (
              <span key={c.label} className="text-center">
                {c.label}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.user.id}>
              <button
                onClick={() => setOpen(open === r.user.id ? null : r.user.id)}
                className="grid w-full grid-cols-[1.6fr_repeat(4,1fr)] items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <UserAvatar id={r.user.id} name={r.user.name} size={24} /> {r.user.name}
                </span>
                {r.cells.map((c) => (
                  <span key={c.label} className="text-center text-sm text-gray-700">
                    {c.value}
                  </span>
                ))}
              </button>
              {open === r.user.id && (
                <div className="border-t border-gray-100 bg-gray-50/40 px-2 pb-3">
                  <div className="px-2 py-2 text-center text-xs font-medium text-brand-accent underline">
                    {TABS.find((t) => t.key === tab)?.label}: {userName(r.user.id)}
                  </div>
                  {r.list.length ? (
                    <TaskTable tasks={r.list} userName={userName} projectName={projectName} />
                  ) : (
                    <p className="py-4 text-center text-xs text-gray-400">No tasks.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
