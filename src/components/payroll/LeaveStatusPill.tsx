import type { LeaveStatus } from "@/lib/api";

/** Shared status badge for leave requests. */
export function LeaveStatusPill({ status }: { status: LeaveStatus }) {
  const cfg: Record<LeaveStatus, string> = {
    PENDING: "bg-amber-50 text-amber-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    REJECTED: "bg-rose-50 text-rose-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${cfg[status]}`}>{status}</span>;
}
