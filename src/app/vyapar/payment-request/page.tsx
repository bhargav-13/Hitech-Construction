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
 * Vyapar → Payment Request (KAN-68).
 *
 * Payables tab: every party we owe, from the same balance the Parties screen shows (bills + credit
 * expenses − payments-out − returns), and how much of it is already asked for. The accountant opens a
 * party, ticks the bills to clear (or none — on account) and proposes how much to pay now. The
 * request climbs the Payment Request chain (Settings → Multi Level Approval — e.g. Accountant →
 * Super Admin, set per office/site); each approver may change the amount. Pay then books an ordinary
 * Payment-Out linked to the ticked bills.
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
  /** What the requester first asked for — `amount` is where it stands after approvers. */
  proposedAmount: number | null;
  /** The party's payable when the request was raised. */
  dueAmount: number | null;
  invoiceIds: number[];
}

interface Payable {
  partyId: number;
  partyName: string;
  partyGroup: string | null;
  phone: string | null;
  due: number;
  requested: number;
  approved: number;
  free: number;
  openRequests: number;
}

interface OpenBill {
  id: number;
  docType: string;
  type: string;
  number: string;
  date: string | null;
  total: number;
  balance: number;
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
  const [tab, setTab] = useState<"PAYABLES" | "REQUESTS">(can("VYAPAR_PAYMENT_REQUEST:CREATE") ? "PAYABLES" : "REQUESTS");
  const [creating, setCreating] = useState<{ partyId?: number } | null>(null);
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
      setCreating({});
      router.replace(pathname, { scroll: false });
    }
    const open = Number(params?.get("open"));
    if (open) {
      setHighlight(open);
      setTab("REQUESTS");
    }
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
    (r.approval && r.approval.status === "PENDING" ? r.approval.canActNow : can("VYAPAR_PAYMENT_REQUEST:APPROVE") && (r.requestedBy !== myId || isSuperAdmin));

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
          <p className="mt-0.5 text-sm text-gray-500">See what we owe each party, propose how much to pay now, get it approved, then pay.</p>
        </div>
        {can("VYAPAR_PAYMENT_REQUEST:CREATE") && (
          <button onClick={() => setCreating({})} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Plus size={15} /> Add Payment Request
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["PAYABLES", "REQUESTS"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t === "PAYABLES" ? "Payables" : `Requests${rows ? ` (${rows.filter((r) => r.status === "PENDING" || r.status === "APPROVED").length} open)` : ""}`}
          </button>
        ))}
      </div>

      {tab === "PAYABLES" ? (
        <Payables
          projectId={projectScope ?? null}
          canRequest={can("VYAPAR_PAYMENT_REQUEST:CREATE")}
          reloadKey={rows}
          onRequest={(partyId) => setCreating({ partyId })}
          onShowRequests={(partyName) => { setSearch(partyName); setStatus("ALL"); setTab("REQUESTS"); }}
        />
      ) : (
      <>
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
                  <td className="px-3 py-2.5 text-right">
                    <div className="font-semibold text-gray-900">{inr(Number(r.amount))}</div>
                    {r.proposedAmount != null && Number(r.proposedAmount) !== Number(r.amount) && (
                      <div className="text-[11px] text-amber-600" title="An approver changed the amount">proposed <span className="line-through">{inr(Number(r.proposedAmount))}</span></div>
                    )}
                    {r.dueAmount != null && Number(r.dueAmount) > 0 && <div className="text-[11px] text-gray-400">of {inr(Number(r.dueAmount))} due</div>}
                    {r.invoiceIds.length > 0 && <div className="text-[11px] text-gray-400">{r.invoiceIds.length} bill{r.invoiceIds.length > 1 ? "s" : ""}</div>}
                  </td>
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
      </>
      )}

      {creating && (
        <NewRequest
          defaultProjectId={projectScope ?? null}
          defaultPartyId={creating.partyId ?? null}
          projects={projects}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); setTab("REQUESTS"); void load(); }}
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

/** Everyone we owe, biggest first, with what is already asked for. */
function Payables({
  projectId,
  canRequest,
  reloadKey,
  onRequest,
  onShowRequests,
}: {
  projectId: number | null;
  canRequest: boolean;
  /** Changes whenever the request list reloads, so the requested columns follow. */
  reloadKey: unknown;
  onRequest: (partyId: number) => void;
  onShowRequests: (partyName: string) => void;
}) {
  const [rows, setRows] = useState<Payable[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  useEffect(() => {
    apiRequest<Payable[]>(`${BASE}/payables${projectId ? `?projectId=${projectId}` : ""}`)
      .then((r) => { setRows(r); setError(""); })
      .catch((e) => { setError(e instanceof Error ? e.message : "Couldn't load payables."); setRows([]); });
  }, [projectId, reloadKey]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!onlyFree || r.free > 0) && (!q || [r.partyName, r.partyGroup, r.phone].some((f) => f?.toLowerCase().includes(q))));
  }, [rows, search, onlyFree]);
  const sum = (k: "due" | "requested" | "approved" | "free") => shown.reduce((a, r) => a + Number(r[k]), 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="We owe (total due)" value={inr(sum("due"))} tone="text-rose-600" />
        <Tile label="Asked for, waiting" value={inr(sum("requested"))} tone="text-amber-600" />
        <Tile label="Approved, to pay" value={inr(sum("approved"))} tone="text-sky-700" />
        <Tile label="Not yet requested" value={inr(sum("free"))} tone="text-gray-800" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search party, group, phone…" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-cyan-600" />
          Only not yet requested
        </label>
      </div>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {rows == null ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
      ) : shown.length === 0 ? (
        <VyaparEmpty icon={HandCoins} title={rows.length ? "Nothing matches" : "Nothing owed"} hint="Parties with unpaid purchase bills or credit expenses show here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Party</th>
                <th className="px-3 py-2 text-right font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Requested</th>
                <th className="px-3 py-2 text-right font-medium">Approved</th>
                <th className="px-3 py-2 text-right font-medium">Not requested</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.partyId} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                  <td className="px-3 py-2.5">
                    <Link href={`/vyapar/parties?open=${r.partyId}`} className="font-medium text-gray-800 hover:text-brand-accent hover:underline">{r.partyName}</Link>
                    {(r.partyGroup || r.phone) && <div className="text-[11px] text-gray-400">{[r.partyGroup, r.phone].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-rose-600 tabular-nums">{inr(Number(r.due))}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600 tabular-nums">{Number(r.requested) ? inr(Number(r.requested)) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-sky-700 tabular-nums">{Number(r.approved) ? inr(Number(r.approved)) : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">{inr(Number(r.free))}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {canRequest && (
                        <button onClick={() => onRequest(r.partyId)} className="flex items-center gap-1 rounded-md bg-brand-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                          <Plus size={12} /> Propose payment
                        </button>
                      )}
                      {r.openRequests > 0 && (
                        <button onClick={() => onShowRequests(r.partyName)} className="text-xs text-brand-accent hover:underline">
                          {r.openRequests} open request{r.openRequests > 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewRequest({
  defaultProjectId,
  defaultPartyId,
  projects,
  onClose,
  onSaved,
}: {
  defaultProjectId: number | null;
  defaultPartyId: number | null;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [parties, setParties] = useState<Party[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ? String(defaultProjectId) : "");
  const [partyId, setPartyId] = useState(defaultPartyId ? String(defaultPartyId) : "");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [bills, setBills] = useState<OpenBill[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
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
  // Balance < 0 = we owe them (Vyapar's "To Pay").
  const due = Math.max(0, -(parties.find((p) => String(p.id) === partyId)?.balance ?? 0));

  // The party's unpaid bills — tick some and the amount follows, until it's typed by hand.
  useEffect(() => {
    setBills(null);
    setPicked([]);
    if (!partyId) return;
    apiRequest<OpenBill[]>(`${BASE}/payables/${partyId}/bills`).then(setBills).catch(() => setBills([]));
  }, [partyId]);
  useEffect(() => {
    if (amountTouched) return;
    const fromBills = (bills ?? []).filter((b) => picked.includes(b.id)).reduce((a, b) => a + Number(b.balance), 0);
    setAmount(picked.length ? String(Math.round(fromBills * 100) / 100) : due > 0 ? String(due) : "");
  }, [picked, bills, due, amountTouched]);

  async function save() {
    if (!partyId) return setError("Pick the party to be paid.");
    if (!(Number(amount) > 0)) return setError("Enter the amount needed.");
    setSaving(true);
    setError("");
    try {
      await apiRequest(BASE, {
        method: "POST",
        body: {
          projectId: projectId ? Number(projectId) : null,
          partyId: Number(partyId),
          amount: Number(amount),
          against,
          neededBy: neededBy || null,
          note: note.trim() || null,
          invoiceIds: picked,
        },
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
          <Select value={partyId} onChange={(v) => { setPartyId(v); setAmountTouched(false); }} placeholder="Select party" options={partyOptions} />
        </DrawerField>
        {partyId && (
          <div className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-600">Total due to this party</span>
              <span className="font-semibold text-rose-600">{inr(due)}</span>
            </div>
            {bills == null ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-400"><Spinner size={12} /> Loading bills…</div>
            ) : bills.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400">No unpaid bills — the payment will go on account.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                <p className="px-3 pt-2 text-[11px] text-gray-400">Tick the bills this should clear (optional). Oldest are settled first.</p>
                {bills.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={picked.includes(b.id)}
                      onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id)))}
                      className="accent-cyan-600"
                    />
                    <span className="flex-1 truncate text-gray-700">{b.type} {b.number || "—"}</span>
                    <span className="text-[11px] text-gray-400">{b.date ? bookDate(b.date) : ""}</span>
                    <span className="w-24 text-right font-medium text-gray-800 tabular-nums">{inr(Number(b.balance))}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Amount to pay now" required>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
              className="input"
              placeholder="0"
            />
            {due > 0 && Number(amount) > due && <p className="mt-1 text-[11px] text-amber-600">More than the {inr(due)} due — the extra is an advance.</p>}
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
  const [amount, setAmount] = useState(String(row.amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    if (approve && !(Number(amount) > 0)) return setError("Enter the amount you approve.");
    setBusy(true);
    setError("");
    try {
      await apiRequest(`${BASE}/${row.id}/decide`, {
        method: "POST",
        body: { approve, note: note.trim() || null, amount: approve ? Number(amount) : null },
      });
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
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5 text-xs">
          <div><div className="text-gray-400">Due to party</div><div className="font-semibold text-rose-600">{row.dueAmount != null ? inr(Number(row.dueAmount)) : "—"}</div></div>
          <div><div className="text-gray-400">Proposed by {row.requestedByName?.split(" ")[0] ?? "requester"}</div><div className="font-semibold text-gray-800">{inr(Number(row.proposedAmount ?? row.amount))}</div></div>
          <div><div className="text-gray-400">Now</div><div className="font-semibold text-gray-800">{inr(Number(row.amount))}</div></div>
        </div>
        {approve && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Amount to approve</span>
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
            {Number(amount) !== Number(row.amount) && <span className="mt-1 block text-[11px] text-amber-600">You are changing the amount from {inr(Number(row.amount))}.</span>}
          </label>
        )}
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
