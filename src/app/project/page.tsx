"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import * as api from "@/lib/api";
import type { ProjectResponse, ProjectStatus } from "@/lib/api";
import { projectInitials } from "@/lib/projectHelpers";
import { useAppStore } from "@/lib/store";
import {
  Building2,
  Wallet,
  Activity,
  AlertTriangle,
  Search,
  Plus,
  MapPin,
  UserRound,
  Layers3,
  X,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

/* ---------- display meta ---------- */
const STATUS_META: Record<ProjectStatus, { label: string; dot: string; chip: string; bar: string }> = {
  ONGOING: { label: "Ongoing", dot: "bg-cyan-500", chip: "bg-cyan-50 text-cyan-700 ring-cyan-600/20", bar: "bg-cyan-500" },
  NOT_STARTED: { label: "Not Started", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 ring-slate-500/20", bar: "bg-slate-400" },
  ONHOLD: { label: "On Hold", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-600/20", bar: "bg-amber-500" },
  COMPLETED: { label: "Completed", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", bar: "bg-emerald-500" },
};
const HEALTH_META = {
  HEALTHY: { label: "Healthy", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  AT_RISK: { label: "At Risk", chip: "bg-rose-50 text-rose-700 ring-rose-600/20", dot: "bg-rose-500" },
};
const AVATAR_TINTS = ["from-cyan-500 to-sky-600", "from-indigo-500 to-blue-600", "from-teal-500 to-emerald-600", "from-violet-500 to-purple-600", "from-amber-500 to-orange-600", "from-rose-500 to-pink-600"];
const avatarTint = (id: number) => AVATAR_TINTS[id % AVATAR_TINTS.length];

function inr(value: number): string {
  if (!value) return "₹0";
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  if (value >= 1e3) return `₹${(value / 1e3).toFixed(0)}K`;
  return `₹${value}`;
}

const FILTERS: { key: "ALL" | ProjectStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "NOT_STARTED", label: "Not Started" },
  { key: "ONHOLD", label: "On Hold" },
  { key: "COMPLETED", label: "Completed" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | ProjectStatus>("ALL");
  const [selected, setSelected] = useState<ProjectResponse | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProjects({ size: 200 });
      setProjects(res.content);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const total = projects.length;
    const value = projects.reduce((s, p) => s + p.projectValue, 0);
    const ongoing = projects.filter((p) => p.status === "ONGOING").length;
    const atRisk = projects.filter((p) => p.health === "AT_RISK").length;
    return { total, value, ongoing, atRisk };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter !== "ALL" && p.status !== filter) return false;
      if (!q) return true;
      return [p.name, p.category, p.customerName, p.city, p.projectCode].some((f) => f?.toLowerCase().includes(q));
    });
  }, [projects, query, filter]);

  return (
    <AppShell title="Projects">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "Loading portfolio…" : `${stats.total} projects across sites, live from the backend.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-accent-strong"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<Building2 size={18} />} tint="bg-cyan-50 text-cyan-600" label="Total Projects" value={String(stats.total)} />
        <Kpi icon={<Wallet size={18} />} tint="bg-indigo-50 text-indigo-600" label="Portfolio Value" value={inr(stats.value)} />
        <Kpi icon={<Activity size={18} />} tint="bg-emerald-50 text-emerald-600" label="Ongoing" value={String(stats.ongoing)} />
        <Kpi icon={<AlertTriangle size={18} />} tint="bg-rose-50 text-rose-600" label="At Risk" value={String(stats.atRisk)} />
      </div>

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, client, city or code…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-navy text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* content */}
      {error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 py-16 text-center">
          <AlertTriangle size={28} className="mb-2 text-rose-500" />
          <p className="text-sm font-medium text-rose-700">{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Building2 size={30} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No projects match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={() => setSelected(p)} />
          ))}
        </div>
      )}

      {selected && <ProjectDrawer project={selected} onClose={() => setSelected(null)} />}
      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </AppShell>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const addProject = useAppStore((s) => s.addProject);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const localProject = addProject({ name: name.trim(), address: address.trim(), city: city.trim() });
      try {
        await api.createProject({ name: name.trim(), address: address.trim() || undefined, city: city.trim() || undefined });
      } catch {
        // Keep the UI flowing even if the backend is unavailable.
      }
      onClose();
      router.push(`/project/${localProject.id}?setup=1`);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't create the project. Is the backend running?");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-[fade-in_.15s_ease-out]" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fade-in-scale_.15s_ease-out]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-navy px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent">
              <Plus size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold leading-tight">New Project</h2>
              <p className="text-xs text-white/60">Start with the basics — refine details later.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Project Name <span className="text-rose-500">*</span></span>
            <input
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. Ward 12 CC Road"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Site address"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">City</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="City"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
          </label>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent-strong disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */
function Kpi({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function ProjectCard({ project: p, onOpen }: { project: ProjectResponse; onOpen: () => void }) {
  const s = STATUS_META[p.status];
  const h = HEALTH_META[p.health];
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/60 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarTint(p.id)} text-sm font-bold text-white shadow-sm`}>
            {projectInitials(p.name)}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-medium text-slate-400">{p.projectCode ?? "—"}</div>
            <h3 className="truncate text-[15px] font-semibold leading-tight text-slate-900">{p.name}</h3>
          </div>
        </div>
        <span className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <UserRound size={14} className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{p.customerName ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{p.city || p.address || "Location not set"}</span>
        </div>
      </div>

      {p.status === "ONGOING" || p.status === "COMPLETED" ? (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-400">Progress</span>
            <span className="font-semibold text-slate-700">{p.progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${p.progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Layers3 size={14} /> {p.stage || "Awaiting kickoff"}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
        <span className="text-sm font-semibold text-slate-900">{inr(p.projectValue)}</span>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${h.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${h.dot}`} />
            {h.label}
          </span>
          <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-500" />
        </div>
      </div>
    </button>
  );
}

function ProjectDrawer({ project, onClose }: { project: ProjectResponse; onClose: () => void }) {
  const router = useRouter();
  const [full, setFull] = useState<ProjectResponse>(project);
  const s = STATUS_META[full.status];
  const h = HEALTH_META[full.health];

  // Re-fetch the single project so the drawer always shows fresh backend data.
  useEffect(() => {
    let alive = true;
    api.getProjectById(project.id).then((p) => alive && setFull(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [project.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-[fade-in_.15s_ease-out]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl animate-[slide-in-right_.2s_ease-out]">
        {/* header */}
        <div className="flex items-start justify-between gap-3 bg-navy p-6 text-white">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${avatarTint(full.id)} text-base font-bold shadow`}>
              {projectInitials(full.name)}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-cyan-300">{full.projectCode ?? "—"}</div>
              <h2 className="text-lg font-semibold leading-tight">{full.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-6 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${h.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${h.dot}`} /> {h.label}
          </span>
        </div>

        {/* progress */}
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-slate-500">Overall progress</span>
            <span className="font-semibold text-slate-900">{full.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${full.progress}%` }} />
          </div>
        </div>

        {/* details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-6 py-5">
          <Field icon={<Wallet size={14} />} label="Project value" value={inr(full.projectValue)} />
          <Field icon={<Layers3 size={14} />} label="Stage" value={full.stage} />
          <Field icon={<UserRound size={14} />} label="Client" value={full.customerName} />
          <Field icon={<Building2 size={14} />} label="Category" value={full.category} />
          <Field icon={<MapPin size={14} />} label="Location" value={[full.address, full.city].filter(Boolean).join(", ")} />
          <Field icon={<CalendarDays size={14} />} label="Start date" value={full.startDate} />
          <Field icon={<CalendarDays size={14} />} label="End date" value={full.endDate} />
          <Field icon={<UserRound size={14} />} label="Key personnel" value={full.keyPersonnel} />
        </div>

        {full.scopeOfWork && (
          <div className="border-t border-slate-100 px-6 py-5">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Scope of work</div>
            <p className="text-sm leading-relaxed text-slate-600">{full.scopeOfWork}</p>
          </div>
        )}

        {/* footer action — project-centric entry point */}
        <div className="mt-auto border-t border-slate-100 p-5">
          <button
            onClick={() => router.push(`/project/${full.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition hover:bg-brand-accent-strong"
          >
            Open project workspace <ArrowRight size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-medium text-slate-800">{value || "—"}</div>
    </div>
  );
}
