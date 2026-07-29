"use client";

import { useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useMyLeave } from "@/lib/usePayrollLive";
import { ApiError } from "@/lib/api";
import { LeaveStatusPill } from "@/components/payroll/LeaveStatusPill";
import { CalendarDays, Plus, X } from "lucide-react";

/** My Leave — self-service. See balance per type + apply for leave + cancel a pending request. */
export default function MyLeavePage() {
  const { requests, balance, loading, error, apply, cancel } = useMyLeave();
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState("");

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Leave</h2>
            <p className="mt-0.5 text-sm text-gray-500">See your balance and apply for time off.</p>
          </div>
          <button
            onClick={() => setApplying(true)}
            disabled={balance.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            <Plus size={15} /> Apply for Leave
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Balance cards */}
        {balance.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            You don&apos;t have a leave policy assigned yet — HR will set this up in your payroll profile.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balance.map((b) => (
              <div key={b.leaveTypeName} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
                      <CalendarDays size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{b.leaveTypeName}</div>
                      <div className="text-[11px] text-gray-400">{b.paid ? "Paid leave" : "Unpaid leave"}</div>
                    </div>
                  </div>
                  <span className="text-2xl font-semibold text-brand-accent">{b.remaining}</span>
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {b.taken} taken · {b.annualCount} granted
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Requests list */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-800">My Requests</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Spinner size={16} className="text-brand-accent" /> Loading…
            </div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No requests yet.</div>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Leave Type</th>
                  <th className="px-4 py-2 font-medium">From – To</th>
                  <th className="px-4 py-2 text-right font-medium">Days</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Decision</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.leaveTypeName}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.fromDate} → {r.toDate}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{r.days}</td>
                    <td className="px-4 py-2.5"><LeaveStatusPill status={r.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {r.approverName ? `${r.approverName}${r.decisionNote ? ` — ${r.decisionNote}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.status === "PENDING" && (
                        <button
                          onClick={async () => { try { await cancel(r.id); } catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to cancel."); } }}
                          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          title="Cancel this request"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {applying && (
        <ApplyLeaveDrawer
          types={balance.map((b) => b.leaveTypeName)}
          onClose={() => setApplying(false)}
          onApply={async (body) => { try { await apply(body); setApplying(false); } catch (err) { throw err; } }}
        />
      )}
    </PayrollShell>
  );
}

function ApplyLeaveDrawer({
  types,
  onClose,
  onApply,
}: {
  types: string[];
  onClose: () => void;
  onApply: (body: { leaveTypeName: string; fromDate: string; toDate: string; reason?: string }) => Promise<void>;
}) {
  const [type, setType] = useState(types[0] ?? "");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!type) { setError("Pick a leave type."); return; }
    if (!from || !to) { setError("Pick start and end dates."); return; }
    if (to < from) { setError("End date must be on or after the start date."); return; }
    setSaving(true);
    setError("");
    try {
      await onApply({ leaveTypeName: type, fromDate: from, toDate: to, reason: reason.trim() || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to apply — try again.");
      setSaving(false);
    }
  }

  return (
    <Drawer title="Apply for Leave" onClose={onClose} onSave={submit} saveLabel={saving ? "Submitting…" : "Submit"}>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label="Leave Type" required>
          <Select value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t }))} />
        </DrawerField>
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="From" required>
            <DatePicker value={from} onChange={setFrom} placeholder="From" />
          </DrawerField>
          <DrawerField label="To" required>
            <DatePicker value={to} onChange={setTo} placeholder="To" />
          </DrawerField>
        </div>
        <DrawerField label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" placeholder="Why do you need this leave? (optional)" />
        </DrawerField>
      </div>
    </Drawer>
  );
}
