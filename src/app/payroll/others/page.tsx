"use client";

import { useEffect, useState } from "react";
import { useDiscardGuard } from "@/lib/formDirty";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { OTHERS_TILES } from "@/lib/payrollConfig";
import { loadRows, saveRows, type RegisterRow } from "@/lib/localRegister";
import { loadReportContext, buildReport } from "@/lib/payrollReports";
import { getPayrollPeople, getPayrollProfiles } from "@/lib/api";
import { inr } from "@/lib/format";
import {
  CheckSquare, FileText, Gift, LayoutGrid, Plus, Shield, Trophy, Trash2, Users, Wallet, X,
} from "lucide-react";
import { ReportTable } from "@/components/payroll/ReportTable";
import { EmploymentLetters } from "@/components/payroll/EmploymentLetters";

const ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  file: FileText, shield: Shield, grid: LayoutGrid, wallet: Wallet, trophy: Trophy, check: CheckSquare, users: Users, gift: Gift,
};

type TileKind = "register" | "cashbook" | "scorecard" | "celebrations" | "letters";
interface TileCfg { kind: TileKind; columns?: string[] }

/** How each Others tile behaves. Register/cashbook persist locally; the rest use live data. */
const TILE_CFG: Record<string, TileCfg> = {
  "Employment Letters": { kind: "letters" },
  "Active Sessions": { kind: "register", columns: ["Staff", "Device", "Location", "Last Active"] },
  "Asset Management": { kind: "register", columns: ["Asset", "Assigned To", "Serial No.", "Status"] },
  "Cashbook": { kind: "cashbook" },
  "Goals": { kind: "register", columns: ["Staff", "Goal", "Target", "Progress"] },
  "Performance Templates": { kind: "register", columns: ["Template", "Criteria", "Weightage"] },
  "Scorecard": { kind: "scorecard" },
  "Job Posts": { kind: "register", columns: ["Title", "Department", "Status", "Applications"] },
  "Celebrations": { kind: "celebrations" },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function OthersPage() {
  const [open, setOpen] = useState<string | null>(null);
  const cfg = open ? TILE_CFG[open] : null;

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Others</h2>
          <p className="mt-0.5 text-sm text-gray-500">Additional HR tools and workspace utilities.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OTHERS_TILES.map((t) => {
            const Icon = ICON[t.icon] ?? LayoutGrid;
            return (
              <button
                key={t.name}
                onClick={() => setOpen(t.name)}
                className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={18} /></div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{t.name}</div>
                  <p className="mt-0.5 text-xs text-gray-400">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {open && cfg && (
        <Modal title={open} onClose={() => setOpen(null)}>
          {cfg.kind === "register" && <Register title={open} columns={cfg.columns!} />}
          {cfg.kind === "cashbook" && <Cashbook />}
          {cfg.kind === "scorecard" && <Scorecard />}
          {cfg.kind === "celebrations" && <Celebrations />}
          {cfg.kind === "letters" && <EmploymentLetters />}
        </Modal>
      )}
    </PayrollShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Asks before throwing away a half-filled sheet — the backdrop used to close it outright.
  const { panelRef, confirmDiscard } = useDiscardGuard();
  const dismiss = () => confirmDiscard() && onClose();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={dismiss}>
      <div ref={panelRef} className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button onClick={dismiss} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Generic local table: add/edit/delete rows, persisted in the browser. */
function Register({ title, columns }: { title: string; columns: string[] }) {
  const key = slug(title);
  const [rows, setRows] = useState<RegisterRow[]>(() => loadRows(key));
  const update = (next: RegisterRow[]) => { setRows(next); saveRows(key, next); };
  const addRow = () => update([...rows, Object.fromEntries(columns.map((c) => [c, ""]))]);
  const setCell = (i: number, col: string, v: string) => update(rows.map((r, j) => (j === i ? { ...r, [col]: v } : r)));
  const removeRow = (i: number) => update(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add</button>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Nothing yet — click Add to create the first entry.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                {columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-b-0">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1.5">
                      <input value={r[c] ?? ""} onChange={(e) => setCell(i, c, e.target.value)} className="w-full rounded-md border border-transparent px-2 py-1 text-sm outline-none hover:border-gray-200 focus:border-cyan-500" placeholder={c} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => removeRow(i)} aria-label="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Daily cash log with a running balance. */
function Cashbook() {
  const key = "cashbook";
  const [rows, setRows] = useState<RegisterRow[]>(() => loadRows(key));
  const update = (next: RegisterRow[]) => { setRows(next); saveRows(key, next); };
  const addRow = () => update([...rows, { date: new Date().toISOString().slice(0, 10), desc: "", in: "", out: "" }]);
  const setCell = (i: number, col: string, v: string) => update(rows.map((r, j) => (j === i ? { ...r, [col]: v } : r)));
  const removeRow = (i: number) => update(rows.filter((_, j) => j !== i));
  const balance = rows.reduce((s, r) => s + (Number(r.in) || 0) - (Number(r.out) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm">Balance <span className="font-semibold text-gray-900">{inr(balance)}</span></div>
        <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add entry</button>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No cash entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">In</th>
                <th className="px-3 py-2 text-right font-medium">Out</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5"><input type="date" value={r.date ?? ""} onChange={(e) => setCell(i, "date", e.target.value)} className="rounded-md border border-transparent px-2 py-1 text-sm outline-none hover:border-gray-200 focus:border-cyan-500" /></td>
                  <td className="px-2 py-1.5"><input value={r.desc ?? ""} onChange={(e) => setCell(i, "desc", e.target.value)} className="w-full rounded-md border border-transparent px-2 py-1 text-sm outline-none hover:border-gray-200 focus:border-cyan-500" placeholder="Description" /></td>
                  <td className="px-2 py-1.5"><input type="number" value={r.in ?? ""} onChange={(e) => setCell(i, "in", e.target.value)} className="w-24 rounded-md border border-transparent px-2 py-1 text-right text-sm text-emerald-600 outline-none hover:border-gray-200 focus:border-cyan-500" placeholder="0" /></td>
                  <td className="px-2 py-1.5"><input type="number" value={r.out ?? ""} onChange={(e) => setCell(i, "out", e.target.value)} className="w-24 rounded-md border border-transparent px-2 py-1 text-right text-sm text-rose-600 outline-none hover:border-gray-200 focus:border-cyan-500" placeholder="0" /></td>
                  <td className="px-2 py-1.5 text-right"><button onClick={() => removeRow(i)} aria-label="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Live attendance leaderboard for the current month. */
function Scorecard() {
  const [data, setData] = useState<{ head: string[]; rows: (string | number)[][] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadReportContext()
      .then((ctx) => { const r = buildReport("Scorecard Report", ctx); setData({ head: r.head, rows: r.rows }); })
      .catch(() => setError("Couldn't load attendance data."));
  }, []);
  if (error) return <p className="py-8 text-center text-sm text-rose-600">{error}</p>;
  if (!data) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>;
  return <ReportTable report={data} />;
}

/** Upcoming work anniversaries from members' joining dates. */
function Celebrations() {
  const [items, setItems] = useState<{ name: string; date: string; years: number; inDays: number }[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const users = (await getPayrollPeople()).content.filter((u) => u.onPayroll);
        const profiles = users.length ? await getPayrollProfiles(users.map((u) => u.id)).catch(() => []) : [];
        const byId = new Map(users.map((u) => [u.id, u.fullName]));
        const today = new Date();
        const out = profiles
          .filter((p) => p.joiningDate)
          .map((p) => {
            const jd = new Date(p.joiningDate!);
            const next = new Date(today.getFullYear(), jd.getMonth(), jd.getDate());
            if (next < today) next.setFullYear(today.getFullYear() + 1);
            const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
            return { name: byId.get(p.userId) ?? "—", date: next.toISOString().slice(0, 10), years: next.getFullYear() - jd.getFullYear(), inDays };
          })
          .filter((x) => x.inDays <= 60)
          .sort((a, b) => a.inDays - b.inDays);
        setItems(out);
      } catch {
        setItems([]);
      }
    })();
  }, []);
  if (!items) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>;
  if (items.length === 0) return <p className="py-8 text-center text-sm text-gray-400">No work anniversaries in the next 60 days.</p>;
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Gift size={16} className="text-brand-accent" />
            <div>
              <div className="text-sm font-medium text-gray-800">{x.name}</div>
              <div className="text-xs text-gray-400">{x.years}-year work anniversary · {x.date}</div>
            </div>
          </div>
          <span className="text-xs font-medium text-brand-accent">{x.inDays === 0 ? "Today" : `in ${x.inDays} day${x.inDays === 1 ? "" : "s"}`}</span>
        </div>
      ))}
    </div>
  );
}
