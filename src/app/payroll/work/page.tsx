"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import {
  ApiError, addWorkLogApi, deleteWorkItemApi, deleteWorkLogApi, getPayrollPeople, getWorkItemsApi, getWorkLogsApi, saveWorkItemApi,
} from "@/lib/api";
import type { UserResponse, WorkItemApi, WorkLogApi } from "@/lib/api";
import { usePayrollProfiles } from "@/lib/usePayrollSetup";
import { formatDateIST, todayIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { exportRowsToXlsx } from "@/lib/vyaparExport";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Hammer, Pencil, Plus, Trash2 } from "lucide-react";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";

type Tab = "logs" | "summary" | "catalogue";
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Work Management — piece-rate pay (PagarBook's Work Logs): a catalogue of work items with rates,
 * daily work logs (units × rate), and a per-staff summary. Logged work is paid through the month's
 * payroll run.
 */
export default function WorkPage() {
  const [tab, setTab] = useState<Tab>("logs");
  const [date, setDate] = useState(todayIST());
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const [items, setItems] = useState<WorkItemApi[]>([]);
  const [logs, setLogs] = useState<WorkLogApi[] | null>(null);
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [error, setError] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [itemEdit, setItemEdit] = useState<WorkItemApi | "new" | null>(null);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const { profiles } = usePayrollProfiles(memberIds.length ? memberIds : undefined);

  const [y, m] = month.split("-").map(Number);
  const monthEnd = `${month}-${pad(new Date(y, m, 0).getDate())}`;
  const loadItems = useCallback(async () => { try { setItems(await getWorkItemsApi()); } catch { /* shown via logs */ } }, []);
  const loadLogs = useCallback(async () => {
    setLogs(null);
    try { setLogs(await getWorkLogsApi(`${month}-01`, monthEnd)); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load work logs."); setLogs([]); }
  }, [month, monthEnd]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { getPayrollPeople().then((r) => setMembers(r.content.filter((u) => u.onPayroll))).catch(() => {}); }, []);

  const dayLogs = (logs ?? []).filter((l) => l.date === date);
  const pieceWorkers = members.filter((mm) => profiles[mm.id]?.salary.workType === "PIECE" || profiles[mm.id]?.category === "WORK_BASIS");
  const summary = useMemo(() => {
    const map = new Map<number, { name: string; units: number; amount: number; days: Set<string> }>();
    for (const l of logs ?? []) {
      const e = map.get(l.userId) ?? { name: l.memberName, units: 0, amount: 0, days: new Set<string>() };
      e.units += Number(l.units); e.amount += Number(l.amount); e.days.add(l.date);
      map.set(l.userId, e);
    }
    return [...map.entries()].map(([id, e]) => ({ id, ...e })).sort((a, b) => b.amount - a.amount);
  }, [logs]);

  const stepMonth = (d: number) => { const dt = new Date(y, m - 1 + d, 1); setMonth(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`); };
  async function removeLog(id: number) {
    try { await deleteWorkLogApi(id); await loadLogs(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }
  async function removeItem(it: WorkItemApi) {
    if (!confirm(`Delete “${it.name}” from the catalogue? Past logs keep their rate.`)) return;
    try { await deleteWorkItemApi(it.id); await loadItems(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Work Management</h2>
            <p className="mt-0.5 text-sm text-gray-500">Piece-rate work logged by staff and supervisors — paid through the month&apos;s payroll.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLogOpen(true)} disabled={items.length === 0} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Plus size={14} /> Log Work</button>
          </div>
        </div>

        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
          {([["logs", "Work Logs"], ["summary", "Work Summary"], ["catalogue", "Catalogue"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 text-sm font-medium ${tab === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
          ))}
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        {items.length === 0 && tab !== "catalogue" && (
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-xs text-brand-accent">
            Your catalogue is empty — add work items and their rates in the <button onClick={() => setTab("catalogue")} className="font-semibold underline">Catalogue</button> first.
          </div>
        )}

        {tab === "logs" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40"><DatePicker value={date} onChange={(v) => { setDate(v); setMonth(v.slice(0, 7)); }} /></div>
              <button onClick={() => exportRowsToXlsx(`work-logs-${date}`, ["Staff", "Date", "Item", "Units", "Rate", "Amount", "Note", "Logged by"], dayLogs.map((l) => [l.memberName, l.date, l.itemName, Number(l.units), Number(l.rate), Number(l.amount), l.note ?? "", l.loggedByName ?? ""]))} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><FileSpreadsheet size={14} /> Download Report</button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Logged Today" value={`${dayLogs.reduce((a, l) => a + Number(l.units), 0)} units`} accent="cyan" />
              <StatCard label="Payable Today" value={inr(dayLogs.reduce((a, l) => a + Number(l.amount), 0))} accent="green" />
              <StatCard label="Staff Who Logged" value={`${new Set(dayLogs.map((l) => l.userId)).size} / ${pieceWorkers.length || members.length}`} />
              <StatCard label="This Month" value={inr((logs ?? []).reduce((a, l) => a + Number(l.amount), 0))} accent="blue" />
            </div>
            {logs === null ? <Loading /> : dayLogs.length === 0 ? (
              <PayrollEmpty icon={Hammer} title="No work logged for the day" hint="Use “Log Work” to add units produced by a staff member." />
            ) : (
              <LogTable rows={dayLogs} onDelete={removeLog} />
            )}
          </>
        )}

        {tab === "summary" && (
          <>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
              <button onClick={() => stepMonth(-1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <span className="min-w-[110px] px-2 text-center text-sm font-semibold text-gray-700">{month}</span>
              <button onClick={() => stepMonth(1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
            {logs === null ? <Loading /> : summary.length === 0 ? <PayrollEmpty icon={Hammer} title="No work this month" /> : <SummaryTable rows={summary} />}
          </>
        )}

        {tab === "catalogue" && (
          <div className="space-y-3">
            <div className="flex justify-end"><button onClick={() => setItemEdit("new")} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add Items</button></div>
            {items.length === 0 ? <PayrollEmpty icon={Hammer} title="Your catalogue is empty" hint="Add work items and their rates to start building your catalogue." /> : <CatalogueTable items={items} onEdit={setItemEdit} onDelete={removeItem} />}
          </div>
        )}
      </div>

      {logOpen && (
        <LogWorkDialog
          members={pieceWorkers.length ? pieceWorkers : members}
          items={items.filter((i) => i.active)}
          date={date}
          onClose={() => setLogOpen(false)}
          onSaved={async () => { setLogOpen(false); await loadLogs(); }}
        />
      )}
      {itemEdit && <ItemDialog item={itemEdit === "new" ? null : itemEdit} onClose={() => setItemEdit(null)} onSaved={async () => { setItemEdit(null); await loadItems(); }} />}
    </PayrollShell>
  );
}

function Loading() {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>;
}

const LOG_SORT = {
  staff: (l: WorkLogApi) => l.memberName,
  date: (l: WorkLogApi) => l.date,
  operation: (l: WorkLogApi) => l.itemName,
  units: (l: WorkLogApi) => Number(l.units),
  rate: (l: WorkLogApi) => Number(l.rate),
  amount: (l: WorkLogApi) => Number(l.amount),
  by: (l: WorkLogApi) => l.loggedByName ?? "",
};
type SummaryRow = { id: number; name: string; units: number; amount: number; days: Set<string> };
const SUMMARY_SORT = {
  staff: (r: SummaryRow) => r.name,
  days: (r: SummaryRow) => r.days.size,
  units: (r: SummaryRow) => r.units,
  amount: (r: SummaryRow) => r.amount,
};
const ITEM_SORT = {
  name: (i: WorkItemApi) => i.name,
  unit: (i: WorkItemApi) => i.unit ?? "",
  rate: (i: WorkItemApi) => Number(i.rate),
  status: (i: WorkItemApi) => (i.active ? "Active" : "Archived"),
};

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, SUMMARY_SORT, { key: "amount", dir: "desc" });
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
          <SortTh label="Staff" sortKey="staff" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Days worked" sortKey="days" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Units" sortKey="units" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Payout" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
        </tr></thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} className="border-t border-gray-50">
              <td className="px-4 py-2"><Link href={`/payroll/staff/${s.id}#work`} className="font-medium text-gray-800 hover:text-brand-accent hover:underline">{s.name}</Link></td>
              <td className="px-4 py-2 text-right">{s.days.size}</td>
              <td className="px-4 py-2 text-right">{s.units}</td>
              <td className="px-4 py-2 text-right font-semibold">{inr(s.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogueTable({ items, onEdit, onDelete }: { items: WorkItemApi[]; onEdit: (i: WorkItemApi) => void; onDelete: (i: WorkItemApi) => void }) {
  const [show, setShow] = useState<"all" | "active" | "archived">("all");
  const rows = useMemo(() => items.filter((i) => show === "all" || (show === "active") === i.active), [items, show]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, ITEM_SORT, { key: "name" });
  return (
    <div className="space-y-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
        {(["all", "active", "archived"] as const).map((k) => (
          <button key={k} onClick={() => setShow(k)} className={`px-3 py-1.5 font-medium capitalize ${show === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{k}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
            <SortTh label="Item Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Unit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Rate" sortKey="rate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggle} /><th />
          </tr></thead>
          <tbody>
            {sorted.map((it) => (
              <tr key={it.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{it.name}</td>
                <td className="px-4 py-2 text-gray-600">{it.unit ?? "—"}</td>
                <td className="px-4 py-2 text-right">{inr(it.rate)}</td>
                <td className="px-4 py-2 text-xs">{it.active ? "Active" : "Archived"}</td>
                <td className="px-2 py-2 text-right">
                  <button onClick={() => onEdit(it)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(it)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogTable({ rows: all, onDelete }: { rows: WorkLogApi[]; onDelete: (id: number) => void }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? all.filter((l) => l.memberName.toLowerCase().includes(t) || l.itemName.toLowerCase().includes(t)) : all;
  }, [all, q]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, LOG_SORT);
  return (
    <div className="space-y-2">
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff or item" className="input w-64" />
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
          <SortTh label="Staff Name" sortKey="staff" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Date Logged" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} /><th className="px-4 py-2 font-medium">Source</th><SortTh label="Operation" sortKey="operation" activeKey={sortKey} dir={sortDir} onSort={toggle} />
          <SortTh label="Units" sortKey="units" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Rate" sortKey="rate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Logged By" sortKey="by" activeKey={sortKey} dir={sortDir} onSort={toggle} /><th />
        </tr></thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="border-t border-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800">{l.memberName}</td>
              <td className="px-4 py-2">{formatDateIST(l.date)}</td>
              <td className="px-4 py-2 text-xs text-gray-500">General Work</td>
              <td className="px-4 py-2">{l.itemName}{l.note ? <span className="ml-1 text-xs text-gray-400">· {l.note}</span> : null}</td>
              <td className="px-4 py-2 text-right">{Number(l.units)}</td>
              <td className="px-4 py-2 text-right text-gray-500">{inr(l.rate)}</td>
              <td className="px-4 py-2 text-right font-semibold">{inr(l.amount)}</td>
              <td className="px-4 py-2 text-xs text-gray-500">{l.loggedByName ?? "—"}</td>
              <td className="px-2 py-2"><button onClick={() => onDelete(l.id)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function LogWorkDialog({ members, items, date, onClose, onSaved }: {
  members: UserResponse[]; items: WorkItemApi[]; date: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [itemId, setItemId] = useState(items[0] ? String(items[0].id) : "");
  const [units, setUnits] = useState("");
  const [rate, setRate] = useState("");
  const [d, setD] = useState(date);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const item = items.find((i) => String(i.id) === itemId);
  const r = rate !== "" ? Number(rate) : Number(item?.rate ?? 0);
  async function save() {
    if (!userId || !item || !(Number(units) > 0)) { setError("Pick the staff member, the item and the units."); return; }
    setBusy(true); setError("");
    try {
      await addWorkLogApi({ userId: Number(userId), date: d, itemId: item.id, units: Number(units), rate: r, note: note || undefined });
      await onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to log work."); setBusy(false); }
  }
  return (
    <Modal onClose={onClose}>
      <div className="border-b border-gray-100 px-5 py-4 pr-12"><h3 className="text-base font-semibold text-gray-800">Add Work Log</h3></div>
      <div className="space-y-3 px-5 py-4">
        <label className="block text-xs text-gray-500">Staff Member *<Select value={userId} onChange={setUserId} placeholder="Select staff member" options={members.map((mm) => ({ value: String(mm.id), label: mm.fullName }))} /></label>
        <label className="block text-xs text-gray-500">Item *<Select value={itemId} onChange={(v) => { setItemId(v); setRate(""); }} options={items.map((i) => ({ value: String(i.id), label: `${i.name}${i.unit ? ` (${i.unit})` : ""}` }))} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500">Units Produced *<input type="number" min={0} value={units} onChange={(e) => setUnits(e.target.value)} className="input mt-1 w-full" /></label>
          <label className="block text-xs text-gray-500">Rate Per Unit<input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder={item ? String(item.rate) : "₹"} className="input mt-1 w-full" /></label>
        </div>
        <label className="block text-xs text-gray-500">Date *<DatePicker value={d} onChange={setD} /></label>
        <label className="block text-xs text-gray-500">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="input mt-1 w-full" /></label>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="text-gray-500">Total Amount</span><span className="font-semibold">{inr(r)} × {Number(units) || 0} = {inr(r * (Number(units) || 0))}</span></div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Save Work Log"}</button>
      </div>
    </Modal>
  );
}

function ItemDialog({ item, onClose, onSaved }: { item: WorkItemApi | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [rate, setRate] = useState(item ? String(item.rate) : "");
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim() || rate === "") { setError("Item name and rate are required."); return; }
    setBusy(true); setError("");
    try { await saveWorkItemApi(item?.id ?? null, { name: name.trim(), unit: unit || undefined, rate: Number(rate), active }); await onSaved(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save."); setBusy(false); }
  }
  return (
    <Modal onClose={onClose}>
      <div className="border-b border-gray-100 px-5 py-4 pr-12"><h3 className="text-base font-semibold text-gray-800">{item ? "Edit Catalogue Item" : "Add Catalogue Item"}</h3></div>
      <div className="space-y-3 px-5 py-4">
        <label className="block text-xs text-gray-500">Item Name *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor tiling" className="input mt-1 w-full" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500">Unit<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sq ft, piece, m³" className="input mt-1 w-full" /></label>
          <label className="block text-xs text-gray-500">Item Rate (₹) *<input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="input mt-1 w-full" /></label>
        </div>
        {item && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : item ? "Save" : "Add Item"}</button>
      </div>
    </Modal>
  );
}
