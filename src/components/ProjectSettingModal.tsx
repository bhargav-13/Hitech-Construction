"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, X, Trash2 } from "lucide-react";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { DatePicker } from "./DatePicker";
import { LocationStructure } from "./LocationStructure";
import { ProjectMembers } from "./ProjectMembers";
import { useAuthStore } from "@/lib/authStore";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";
import * as api from "@/lib/api";
import type { ProjectResponse } from "@/lib/api";

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

const TABS = ["Project Details", "Members", "Location Structure"] as const;
type Tab = (typeof TABS)[number];

/**
 * "Project Setting" — the detailed configuration surface that follows the quick create
 * drawer. Presented as a right-side slide-over (no centered popup), with three tabs:
 * full Project Details form, team Members, and the (upcoming) Location Structure builder.
 */
export function ProjectSettingModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectResponse;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const canDelete = useAuthStore((s) => s.user?.permissions.includes("PROJECT:DELETE") ?? false);
  const { closing, requestClose } = useDrawerDismiss(onClose);

  const [tab, setTab] = useState<Tab>("Project Details");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    projectCode: project.projectCode ?? "",
    name: project.name,
    stage: project.stage ?? "",
    category: project.category ?? "",
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    address: project.address ?? "",
    companyBranch: project.companyBranch ?? "",
    attendanceRadius: project.attendanceRadius,
    projectValue: project.projectValue,
    orientation: project.orientation ?? "",
    dimension: project.dimension ?? "",
    scopeOfWork: project.scopeOfWork ?? "",
  });

  // Live "how long is this project" hint under the end date — instant feedback while picking dates.
  const durationLabel = useMemo(
    () => describeSpan(toDateInput(form.startDate), toDateInput(form.endDate)),
    [form.startDate, form.endDate]
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateProject(project.id, {
        projectCode: form.projectCode,
        name: form.name,
        stage: form.stage,
        category: form.category,
        startDate: form.startDate,
        endDate: form.endDate,
        address: form.address,
        companyBranch: form.companyBranch,
        attendanceRadius: Number(form.attendanceRadius) || 0,
        projectValue: Number(form.projectValue) || 0,
        orientation: form.orientation,
        dimension: form.dimension,
        scopeOfWork: form.scopeOfWork,
      });
      onSaved?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      router.push("/project");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't delete this project.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${
        closing ? "animate-overlay-out" : "animate-overlay-in"
      }`}
      onClick={requestClose}
    >
      <div
        className={`flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-cyan-400" />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white ${projectAvatarColor(String(project.id))}`}
            >
              {projectInitials(form.name || project.name)}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Project Setting</h2>
              <div className="text-xs text-gray-400">{form.name || project.name}</div>
            </div>
          </div>
          <button
            onClick={requestClose}
            className="rounded-full p-1.5 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-5 border-b border-gray-100 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors duration-150 ${
                tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "Project Details" && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Project Code">
                  <input value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} placeholder="Project Code" className="input" />
                </Field>
                <Field label="Project Name">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
                </Field>

                <Field label="Project Stage">
                  <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="input">
                    <option value="">Select Stage</option>
                    {STAGES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Project Category">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                    <option value="">Select Category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Start Date">
                  <DatePicker
                    value={toDateInput(form.startDate)}
                    onChange={(v) => setForm({ ...form, startDate: v })}
                    placeholder="Start date"
                  />
                </Field>
                <Field label="End Date">
                  <DatePicker
                    value={toDateInput(form.endDate)}
                    min={toDateInput(form.startDate) || undefined}
                    onChange={(v) => setForm({ ...form, endDate: v })}
                    placeholder="End date"
                  />
                  {durationLabel && (
                    <span className="animate-fade-in mt-1.5 inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                      <CalendarRange size={11} /> {durationLabel}
                    </span>
                  )}
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Project Address">
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="input" />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field label="Company Branch">
                    <select value={form.companyBranch} onChange={(e) => setForm({ ...form, companyBranch: e.target.value })} className="input">
                      <option value="">Select Company Address</option>
                      {BRANCHES.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Attendance Radius">
                  <input type="number" value={form.attendanceRadius} onChange={(e) => setForm({ ...form, attendanceRadius: Number(e.target.value) })} className="input" />
                </Field>
                <Field label="Project Value">
                  <input type="number" value={form.projectValue} onChange={(e) => setForm({ ...form, projectValue: Number(e.target.value) })} className="input" />
                </Field>

                <Field label="Project Orientation">
                  <input value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })} placeholder="Project Orientation" className="input" />
                </Field>
                <Field label="Project Dimension">
                  <input value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })} placeholder="Project Dimension" className="input" />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Scope of Work">
                    <textarea value={form.scopeOfWork} onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })} rows={3} className="input resize-none" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {tab === "Members" && <ProjectMembers projectId={String(project.id)} />}

          {tab === "Location Structure" && (
            <div className="animate-fade-in">
              <LocationStructure projectId={project.id} />
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "Project Details" && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
            {canDelete ? (
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-rose-600">Delete this project? This can't be undone.</span>
                  <button
                    onClick={deleteProject}
                    disabled={deleting}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-rose-700 active:scale-95 disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95"
                >
                  <Trash2 size={15} /> Delete Project
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-brand-accent px-6 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Native <input type="date"> needs a bare yyyy-MM-dd; tolerate stored ISO datetimes.
function toDateInput(value: string): string {
  if (!value) return "";
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** Human duration between two yyyy-MM-dd dates, e.g. "1 yr 2 mo · 428 days". */
function describeSpan(start: string, end: string): string | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  if (days < 0) return "End date is before start date";
  if (days === 0) return "Same day";
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const parts: string[] = [];
  if (years) parts.push(`${years} yr`);
  if (months) parts.push(`${months} mo`);
  const head = parts.length ? parts.join(" ") + " · " : "";
  return `${head}${days} day${days === 1 ? "" : "s"}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}
