"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { LeaveStatusPill } from "@/components/payroll/LeaveStatusPill";
import { ApprovalTrail, ApprovalProgressPill } from "@/components/approval/ApprovalTrail";
import { allLeave, decideLeave, ApiError } from "@/lib/api";
import type { LeaveRequestApi, LeaveStatus } from "@/lib/api";
import { CalendarDays, Check, ClipboardList, Search, UserRound, X } from "lucide-react";

/**
 * Leave — one list, one detail pane.
 *
 * <p>This used to be two tabs: an "Approval Queue" of pending rows and an "All Requests" history.
 * Deciding on a request therefore meant approving it in one tab and going to the other to see
 * whether the person had taken six days last month. They're now the same list — the queue is just a
 * filter over it — and selecting a row opens a sidebar with the full approval ladder and audit
 * trail beside the decision buttons.
 *
 * <p>The list is also a single request now. It previously fetched every payroll member and then one
 * leave history per member, so a 90-person site cost 91 round trips to render one screen.
 */

type Filter = "AWAITING_ME" | "PENDING" | "ALL" | LeaveStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "AWAITING_ME", label: "Needs my approval" },
  { key: "PENDING", label: "Pending" },
  { key: "ALL", label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function LeavePage() {
  const [rows, setRows] = useState<LeaveRequestApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("AWAITING_ME");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await allLeave());
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const awaitingMe = useMemo(() => rows.filter((r) => r.canActNow).length, [rows]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "AWAITING_ME" && !r.canActNow) return false;
      if (filter !== "AWAITING_ME" && filter !== "ALL" && r.status !== filter) return false;
      if (!query) return true;
      return (
        r.memberName.toLowerCase().includes(query) ||
        r.leaveTypeName.toLowerCase().includes(query) ||
        (r.reason ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, filter, q]);

  // Keep a selection alive across refreshes, and fall back to the first visible row.
  const selected = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId]
  );

  async function act(action: "APPROVE" | "REJECT") {
    if (!selected) return;
    setBusy(true);
    setActionError("");
    try {
      await decideLeave(selected.id, { action, note: note.trim() || undefined });
      setNote("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Unable to ${action.toLowerCase()} — try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Leave</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {rows.length} request{rows.length === 1 ? "" : "s"}
              {awaitingMe > 0 && <span className="text-amber-600"> · {awaitingMe} waiting on you</span>}
            </p>
          </div>
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500 sm:max-w-xs">
            <Search size={15} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, type or reason…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const count =
              f.key === "AWAITING_ME"
                ? awaitingMe
                : f.key === "ALL"
                  ? rows.length
                  : rows.filter((r) => r.status === f.key).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-navy text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={ClipboardList} title="No leave requests yet" hint="Applications appear here as members submit them." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* ---- the one list ---- */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {visible.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Nothing matches this filter.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => {
                            setSelectedId(r.id);
                            setNote("");
                            setActionError("");
                          }}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                            active ? "bg-cyan-50/60 ring-1 ring-inset ring-cyan-500/20" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <UserRound size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium text-slate-800">{r.memberName}</span>
                              <LeaveStatusPill status={r.status} />
                              {r.canActNow && (
                                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  YOUR TURN
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                              <span>{r.leaveTypeName}</span>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays size={11} className="text-slate-400" />
                                {r.fromDate} → {r.toDate}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>{r.days}d</span>
                            </div>
                            <div className="mt-1">
                              <ApprovalProgressPill approval={r.approval} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ---- detail sidebar: request + ladder + trail + actions ---- */}
            <aside className="rounded-xl border border-gray-200 bg-white">
              {!selected ? (
                <div className="p-6 text-center text-sm text-slate-400">Select a request to see its history.</div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="border-b border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{selected.memberName}</div>
                        <div className="text-xs text-slate-500">{selected.leaveTypeName}</div>
                      </div>
                      <LeaveStatusPill status={selected.status} />
                    </div>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <Row label="Dates" value={`${selected.fromDate} → ${selected.toDate}`} />
                      <Row label="Days" value={String(selected.days)} />
                      <Row label="Applied" value={selected.createdAt ? formatWhen(selected.createdAt) : "—"} />
                    </dl>
                    {selected.reason && (
                      <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600">{selected.reason}</p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    <ApprovalTrail approval={selected.approval} />
                  </div>

                  {/* Actions live beside the history, not on a separate screen. */}
                  {selected.status === "PENDING" && (
                    <div className="border-t border-gray-100 p-4">
                      {selected.canActNow ? (
                        <>
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="Add a note (optional)"
                            className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-cyan-500"
                          />
                          {actionError && <p className="mt-1.5 text-xs text-rose-600">{actionError}</p>}
                          <div className="mt-2 flex gap-2">
                            <button
                              disabled={busy}
                              onClick={() => act("APPROVE")}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check size={15} /> Approve
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => act("REJECT")}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                              <X size={15} /> Reject
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {selected.approval?.awaitingRoleNames
                            ? `Waiting on ${selected.approval.awaitingRoleNames}. You can't act at this level.`
                            : "You can't act on this request."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
