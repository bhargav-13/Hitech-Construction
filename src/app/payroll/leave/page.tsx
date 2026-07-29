"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { usePendingLeave } from "@/lib/usePayrollLive";
import { getUsers, memberLeave, ApiError } from "@/lib/api";
import type { LeaveRequestApi, LeaveStatus, UserResponse } from "@/lib/api";
import { LeaveStatusPill } from "@/components/payroll/LeaveStatusPill";
import { CalendarDays, Search } from "lucide-react";

/**
 * All Leave Requests — org-wide view of every request across every member. Pending ones are
 * actionable from the Approval Queue; this page is the audit/history view.
 */
export default function LeaveAllPage() {
  const { requests: pendingOnly } = usePendingLeave();
  const [all, setAll] = useState<LeaveRequestApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<LeaveStatus | "ALL">("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const users = await getUsers(0, 200);
        const onPayroll = users.content.filter((u: UserResponse) => u.onPayroll);
        const collected = await Promise.all(onPayroll.map((u) => memberLeave(u.id).catch(() => [])));
        if (!cancelled) {
          const flat = collected.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
          setAll(flat);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load leave requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!query) return true;
      return r.memberName.toLowerCase().includes(query) || r.leaveTypeName.toLowerCase().includes(query);
    });
  }, [all, status, q]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Leave Requests</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {all.length} total · {pendingOnly.length} pending decision
            </p>
          </div>
          <Link href="/payroll/leave/approvals" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95">
            Approval Queue ({pendingOnly.length})
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or leave type…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44">
            <Select
              value={status}
              onChange={(v) => setStatus(v as LeaveStatus | "ALL")}
              options={[
                { value: "ALL", label: "All statuses" },
                { value: "PENDING", label: "Pending" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={CalendarDays} title="No leave requests" hint="Requests will appear here as members apply from their self-service page." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Member</th>
                  <th className="px-4 py-2 font-medium">Leave Type</th>
                  <th className="px-4 py-2 font-medium">From – To</th>
                  <th className="px-4 py-2 text-right font-medium">Days</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Decided By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                          {r.memberName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                        <span className="font-medium text-gray-800">{r.memberName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{r.leaveTypeName}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.fromDate} → {r.toDate}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{r.days}</td>
                    <td className="px-4 py-2.5"><LeaveStatusPill status={r.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.approverName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

