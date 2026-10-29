"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, HandCoins, Plus, Search, Wallet, X } from "lucide-react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { ApprovalBadge } from "@/components/approval/ApprovalBadge";
import { apiRequest, type ApprovalState } from "@/lib/api";
import * as vyapar from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { useProjects } from "@/lib/useProjects";
import { useVyaparProjectId } from "@/lib/projectScope";
import { usePaymentTypeOptions, useBankAccountResolver } from "@/lib/bankScope";
import { useCan } from "@/lib/permissions";
import { useAuthStore } from "@/lib/authStore";
import { inr, bookDate } from "@/lib/format";
import { todayIST, formatDateTimeIST } from "@/lib/datetime";

/**
 * Vyapar → Payment Request (KAN-68). A site asks for money to pay a party; it is approved (on the
 * Payment Request chain from Settings → Multi Level Approval, or by anyone with Payments → Approve
 * when no chain is published); then Pay books an ordinary Payment-Out for the party.
 */

type Status = "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
interface PaymentRequestApi {
  id: number;
  requestNo: string;
  projectId: number | null;
  partyId: number;
  partyName: string | null;
  amount: number;
  against: string | null;
  neededBy: string | null;
  note: string | null;
  status: Status;
  requestedBy: number | null;
  requestedByName: string | null;
  createdAt: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  paymentId: number | null;
  approval: ApprovalState | null;
}

const BASE = "/api/v1/vyapar/payment-requests";
const AGAINST = ["Against Labour", "Against Subcon WO", "Against Material", "Against Petty Cash", "Against Other"];
const STATUS_CLS: Record<Status, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  APPROVED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  CANCELLED: "bg-gray-100 text-gray-500 ring-gray-400/20",
};
const STATUS_LABEL: Record<Status, string> = { PENDING: "Pending", APPROVED: "Approved", PAID: "Paid", REJECTED: "Rejected", CANCELLED: "Withdrawn" };

export default function PaymentRequestPage() {
  return (
    <VyaparShell>
      <PaymentRequests />
    </VyaparShell>
  );
}

function PaymentRequests() {
  const can = useCan();
  const myId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role?.name?.toLowerCase() === "super admin");
  const projectScope = useVyaparProjectId();
  const { projects } = useProjects();
  const [rows, setRows] = useState<PaymentRequestApi[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | Status>("ALL");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<PaymentRequestApi | null>(null);
  const [deciding, setDeciding] = useState<{ row: PaymentRequestApi; approve: boolean } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      setRows(await apiRequest<PaymentRequestApi[]>(BASE));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load payment requests.");
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // ?new=1 (Add More, Alt-key shortcut) opens the form; ?open=<id> (approvals inbox) highlights a row.
  useEffect(() => {
    if (params?.get("new")) {
      setCreating(true);
      router.replace(pathname, { scroll: false });
    }
    const open = Number(params?.get("open"));
    if (open) setHighlight(open);
  }, [params, router, pathname]);

  const projectName = (id: number | null) => projects.find((p) => p.id === String(id))?.name ?? "—";
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (projectScope && r.projectId !== projectScope) return false;
      if (status !== "ALL" && r.status !== status) return false;
      if (!q) return true;
      return [r.requestNo, r.partyName, r.against, r.note, r.requestedByName].some((f) => f?.toLowerCase().includes(q));
    });
  }, [rows, search, status, projectScope]);
  const totals = useMemo(() => {
    const sum = (s: Status) => shown.filter((r) => r.status === s).reduce((a, r) => a + Number(r.amount), 0);
    return { pending: sum("PENDING"), approved: sum("APPROVED"), paid: sum("PAID") };
  }, [shown]);

  /** On a chain: whoever the rung waits on. No chain: Payments → Approve, not your own request. */
  const canDecide = (r: PaymentRequestApi) =>
    r.status === "PENDING" &&
    (r.approval && r.approval.status === "PENDING" ? r.approval.canActNow : can("VYAPAR_PAYMENT:APPROVE") && (r.requestedBy !== myId || isSuperAdmin));

  async function withdraw(r: PaymentRequestApi) {
    if (!confirm(`Withdraw ${r.requestNo}?`)) return;
    try {
      await apiRequest(`${BASE}/${r.id}/cancel`, { method: "POST" });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't withdraw it.");
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Payment Requests</h2>
          <p className="mt-0.5 text-sm text-gray-500">Ask for money to pay a party. Once approved, Pay records it as a Payment-Out.</p>
        </div>
        {can("VYAPAR_PAYMENT:CREATE") && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Plus size={15} /> Add Payment Request
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Waiting for approval" value={inr(totals.pending)} tone="text-amber-600" />
        <Tile label="Approved, to pay" value={inr(totals.approved)} tone="text-sky-700" />
        <Tile label="Paid" value={inr(totals.paid)} tone="text-emerald-600" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search request no, party, note…" className="w-full bg-transparent text-sm outline-none" />
        </div>
        {(["ALL", "PENDING", "APPROVED", "PAID", "REJECTED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${status === s ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}
          >
            {s === "ALL" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {rows == null ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
      ) : shown.length === 0 ? (
        <VyaparEmpty icon={HandCoins} title={rows.length ? "Nothing matches" : "No payment requests yet"} hint="A site asks for money to pay a party here; it's approved, then paid." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Request</th>
                <th className="px-3 py-2 font-medium">Party</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Against</th>
                <th className="px-3 py-2 font-medium">Needed by</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-b border-gray-50 last:border-b-0 ${highlight === r.id ? "bg-cyan-50/60" : "even:bg-gray-50/40"}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{r.requestNo}</div>
                    <div className="text-[11px] text-gray-400">{r.requestedByName ?? "—"} · {formatDateTimeIST(r.createdAt)}</div>
                    {r.note && <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-gray-500" title={r.note}>{r.note}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{r.partyName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{projectName(r.projectId)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.against?.replace(/^Against /, "") ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{r.neededBy ? bookDate(r.neededBy) : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{inr(Number(r.amount))}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      {r.status === "PENDING" && <ApprovalBadge state={r.approval} />}
                      {r.decidedByName && r.status !== "PENDING" && (
                        <span className="text-[10px] text-gray-400" title={r.decisionNote ?? undefined}>by {r.decidedByName}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canDecide(r) && (
                        <>
                          <button onClick={() => setDeciding({ row: r, approve: true })} className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"><Check size={12} /> Approve</button>
                          <button onClick={() => setDeciding({ row: r, approve: false })} className="flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"><X size={12} /> Reject</button>
                        </>
                      )}
                      {r.status === "APPROVED" && can("VYAPAR_PAYMENT:CREATE") && (
                        <button onClick={() => setPaying(r)} className="flex items-center gap-1 rounded-md bg-brand-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"><Wallet size={12} /> Pay</button>
                      )}
                      {r.status === "PAID" && r.paymentId && (
                        <Link href={`/vyapar/payment-out?open=${r.paymentId}`} className="flex items-center gap-1 text-xs text-brand-accent hover:underline">Payment <ExternalLink size={11} /></Link>
                      )}
                      {r.status === "PENDING" && r.requestedBy === myId && (
                        <button onClick={() => void withdraw(r)} className="text-xs text-gray-500 hover:text-rose-600 hover:underline">Withdraw</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewRequest
          defaultProjectId={projectScope ?? null}
          projects={projects}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void load(); }}
        />
      )}
      {paying && <PayDialog row={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); void load(); }} />}
      {deciding && (
        <DecideDialog
          row={deciding.row}
          approve={deciding.approve}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); void load(); }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function NewRequest({
  defaultProjectId,
  projects,
  onClose,
  onSaved,
}: {
  defaultProjectId: number | null;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [parties, setParties] = useState<Party[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ? String(defaultProjectId) : "");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [against, setAgainst] = useState(AGAINST[0]);
  const [neededBy, setNeededBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    vyapar.getParties().then((p) => setParties([...p].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setParties([]));
  }, []);
  const partyOptions = useMemo(
    () => vyapar.partiesForProject(parties, projectId || null).map((p) => ({ value: String(p.id), label: p.name })),
    [parties, projectId],
  );

  async function save() {
    if (!partyId) return setError("Pick the party to be paid.");
    if (!(Number(amount) > 0)) return setError("Enter the amount needed.");
    setSaving(true);
    setError("");
    try {
      await apiRequest(BASE, {
        method: "POST",
        body: { projectId: projectId ? Number(projectId) : null, partyId: Number(partyId), amount: Number(amount), against, neededBy: neededBy || null, note: note.trim() || null },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the request.");
      setSaving(false);
    }
  }

  return (
    <Drawer title="New Payment Request" onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Send for approval"}>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label="Project">
          <Select value={projectId} onChange={setProjectId} placeholder="Select project" options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        </DrawerField>
        <DrawerField label="Party to pay" required>
          <Select value={partyId} onChange={setPartyId} placeholder="Select party" options={partyOptions} />
        </DrawerField>
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Amount" required>
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="0" />
          </DrawerField>
          <DrawerField label="Needed by">
            <DatePicker value={neededBy} onChange={setNeededBy} min={todayIST()} placeholder="Any time" />
          </DrawerField>
        </div>
        <DrawerField label="Against">
          <Select value={against} onChange={setAgainst} options={AGAINST.map((a) => ({ value: a, label: a }))} />
        </DrawerField>
        <DrawerField label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input resize-none" placeholder="What it's for — bill no., work done, week…" />
        </DrawerField>
      </div>
    </Drawer>
  );
}

function DecideDialog({ row, approve, onClose, onDone }: { row: PaymentRequestApi; approve: boolean; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`${BASE}/${row.id}/decide`, { method: "POST", body: { approve, note: note.trim() || null } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the decision.");
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-800">{approve ? "Approve" : "Reject"} {row.requestNo}</h3>
        <p className="text-sm text-gray-600">{inr(Number(row.amount))} to {row.partyName}{row.against ? ` · ${row.against}` : ""}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input resize-none" placeholder={approve ? "Note (optional)" : "Why it's rejected (optional)"} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => void go()}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
          >
            {busy ? "Saving…" : approve ? "Approve" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayDialog({ row, onClose, onPaid }: { row: PaymentRequestApi; onClose: () => void; onPaid: () => void }) {
  const paymentTypes = usePaymentTypeOptions();
  const bankAccountFor = useBankAccountResolver();
  const [mode, setMode] = useState("Cash");
  const [date, setDate] = useState(todayIST());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pay() {
    setBusy(true);
    setError("");
    try {
      // Both the account's name and its id go — the balance follows the id (see bankScope).
      await apiRequest(`${BASE}/${row.id}/pay`, {
        method: "POST",
        body: { paymentDate: date, mode, bankAccountId: bankAccountFor(mode), reference: reference.trim() || null },
      });
      onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the payment.");
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-800">Pay {row.requestNo}</h3>
        <p className="text-sm text-gray-600">
          Records a Payment-Out of <b>{inr(Number(row.amount))}</b> to <b>{row.partyName}</b>.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Paid from</span>
          <Select value={mode} onChange={setMode} options={paymentTypes} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
            <DatePicker value={date} onChange={setDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Reference</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="UTR / cheque no." />
          </label>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={() => void pay()} disabled={busy} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Paying…" : "Record payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
