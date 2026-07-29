"use client";

import { useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { usePayrollRuns, usePayrollRun } from "@/lib/usePayrollLive";
import { ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import {
  ChevronLeft, ChevronRight, CircleCheck, FileSpreadsheet, Lock, Play, RefreshCw, ShieldCheck, Unlock, Users, Wallet,
} from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Monthly Runs — pick a month, generate the run (reads live attendance + profiles + loans +
 * reimbursements from the backend, computes gross/deductions/net), review, then lock. All powered
 * by payroll-service — no client-side salary math here.
 */
export default function PayrollRunPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const monthKey = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

  const { runs, refresh: refreshList, generate, lock, unlock, pay } = usePayrollRuns();
  const { run, loading, error, refresh: refreshRun } = usePayrollRun(monthKey);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const step = (dir: 1 | -1) => {
    let m = monthIdx + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIdx(m); setYear(y);
  };

  async function doGenerate() {
    setBusy(true); setActionError("");
    try { await generate(monthKey); await refreshRun(); await refreshList(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to generate the run."); }
    finally { setBusy(false); }
  }
  async function doLock() {
    setBusy(true); setActionError("");
    try { await lock(monthKey); await refreshRun(); await refreshList(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to lock the run."); }
    finally { setBusy(false); }
  }
  async function doUnlock() {
    setBusy(true); setActionError("");
    try { await unlock(monthKey); await refreshRun(); await refreshList(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to unlock the run."); }
    finally { setBusy(false); }
  }
  async function doPay() {
    if (!confirm("Mark this month's salaries as PAID? This only records that Hi-Tech disbursed them manually (bank / cash) — it does not transfer any money.")) return;
    setBusy(true); setActionError("");
    try { await pay(monthKey); await refreshRun(); await refreshList(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to mark the run paid."); }
    finally { setBusy(false); }
  }

  const head = ["Member", "Payable Days", "Gross", "PF", "ESIC", "PT", "Loan EMI", "Reimb.", "Net"];
  const data = useMemo(() => (run?.payslips ?? []).map((p) => [
    p.memberName,
    `${p.payableDays} / ${p.totalDays}`,
    p.gross, p.pf, p.esic, p.pt, p.loanEmi, p.reimbursements, p.net,
  ]), [run]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Monthly Payroll Runs</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Turn a month of attendance + salary + loans + reimbursements into payslips.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <div className="min-w-[110px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-sm font-semibold text-gray-800">{MONTHS[monthIdx]} {year}</div>
            <button onClick={() => step(1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><ChevronRight size={16} /></button>
          </div>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {run?.status === "DRAFT" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <RefreshCw size={15} className="mt-0.5 shrink-0" />
            <span>
              This is a <strong>draft</strong> — the figures are a snapshot from when it was last generated.
              After any attendance, leave, loan or reimbursement change, click <strong>Regenerate</strong> before locking.
            </span>
          </div>
        )}
        {run?.status === "PAID" && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <CircleCheck size={15} className="mt-0.5 shrink-0" />
            <span>
              Salaries for {MONTHS[monthIdx]} {year} are marked <strong>paid</strong>
              {run.paidByName ? ` by ${run.paidByName}` : ""}{run.paidAt ? ` on ${new Date(run.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
              This is a record only — Hi-Tech disburses salaries manually (bank / cash); the system never moves money.
            </span>
          </div>
        )}

        {/* Run controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{MONTHS[monthIdx]} {year}</span>
              {run && <RunStatusBadge status={run.status} />}
            </div>
            <p className="text-xs text-gray-500">
              {run
                ? `${run.personCount} member${run.personCount === 1 ? "" : "s"} · net ${inr(Number(run.totalNet))}${run.lockedByName ? ` · locked by ${run.lockedByName}` : ""}`
                : "No run generated for this month yet."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {run?.status !== "PAID" && (
              <button
                onClick={doGenerate}
                disabled={busy || run?.status === "LOCKED"}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
              >
                <Play size={14} /> {busy ? "Generating…" : run ? "Regenerate" : "Generate Run"}
              </button>
            )}
            {run?.status === "DRAFT" && (
              <button onClick={doLock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-all duration-150 hover:bg-emerald-100 disabled:opacity-50">
                <Lock size={14} /> Lock
              </button>
            )}
            {run?.status === "LOCKED" && (
              <button onClick={doPay} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-emerald-700 disabled:opacity-50">
                <CircleCheck size={14} /> Mark as Paid
              </button>
            )}
            {run?.status === "LOCKED" && (
              <button onClick={doUnlock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-all duration-150 hover:bg-amber-100 disabled:opacity-50">
                <Unlock size={14} /> Unlock
              </button>
            )}
            {run?.status === "PAID" && (
              <button onClick={doUnlock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-all duration-150 hover:bg-amber-100 disabled:opacity-50">
                <Unlock size={14} /> Undo Paid
              </button>
            )}
            {run && run.payslips.length > 0 && (
              <button onClick={() => exportRowsToCsv(`payroll-${monthKey}`, head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <FileSpreadsheet size={14} /> Export
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {run && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <StatCard label="Total Gross" value={inr(Number(run.totalGross))} accent="cyan" icon={Wallet} />
            <StatCard label="Total Net Payout" value={inr(Number(run.totalNet))} accent="green" icon={CircleCheck} />
            <StatCard label="People" value={run.personCount} accent="blue" icon={Users} />
            <StatCard label="Status" value={run.status} accent={run.status === "LOCKED" ? "green" : run.status === "PAID" ? "cyan" : "amber"} icon={ShieldCheck} />
          </div>
        )}

        {/* Payslips */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : !run ? (
          <PayrollEmpty icon={Wallet} title="No run yet" hint={`Click "Generate Run" to create payslips for ${MONTHS[monthIdx]} ${year}.`} />
        ) : run.payslips.length === 0 ? (
          <PayrollEmpty icon={Users} title="No payslips" hint="No members on payroll have data for this month yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Member</th>
                  <th className="px-4 py-2 text-right font-medium">Payable Days</th>
                  <th className="px-4 py-2 text-right font-medium">Gross</th>
                  <th className="px-4 py-2 text-right font-medium">PF</th>
                  <th className="px-4 py-2 text-right font-medium">ESIC</th>
                  <th className="px-4 py-2 text-right font-medium">PT</th>
                  <th className="px-4 py-2 text-right font-medium">Loan EMI</th>
                  <th className="px-4 py-2 text-right font-medium">Reimb.</th>
                  <th className="px-4 py-2 text-right font-medium">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {run.payslips.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                          {p.memberName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                        <span className="font-medium text-gray-800">{p.memberName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{p.payableDays} / {p.totalDays}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{inr(p.gross)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{Number(p.pf) > 0 ? `−${inr(p.pf)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{Number(p.esic) > 0 ? `−${inr(p.esic)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{Number(p.pt) > 0 ? `−${inr(p.pt)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{Number(p.loanEmi) > 0 ? `−${inr(p.loanEmi)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{Number(p.reimbursements) > 0 ? `+${inr(p.reimbursements)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{inr(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Prior runs history */}
        {runs.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-800">Recent Runs</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {runs.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => { const [y, m] = r.month.split("-").map(Number); setYear(y); setMonthIdx(m - 1); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-cyan-50/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">{r.month}</span>
                    <RunStatusBadge status={r.status} />
                  </div>
                  <div className="text-sm text-gray-600">
                    {r.personCount} people · <span className="font-medium text-gray-900">{inr(Number(r.totalNet))}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

function RunStatusBadge({ status }: { status: "DRAFT" | "LOCKED" | "PAID" }) {
  const cfg = {
    DRAFT: "bg-amber-50 text-amber-700",
    LOCKED: "bg-emerald-50 text-emerald-700",
    PAID: "bg-cyan-50 text-brand-accent",
  } as const;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cfg[status]}`}>{status}</span>;
}
