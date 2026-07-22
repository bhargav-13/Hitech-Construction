"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChevronLeft,
  Clock,
  Image as ImageIcon,
  Settings,
  Wrench,
  AlertTriangle,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ListTodo,
  MapPin,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { ProjectSettingModal } from "@/components/ProjectSettingModal";
import { TaskWorkspace } from "@/components/task/TaskWorkspace";
import { ProjectMembers } from "@/components/ProjectMembers";
import { CreateTransactionMenu } from "@/components/CreateTransactionMenu";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import * as api from "@/lib/api";
import type { ProjectResponse } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { formatRupee, projectInitials } from "@/lib/projectHelpers";
import { inr } from "@/lib/format";
import { txnStyle } from "@/lib/txnDisplay";
import type { TxnType } from "@/lib/types";
import {
  generateProjectAttendance,
  generateProjectMaterials,
  generateProjectTasks,
} from "@/lib/projectTabData";

export const runtime = "edge";

// Real Onsite project workspace tabs
const TABS = [
  "Dashboard",
  "Design",
  "Party",
  "Transaction",
  "To Do",
  "Task",
  "Members",
  "Attendance",
  "Material",
  "Subcon",
  "Equipment",
  "Files",
  "MOM",
  "Inspection",
] as const;
type Tab = (typeof TABS)[number];

const COMING_SOON: Tab[] = ["Design", "Party", "Subcon", "Equipment", "Files", "MOM", "Inspection"];

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

// Adapt the real backend project to the shape the workspace body displays.
function adapt(p: ProjectResponse) {
  return {
    id: String(p.id),
    name: p.name,
    address: [p.address, p.city].filter(Boolean).join(", "),
    status: STATUS_DISPLAY[p.status],
    health: HEALTH_DISPLAY[p.health],
    progress: p.progress,
    inAmount: p.inAmount,
    outAmount: p.outAmount,
    stage: p.stage ?? "",
    category: p.category ?? "",
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
  };
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const transactions = useAppStore((s) => s.transactions);
  const todos = useAppStore((s) => s.todos);
  const parties = useAppStore((s) => s.parties);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [editing, setEditing] = useState(false);
  const [txnType, setTxnType] = useState<TxnType | null>(null);

  const [real, setReal] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReal(await api.getProjectById(projectId));
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Couldn't load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const project = useMemo(() => (real ? adapt(real) : null), [real]);

  const attendance = useMemo(() => (project ? generateProjectAttendance(project.id) : []), [project]);
  const materials = useMemo(() => (project ? generateProjectMaterials(project.id) : []), [project]);
  const tasks = useMemo(() => (project ? generateProjectTasks(project.id) : []), [project]);
  const projectTxns = useMemo(
    () => transactions.filter((t) => t.projectId === params.id),
    [transactions, params.id]
  );
  const projectTodos = useMemo(() => todos.filter((t) => t.projectId === params.id), [todos, params.id]);
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "—";

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

  if (error || !project || !real) {
    return (
      <AppShell title="Projects">
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 py-16 text-center">
          <AlertTriangle size={24} className="mb-2 text-rose-500" />
          <p className="text-sm font-medium text-rose-700">{error ?? "Project not found."}</p>
          <Link href="/project" className="mt-3 text-sm font-medium text-brand-accent hover:underline">Back to projects</Link>
        </div>
      </AppShell>
    );
  }

  const balance = projectTxns.reduce((s, t) => s + (t.flow === "in" ? t.amount : t.flow === "out" ? -t.amount : 0), 0);

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
              <span className="font-mono text-xs text-slate-400">{real.projectCode}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} className="text-slate-400" />
              {project.address || "No address set"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_CHIP[real.status]}`}>
            {project.status}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${HEALTH_CHIP[real.health]}`}>
            {project.health}
          </span>
          <button onClick={() => setEditing(true)} title="Project settings" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
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

      {tab === "Dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<Activity size={16} />} tint="bg-cyan-50 text-cyan-600" label="Progress" value={`${real.progress}%`} />
            <StatCard icon={<ArrowDownRight size={16} />} tint="bg-emerald-50 text-emerald-600" label="Amount In" value={inr(real.inAmount)} />
            <StatCard icon={<ArrowUpRight size={16} />} tint="bg-rose-50 text-rose-600" label="Amount Out" value={inr(real.outAmount)} />
            <StatCard icon={<ListTodo size={16} />} tint="bg-amber-50 text-amber-600" label="To Do" value={String(real.todoCount)} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-slate-500">Overall progress</span>
              <span className="font-semibold text-slate-900">{real.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${real.progress}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm md:grid-cols-3">
            <InfoRow label="Status" value={project.status} />
            <InfoRow label="Health" value={project.health} />
            <InfoRow label="Stage" value={project.stage || "—"} />
            <InfoRow label="Category" value={project.category || "—"} />
            <InfoRow label="Start Date" value={project.startDate || "—"} />
            <InfoRow label="End Date" value={project.endDate || "—"} />
            <InfoRow label="Project Value" value={inr(real.projectValue)} />
            <InfoRow label="Client" value={real.customerName || "—"} />
            <InfoRow label="Key Personnel" value={real.keyPersonnel || "—"} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Attendance (Last 7 Days)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendance}>
                  <CartesianGrid vertical={false} stroke="#eef2f1" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="workers" fill="#0891b2" radius={[5, 5, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "Transaction" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid flex-1 grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm text-gray-500">Project Balance</div>
                <div className="mt-1 text-xl font-semibold text-gray-800">{formatRupee(balance)}</div>
                <div className="text-xs text-gray-400">In: {formatRupee(project.inAmount)} · Out: {formatRupee(project.outAmount)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm text-gray-500">Transactions</div>
                <div className="mt-1 text-xl font-semibold text-gray-800">{projectTxns.length}</div>
                <div className="text-xs text-gray-400">on this project</div>
              </div>
            </div>
            <div className="ml-4">
              <CreateTransactionMenu onPick={(t) => (t === "Sales Invoice" ? setTxnType("Sales Invoice") : setTxnType(t))} />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {projectTxns.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No transactions yet.</div>
            ) : (
              projectTxns.map((t) => {
                const style = txnStyle(t.type, t.flow);
                return (
                  <div key={t.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{partyName(t.partyId)}</div>
                      <div className="text-xs text-gray-400">{t.type} · {t.date} · {t.description}</div>
                    </div>
                    <div className={`text-sm font-semibold ${style.amountColor}`}>{style.sign}{formatRupee(t.amount)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "To Do" && (
        <SimpleTable
          columns={[
            { key: "title", label: "Task" },
            { key: "assignee", label: "Assignee" },
            { key: "priority", label: "Priority" },
            { key: "dueDate", label: "Due Date" },
            { key: "status", label: "Status" },
          ]}
          rows={projectTodos.length ? projectTodos.map((t) => ({ ...t })) : [{ title: "No to-dos for this project", assignee: "", priority: "", dueDate: "", status: "" }]}
        />
      )}

      {/* Project-scoped Taskopad workspace — same surface as the Taskopad module, filtered to this project. */}
      {tab === "Task" && (
        // TaskWorkspace reads query params, which needs a boundary for the production build.
        <Suspense fallback={null}>
          <TaskWorkspace projectId={params.id} />
        </Suspense>
      )}

      {tab === "Members" && <ProjectMembers projectId={params.id} />}

      {tab === "Attendance" && (
        <SimpleTable columns={[{ key: "date", label: "Date" }, { key: "workers", label: "Workers Present" }]} rows={attendance} />
      )}

      {tab === "Material" && (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "material", label: "Material" },
            { key: "movement", label: "Movement" },
            { key: "quantity", label: "Quantity" },
            { key: "unit", label: "Unit" },
          ]}
          rows={materials}
        />
      )}

      {COMING_SOON.includes(tab) && <ComingSoonPanel tab={tab} />}

      {editing && (
        <ProjectSettingModal
          project={real}
          onClose={() => setEditing(false)}
          onSaved={loadProject}
        />
      )}
      {txnType && <TransactionFormModal type={txnType} fixedProjectId={project.id} onClose={() => setTxnType(null)} />}
    </AppShell>
  );
}

function ComingSoonPanel({ tab }: { tab: string }) {
  const ICONS: Record<string, React.ComponentType<{ size?: number }>> = { Files: ImageIcon, MOM: Clock, Inspection: Wrench };
  const Icon = ICONS[tab] ?? Clock;
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-brand-accent">
          <Icon size={24} />
        </div>
        <div className="text-base font-medium text-gray-700">{tab}</div>
        <div className="mt-1 text-sm text-gray-400">This tab is coming soon.</div>
      </div>
    </div>
  );
}

function StatCard({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
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
