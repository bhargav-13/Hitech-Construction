"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { usePendingLeave } from "@/lib/usePayrollLive";
import { ApiError } from "@/lib/api";
import type { LeaveRequestApi } from "@/lib/api";
import { LeaveStatusPill } from "@/components/payroll/LeaveStatusPill";
import { ArrowLeft, Check, ClipboardList, X } from "lucide-react";

/** Approval Queue — every pending leave request. Anyone with PAYROLL:APPROVE decides here. */
export default function LeaveApprovalQueuePage() {
  const { requests, loading, error, decide } = usePendingLeave();
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});

  async function act(r: LeaveRequestApi, action: "APPROVE" | "REJECT") {
    setBusy(r.id);
    setActionError("");
    try {
      await decide(r.id, action, note[r.id]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Unable to ${action.toLowerCase()} — try again.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/payroll/leave" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            <ArrowLeft size={14} /> All Requests
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Approval Queue</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {requests.length} pending request{requests.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : requests.length === 0 ? (
          <PayrollEmpty icon={ClipboardList} title="Nothing pending" hint="You're all caught up — new requests will land here as members apply." />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-sm font-semibold text-brand-accent">
                        {r.memberName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{r.memberName}</div>
                        <div className="text-xs text-gray-500">Applied {r.createdAt?.slice(0, 10) ?? "—"}</div>
                      </div>
                      <LeaveStatusPill status={r.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <Detail label="Leave Type" value={r.leaveTypeName} />
                      <Detail label="From" value={r.fromDate} />
                      <Detail label="To" value={r.toDate} />
                      <Detail label="Days" value={String(r.days)} />
                    </div>
                    {r.reason && (
                      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <span className="font-medium text-gray-500">Reason: </span>{r.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-72">
                    <input
                      value={note[r.id] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Note (optional)"
                      className="input text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => act(r, "APPROVE")}
                        disabled={busy === r.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        onClick={() => act(r, "REJECT")}
                        disabled={busy === r.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </div>
  );
}
