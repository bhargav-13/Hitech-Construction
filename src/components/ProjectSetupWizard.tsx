"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Layers, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import * as api from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import type { Project } from "@/lib/types";

const STAGES = [
  "Received LOA",
  "Received Work Order",
  "Awarded",
  "Pending For Land Clearance",
  "Form 3A Certificate",
  "Sample Testing At GERI",
  "Received Elevation Drawing",
  "Received Structural Drawing",
  "Execution in Progress",
  "Running Bill In Progress",
  "Final Bill In Progress",
  "Completed",
];
const CATEGORIES = [
  "Road and Building Division",
  "Rajkot Municipal Corporation",
  "Directorate Urban Administration and Development",
  "Gujarat State Electricity Corporation Limited",
];
const BRANCHES = ["Hi-Tech Construction - Head Office", "Hi-Tech Construction - Rajkot Branch"];
const STATUS_OPTIONS = ["Not Started", "Ongoing", "Onhold", "Completed"] as const;
const HEALTH_OPTIONS = ["Healthy", "At Risk"] as const;

export function ProjectSetupWizard({ project, onClose }: { project: Project; onClose: () => void }) {
  const router = useRouter();
  const updateProject = useAppStore((s) => s.updateProject);
  const users = useAppStore((s) => s.users);
  const [activeTab, setActiveTab] = useState<"details" | "members">("details");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    projectCode: project.projectCode ?? "",
    name: project.name ?? "",
    stage: project.stage ?? "",
    category: project.category ?? "",
    status: project.status ?? "Not Started",
    health: project.health ?? "Healthy",
    customerName: project.customerName ?? "",
    keyPersonnel: project.keyPersonnel ?? "",
    address: project.address ?? "",
    city: project.city ?? "",
    companyBranch: project.companyBranch ?? "",
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    progress: project.progress ?? 0,
    attendanceRadius: project.attendanceRadius ?? 0,
    projectValue: project.projectValue ?? 0,
    orientation: project.orientation ?? "",
    dimension: project.dimension ?? "",
    scopeOfWork: project.scopeOfWork ?? "",
    inAmount: project.inAmount ?? 0,
    outAmount: project.outAmount ?? 0,
    todoCount: project.todoCount ?? 0,
  });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  const members = useMemo(() => users.filter((u) => memberIds.includes(u.id)), [memberIds, users]);
  const candidates = useMemo(
    () =>
      users.filter(
        (u) =>
          !memberIds.includes(u.id) &&
          (memberSearch.trim() === "" ||
            u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
            u.role.toLowerCase().includes(memberSearch.toLowerCase()))
      ),
    [memberIds, memberSearch, users]
  );

  async function save() {
    setSaving(true);

    updateProject(project.id, {
      projectCode: form.projectCode,
      name: form.name,
      stage: form.stage,
      category: form.category,
      status: form.status,
      health: form.health,
      customerName: form.customerName,
      keyPersonnel: form.keyPersonnel,
      address: form.address,
      city: form.city,
      companyBranch: form.companyBranch,
      startDate: form.startDate,
      endDate: form.endDate,
      progress: Number(form.progress) || 0,
      attendanceRadius: Number(form.attendanceRadius) || 0,
      projectValue: Number(form.projectValue) || 0,
      orientation: form.orientation,
      dimension: form.dimension,
      scopeOfWork: form.scopeOfWork,
      inAmount: Number(form.inAmount) || 0,
      outAmount: Number(form.outAmount) || 0,
      todoCount: Number(form.todoCount) || 0,
    });

    const numericId = Number(project.id.replace(/\D/g, ""));
    if (!Number.isNaN(numericId)) {
      try {
        await api.updateProject(numericId, {
          projectCode: form.projectCode || undefined,
          name: form.name || undefined,
          category: form.category || undefined,
          stage: form.stage || undefined,
          status: toBackendStatus(form.status),
          health: toBackendHealth(form.health),
          customerName: form.customerName || undefined,
          keyPersonnel: form.keyPersonnel || undefined,
          address: form.address || undefined,
          city: form.city || undefined,
          companyBranch: form.companyBranch || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          progress: Number(form.progress) || 0,
          attendanceRadius: Number(form.attendanceRadius) || 0,
          projectValue: Number(form.projectValue) || 0,
          orientation: form.orientation || undefined,
          dimension: form.dimension || undefined,
          scopeOfWork: form.scopeOfWork || undefined,
          inAmount: Number(form.inAmount) || 0,
          outAmount: Number(form.outAmount) || 0,
          todoCount: Number(form.todoCount) || 0,
        });
      } catch {
        // Keep the local update responsive even if the backend is unavailable.
      }
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 1200);
    onClose();
    router.push(`/project/${project.id}`);
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Step 2 of 2
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Project details and team</h2>
          <p className="mt-1 text-sm text-slate-500">Capture the full project setup, then continue to the workspace.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${projectAvatarColor(project.id)} text-sm font-semibold text-white`}>
            {projectInitials(form.name || project.name)}
          </div>
          <div className="min-w-[180px]">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Project</div>
            <div className="truncate text-sm font-semibold text-slate-700">{form.name || project.name}</div>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {[
          { key: "details", label: "Project details" },
          { key: "members", label: "Members" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "details" | "members")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "details" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Project Code">
            <input value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} className="input" placeholder="Project Code" />
          </Field>
          <Field label="Project Name">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Project Name" />
          </Field>
          <Field label="Project Stage">
            <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="input">
              <option value="">Select stage</option>
              {STAGES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option value="">Select category</option>
              {CATEGORIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className="input">
              {STATUS_OPTIONS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Health">
            <select value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value as typeof form.health })} className="input">
              {HEALTH_OPTIONS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Customer Name">
            <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="input" placeholder="Client / customer" />
          </Field>
          <Field label="Key Personnel">
            <input value={form.keyPersonnel} onChange={(e) => setForm({ ...form, keyPersonnel: e.target.value })} className="input" placeholder="Key person" />
          </Field>
          <Field label="Start Date">
            <input value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" placeholder="DD-Mon-YYYY" />
          </Field>
          <Field label="End Date">
            <input value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" placeholder="DD-Mon-YYYY" />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="Site address" />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" placeholder="City" />
          </Field>
          <Field label="Company Branch">
            <select value={form.companyBranch} onChange={(e) => setForm({ ...form, companyBranch: e.target.value })} className="input">
              <option value="">Select branch</option>
              {BRANCHES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Attendance Radius">
            <input type="number" value={form.attendanceRadius} onChange={(e) => setForm({ ...form, attendanceRadius: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="Project Value">
            <input type="number" value={form.projectValue} onChange={(e) => setForm({ ...form, projectValue: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="Orientation">
            <input value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })} className="input" placeholder="Orientation" />
          </Field>
          <Field label="Dimension">
            <input value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })} className="input" placeholder="Dimension" />
          </Field>
          <Field label="Progress (%)">
            <input type="number" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="In Amount">
            <input type="number" value={form.inAmount} onChange={(e) => setForm({ ...form, inAmount: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="Out Amount">
            <input type="number" value={form.outAmount} onChange={(e) => setForm({ ...form, outAmount: Number(e.target.value) })} className="input" />
          </Field>
          <Field label="To-do Count">
            <input type="number" value={form.todoCount} onChange={(e) => setForm({ ...form, todoCount: Number(e.target.value) })} className="input" />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Scope of Work">
              <textarea value={form.scopeOfWork} onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })} rows={4} className="input resize-none" placeholder="Describe the work scope" />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search people to add"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {members.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Added members</div>
              <div className="space-y-2">
                {members.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${projectAvatarColor(u.id)}`}>
                      <UserRound size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{u.name}</div>
                      <div className="truncate text-xs text-slate-500">{u.role}</div>
                    </div>
                    <button onClick={() => setMemberIds((ids) => ids.filter((id) => id !== u.id))} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Suggestions</div>
            {candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                No people found.
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${projectAvatarColor(u.id)}`}>
                      <UserRound size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{u.name}</div>
                      <div className="truncate text-xs text-slate-500">{u.role}</div>
                    </div>
                    <button onClick={() => setMemberIds((ids) => [...ids, u.id])} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-cyan-400 hover:text-cyan-600">
                      <Plus size={13} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {saved ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Layers size={16} className="text-slate-400" />}
          {saved ? "Project details saved" : "Review the details and continue"}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            Skip for now
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent-strong disabled:opacity-60">
            {saving ? "Saving…" : saved ? "Saved" : "Save & continue"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function toBackendStatus(status: Project["status"]): api.ProjectStatus {
  switch (status) {
    case "Ongoing":
      return "ONGOING";
    case "Onhold":
      return "ONHOLD";
    case "Completed":
      return "COMPLETED";
    default:
      return "NOT_STARTED";
  }
}

function toBackendHealth(health: Project["health"]): api.ProjectHealth {
  return health === "At Risk" ? "AT_RISK" : "HEALTHY";
}
