"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { ApiError, addPaymentApi, cancelStaffExit, exitStaff, getMemberPayslips, getSettlement } from "@/lib/api";
import type { PayrollProfileResponse, SettlementApi } from "@/lib/api";
import { todayIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { downloadPaymentVoucher } from "@/lib/payslipExport";

const REASONS = ["Resigned", "Terminated", "Retired", "Contract ended", "Absconding", "Other"];

/**
 * Staff exit and full-and-final settlement (PagarBook's "Initiate Exit"). The server works out
 * leave encashment, gratuity and loans still owed; unpaid salary comes from the member's payslips;
 * everything is editable before the exit is confirmed. Confirming deactivates the member and,
 * optionally, records the settlement as an FNF payment with a printable statement.
 */
export function ExitDialog({
  userId, name, profile, onClose, onDone,
}: {
  userId: number; name: string; profile: PayrollProfileResponse | undefined; onClose: () => void; onDone: (msg: string) => void;
}) {
  const exited = profile?.details?.exitDate ?? null;
  const [exitDate, setExitDate] = useState(exited ?? todayIST());
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState(profile?.details?.exitReason ?? "");
  const [s, setS] = useState<SettlementApi | null>(null);
  const [salary, setSalary] = useState(0);
  const [dueMonths, setDueMonths] = useState<string[]>([]);
  const [encash, setEncash] = useState(0);
  const [gratuity, setGratuity] = useState(0);
  const [otherEarn, setOtherEarn] = useState(0);
  const [loans, setLoans] = useState(0);
  const [notice, setNotice] = useState(0);
  const [otherDed, setOtherDed] = useState(0);
  const [record, setRecord] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMemberPayslips(userId)
      .then((slips) => {
        if (cancelled) return;
        const open = slips.filter((p) => p.payStatus !== "PAID" && p.holdStatus !== "STOP" && Number(p.net) > 0);
        setSalary(Math.round(open.reduce((a, p) => a + Number(p.net), 0)));
        setDueMonths(open.map((p) => p.month ?? "").filter(Boolean).sort());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    getSettlement(userId, exitDate)
      .then((r) => {
        if (cancelled) return;
        setS(r);
        setEncash(r.encashAmount);
        setGratuity(r.gratuity);
        setLoans(r.loanOutstanding);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to work out the settlement."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, exitDate]);

  const earnings: [string, number][] = [
    ["Unpaid salary", salary],
    [`Leave encashment${s ? ` (${s.encashDays} day${s.encashDays === 1 ? "" : "s"})` : ""}`, encash],
    ["Gratuity", gratuity],
    ["Other earnings", otherEarn],
  ];
  const deductions: [string, number][] = [
    ["Loan outstanding", loans],
    ["Notice period recovery", notice],
    ["Other deductions", otherDed],
  ];
  const total = earnings.reduce((a, [, v]) => a + v, 0) - deductions.reduce((a, [, v]) => a + v, 0);
  const statementLines: [string, number][] = [
    ...earnings.filter(([, v]) => v),
    ...deductions.filter(([, v]) => v).map(([l, v]) => [`Less: ${l}`, -v] as [string, number]),
  ];

  async function confirm() {
    if (!profile) return setError("Set up a payroll profile first.");
    setBusy(true);
    setError("");
    try {
      await exitStaff(userId, { exitDate, reason: [reason, note.trim()].filter(Boolean).join(" — ") });
      if (record && total > 0) {
        const pay = await addPaymentApi({
          userId, category: "FNF", mode: "BANK", amount: Math.round(total), recordDate: exitDate,
          month: exitDate.slice(0, 7), description: `Full & final settlement — ${reason}`,
        });
        await downloadPaymentVoucher(pay, name, { profile, lines: statementLines });
      }
      onDone(`${name} exited on ${exitDate}${record && total > 0 ? " — settlement recorded." : "."}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to complete the exit.");
      setBusy(false);
    }
  }

  async function undo() {
    if (!window.confirm(`Cancel ${name}'s exit and reactivate them? Any settlement payment stays on the ledger.`)) return;
    setBusy(true);
    try {
      await cancelStaffExit(userId);
      onDone("Exit cancelled — staff reactivated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel the exit.");
      setBusy(false);
    }
  }

  const money = (v: number, set: (n: number) => void) => (
    <input type="number" value={v} onChange={(e) => set(Number(e.target.value) || 0)} className="input w-32 text-right" />
  );

  return (
    <Modal onClose={onClose} wide>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">{exited ? "Full & Final Settlement" : "Initiate Exit"}</h3>
        <p className="text-xs text-gray-500">
          {name}
          {s?.joiningDate && <> · joined {s.joiningDate} · {s.yearsOfService} yrs of service</>}
        </p>
      </div>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
        {exited && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Exited on {exited}{profile?.details?.exitReason ? ` — ${profile.details.exitReason}` : ""}. You can still print the statement or cancel the exit.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Last working day</span>
            <DatePicker value={exitDate} onChange={setExitDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Reason</span>
            <Select value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input w-full" placeholder="Optional" />
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Working out the settlement…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 bg-emerald-50/60 px-3 py-2 text-xs font-semibold text-emerald-800 uppercase">Payable to staff</div>
              <Row label="Unpaid salary" hint={dueMonths.length ? `Payslips not marked paid: ${dueMonths.join(", ")}` : "No unpaid payslips"}>{money(salary, setSalary)}</Row>
              <Row label="Leave encashment" hint={s ? `${s.encashDays} day(s) × ${inr(s.dailyRate)}` : undefined}>{money(encash, setEncash)}</Row>
              <Row label="Gratuity" hint={s?.gratuityEligible ? "15 days' basic per year of service" : "Under 5 years — not eligible"}>{money(gratuity, setGratuity)}</Row>
              <Row label="Other earnings">{money(otherEarn, setOtherEarn)}</Row>
            </div>
            <div className="rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 bg-rose-50/60 px-3 py-2 text-xs font-semibold text-rose-800 uppercase">Recoverable</div>
              <Row label="Loan outstanding">{money(loans, setLoans)}</Row>
              <Row label="Notice period recovery">{money(notice, setNotice)}</Row>
              <Row label="Other deductions">{money(otherDed, setOtherDed)}</Row>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${total >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
          <span className="text-sm font-semibold">{total >= 0 ? "Net payable to staff" : "Net recoverable from staff"}</span>
          <span className="text-lg font-bold">{inr(Math.abs(total))}</span>
        </div>
        {!exited && total > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
            Record it as a Full &amp; Final payment and download the settlement statement
          </label>
        )}
      </div>
      <div className="border-t border-gray-100 px-5 py-3">
        {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          {exited ? (
            <>
              <button onClick={undo} disabled={busy} className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">Cancel exit</button>
              <button
                onClick={() => downloadPaymentVoucher(
                  { category: "FNF", amount: Math.max(0, Math.round(total)), recordDate: exitDate, month: exitDate.slice(0, 7), description: "Full & final settlement statement" },
                  name, { profile, lines: statementLines },
                )}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Download statement
              </button>
              <button onClick={onClose} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white">Close</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
              <button onClick={confirm} disabled={busy || loading} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Spinner size={14} />} Confirm Exit
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0">
      <div>
        <div className="text-sm text-gray-700">{label}</div>
        {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
