"use client";

import { useEffect, useMemo, useState } from "react";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useReimbursements } from "@/lib/usePayrollLive";
import { getUsers, ApiError } from "@/lib/api";
import type { ReimbursementApi, ReimbStatus, UserResponse } from "@/lib/api";
import { inr } from "@/lib/format";
import { formatDateTimeIST } from "@/lib/datetime";
import { Banknote, CalendarDays, Check, CircleCheck, Clock, Eye, Plus, Receipt, RotateCcw, UserRound, Wallet, X } from "lucide-react";

/** What can be done to a claim. REOPEN clears a decision and sends it back to the pending queue. */
type ReimbAction = "APPROVE" | "REJECT" | "PAY" | "REOPEN";

const STATUS_STYLE: Record<ReimbStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-rose-50 text-rose-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const EXPENSE_TYPES = ["Travel", "Fuel", "Site Supplies", "Food & Lodging", "Tools", "Medical", "Other"];

/** Reimbursements — real backend. Members submit claims, admins approve/reject/pay. */
export default function ReimbursementsPage() {
  const { rows, loading, error, create, decide } = useReimbursements();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"ALL" | ReimbStatus>("ALL");
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [actionError, setActionError] = useState("");
  // Clicking anywhere on a row opens the claim — the kebab was the only way in before, which meant
  // there was nowhere to read a claim's dates, amounts and approver together.
  const [openClaim, setOpenClaim] = useState<ReimbursementApi | null>(null);

  useEffect(() => {
    getUsers(0, 200).then((r) => setMembers(r.content.filter((u) => u.onPayroll))).catch(() => setMembers([]));
  }, []);

  const totals = useMemo(() => ({
    paid: rows.filter((r) => r.status === "PAID").reduce((a, r) => a + Number(r.approvedAmount ?? 0), 0),
    paidCount: rows.filter((r) => r.status === "PAID").length,
    approved: rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + Number(r.approvedAmount ?? 0), 0),
    approvedCount: rows.filter((r) => r.status === "APPROVED").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
  }), [rows]);

  const visible = tab === "ALL" ? rows : rows.filter((r) => r.status === tab);

  async function act(id: number, action: ReimbAction) {
    try {
      await decide(id, action);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Unable to ${action.toLowerCase()} this claim.`);
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Reimbursements</h2>
            <p className="mt-0.5 text-sm text-gray-500">Track, approve and settle member expense claims.</p>
          </div>
          <button onClick={() => setCreating(true)} disabled={members.length === 0} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50">
            <Plus size={15} /> New Claim
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Reimbursements Paid" value={inr(totals.paid)} accent="green" icon={CircleCheck} hint={`${totals.paidCount} settled claims`} />
          <StatCard label="Approved (awaiting payout)" value={inr(totals.approved)} accent="blue" icon={Wallet} hint={`${totals.approvedCount} claims`} />
          <StatCard label="Pending Review" value={totals.pending} accent="amber" icon={Clock} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "PENDING", "APPROVED", "PAID", "REJECTED"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${tab === t ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
              {t === "ALL" ? "All" : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Expense / Claim</th>
                  <th className="px-4 py-2 font-medium">Member</th>
                  <th className="px-4 py-2 font-medium">Expense Date</th>
                  <th className="px-4 py-2 text-right font-medium">Requested</th>
                  <th className="px-4 py-2 text-right font-medium">Approved</th>
                  <th className="px-4 py-2 font-medium">Approved By</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-10 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenClaim(r)}
                    title="Open this claim"
                    className="cursor-pointer border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{r.expenseType}</div>
                      <div className="font-mono text-xs text-gray-400">{r.claimId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.memberName}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.expenseDate}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{inr(r.requestedAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{r.approvedAmount != null ? inr(r.approvedAmount) : "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.approverName ?? "—"}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex">
                        <RowMenu align="right" buttonLabel={`Actions for ${r.claimId}`}>
                          {/* Every status offers something. A rejected or paid claim used to open
                              an empty menu — the ⋮ was there, clicking it did nothing, which reads
                              as broken rather than as "no actions here". */}
                          {(close) => (
                            <>
                              <RowMenuItem icon={Eye} label="View claim" onClick={() => { close(); setOpenClaim(r); }} />
                              {r.status === "PENDING" && <RowMenuItem icon={Check} label="Approve" onClick={() => { close(); act(r.id, "APPROVE"); }} />}
                              {r.status === "PENDING" && <RowMenuItem icon={X} label="Reject" tone="danger" onClick={() => { close(); act(r.id, "REJECT"); }} />}
                              {r.status === "APPROVED" && <RowMenuItem icon={Banknote} label="Mark paid" onClick={() => { close(); act(r.id, "PAY"); }} />}
                              {(r.status === "REJECTED" || r.status === "APPROVED") && (
                                <>
                                  <RowMenuDivider />
                                  <RowMenuItem
                                    icon={RotateCcw}
                                    label="Reopen — decide again"
                                    onClick={() => { close(); act(r.id, "REOPEN"); }}
                                  />
                                </>
                              )}
                            </>
                          )}
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400"><Receipt size={22} className="mx-auto mb-2 text-gray-300" />No claims here.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openClaim && (
        <ClaimDetailDrawer
          claim={rows.find((r) => r.id === openClaim.id) ?? openClaim}
          onClose={() => setOpenClaim(null)}
          onAct={async (action) => {
            await act(openClaim.id, action);
            setOpenClaim(null);
          }}
        />
      )}

      {creating && (
        <ClaimDialog
          members={members}
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            try {
              await create(body);
              setCreating(false);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : "Unable to create this claim.");
            }
          }}
        />
      )}
    </PayrollShell>
  );
}

/** One claim in full, with its decision buttons — what a row click opens. */
function ClaimDetailDrawer({
  claim,
  onClose,
  onAct,
}: {
  claim: ReimbursementApi;
  onClose: () => void;
  onAct: (action: ReimbAction) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: ReimbAction) => {
    setBusy(true);
    try { await onAct(action); } finally { setBusy(false); }
  };

  return (
    <Drawer title={`Claim ${claim.claimId}`} onClose={onClose} width="max-w-lg" guardOnClose={false}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">{claim.expenseType}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
              <UserRound size={13} className="text-gray-400" /> {claim.memberName}
            </div>
          </div>
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[claim.status]}`}>{claim.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Detail label="Requested" value={inr(claim.requestedAmount)} />
          <Detail label="Approved" value={claim.approvedAmount != null ? inr(claim.approvedAmount) : "—"} />
          <Detail label="Expense date" value={claim.expenseDate} icon={CalendarDays} />
          <Detail label="Applied" value={formatDateTimeIST(claim.appliedAt)} />
          <Detail label="Decided" value={claim.approvedAt ? formatDateTimeIST(claim.approvedAt) : "—"} />
          <Detail label="Settled" value={claim.settlementDate ?? "—"} />
          <Detail label="Approved by" value={claim.approverName ?? "—"} />
          <Detail label="Claim id" value={claim.claimId} mono />
        </div>

        {claim.status === "PENDING" && (
          <div className="flex gap-2 border-t border-gray-100 pt-4">
            <button
              disabled={busy}
              onClick={() => run("APPROVE")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={15} /> Approve
            </button>
            <button
              disabled={busy}
              onClick={() => run("REJECT")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <X size={15} /> Reject
            </button>
          </div>
        )}
        {(claim.status === "REJECTED" || claim.status === "APPROVED") && (
          <div className="border-t border-gray-100 pt-4">
            <button
              disabled={busy}
              onClick={() => run("REOPEN")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-accent hover:text-brand-accent disabled:opacity-50"
            >
              <RotateCcw size={15} /> Reopen — decide again
            </button>
            <p className="mt-2 text-[11px] text-gray-400">
              Clears the decision and puts the claim back in the pending queue. A paid claim can&apos;t be
              reopened here — that is an accounting entry, not a status change.
            </p>
          </div>
        )}
        {claim.status === "APPROVED" && (
          <div className="border-t border-gray-100 pt-4">
            <button
              disabled={busy}
              onClick={() => run("PAY")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Banknote size={15} /> Mark paid
            </button>
            <p className="mt-2 text-[11px] text-gray-400">
              Records that Hi-Tech settled this claim manually — no money is moved by the system.
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Detail({ label, value, mono, icon: Icon }: { label: string; value: string; mono?: boolean; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>
        {Icon && <Icon size={12} className="shrink-0 text-gray-300" />}
        {value}
      </div>
    </div>
  );
}

function ClaimDialog({
  members,
  onClose,
  onCreate,
}: {
  members: UserResponse[];
  onClose: () => void;
  onCreate: (body: { userId: number; expenseType: string; expenseDate: string; requestedAmount: number }) => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES[0]);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!userId) { setError("Select a member."); return; }
    if (!amount) { setError("Enter the claim amount."); return; }
    setSaving(true);
    setError("");
    try {
      await onCreate({ userId: Number(userId), expenseType, expenseDate, requestedAmount: amount });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title="New Reimbursement Claim" onClose={onClose} onSave={save} saveLabel={saving ? "Submitting…" : "Submit Claim"} width="max-w-md">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <F label="Member" required>
          <Select value={userId} onChange={setUserId} placeholder="Select member" options={[{ value: "", label: "Select member" }, ...members.map((m) => ({ value: String(m.id), label: m.fullName }))]} />
        </F>
        <F label="Expense Type"><Select value={expenseType} onChange={setExpenseType} options={EXPENSE_TYPES.map((t) => ({ value: t, label: t }))} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Expense Date"><DatePicker value={expenseDate} onChange={setExpenseDate} placeholder="Date" /></F>
          <F label="Amount (₹)" required><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" /></F>
        </div>
      </div>
    </Drawer>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  );
}
