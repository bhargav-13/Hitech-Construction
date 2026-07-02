"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, Image as ImageIcon, Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { EditProjectModal } from "@/components/EditProjectModal";
import { useAppStore } from "@/lib/store";
import { formatRupee, projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import {
  generateProjectAttendance,
  generateProjectInvoices,
  generateProjectMaterials,
  generateProjectPhotos,
  generateProjectTasks,
  generateTransactions,
} from "@/lib/projectTabData";

const TABS = ["Dashboard", "Transactions", "Attendance", "Materials", "Tasks", "Photos", "Billing"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const project = useAppStore((s) => s.projects.find((p) => p.id === params.id));
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [editing, setEditing] = useState(false);

  const transactions = useMemo(() => (project ? generateTransactions(project.id) : []), [project]);
  const attendance = useMemo(() => (project ? generateProjectAttendance(project.id) : []), [project]);
  const materials = useMemo(() => (project ? generateProjectMaterials(project.id) : []), [project]);
  const tasks = useMemo(() => (project ? generateProjectTasks(project.id) : []), [project]);
  const photos = useMemo(() => (project ? generateProjectPhotos(project.id) : []), [project]);
  const invoices = useMemo(() => (project ? generateProjectInvoices(project.id) : []), [project]);

  if (!project) {
    return (
      <AppShell title="Projects">
        <div className="flex h-full items-center justify-center text-sm text-gray-400">
          Project not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Projects">
      <Link
        href="/project"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-accent"
      >
        <ChevronLeft size={15} />
        Back to Projects
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl text-base font-semibold text-white ${projectAvatarColor(project.id)}`}
          >
            {projectInitials(project.name)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{project.name}</h2>
            <div className="text-xs text-gray-400">{project.address || "No address set"}</div>
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
        >
          <Settings size={16} />
        </button>
      </div>

      <div className="mb-4 flex gap-6 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap ${
              tab === t
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <MiniStat label="Progress" value={`${project.progress}%`} />
            <MiniStat label="Amount In" value={formatRupee(project.inAmount)} />
            <MiniStat label="Amount Out" value={formatRupee(project.outAmount)} />
            <MiniStat label="To Do" value={String(project.todoCount)} />
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

      {tab === "Transactions" && (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "type", label: "Type" },
            { key: "description", label: "Description" },
            { key: "amount", label: "Amount" },
            { key: "balance", label: "Balance" },
          ]}
          rows={transactions}
        />
      )}

      {tab === "Attendance" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
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
          <SimpleTable
            columns={[
              { key: "date", label: "Date" },
              { key: "workers", label: "Workers Present" },
            ]}
            rows={attendance}
          />
        </div>
      )}

      {tab === "Materials" && (
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

      {tab === "Tasks" && (
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

      {tab === "Photos" && (
        <div className="grid grid-cols-3 gap-4">
          {photos.map((photo, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex h-32 items-center justify-center bg-gray-100 text-gray-300">
                <ImageIcon size={32} />
              </div>
              <div className="p-3">
                <div className="text-sm font-medium text-gray-700">{photo.caption}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {photo.date} · {photo.uploadedBy}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Billing" && (
        <SimpleTable
          columns={[
            { key: "invoiceNumber", label: "Invoice Number" },
            { key: "date", label: "Date" },
            { key: "amount", label: "Amount" },
            { key: "status", label: "Status" },
          ]}
          rows={invoices}
        />
      )}

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
    </AppShell>
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
