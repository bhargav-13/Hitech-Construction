"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlarmClock, CalendarClock, CheckCircle2, ListChecks, UserRound } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { UserAvatar } from "@/components/task/TaskBits";
import { Select } from "@/components/Select";
import { useAuthStore } from "@/lib/authStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useTaskStore } from "@/lib/taskStore";
import { PRIORITY_STYLE, formatTaskDate, isDueToday, isOverdue, toIso } from "@/lib/taskTypes";
import type { Task } from "@/lib/taskTypes";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function TaskopadDashboardPage() {
  const allTasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const { users } = useUsers();
  const { projects } = useProjects();
  const projectScope = useProjectScope((s) => s.projectId);
  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    load();
  }, [load]);

  const [scope, setScope] = useState<"My Task" | "All Task">("All Task");
  const [range, setRange] = useState<"Monthly" | "Weekly">("Monthly");

  // "My Task" is the signed-in backend user.
  const router = useRouter();
  const meId = authUser ? String(authUser.id) : "";
  const live = useMemo(
    () => allTasks.filter((t) => !t.isDraft && (projectScope === "all" || t.projectId === projectScope)),
    [allTasks, projectScope]
  );
  const scoped = useMemo(
    () => (scope === "My Task" ? live.filter((t) => t.assigneeId === meId) : live),
    [live, scope]
  );

  const totalTask = live.length;
  const assignedToMe = live.filter((t) => t.assigneeId === meId).length;
  const dueToday = live.filter((t) => isDueToday(t)).length;
  const pastDue = live.filter((t) => isOverdue(t)).length;
  // Drill-down targets for the score cards.
  const todayIso = toIso(new Date());
  const yesterdayIso = toIso(new Date(Date.now() - 86_400_000));

  const priorityData = (["Low", "Medium", "High"] as const).map((p) => ({
    name: p,
    value: scoped.filter((t) => t.priority === p).length,
  }));

  const statsData = useMemo(() => buildStats(scoped, range), [scoped, range]);

  const teamIncomplete = users
    .map((u) => ({
      ...u,
      count: live.filter((t) => t.assigneeId === u.id && t.status !== "Completed").length,
    }))
    .sort((a, b) => b.count - a.count);

  const recentProjects = useMemo(() => {
    const withCounts = projects
      .map((p) => ({
        id: p.id,
        name: p.name,
        open: live.filter((t) => t.projectId === p.id && t.status !== "Completed").length,
      }))
      .filter((p) => p.open > 0)
      .sort((a, b) => b.open - a.open);
    return withCounts.slice(0, 6);
  }, [projects, live]);

  const activity = useMemo(
    () =>
      [...live]
        .flatMap((t) => t.activity.map((a) => ({ ...a, task: t.title })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
    [live]
  );

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";
  const totalPriority = priorityData.reduce((s, p) => s + p.value, 0);

  return (
    <TaskopadShell>
      <div className="animate-fade-in space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label="Total Task"
            value={totalTask}
            icon={ListChecks}
            tint="bg-cyan-50 text-brand-accent"
            drill={{}}
          />
          <Kpi
            label="Assigned to me"
            value={assignedToMe}
            icon={UserRound}
            tint="bg-green-50 text-green-600"
            drill={meId ? { assignee: meId } : {}}
          />
          <Kpi
            label="Due today"
            value={dueToday}
            icon={AlarmClock}
            tint="bg-amber-50 text-amber-600"
            drill={{ dueFrom: todayIso, dueTo: todayIso }}
          />
          <Kpi
            label="Past due tasks"
            value={pastDue}
            icon={CalendarClock}
            tint="bg-rose-50 text-rose-600"
            valueClass={pastDue > 0 ? "text-rose-600" : undefined}
            drill={{ dueTo: yesterdayIso }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Statistics */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Statistics</h3>
              <div className="flex items-center gap-2">
                <Select
                  value={scope}
                  onChange={(v) => setScope(v as "My Task" | "All Task")}
                  size="sm"
                  className="w-[110px]"
                  options={[
                    { value: "All Task", label: "All Task" },
                    { value: "My Task", label: "My Task" },
                  ]}
                />
                <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">
                  {(["Monthly", "Weekly"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-md px-2.5 py-1 font-medium transition-all duration-150 ${
                        range === r ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statsData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f1ef" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #eee", fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Completed" stroke="#0ca30c" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Incomplete" stroke="#d03b3b" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Priority Task Summary</h3>
            <div className="relative h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {priorityData.map((p) => (
                      <Cell
                        key={p.name}
                        fill={PRIORITY_STYLE[p.name].hex}
                        className="cursor-pointer outline-none"
                        onClick={() => router.push(`/taskopad/tasks?priority=${encodeURIComponent(p.name)}`)}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #eee", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold text-gray-800">{totalPriority}</span>
                <span className="text-[10px] text-gray-400">tasks</span>
              </div>
            </div>
            <div className="mt-2 flex justify-center gap-4">
              {priorityData.map((p) => (
                <div key={p.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PRIORITY_STYLE[p.name].hex }} />
                  <span className="text-gray-500">{p.name}</span>
                  <span className="font-semibold text-gray-800">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Upcoming (replaces TaskOPad's empty calendar with something useful) */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Upcoming & Overdue</h3>
              <Link href="/taskopad/tasks" className="text-xs font-medium text-brand-accent hover:underline">
                View all
              </Link>
            </div>
            <UpcomingList tasks={live} userName={userName} />
          </div>

          {/* Team incomplete */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Team Incomplete Task</h3>
            <div className="space-y-2.5">
              {teamIncomplete.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5">
                  <UserAvatar id={u.id} name={u.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{u.name}</div>
                    <div className="truncate text-xs text-gray-400">{u.role}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.count > 0 ? "bg-cyan-50 text-brand-accent" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {u.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent projects */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Recent Projects</h3>
            {recentProjects.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No incomplete tasks yet.</p>
            ) : (
              <div className="space-y-2">
                {recentProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/project/${p.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 transition-colors duration-150 hover:bg-gray-50"
                  >
                    <span className="truncate text-sm text-gray-700">{p.name}</span>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {p.open} open
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Activity</h3>
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((a) => (
                  <div key={a.id} className="flex gap-2.5">
                    <UserAvatar id={a.userId} name={userName(a.userId)} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{userName(a.userId)}</span> · {a.text}
                      </div>
                      <div className="truncate text-xs text-gray-400">{a.task}</div>
                      <div className="text-[10px] text-gray-400">{formatTaskDate(a.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TaskopadShell>
  );
}

function UpcomingList({ tasks, userName }: { tasks: Task[]; userName: (id: string) => string }) {
  const open = tasks
    .filter((t) => t.status !== "Completed")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);

  if (open.length === 0) return <p className="py-8 text-center text-sm text-gray-400">Nothing due. All clear.</p>;

  return (
    <div className="space-y-2">
      {open.map((t) => {
        const overdue = isOverdue(t);
        const today = isDueToday(t);
        return (
          <Link
            key={t.id}
            href="/taskopad/tasks"
            className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 transition-colors duration-150 hover:bg-gray-50"
          >
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_STYLE[t.priority].hex }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-800">{t.title}</div>
              <div className="text-xs text-gray-400">
                {userName(t.assigneeId)} · {formatTaskDate(t.dueDate)}
              </div>
            </div>
            {overdue ? (
              <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                Overdue
              </span>
            ) : today ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Due today
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function buildStats(tasks: Task[], range: "Monthly" | "Weekly") {
  const now = new Date();
  if (range === "Weekly") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      const due = tasks.filter((t) => t.dueDate === toIso(d));
      return {
        label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
        Completed: due.filter((t) => t.status === "Completed").length,
        Incomplete: due.filter((t) => t.status !== "Completed").length,
      };
    });
  }
  return Array.from({ length: 12 }, (_, m) => {
    const due = tasks.filter((t) => {
      const d = new Date(t.dueDate);
      return d.getMonth() === m && d.getFullYear() === now.getFullYear();
    });
    return {
      label: MONTHS[m],
      Completed: due.filter((t) => t.status === "Completed").length,
      Incomplete: due.filter((t) => t.status !== "Completed").length,
    };
  });
}

/**
 * Score card. When `drill` is set the whole card becomes a link into the task list with those
 * filters pre-applied, so the client can click a number and see exactly which tasks it counts.
 */
function Kpi({
  label,
  value,
  icon: Icon,
  tint,
  valueClass = "text-gray-800",
  drill,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number }>;
  tint: string;
  valueClass?: string;
  drill?: Record<string, string>;
}) {
  const body = (
    <>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </>
  );
  const base =
    "flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all duration-150 hover:shadow-md";

  if (!drill) return <div className={base}>{body}</div>;

  return (
    <Link
      href={`/taskopad/tasks?${new URLSearchParams(drill).toString()}`}
      title={`View ${label.toLowerCase()}`}
      className={`${base} cursor-pointer hover:-translate-y-0.5 hover:border-brand-accent active:scale-[0.99]`}
    >
      {body}
    </Link>
  );
}
