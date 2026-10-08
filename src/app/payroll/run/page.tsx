"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDiscardGuard } from "@/lib/formDirty";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { usePayrollRuns, usePayrollRun } from "@/lib/usePayrollLive";
import { usePayrollProfiles } from "@/lib/usePayrollSetup";
import {
  ApiError, deleteVariableApi, editPayslip, getPayrollPeople, getReimbursementsApi, getVariablesApi, pendingLeave, payRunMembers,
  setPayslipInputs, unpayRunMember,
} from "@/lib/api";
import type { PaymentModeApi, PayrollProfileResponse, PayslipApi, RunAssumption, UnmarkedDayPolicy, UserResponse, VariableApi } from "@/lib/api";
import { Select } from "@/components/Select";
import { ApprovalPanel } from "@/components/approval/ApprovalBadge";
import { useApprovalStates } from "@/lib/approvals";
import { VariableDialog, PAYMENT_MODES, PaidFromField, usePaidFrom } from "@/components/payroll/PayrollDialogs";
import { payGroupOf, staffStatusOf, PAY_GROUP_ORDER } from "@/lib/payrollGroups";
import { inr } from "@/lib/format";
import { formatDateIST, todayIST } from "@/lib/datetime";
import { exportRowsToCsv, exportRowsToXlsx } from "@/lib/vyaparExport";
import { downloadPayslip, leaveSummary } from "@/lib/payslipExport";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";
import {
  ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, Download, FileSpreadsheet, Lock, Pause, Pencil, Play, Plus,
  RefreshCw, Search, ShieldCheck, Trash2, Undo2, Unlock, Users, Wallet, X,
} from "lucide-react";
import { useOwnRecordLock } from "@/lib/permissions";
import { isBackgroundRefresh, useAutoRefresh } from "@/lib/autoRefresh";

/** Payable days to two places at most — a short day makes 1.3333, which reads better as 1.33. */
const days = (n: number | string) => String(Math.round(Number(n) * 100) / 100);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (v: number | null | undefined) => Number(v ?? 0);

/** Everything a slip takes away from gross (statutory, other, fines, one-offs, advance, loan, income tax). */
const deductionsOf = (p: PayslipApi) =>
  n(p.pf) + n(p.esic) + n(p.pt) + n(p.otherDeductions) + n(p.fineAmount) + n(p.variableDeductions) + n(p.advanceDeduction) + n(p.loanEmi) + n(p.tds);

type SubTab = "summary" | "inputs" | "payment";

/**
 * Monthly Runs — PagarBook's payroll flow on our backend:
 *   Overview (conditions + tiles) → Approvals (pending leave / claims) → Payroll Inputs (LOP
 *   override, hold / stop, one-off earnings & deductions) → Employee Summary → Lock → Payment
 *   (record offline payment per member, undo) → payslips.
 * All salary maths runs in payroll-service; this page only drives it.
 */
export default function PayrollRunPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const monthKey = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

  const { runs, refresh: refreshList, generate, lock, unlock, pay } = usePayrollRuns();
  const { run, loading, error, refresh: refreshRun } = usePayrollRun(monthKey);
  const runIds = useMemo(() => (run ? [run.id] : []), [run]);
  const { states: runApproval, reload: reloadRunApproval } = useApprovalStates("PAYROLL_RUN", runIds);
  const approval = run ? runApproval[run.id] : undefined;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState<PayslipApi | null>(null);
  const [query, setQuery] = useState("");
  const [payType, setPayType] = useState("all");
  const [slipStatus, setSlipStatus] = useState("all");
  const [sub, setSub] = useState<SubTab>("summary");
  const [unmarked, setUnmarked] = useState<UnmarkedDayPolicy>("ABSENT");
  const [cutoff, setCutoff] = useState("");
  const [assumption, setAssumption] = useState<RunAssumption>("PRESENT");
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const { profiles, loading: profilesLoading } = usePayrollProfiles();

  // The run remembers how it was generated; the controls follow it.
  useEffect(() => {
    if (!run) return;
    if (run.unmarkedPolicy) setUnmarked(run.unmarkedPolicy);
    setCutoff(run.cutoffDate ?? "");
    if (run.assumption) setAssumption(run.assumption);
  }, [run]);

  const step = (dir: 1 | -1) => {
    let m = monthIdx + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIdx(m); setYear(y);
  };

  async function wrap(fn: () => Promise<unknown>, msg: string) {
    setBusy(true); setActionError("");
    try { await fn(); await refreshRun(); await refreshList(); await reloadRunApproval(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : msg); }
    finally { setBusy(false); }
  }
  const doGenerate = () => wrap(() => generate(monthKey, unmarked, cutoff || null, cutoff ? assumption : null), "Unable to generate the run.");
  const doLock = () => wrap(() => lock(monthKey), "Unable to lock the run.");
  const doUnlock = () => wrap(() => unlock(monthKey), "Unable to unlock the run.");
  const [payAllOpen, setPayAllOpen] = useState(false);
  const doPay = () => setPayAllOpen(true);

  const slips = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (run?.payslips ?? []).filter((p) => {
      if (q && !p.memberName.toLowerCase().includes(q)) return false;
      if (payType !== "all" && payGroupOf(profiles[p.userId]) !== payType) return false;
      if (slipStatus !== "all" && slipStatusOf(p) !== slipStatus) return false;
      return true;
    });
  }, [run, query, payType, slipStatus, profiles]);
  const grouped = useMemo(() => {
    const map = new Map<string, PayslipApi[]>();
    for (const p of slips) {
      const g = payGroupOf(profiles[p.userId]);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return PAY_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, list: map.get(g)! }));
  }, [slips, profiles]);

  const tiles = useMemo(() => {
    const all = run?.payslips ?? [];
    const sum = (f: (p: PayslipApi) => number, pred: (p: PayslipApi) => boolean = () => true) => all.filter(pred).reduce((a, p) => a + f(p), 0);
    return {
      gross: sum((p) => n(p.gross), (p) => p.holdStatus !== "STOP"),
      deductions: sum(deductionsOf, (p) => p.holdStatus !== "STOP"),
      held: all.filter((p) => p.holdStatus === "HOLD").length,
      heldAmt: sum((p) => n(p.net), (p) => p.holdStatus === "HOLD"),
      stopped: all.filter((p) => p.holdStatus === "STOP").length,
      paid: all.filter((p) => p.payStatus === "PAID").length,
      paidAmt: sum((p) => n(p.paidAmount), (p) => p.payStatus === "PAID"),
      ot: sum((p) => n(p.otAmount)),
      fine: sum((p) => n(p.fineAmount)),
    };
  }, [run]);

  const head = ["Member", "Staff Type", "Payable Days", "LOP", "Earnings", "OT", "Piece work", "One-off +", "PF", "ESIC", "PT", "Fines", "One-off −", "Advance", "Loan EMI", "Reimb.", "Net", "Hold", "Payment"];
  const data = useMemo(() => (run?.payslips ?? []).map((p) => [
    p.memberName, payGroupOf(profiles[p.userId]), `${days(p.payableDays)} / ${p.totalDays}`, n(p.lopOverride ?? p.lopDays),
    n(p.gross), n(p.otAmount), n(p.workAmount), n(p.variableEarnings), n(p.pf), n(p.esic), n(p.pt), n(p.fineAmount),
    n(p.variableDeductions), n(p.advanceDeduction), n(p.loanEmi), n(p.reimbursements), n(p.net), p.holdStatus ?? "", p.payStatus ?? "",
  ]), [run, profiles]);

  const editable = run?.status === "DRAFT";

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Payroll</h2>
            <p className="mt-0.5 text-sm text-gray-500">Attendance + salary + inputs → payslips → payment record.</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <div className="min-w-[110px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-sm font-semibold text-gray-800">{MONTHS[monthIdx]} {year}</div>
            <button onClick={() => step(1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><ChevronRight size={16} /></button>
          </div>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Conditions banner */}
        {run?.status !== "PAID" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-100 bg-cyan-50/50 px-4 py-2.5 text-sm text-gray-700">
            <span>
              {run?.cutoffDate
                ? <>Projecting payroll with actual attendance up to <b>{formatDateIST(run.cutoffDate)}</b>. Remaining days assumed as <b>{(run.assumption ?? "PRESENT").toLowerCase()}</b>.</>
                : <>Unmarked days: <b>{unmarked === "PRESENT" ? "paid" : unmarked === "ABSENT_PAY_OFFS" ? "unpaid, weekly offs paid" : "unpaid"}</b>. Set an attendance cut-off to preview the month before it ends.</>}
            </span>
            {editable || !run ? (
              <button onClick={() => setConditionsOpen(true)} className="rounded-lg border border-brand-accent px-3 py-1 text-xs font-semibold text-brand-accent hover:bg-white">
                {run?.cutoffDate ? "Edit Payroll Conditions" : "Set Up"}
              </button>
            ) : null}
          </div>
        )}
        {run?.status === "DRAFT" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <RefreshCw size={15} className="mt-0.5 shrink-0" />
            <span>This is a <strong>draft</strong>. After any attendance, leave, loan, payment or input change, click <strong>Regenerate</strong> before locking.</span>
          </div>
        )}
        {run?.status === "PAID" && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <CircleCheck size={15} className="mt-0.5 shrink-0" />
            <span>
              Salaries for {MONTHS[monthIdx]} {year} are recorded as <strong>paid</strong>{run.paidByName ? ` by ${run.paidByName}` : ""}{run.paidAt ? ` on ${formatDateIST(run.paidAt)}` : ""}.
              A record only — the system never moves money.
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
              {run ? `${run.personCount} staff · net ${inr(Number(run.totalNet))}${run.lockedByName ? ` · locked by ${run.lockedByName}` : ""}` : "No payroll generated for this month yet."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {run?.status !== "PAID" && (
              <button onClick={doGenerate} disabled={busy || run?.status === "LOCKED"} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                <Play size={14} /> {busy ? "Working…" : run ? "Regenerate" : "Process Payroll"}
              </button>
            )}
            {run?.status === "DRAFT" && (
              <button onClick={doLock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                <Lock size={14} /> Lock
              </button>
            )}
            {run?.status === "LOCKED" && (
              <>
                <button onClick={doPay} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <CircleCheck size={14} /> Mark all paid
                </button>
                <button onClick={doUnlock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                  <Unlock size={14} /> Unprocess
                </button>
              </>
            )}
            {run?.status === "PAID" && (
              <button onClick={doUnlock} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                <Unlock size={14} /> Undo Paid
              </button>
            )}
            {run && run.payslips.length > 0 && (
              <>
                <button onClick={() => exportRowsToXlsx(`payroll-${monthKey}`, head, data, [], { title: `Payroll — ${MONTHS[monthIdx]} ${year}` })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button onClick={() => exportRowsToCsv(`payroll-${monthKey}`, head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  CSV
                </button>
              </>
            )}
          </div>
        </div>

        {run && approval && approval.status !== "CANCELLED" && (
          <ApprovalPanel
            entityType="PAYROLL_RUN"
            entityId={run.id}
            state={approval}
            onChanged={() => { void reloadRunApproval(); refreshRun(); }}
            rejectHint="Rejecting sends the run back to draft so it can be corrected and regenerated."
          />
        )}

        <PendingApprovals monthKey={monthKey} />

        {run && run.status === "DRAFT" && !profilesLoading && <MissingFromRun slips={run.payslips} profiles={profiles} />}

        {run && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
            <StatCard label="Net Payout" value={inr(Number(run.totalNet))} accent="green" icon={Wallet} />
            <StatCard label="Gross Pay" value={inr(tiles.gross)} accent="cyan" />
            <StatCard label="Deductions" value={inr(tiles.deductions)} accent="rose" />
            <StatCard label="Active Staff" value={run.personCount} accent="blue" icon={Users} />
            <StatCard label="Hold" value={tiles.held} hint={tiles.held ? inr(tiles.heldAmt) : undefined} accent="amber" icon={Pause} />
            <StatCard label="Stop" value={tiles.stopped} accent="rose" />
            <StatCard label="Overtime / Fines" value={`${inr(tiles.ot)} / ${inr(tiles.fine)}`} />
            <StatCard label="Payment Processed" value={tiles.paid} hint={tiles.paid ? inr(tiles.paidAmt) : undefined} accent="green" icon={ShieldCheck} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : !run ? (
          <PayrollEmpty icon={Wallet} title="No payroll yet" hint={`Click "Process Payroll" to create payslips for ${MONTHS[monthIdx]} ${year}.`} />
        ) : run.payslips.length === 0 ? (
          <PayrollEmpty icon={Users} title="No payslips" hint="No active staff on payroll." />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                {([["summary", "Employee Summary"], ["inputs", "Payroll Inputs"], ["payment", "Payment"]] as [SubTab, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setSub(k)} className={`px-3.5 py-2 text-sm font-medium transition-colors ${sub === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{label}</button>
                ))}
              </div>
              <div className="w-44"><Select value={payType} onChange={setPayType} options={[{ value: "all", label: "All salary types" }, ...PAY_GROUP_ORDER.map((g) => ({ value: g, label: g }))]} /></div>
              <div className="w-40"><Select value={slipStatus} onChange={setSlipStatus} options={SLIP_STATUS_OPTIONS} /></div>
              {(payType !== "all" || slipStatus !== "all") && (
                <button onClick={() => { setPayType("all"); setSlipStatus("all"); }} className="text-xs font-medium text-gray-500 hover:text-gray-800">Clear</button>
              )}
              <div className="relative ml-auto w-full max-w-xs">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff…" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm outline-none focus:border-brand-accent" />
                {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
              </div>
            </div>

            {sub === "summary" && (
              <SummaryTable grouped={grouped} editable={editable} onEdit={setEditing} profiles={profiles} />
            )}
            {sub === "inputs" && (
              <InputsPanel monthKey={monthKey} slips={slips} editable={editable} status={run.status} onChanged={async () => { await refreshRun(); await refreshList(); }} />
            )}
            {sub === "payment" && (
              <PaymentPanel monthKey={monthKey} slips={slips} status={run.status} profiles={profiles} onChanged={async () => { await refreshRun(); await refreshList(); }} />
            )}
          </div>
        )}

        {runs.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-2"><h3 className="text-sm font-semibold text-gray-800">Recent Runs</h3></div>
            <div className="divide-y divide-gray-50">
              {runs.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => { const [y, m] = r.month.split("-").map(Number); setYear(y); setMonthIdx(m - 1); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-cyan-50/40"
                >
                  <div className="flex items-center gap-3"><span className="text-sm font-medium text-gray-800">{r.month}</span><RunStatusBadge status={r.status} /></div>
                  <div className="text-sm text-gray-600">{r.personCount} staff · <span className="font-medium text-gray-900">{inr(Number(r.totalNet))}</span></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {payAllOpen && run && (
        <PayDialog
          title="Mark all salaries paid"
          details={false}
          count={run.payslips.filter((p) => !p.holdStatus && p.payStatus !== "PAID").length}
          total={run.payslips.filter((p) => !p.holdStatus && p.payStatus !== "PAID").reduce((a, p) => a + n(p.net) - n(p.paidAmount), 0)}
          onClose={() => setPayAllOpen(false)}
          onConfirm={async (_mode, _date, _note, bankAccountId) => {
            setPayAllOpen(false);
            await wrap(() => pay(monthKey, bankAccountId), "Unable to mark the run paid.");
          }}
        />
      )}
      {conditionsOpen && (
        <ConditionsDialog
          monthKey={monthKey}
          unmarked={unmarked}
          cutoff={cutoff}
          assumption={assumption}
          onClose={() => setConditionsOpen(false)}
          onConfirm={async (u, c, a) => {
            setUnmarked(u); setCutoff(c); setAssumption(a); setConditionsOpen(false);
            await wrap(() => generate(monthKey, u, c || null, c ? a : null), "Unable to generate the run.");
          }}
        />
      )}
      {editing && (
        <EditPayslipModal slip={editing} month={monthKey} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refreshRun(); refreshList(); }} />
      )}
    </PayrollShell>
  );
}

/**
 * Active on-payroll staff with no payslip in this run, so nobody silently drops out of payroll:
 * either their payroll profile was never set up (the run only covers people with one), or they were
 * set up after the draft was generated and a Regenerate picks them up.
 */
function MissingFromRun({ slips, profiles }: { slips: PayslipApi[]; profiles: Record<number, PayrollProfileResponse> }) {
  const [people, setPeople] = useState<UserResponse[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPayrollPeople().then((r) => { if (!cancelled) setPeople(r.content.filter((u) => u.onPayroll)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const inRun = useMemo(() => new Set(slips.map((s) => s.userId)), [slips]);
  if (!people) return null;
  const missing = people.filter((u) => !inRun.has(u.id) && staffStatusOf(profiles[u.id]) === "ACTIVE");
  if (missing.length === 0) return null;
  const notSetUp = missing.filter((u) => !profiles[u.id]);
  const late = missing.filter((u) => profiles[u.id]);
  return (
    <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-center gap-2 font-medium">
        <Users size={15} className="text-amber-700" /> {missing.length} staff on payroll {missing.length === 1 ? "is" : "are"} not in this run
      </div>
      {notSetUp.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span>No payroll profile yet:</span>
          {notSetUp.map((u) => (
            <Link key={u.id} href={`/payroll/staff/${u.id}/edit`} className="rounded-md bg-white px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200 hover:underline">
              {u.fullName} · Set up
            </Link>
          ))}
        </div>
      )}
      {late.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span>Set up after this draft was generated — click <b>Regenerate</b> to include:</span>
          {late.map((u) => (
            <Link key={u.id} href={`/payroll/staff/${u.id}`} className="rounded-md bg-white px-2 py-0.5 text-amber-800 ring-1 ring-amber-200 hover:underline">{u.fullName}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pending approvals that should be cleared before payroll: leave requests and expense claims. */
function PendingApprovals({ monthKey }: { monthKey: string }) {
  const [counts, setCounts] = useState<{ leave: number; claims: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([pendingLeave().catch(() => []), getReimbursementsApi().catch(() => [])]).then(([l, r]) => {
      if (!cancelled) setCounts({ leave: l.length, claims: r.filter((x) => x.status === "PENDING").length });
    });
    return () => { cancelled = true; };
  }, [monthKey]);
  if (!counts || (counts.leave === 0 && counts.claims === 0)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm">
      <ClipboardCheck size={16} className="text-amber-700" />
      <span className="font-medium text-amber-800">Pending approvals before payroll:</span>
      {counts.leave > 0 && <Link href="/payroll/leave" className="rounded-md bg-white px-2 py-0.5 text-amber-800 ring-1 ring-amber-200 hover:underline">{counts.leave} leave</Link>}
      {counts.claims > 0 && <Link href="/payroll/reimbursements" className="rounded-md bg-white px-2 py-0.5 text-amber-800 ring-1 ring-amber-200 hover:underline">{counts.claims} expense claims</Link>}
    </div>
  );
}

const SLIP_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Ready", label: "Ready" },
  { value: "Salary held", label: "Salary held" },
  { value: "Salary stopped", label: "Salary stopped" },
  { value: "Paid", label: "Paid" },
];
function slipStatusOf(p: PayslipApi) {
  if (p.payStatus === "PAID") return "Paid";
  if (p.holdStatus === "HOLD") return "Salary held";
  if (p.holdStatus === "STOP") return "Salary stopped";
  return "Ready";
}
/** Leave taken and claims reimbursed — the two things a payslip pays for that aren't in its columns. */
function SlipExtras({ p }: { p: PayslipApi }) {
  const leave = leaveSummary(p);
  if (!leave && !p.claimDetail) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {leave && <span title={leave} className="max-w-[260px] truncate rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">Leave: {leave}</span>}
      {p.claimDetail && (
        <span title={p.claimDetail} className="max-w-[260px] truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
          Claims +{inr(n(p.reimbursements))}: {p.claimDetail}
        </span>
      )}
    </div>
  );
}

const adjustmentOf = (p: PayslipApi) => n(p.reimbursements) - n(p.variableDeductions);
/** Deductions without income tax — the summary shows tax in its own column. */
const deductionsExTax = (p: PayslipApi) => deductionsOf(p) - n(p.tds);

const SUMMARY_SORT = {
  name: (p: PayslipApi) => p.memberName,
  days: (p: PayslipApi) => n(p.payableDays),
  earnings: (p: PayslipApi) => n(p.gross),
  deductions: (p: PayslipApi) => deductionsExTax(p),
  adjustments: (p: PayslipApi) => adjustmentOf(p),
  tax: (p: PayslipApi) => n(p.tds),
  net: (p: PayslipApi) => n(p.net),
  status: (p: PayslipApi) => slipStatusOf(p),
  hours: (p: PayslipApi) => n(p.workedHours),
  hourAmount: (p: PayslipApi) => n(p.hourBasedAmount),
};

const HOUR_VIEW_KEY = "hitech.payroll.hourView.v1";

function SummaryTable({ grouped, editable, onEdit, profiles }: {
  grouped: { group: string; list: PayslipApi[] }[];
  editable: boolean;
  onEdit: (p: PayslipApi) => void;
  profiles: Record<number, import("@/lib/api").PayrollProfileResponse>;
}) {
  // Sort inside each pay-type group, so the grouping PagarBook shows survives a column sort.
  const flat = useMemo(() => grouped.flatMap((g) => g.list), [grouped]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(flat, SUMMARY_SORT);
  const order = useMemo(() => new Map(sorted.map((p, i) => [p.id, i])), [sorted]);
  const groups = useMemo(
    () => grouped.map((g) => ({ ...g, list: [...g.list].sort((a, b) => order.get(a.id)! - order.get(b.id)!) })),
    [grouped, order],
  );
  const th = (label: string, key: keyof typeof SUMMARY_SORT, align: "left" | "right" = "right") => (
    <SortTh label={label} sortKey={key} activeKey={sortKey} dir={sortDir} onSort={toggle} align={align} className={align === "right" ? "px-3" : ""} />
  );
  const total = (f: (p: PayslipApi) => number) => flat.filter((p) => p.holdStatus !== "STOP").reduce((a, p) => a + f(p), 0);
  // Hour-based view: extra columns beside the real salary, for comparison only — nothing paid
  // changes. Remembered per browser.
  const [hourView, setHourView] = useState(false);
  useEffect(() => {
    try { setHourView(localStorage.getItem(HOUR_VIEW_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggleHourView = (on: boolean) => {
    setHourView(on);
    try { localStorage.setItem(HOUR_VIEW_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  };
  const hrs = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })} h`);
  return (
    <div>
    <div className="mb-2 flex items-center justify-end gap-2 text-xs text-gray-600">
      <label className="flex cursor-pointer items-center gap-1.5" title="Adds Hours worked, Hourly rate and Hour-based amount beside the real salary. For comparison only — salaries are still paid as calculated.">
        <input type="checkbox" checked={hourView} onChange={(e) => toggleHourView(e.target.checked)} />
        Show hour-based salary
      </label>
    </div>
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className={`w-full ${hourView ? "min-w-[1400px]" : "min-w-[1060px]"} border-collapse text-sm`}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            {th("Name", "name", "left")}
            {th("Net Payable Days", "days")}
            {th("Earnings", "earnings")}
            {th("Deductions", "deductions")}
            {th("Adjustments", "adjustments")}
            {th("Income Tax", "tax")}
            {th("Net Salary", "net")}
            {hourView && th("Hours Worked", "hours")}
            {hourView && <th className="px-3 py-2 text-right text-xs font-medium">Hourly Rate</th>}
            {hourView && th("Hour-based Amount", "hourAmount")}
            {th("Status", "status", "left")}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, list }) => [
            <tr key={`g-${group}`} className="bg-gray-50/70"><td colSpan={hourView ? 12 : 9} className="px-4 py-1.5 text-xs font-semibold text-gray-600">{group} <span className="ml-1 text-gray-400">{list.length}</span></td></tr>,
            ...list.map((p) => {
              const adj = n(p.reimbursements) - n(p.variableDeductions);
              return (
                <tr key={p.id} className={`border-b border-gray-50 last:border-b-0 ${p.holdStatus === "STOP" ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/payroll/staff/${p.userId}#salary`} className="font-medium text-gray-800 hover:text-brand-accent hover:underline">{p.memberName}</Link>
                    {(n(p.otAmount) > 0 || n(p.workAmount) > 0 || n(p.variableEarnings) > 0) && (
                      <div className="text-[11px] text-gray-400">
                        {n(p.otAmount) > 0 && `OT ${inr(n(p.otAmount))} `}{n(p.workAmount) > 0 && `· work ${inr(n(p.workAmount))} `}{n(p.variableEarnings) > 0 && `· one-off ${inr(n(p.variableEarnings))}`}
                      </div>
                    )}
                    <SlipExtras p={p} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{days(p.payableDays)} Days{p.lopOverride != null && <span title={p.lopReason ?? "LOP overridden"} className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700">edited</span>}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{inr(p.gross)}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600" title={`PF ${inr(p.pf)} · ESIC ${inr(p.esic)} · PT ${inr(p.pt)} · fines ${inr(n(p.fineAmount))} · advance ${inr(n(p.advanceDeduction))} · loan ${inr(p.loanEmi)}`}>
                    {deductionsExTax(p) > 0 ? `−${inr(deductionsExTax(p))}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{adj === 0 ? "—" : adj > 0 ? `+${inr(adj)}` : `−${inr(-adj)}`}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{n(p.tds) ? `−${inr(n(p.tds))}` : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{inr(p.net)}</td>
                  {hourView && <td className="bg-cyan-50/40 px-3 py-2.5 text-right text-gray-700">{hrs(p.workedHours)}</td>}
                  {hourView && (
                    <td className="bg-cyan-50/40 px-3 py-2.5 text-right text-gray-500" title={p.hourBasis ?? undefined}>
                      {p.hourRate == null ? "—" : `${inr(n(p.hourRate))}/h`}
                    </td>
                  )}
                  {hourView && (
                    <td
                      className="bg-cyan-50/40 px-3 py-2.5 text-right font-medium text-brand-accent"
                      title={p.hourBasedAmount == null ? "Not applicable (piece rate or no salary set)" : `${hrs(p.workedHours)} × ${inr(n(p.hourRate))}/h · ${p.hourBasis ?? ""}`}
                    >
                      {p.hourBasedAmount == null ? "—" : inr(n(p.hourBasedAmount))}
                    </td>
                  )}
                  <td className="px-3 py-2.5"><SlipStatus p={p} /></td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {editable && (
                        <button onClick={() => onEdit(p)} title="Edit payslip" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={14} /></button>
                      )}
                      <button onClick={() => downloadPayslip(p, p.memberName, { profile: profiles[p.userId] })} title="Download payslip" className="rounded-md p-1.5 text-gray-400 hover:bg-cyan-50 hover:text-brand-accent"><Download size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            }),
          ])}
        </tbody>
        {flat.length > 1 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800">
              <td className="px-4 py-2">{flat.length} staff</td>
              <td />
              <td className="px-3 py-2 text-right">{inr(total((p) => n(p.gross)))}</td>
              <td className="px-3 py-2 text-right text-rose-600">−{inr(total(deductionsExTax))}</td>
              <td className="px-3 py-2 text-right">{inr(total(adjustmentOf))}</td>
              <td className="px-3 py-2 text-right">{inr(total((p) => n(p.tds)))}</td>
              <td className="px-3 py-2 text-right">{inr(total((p) => n(p.net)))}</td>
              {hourView && <td className="px-3 py-2 text-right">{hrs(total((p) => n(p.workedHours)))}</td>}
              {hourView && <td />}
              {hourView && <td className="px-3 py-2 text-right text-brand-accent">{inr(total((p) => n(p.hourBasedAmount)))}</td>}
              <td colSpan={2} className="px-3 py-2 text-xs font-normal text-gray-500">Stopped salaries excluded</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </div>
  );
}

function SlipStatus({ p }: { p: PayslipApi }) {
  if (p.payStatus === "PAID") return <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Paid</span>;
  if (p.holdStatus === "HOLD") return <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700" title={p.holdReason ?? ""}>Salary held</span>;
  if (p.holdStatus === "STOP") return <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700" title={p.holdReason ?? ""}>Salary stopped</span>;
  return <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Ready</span>;
}

const INPUT_SORT = {
  name: (p: PayslipApi) => p.memberName,
  days: (p: PayslipApi) => n(p.payableDays),
  lop: (p: PayslipApi) => n(p.lopOverride ?? p.lopDays),
  ot: (p: PayslipApi) => n(p.otAmount),
  fine: (p: PayslipApi) => n(p.fineAmount),
  hold: (p: PayslipApi) => p.holdStatus ?? "",
};
const PAYMENT_SORT = {
  name: (p: PayslipApi) => p.memberName,
  net: (p: PayslipApi) => n(p.net),
  status: (p: PayslipApi) => slipStatusOf(p),
  paidAt: (p: PayslipApi) => p.paidAt ?? "",
};

/** Payroll Inputs: LOP override, hold / stop, and the month's one-off earnings & deductions. */
function InputsPanel({ monthKey, slips, editable, status, onChanged }: {
  monthKey: string; slips: PayslipApi[]; editable: boolean; status: string; onChanged: () => Promise<void>;
}) {
  const [vars, setVars] = useState<VariableApi[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [lop, setLop] = useState<Record<number, string>>({});
  const { sorted: inputRows, sortKey, sortDir, toggle } = useTableSort(slips, INPUT_SORT);
  const ownLock = useOwnRecordLock();
  const loadVars = useCallback(async () => {
    try { setVars(await getVariablesApi({ month: monthKey })); } catch { setVars([]); }
  }, [monthKey]);
  useAutoRefresh(loadVars);
  useEffect(() => { loadVars(); }, [loadVars]);

  async function input(userId: number, body: Parameters<typeof setPayslipInputs>[2]) {
    setError("");
    try { await setPayslipInputs(monthKey, userId, body); await onChanged(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save the input."); }
  }
  async function removeVar(id: number) {
    try { await deleteVariableApi(id); await loadVars(); setError("Removed — click Regenerate to apply it to the payslips."); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{error}</div>}
      {!editable && <p className="text-xs text-gray-500">The run is {status}. LOP days can only change on a draft; holds can still be released.</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">Attendance & LOP · Salary Hold / Stop</div>
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
            <SortTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} />
            <SortTh label="Gross Payable Days" sortKey="days" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
            <SortTh label="LOP Days" sortKey="lop" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
            <th className="px-3 py-2">Override LOP</th>
            <SortTh label="Overtime" sortKey="ot" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
            <SortTh label="Fine" sortKey="fine" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
            <SortTh label="Hold / Stop" sortKey="hold" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
          </tr></thead>
          <tbody>
            {inputRows.map((p) => (
              <tr key={p.id} className="border-t border-gray-50">
                <td className="px-4 py-2">{p.memberName}</td>
                <td className="px-3 py-2 text-right">{days(p.payableDays)}</td>
                <td className="px-3 py-2 text-right">{days(n(p.lopDays))}{p.lopOverride != null && <span className="ml-1 text-xs text-amber-700">→ {days(n(p.lopOverride))}</span>}</td>
                <td className="px-3 py-2">
                  {editable && !ownLock(p.userId) ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} step={0.5} value={lop[p.userId] ?? (p.lopOverride != null ? String(p.lopOverride) : "")} onChange={(e) => setLop((l) => ({ ...l, [p.userId]: e.target.value }))} placeholder="days" className="input w-20 py-1 text-right" />
                      <button
                        onClick={() => { const v = lop[p.userId]; if (v !== undefined && v !== "") input(p.userId, { lopOverride: Number(v), lopReason: "Edited in payroll inputs" }); }}
                        className="rounded-md bg-brand-accent px-2 py-1 text-xs font-semibold text-white"
                      >Set</button>
                      {p.lopOverride != null && <button onClick={() => { setLop((l) => ({ ...l, [p.userId]: "" })); input(p.userId, { clearLopOverride: true }); }} className="text-xs text-gray-500 hover:text-gray-800">Reset</button>}
                    </div>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">{n(p.otAmount) ? inr(n(p.otAmount)) : "—"}</td>
                <td className="px-3 py-2 text-right text-rose-600">{n(p.fineAmount) ? inr(n(p.fineAmount)) : "—"}</td>
                <td className="px-3 py-2">
                  {p.payStatus === "PAID" ? <span className="text-xs text-gray-400">Paid</span> : ownLock(p.userId) ? <span className="text-xs text-gray-400" title="Your own payroll inputs are set by another HR / admin user.">Yours</span> : (
                    <Select
                      size="sm"
                      value={p.holdStatus ?? "NONE"}
                      onChange={(v) => {
                        const reason = v === "NONE" ? undefined : prompt(v === "HOLD" ? "Reason for holding this salary?" : "Reason for stopping this salary?") ?? undefined;
                        input(p.userId, { holdStatus: v as "HOLD" | "STOP" | "NONE", holdReason: reason });
                      }}
                      options={[{ value: "NONE", label: "Normal" }, { value: "HOLD", label: "Hold salary" }, { value: "STOP", label: "Stop salary" }]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <span className="text-sm font-semibold text-gray-800">Variable Components (one-off earnings & deductions)</span>
          {editable && <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white"><Plus size={13} /> Add</button>}
        </div>
        {vars === null ? <div className="p-4 text-sm text-gray-400">Loading…</div> : vars.length === 0 ? <div className="p-4 text-sm text-gray-400">No one-off earnings or deductions this month.</div> : (
          <table className="w-full text-sm">
            <tbody>
              {vars.map((v) => (
                <tr key={v.id} className="border-t border-gray-50 first:border-t-0">
                  <td className="px-4 py-2">{v.memberName}</td>
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDateIST(v.entryDate)}{v.description ? ` · ${v.description}` : ""}</td>
                  <td className={`px-3 py-2 text-right font-medium ${v.kind === "EARNING" ? "text-emerald-700" : "text-rose-600"}`}>{v.kind === "EARNING" ? "+" : "−"}{inr(v.amount)}</td>
                  <td className="px-2 py-2">{editable && <button onClick={() => removeVar(v.id)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && (
        <VariableDialog
          members={slips.map((p) => ({ id: p.userId, name: p.memberName }))}
          onClose={() => setAdding(false)}
          onSaved={async () => { await loadVars(); setError("Added — click Regenerate to apply it to the payslips."); }}
        />
      )}
    </div>
  );
}

/** Payment: record offline payment per member once the run is locked; undo a payment. */
function PaymentPanel({ monthKey, slips, status, profiles, onChanged }: {
  monthKey: string; slips: PayslipApi[]; status: string;
  profiles: Record<number, import("@/lib/api").PayrollProfileResponse>; onChanged: () => Promise<void>;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [paying, setPaying] = useState(false);
  const { sorted: payRows, sortKey, sortDir, toggle: sortBy } = useTableSort(slips, PAYMENT_SORT);
  const ownLock = useOwnRecordLock();
  const [error, setError] = useState("");
  if (status === "DRAFT") {
    return <PayrollEmpty icon={Lock} title="No locked employees" hint="Go to Employee Summary, check the figures and Lock the run first." />;
  }
  // Your own salary is recorded as paid by someone else (the server refuses it too).
  const payable = slips.filter((p) => p.payStatus !== "PAID" && !p.holdStatus && !ownLock(p.userId));
  const toggle = (id: number) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  async function undo(p: PayslipApi) {
    if (!confirm(`Undo the recorded payment for ${p.memberName}?`)) return;
    try { await unpayRunMember(monthKey, p.userId); await onChanged(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to undo."); }
  }
  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPaying(true)}
          disabled={sel.size === 0}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CircleCheck size={14} /> Pay Offline (record) {sel.size ? `· ${sel.size}` : ""}
        </button>
        <button onClick={() => slips.filter((p) => p.payStatus === "PAID").forEach((p) => downloadPayslip(p, p.memberName, { profile: profiles[p.userId] }))} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <Download size={14} /> Payslips of paid staff
        </button>
        <span className="text-xs text-gray-400">Online payout is not available — Hi-Tech pays by bank / cash and records it here.</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="w-10 px-3 py-2"><input type="checkbox" checked={payable.length > 0 && payable.every((p) => sel.has(p.userId))} onChange={() => setSel(payable.every((p) => sel.has(p.userId)) ? new Set() : new Set(payable.map((p) => p.userId)))} /></th>
            <SortTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" />
            <SortTh label="Net Pay" sortKey="net" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
            <SortTh label="Payment Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" />
            <SortTh label="Paid On" sortKey="paidAt" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><th />
          </tr></thead>
          <tbody>
            {payRows.map((p) => {
              const canPay = p.payStatus !== "PAID" && !p.holdStatus && !ownLock(p.userId);
              return (
                <tr key={p.id} className="border-t border-gray-50">
                  <td className="px-3 py-2">{canPay && <input type="checkbox" checked={sel.has(p.userId)} onChange={() => toggle(p.userId)} />}</td>
                  <td className="px-3 py-2">{p.memberName}</td>
                  <td className="px-3 py-2 text-right font-medium">{inr(p.net)}</td>
                  <td className="px-3 py-2"><SlipStatus p={p} />{p.payStatus !== "PAID" && !p.holdStatus && <span className="ml-1 text-xs text-gray-500">Yet to pay</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.paidAt ? formatDateIST(p.paidAt) : "—"}</td>
                  <td className="px-2 py-2 text-right">
                    {p.payStatus === "PAID" && <button onClick={() => undo(p)} title="Undo payment" className="rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-700"><Undo2 size={14} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paying && (
        <PayDialog
          count={sel.size}
          total={slips.filter((p) => sel.has(p.userId)).reduce((a, p) => a + n(p.net) - n(p.paidAmount), 0)}
          onClose={() => setPaying(false)}
          onConfirm={async (mode, date, note, bankAccountId) => {
            await payRunMembers(monthKey, { userIds: [...sel], mode, date, note, bankAccountId });
            setSel(new Set());
            setPaying(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PayDialog({ count, total, onClose, onConfirm, title = "Record salary payment", details = true }: {
  count: number; total: number; onClose: () => void;
  onConfirm: (mode: PaymentModeApi, date: string, note: string, bankAccountId: number | null) => Promise<void>;
  title?: string;
  /** Mode / date / note — "Mark all paid" records today's date and needs only the account. */
  details?: boolean;
}) {
  const [mode, setMode] = useState<PaymentModeApi>("BANK");
  const [date, setDate] = useState(todayIST());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paidFrom = usePaidFrom();
  const pickAccount = (v: string) => {
    paidFrom.setAccount(v);
    if (v === "Cash") setMode("CASH");
    else if (mode === "CASH") setMode("BANK");
  };
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-500">{count} staff · {inr(total)}</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <PaidFromField value={paidFrom.account} onChange={pickAccount} options={paidFrom.options} />
        {details && (
          <>
            <label className="block text-xs text-gray-500">Mode<Select value={mode} onChange={(v) => setMode(v as PaymentModeApi)} options={PAYMENT_MODES} /></label>
            <label className="block text-xs text-gray-500">Record Entry Date<DatePicker value={date} onChange={setDate} /></label>
            <label className="block text-xs text-gray-500">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UTR / cheque no." className="input mt-1 w-full" /></label>
          </>
        )}
        <p className="text-[11px] text-gray-400">
          {details ? "This records the payment and settles the payslips." : "Records every remaining salary this month as paid, dated today. Held salaries stay unpaid."} No money is transferred.
        </p>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true); setError("");
            try { await onConfirm(mode, date, note, paidFrom.bankAccountId); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to record."); setBusy(false); }
          }}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy && <Spinner size={14} />} Confirm
        </button>
      </div>
    </Modal>
  );
}

/** PagarBook's "Set Up Payroll Conditions": unmarked-day policy + attendance cut-off + assumption. */
function ConditionsDialog({ monthKey, unmarked, cutoff, assumption, onClose, onConfirm }: {
  monthKey: string; unmarked: UnmarkedDayPolicy; cutoff: string; assumption: RunAssumption;
  onClose: () => void; onConfirm: (u: UnmarkedDayPolicy, c: string, a: RunAssumption) => void;
}) {
  const [u, setU] = useState(unmarked);
  const [c, setC] = useState(cutoff || (todayIST().startsWith(monthKey) ? todayIST() : ""));
  const [a, setA] = useState(assumption);
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">Set Up Payroll Conditions</h3>
        <p className="text-xs text-gray-500">Attendance is actual up to the cut-off date; remaining days follow your assumption.</p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <label className="block text-xs text-gray-500">Unmarked days (up to the cut-off)
          <Select value={u} onChange={(v) => setU(v as UnmarkedDayPolicy)} options={[
            { value: "ABSENT", label: "Count as unpaid" },
            { value: "ABSENT_PAY_OFFS", label: "Unpaid, but pay weekly offs & holidays" },
            { value: "PRESENT", label: "Count as paid" },
          ]} />
        </label>
        <label className="block text-xs text-gray-500">Attendance Cut-off Date (optional)
          <DatePicker value={c} onChange={setC} min={`${monthKey}-01`} max={`${monthKey}-${String(last - 1).padStart(2, "0")}`} placeholder="Whole month" />
        </label>
        {c && (
          <div className="space-y-2">
            <span className="block text-xs text-gray-500">How should pending days be handled?</span>
            {([
              ["PRESENT", "Mark as Present", "Remaining days are counted as present. Best for salaried employees — the highest projected salary."],
              ["ABSENT", "Mark as Absent", "Remaining days are counted as absent. Best for no-work-no-pay staff — the lowest projected salary."],
              ["EXTRAPOLATE", "Extrapolate", "Remaining days follow each employee's own attendance so far this month."],
            ] as [RunAssumption, string, string][]).map(([k, title, hint]) => (
              <button key={k} onClick={() => setA(k)} className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${a === k ? "border-brand-accent bg-cyan-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <span className="block text-sm font-medium text-gray-800">{title}</span>
                <span className="block text-[11px] text-gray-500">{hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={() => onConfirm(u, c, a)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Confirm & Generate</button>
      </div>
    </Modal>
  );
}

/** Adjust a DRAFT payslip's gross and custom deductions; net recomputes on the backend. */
function EditPayslipModal({ slip, month, onClose, onSaved }: { slip: PayslipApi; month: string; onClose: () => void; onSaved: () => void }) {
  const [gross, setGross] = useState(slip.gross);
  const [otherDeductions, setOtherDeductions] = useState(slip.otherDeductions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const net = Math.max(0, Number(gross) - deductionsOf({ ...slip, otherDeductions: Number(otherDeductions) }) + n(slip.reimbursements));

  async function save() {
    setSaving(true); setError("");
    try {
      await editPayslip(month, slip.userId, { gross: Number(gross) || 0, otherDeductions: Number(otherDeductions) || 0 });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save this payslip.");
      setSaving(false);
    }
  }
  const { panelRef, confirmDiscard } = useDiscardGuard();
  const dismiss = () => confirmDiscard() && onClose();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={dismiss}>
      <div ref={panelRef} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Edit payslip — {slip.memberName}</h3>
          <button onClick={dismiss} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Gross (total earnings)</span>
            <input type="number" value={gross} onChange={(e) => setGross(Number(e.target.value))} className="input w-full" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Other Deductions</span>
            <input type="number" value={otherDeductions} onChange={(e) => setOtherDeductions(Number(e.target.value))} className="input w-full" /></label>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="text-gray-500">Net Pay (auto)</span><span className="font-semibold text-gray-900">{inr(net)}</span></div>
          <p className="text-[11px] text-gray-400">PF, ESIC, PT, fines, advances, loan EMI and reimbursements come from the run; a Regenerate replaces manual edits.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: "DRAFT" | "LOCKED" | "PAID" }) {
  const cfg = { DRAFT: "bg-amber-50 text-amber-700", LOCKED: "bg-emerald-50 text-emerald-700", PAID: "bg-cyan-50 text-brand-accent" } as const;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cfg[status]}`}>{status}</span>;
}
