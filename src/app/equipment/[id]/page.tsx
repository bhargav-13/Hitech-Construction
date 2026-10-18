"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { DeployDialog, EquipmentFormDialog, UsageDialog, num2, unitLabel } from "@/components/equipment/EquipmentDialogs";
import { ApiError } from "@/lib/api";
import { deleteEquipment, deleteUsage, getEquipment } from "@/lib/equipmentApi";
import type { Deployment, EquipmentDetail, UsageEntry } from "@/lib/equipmentApi";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { formatTimeIST } from "@/lib/datetime";
import { bookDate, inr } from "@/lib/format";
import { useVyaparProjectId } from "@/lib/projectScope";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { ArrowLeft, Clock, FileSpreadsheet, MapPin, Pencil, Plus, Tractor, Trash2 } from "lucide-react";

type Dialog = null | { kind: "EDIT" } | { kind: "DEPLOY" } | { kind: "EDIT_DEPLOY"; row: Deployment } | { kind: "USAGE" };

const RENT_LABEL: Record<string, string> = { monthly: "/ month", daily: "/ day", hourly: "/ hour", trip: "/ trip" };

/**
 * One machine: its deployments (site, rent, from–until) and the day-by-day usage log, filterable
 * by project. Totals follow the filter, so a site's hours can be checked against the hire bill.
 */
export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const can = useCan();
  const id = Number(params.id);
  const { projects } = useProjects();
  const projectName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects]);
  const [data, setData] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const scoped = useVyaparProjectId();
  // Opens on the header's project; the filter here can widen or narrow it.
  const [project, setProject] = useState(scoped ? String(scoped) : "");
  const [month, setMonth] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getEquipment(id));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the equipment.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const usage = useMemo(
    () => (data?.usage ?? []).filter((u) => (!project || u.projectId === Number(project)) && (!month || u.usedOn.startsWith(month))),
    [data, project, month],
  );
  const months = useMemo(() => [...new Set((data?.usage ?? []).map((u) => u.usedOn.slice(0, 7)))].sort().reverse(), [data]);
  const usageProjects = useMemo(() => [...new Set((data?.usage ?? []).map((u) => u.projectId).filter((p): p is number => p != null))], [data]);
  const totals = useMemo(() => ({
    hours: usage.reduce((s, u) => s + Number(u.usedHours), 0),
    distance: usage.reduce((s, u) => s + Number(u.distance), 0),
    fuel: usage.reduce((s, u) => s + Number(u.fuelQty), 0),
    days: new Set(usage.map((u) => u.usedOn)).size,
  }), [usage]);

  if (!data) {
    return (
      <AppShell title="Equipment">
        {error ? (
          <div className="mx-auto max-w-md space-y-3 py-16 text-center">
            <p className="text-sm text-rose-600">{error}</p>
            <Link href="/equipment" className="text-sm font-medium text-brand-accent hover:underline">Back to equipment</Link>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        )}
      </AppShell>
    );
  }

  const { equipment: eq, deployments } = data;
  const canEdit = can("EQUIPMENT:EDIT");
  const canCreate = can("EQUIPMENT:CREATE");
  const canDelete = can("EQUIPMENT:DELETE");
  const pName = (pid: number | null) => (pid == null ? "No project" : projectName.get(pid) ?? `Project #${pid}`);

  async function removeEquipment() {
    if (!confirm(`Delete ${eq.name}? Only possible while it has no usage log.`)) return;
    try {
      await deleteEquipment(eq.id);
      router.push("/equipment");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to delete.");
    }
  }

  async function removeUsage(u: UsageEntry) {
    if (!confirm(`Delete the ${bookDate(u.usedOn)} entry (${num2(u.usedHours)} h)?`)) return;
    try {
      await deleteUsage(u.id);
      void load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to delete the entry.");
    }
  }

  function exportCsv() {
    exportRowsToCsv(
      `equipment-${eq.name}`,
      ["Date", "Project", "Start", "Stop", "Hours", "Km", "Trips", "Fuel", "Note", "Entered by"],
      usage.map((u) => [
        u.usedOn, pName(u.projectId), u.startAt ? formatTimeIST(u.startAt) : "", u.stopAt ? formatTimeIST(u.stopAt) : "",
        Number(u.usedHours), Number(u.distance), u.trips, Number(u.fuelQty), u.note ?? "", u.enteredBy ?? "",
      ]),
    );
  }

  return (
    <AppShell title="Equipment">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <button onClick={() => router.push("/equipment")} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" title="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-brand-accent"><Tractor size={22} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-800">
              {eq.name}
              {!eq.active && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 align-middle text-[11px] font-normal text-gray-500">Inactive</span>}
            </h2>
            <p className="text-xs text-gray-500">
              {[eq.code, eq.ownership === "RENTED" ? "Rented" : "Owned", unitLabel(eq.unit), eq.fuel].filter(Boolean).join(" · ")}
              {eq.vendorName && eq.vendorPartyId && (
                <> · from <Link href={`/vyapar/parties?open=${eq.vendorPartyId}`} className="text-brand-accent hover:underline">{eq.vendorName}</Link></>
              )}
            </p>
            {eq.notes && <p className="mt-1 text-xs text-gray-500">{eq.notes}</p>}
          </div>
          {canCreate && eq.active && (
            <button onClick={() => setDialog({ kind: "USAGE" })} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              <Plus size={15} /> Usage
            </button>
          )}
          {(canEdit || canDelete) && (
            <RowMenu align="right" buttonLabel="Equipment actions">
              {(close) => (
                <>
                  {canEdit && <RowMenuItem icon={Pencil} label="Edit equipment" onClick={() => { close(); setDialog({ kind: "EDIT" }); }} />}
                  {canEdit && <RowMenuItem icon={MapPin} label="Deploy to a project" onClick={() => { close(); setDialog({ kind: "DEPLOY" }); }} />}
                  {canDelete && <RowMenuItem icon={Trash2} label="Delete equipment" tone="danger" onClick={() => { close(); void removeEquipment(); }} />}
                </>
              )}
            </RowMenu>
          )}
        </div>

        {notice && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* Usage log */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Figure label="Hours" value={num2(totals.hours)} />
              <Figure label="Days run" value={String(totals.days)} />
              <Figure label="Distance (km)" value={num2(totals.distance)} />
              <Figure label="Fuel" value={num2(totals.fuel)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <Select value={project} onChange={setProject} options={[{ value: "", label: "All projects" }, ...usageProjects.map((p) => ({ value: String(p), label: pName(p) }))]} />
              </div>
              <div className="w-40">
                <Select
                  value={month}
                  onChange={setMonth}
                  options={[{ value: "", label: "All months" }, ...months.map((m) => ({ value: m, label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) }))]}
                />
              </div>
              <span className="text-sm text-gray-500">({usage.length})</span>
              <button onClick={exportCsv} className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                <FileSpreadsheet size={14} /> Export
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-3 py-2 font-medium">Start – Stop</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">Km</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-2 text-gray-700">{bookDate(u.usedOn)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{pName(u.projectId)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {u.startAt || u.stopAt ? `${u.startAt ? formatTimeIST(u.startAt) : "—"} – ${u.stopAt ? formatTimeIST(u.stopAt) : "—"}` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">{num2(u.usedHours)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{Number(u.distance) > 0 ? num2(u.distance) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {u.note}
                        {u.enteredBy && <div className="text-[10px] text-gray-400">by {u.enteredBy}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canDelete && (
                          <button onClick={() => void removeUsage(u)} className="rounded p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-600" title="Delete entry">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {usage.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No usage logged{project || month ? " for this filter" : " yet"}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deployments */}
          <div className="self-start rounded-xl border border-gray-200 bg-white p-4 lg:sticky lg:top-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Deployments ({deployments.length})</h3>
              {canEdit && (
                <button onClick={() => setDialog({ kind: "DEPLOY" })} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
                  <Plus size={12} /> Deploy
                </button>
              )}
            </div>
            {deployments.length === 0 ? (
              <p className="text-sm text-gray-400">Not deployed to any project yet.</p>
            ) : (
              <ul className="space-y-2">
                {deployments.map((d) => (
                  <li key={d.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.active ? "bg-emerald-500" : "bg-gray-300"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-800">{pName(d.projectId)}</div>
                        <div className="text-xs text-gray-500">
                          {d.startedOn ? bookDate(d.startedOn) : "—"} – {d.endedOn ? bookDate(d.endedOn) : d.active ? "now" : "—"}
                        </div>
                        {Number(d.rentAmount) > 0 && (
                          <div className="text-xs text-gray-600">{inr(Number(d.rentAmount))} {d.rentType ? RENT_LABEL[d.rentType] ?? `/ ${d.rentType}` : ""}</div>
                        )}
                        {d.vendorName && <div className="text-[11px] text-gray-400">{d.vendorName}</div>}
                      </div>
                      {canEdit && (
                        <button onClick={() => setDialog({ kind: "EDIT_DEPLOY", row: d })} className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700" title="Edit deployment">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
              <Clock size={13} /> {eq.usageEntries} entries · {num2(eq.usedHours)} h in all
              {eq.lastUsedOn && <> · last {bookDate(eq.lastUsedOn)}</>}
            </div>
          </div>
        </div>
      </div>

      {dialog?.kind === "EDIT" && <EquipmentFormDialog existing={eq} onClose={() => setDialog(null)} onSaved={() => void load()} />}
      {dialog?.kind === "DEPLOY" && <DeployDialog equipment={eq} onClose={() => setDialog(null)} onDone={() => void load()} />}
      {dialog?.kind === "EDIT_DEPLOY" && <DeployDialog equipment={eq} existing={dialog.row} onClose={() => setDialog(null)} onDone={() => void load()} />}
      {dialog?.kind === "USAGE" && (
        <UsageDialog equipment={eq} projectId={project ? Number(project) : null} onClose={() => setDialog(null)} onDone={() => void load()} />
      )}
    </AppShell>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
