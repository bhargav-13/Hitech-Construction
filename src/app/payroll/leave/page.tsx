"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { usePendingLeave } from "@/lib/usePayrollLive";
import { getUsers, memberLeave, ApiError } from "@/lib/api";
import type { LeaveRequestApi, LeaveStatus, UserResponse } from "@/lib/api";
import { LeaveStatusPill } from "@/components/payroll/LeaveStatusPill";
import { CalendarDays, Check, ClipboardList, Search, X } from "lucide-react";

type Tab = "ALL" | "QUEUE";

/**
 * Leave — a single screen with two tabs so admins never bounce between pages:
 *   • All Requests: org-wide history of every leave request, searchable and filterable.
 *   • Approval Queue: just the pending ones, each actionable inline (approve / reject).
 * Both read the same backend; deciding in the queue refreshes both views.
 */
export default function LeavePage() {
  const { requests: pending, loading: pendingLoading, error: pendingError, decide } = usePendingLeave();
  const [tab, setTab] = useState<Tab>("ALL");

  // ---- All Requests (org-wide history) ----
  const [all, setAll] = useState<LeaveRequestApi[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState("");
  const [status, setStatus] = useState<LeaveStatus | "ALL">("ALL");
  const [q, setQ] = useState("");

  const loadAll = useCallback(async () => {
    setAllLoading(true);
    try {
      const users = await getUsers(0, 200);
      const onPayroll = users.content.filter((u: UserResponse) => u.onPayroll);
      const collected = await Promise.all(onPayroll.map((u) => memberLeave(u.id).catch(() => [])));
      const flat = collected.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setAll(flat);
      setAllError("");
    } catch (err) {
      setAllError(err instanceof ApiError ? err.message : "Unable to load leave requests.");
    } finally {
      setAllLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!query) return true;
      return r.memberName.toLowerCase().includes(query) || r.leaveTypeName.toLowerCase().includes(query);
    });
  }, [all, status, q]);

  // ---- Approval Queue (pending, actionable) ----
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});

  async function act(r: LeaveRequestApi, action: "APPROVE" | "REJECT") {
    setBusy(r.id);
    setActionError("");
    try {
      await decide(r.id, action, note[r.id]);
      // Keep the history tab in step with the decision just made.
      void loadAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Unable to ${action.toLowerCase()} — try again.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Leave</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {all.length} total · {pending.length} pending decision
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          <TabButton active={tab === "ALL"} onClick={() => setTab("ALL")}>
            All Requests
          </TabButton>
          <TabButton active={tab === "QUEUE"} onClick={() => setTab("QUEUE")}>
            Approval Queue
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-white">
                {pending.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "ALL" ? (
          <>
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

            {allError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{allError}</div>}

            {allLoading ? (
              <LoadingBox />
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
          </>
        ) : (
          <>
            {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
            {pendingError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{pendingError}</div>}

            {pendingLoading ? (
              <LoadingBox />
            ) : pending.length === 0 ? (
              <PayrollEmpty icon={ClipboardList} title="Nothing pending" hint="You're all caught up — new requests will land here as members apply." />
            ) : (
              <div className="space-y-3">
                {pending.map((r) => (
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
          </>
        )}
      </div>
    </PayrollShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
        active ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingBox() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
      <Spinner size={16} className="text-brand-accent" /> Loading…
    </div>
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
