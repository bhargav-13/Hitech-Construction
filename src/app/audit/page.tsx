"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { useAuthStore } from "@/lib/authStore";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import * as audit from "@/lib/auditApi";
import type { AuditActionApi, AuditLog } from "@/lib/auditApi";
import { downloadPdf } from "@/lib/vyaparExport";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";

const ACTIONS: AuditActionApi[] = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"];

const ACTION_META: Record<
  AuditActionApi,
  { label: string; badge: string; bar: string; icon: typeof Plus }
> = {
  CREATE: { label: "Create", badge: "bg-green-50 text-green-700", bar: "bg-green-500", icon: Plus },
  UPDATE: { label: "Update", badge: "bg-blue-50 text-blue-700", bar: "bg-blue-500", icon: Pencil },
  DELETE: { label: "Delete", badge: "bg-rose-50 text-rose-700", bar: "bg-rose-500", icon: Trash2 },
  LOGIN: { label: "Login", badge: "bg-cyan-50 text-cyan-700", bar: "bg-cyan-500", icon: LogIn },
  LOGOUT: { label: "Logout", badge: "bg-gray-100 text-gray-600", bar: "bg-gray-400", icon: LogOut },
};

const PAGE_SIZE = 25;

type ActionCounts = Record<AuditActionApi, number>;
const EMPTY_COUNTS: ActionCounts = { CREATE: 0, UPDATE: 0, DELETE: 0, LOGIN: 0, LOGOUT: 0 };

export default function AuditPage() {
  const perms = useAuthStore((s) => s.user?.permissions) ?? [];
  const canView = perms.includes("AUDIT:VIEW");

  const { projects } = useProjects();
  // The global header project selector — the audit trail scopes to it just like every other module.
  const projectId = useProjectScope((s) => s.projectId);
  const setProjectId = useProjectScope((s) => s.setProjectId);

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState<audit.AuditFilterOptions | null>(null);
  const [counts, setCounts] = useState<ActionCounts>(EMPTY_COUNTS);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // The audit-service has no projectId column; project context lives in the request path
  // (/projects/{id}/…), so we scope by free-text matching that path segment.
  const projectQ = projectId !== "all" ? `/projects/${projectId}` : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await audit.getAuditLogs({
        page,
        size: PAGE_SIZE,
        actorUserId: actorUserId ? Number(actorUserId) : undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        from: from || undefined,
        to: to || undefined,
        q: projectQ,
      });
      setRows(res.content);
      setTotal(res.totalElements);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, actorUserId, action, entityType, from, to, projectQ]);

  // Per-action totals for the chart — ignores the Action filter so the distribution stays whole.
  const loadCounts = useCallback(async () => {
    const base = {
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      entityType: entityType || undefined,
      from: from || undefined,
      to: to || undefined,
      q: projectQ,
    };
    try {
      const results = await Promise.all(
        ACTIONS.map((a) =>
          audit.getAuditLogs({ ...base, action: a, size: 1 }).then((r) => [a, r.totalElements] as const)
        )
      );
      setCounts(results.reduce((acc, [a, n]) => ({ ...acc, [a]: n }), { ...EMPTY_COUNTS }));
    } catch {
      setCounts(EMPTY_COUNTS);
    }
  }, [actorUserId, entityType, from, to, projectQ]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  useEffect(() => {
    if (canView) loadCounts();
  }, [canView, loadCounts]);

  useEffect(() => {
    if (!canView) return;
    audit.getAuditFilters().then(setFilters).catch(() => {});
  }, [canView]);

  const activeFilters =
    (projectId !== "all" ? 1 : 0) +
    (actorUserId ? 1 : 0) +
    (action ? 1 : 0) +
    (entityType ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const grandTotal = ACTIONS.reduce((s, a) => s + counts[a], 0);

  function clearFilters() {
    setProjectId("all");
    setActorUserId("");
    setAction("");
    setEntityType("");
    setFrom("");
    setTo("");
    setPage(0);
  }

  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Fetches every page matching the current filters, not just what's on screen — the client
  // flagged the old version for silently dropping every page past the first.
  async function collectFiltered(): Promise<AuditLog[]> {
    const EXPORT_PAGE_SIZE = 500;
    const base = {
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      from: from || undefined,
      to: to || undefined,
      q: projectQ,
    };
    // Keep paging until we've collected every matching record — don't rely on totalPages alone,
    // so the export always contains the full filtered set, never just the visible page.
    const all: AuditLog[] = [];
    let pageIndex = 0;
    let total = Infinity;
    // Hard stop guards against an unexpected server response causing an endless loop.
    while (all.length < total && pageIndex < 1000) {
      const res = await audit.getAuditLogs({ ...base, page: pageIndex, size: EXPORT_PAGE_SIZE });
      total = res.totalElements;
      if (res.content.length === 0) break;
      all.push(...res.content);
      pageIndex += 1;
    }
    return all;
  }

  const auditHead = ["Time", "Actor", "Role", "Action", "Entity", "Result", "IP"];
  const auditRow = (r: AuditLog) => [
    formatWhen(r.createdAt),
    r.actorName ?? r.actorEmail ?? "System",
    r.actorRole ?? "",
    r.action,
    entityLabel(r),
    resultLabel(r.statusCode),
    formatIp(r.ipAddress),
  ];

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await collectFiltered();
      const lines = all.map(auditRow);
      const csv = [auditHead, ...lines]
        .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export audit logs.");
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExportingPdf(true);
    try {
      const all = await collectFiltered();
      await downloadPdf("Audit Log", auditHead, all.map(auditRow), { landscape: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export audit logs.");
    } finally {
      setExportingPdf(false);
    }
  }

  if (!canView) {
    return (
      <AppShell title="Audit">
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <ShieldAlert size={26} />
          </div>
          <div className="text-base font-semibold text-gray-700">No access to the audit trail</div>
          <p className="mt-1 max-w-xs text-sm text-gray-400">
            You need the <span className="font-medium">Audit</span> permission. Ask an administrator to grant it.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Audit">
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>Audit</span>
          <ChevronRight size={12} className="shrink-0" />
          <span className="font-medium text-gray-600">Activity Log</span>
        </div>

        {/* Summary chart strip */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
              <Activity size={22} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-800">{grandTotal.toLocaleString()}</div>
              <div className="text-xs text-gray-500">
                {projectId !== "all"
                  ? `Events for ${projects.find((p) => p.id === projectId)?.name ?? "project"}`
                  : "Total events matching filters"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
              Activity by action
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              {ACTIONS.map((a) =>
                counts[a] > 0 ? (
                  <div
                    key={a}
                    className={`${ACTION_META[a].bar} h-full`}
                    style={{ width: `${grandTotal ? (counts[a] / grandTotal) * 100 : 0}%` }}
                    title={`${ACTION_META[a].label}: ${counts[a]}`}
                  />
                ) : null
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => (setPage(0), setAction(action === a ? "" : a))}
                  className={`flex items-center gap-1.5 text-xs transition-opacity ${
                    action && action !== a ? "opacity-40" : "opacity-100"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${ACTION_META[a].bar}`} />
                  <span className="font-medium text-gray-600">{ACTION_META[a].label}</span>
                  <span className="text-gray-400">{counts[a].toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Audit Log</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Every create, update, delete and sign-in across the system — {total.toLocaleString()} events.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => (load(), loadCounts())}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={exportCsv}
              disabled={rows.length === 0 || exporting}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
            >
              <Download size={14} /> {exporting ? "Exporting…" : "Export"}
            </button>
            <button
              onClick={exportPdf}
              disabled={rows.length === 0 || exportingPdf}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              <FileText size={14} /> {exportingPdf ? "Generating…" : "PDF"}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <FilterSelect
            label="Project"
            value={projectId}
            onChange={(v) => (setPage(0), setProjectId(v))}
            options={[
              { value: "all", label: "All projects" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <FilterSelect
            label="Actor"
            value={actorUserId}
            onChange={(v) => (setPage(0), setActorUserId(v))}
            options={[
              { value: "", label: "All actors" },
              ...(filters?.actors ?? []).map((a) => ({ value: String(a.id), label: a.name })),
            ]}
          />
          <FilterSelect
            label="Action"
            value={action}
            onChange={(v) => (setPage(0), setAction(v))}
            options={[
              { value: "", label: "All actions" },
              ...(filters?.actions ?? ACTIONS).map((a) => ({ value: a, label: a })),
            ]}
          />
          <FilterSelect
            label="Entity"
            value={entityType}
            onChange={(v) => (setPage(0), setEntityType(v))}
            options={[
              { value: "", label: "All entities" },
              ...(filters?.entityTypes ?? []).map((e) => ({ value: e, label: e })),
            ]}
          />
          <DateField label="From" value={from} onChange={(v) => (setPage(0), setFrom(v))} />
          <DateField label="To" value={to} onChange={(v) => (setPage(0), setTo(v))} />
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-rose-600"
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
            <div className="text-base font-semibold text-gray-700">No audit events</div>
            <p className="mt-1 text-sm text-gray-400">Nothing matches these filters yet.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[940px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Actor</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Entity</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                    <th className="px-4 py-2 font-medium">IP address</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const Icon = ACTION_META[r.action]?.icon ?? Activity;
                    return (
                      <tr
                        key={r.id}
                        title={r.summary ?? undefined}
                        className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">{formatWhen(r.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${projectAvatarColor(String(r.actorUserId ?? r.actorEmail ?? "sys"))}`}
                            >
                              {r.actorName ? projectInitials(r.actorName) : <UserRound size={13} />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-800">{r.actorName ?? r.actorEmail ?? "System"}</div>
                              {r.actorRole && <div className="truncate text-xs text-gray-400">{r.actorRole}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_META[r.action]?.badge ?? "bg-gray-100 text-gray-600"}`}>
                            <Icon size={12} /> {r.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{entityLabel(r)}</td>
                        <td className="px-4 py-2.5">
                          {r.statusCode == null ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : r.statusCode >= 400 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                              <XCircle size={12} /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 size={12} /> Success
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{formatIp(r.ipAddress)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {page + 1} of {Math.max(1, totalPages)} · {total.toLocaleString()} events
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
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
      <Select value={value} onChange={onChange} options={options} className="min-w-[140px]" />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      <DatePicker value={value} onChange={onChange} placeholder={label} className="min-w-[150px]" />
    </label>
  );
}

function entityLabel(r: AuditLog): string {
  if (!r.entityType) return "—";
  const name = r.entityType.charAt(0) + r.entityType.slice(1).toLowerCase().replace(/_/g, " ");
  return r.entityId ? `${name} #${r.entityId}` : name;
}

// Backend logs the raw remote address; show IPv6 loopback as its IPv4 form, leave real IPs untouched.
function formatIp(ip: string | null): string {
  if (!ip) return "—";
  if (ip === "0:0:0:0:0:0:0:1" || ip === "::1") return "127.0.0.1";
  return ip;
}

function resultLabel(statusCode: number | null): string {
  if (statusCode == null) return "";
  return statusCode >= 400 ? "Failed" : "Success";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}
