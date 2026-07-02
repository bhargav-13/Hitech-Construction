"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, Clock, Image as ImageIcon, Settings, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { EditProjectModal } from "@/components/EditProjectModal";
import { CreateTransactionMenu } from "@/components/CreateTransactionMenu";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { useAppStore } from "@/lib/store";
import { formatRupee, projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
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
  "BOQ",
  "Party",
  "Transaction",
  "To Do",
  "Task",
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

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const project = useAppStore((s) => s.projects.find((p) => p.id === params.id));
  const transactions = useAppStore((s) => s.transactions);
  const todos = useAppStore((s) => s.todos);
  const parties = useAppStore((s) => s.parties);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [editing, setEditing] = useState(false);
  const [txnType, setTxnType] = useState<TxnType | null>(null);

  const attendance = useMemo(() => (project ? generateProjectAttendance(project.id) : []), [project]);
  const materials = useMemo(() => (project ? generateProjectMaterials(project.id) : []), [project]);
  const tasks = useMemo(() => (project ? generateProjectTasks(project.id) : []), [project]);
  const projectTxns = useMemo(
    () => transactions.filter((t) => t.projectId === params.id),
    [transactions, params.id]
  );
  const projectTodos = useMemo(() => todos.filter((t) => t.projectId === params.id), [todos, params.id]);
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "—";

  if (!project) {
    return (
      <AppShell title="Projects">
        <div className="flex h-full items-center justify-center text-sm text-gray-400">Project not found.</div>
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

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-base font-semibold text-white ${projectAvatarColor(project.id)}`}>
            {projectInitials(project.name)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{project.name}</h2>
            <div className="text-xs text-gray-400">{project.address || "No address set"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">{project.status}</span>
          <button onClick={() => setEditing(true)} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-5 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap ${
              tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MiniStat label="Progress" value={`${project.progress}%`} />
            <MiniStat label="Amount In" value={formatRupee(project.inAmount)} />
            <MiniStat label="Amount Out" value={formatRupee(project.outAmount)} />
            <MiniStat label="To Do" value={String(projectTodos.length)} />
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <InfoRow label="Status" value={project.status} />
            <InfoRow label="Health" value={project.health} />
            <InfoRow label="Stage" value={project.stage || "—"} />
            <InfoRow label="Category" value={project.category || "—"} />
            <InfoRow label="Start Date" value={project.startDate || "—"} />
            <InfoRow label="End Date" value={project.endDate || "—"} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Attendance (Last 7 Days)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendance}>
                  <CartesianGrid vertical={false} stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="workers" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "BOQ" && <BoqTab projectName={project.name} />}

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

      {tab === "Task" && (
        <SimpleTable
          columns={[
            { key: "task", label: "Task" },
            { key: "assignedTo", label: "Assigned To" },
            { key: "dueDate", label: "Due Date" },
            { key: "status", label: "Status" },
          ]}
          rows={tasks}
        />
      )}

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

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
      {txnType && <TransactionFormModal type={txnType} fixedProjectId={project.id} onClose={() => setTxnType(null)} />}
    </AppShell>
  );

  function BoqTab({ projectName }: { projectName: string }) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Bill of Quantities</h3>
          <button className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ BOQ</button>
        </div>
        <SimpleTable
          columns={[
            { key: "no", label: "S.No" },
            { key: "client", label: "Client Name" },
            { key: "title", label: "BOQ Title" },
            { key: "milestone", label: "Milestone" },
            { key: "progress", label: "Physical Progress" },
            { key: "value", label: "BOQ Value" },
          ]}
          rows={[
            { no: "#Sales-3", client: project?.category || "Client", title: `${projectName} - Works`, milestone: "2 / 8", progress: "18%", value: formatRupee(11048504) },
          ]}
        />
      </div>
    );
  }
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-50 py-1.5 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
