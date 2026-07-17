"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  Download,
  Filter,
  Landmark,
  MoreVertical,
  Plus,
  Search,
  Star,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CreateTransactionMenu } from "@/components/CreateTransactionMenu";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { PaymentRequestModal } from "@/components/PaymentRequestModal";
import { BankAccountModal } from "@/components/BankAccountModal";
import { PartyModal } from "@/components/PartyModal";
import { useAppStore } from "@/lib/store";
import { formatRupee, projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { txnStyle } from "@/lib/txnDisplay";
import type { TxnType } from "@/lib/types";

const TABS = ["Party", "Transaction", "Payment Requests", "Accounts"] as const;
type Tab = (typeof TABS)[number];

export default function FinancePage() {
  const router = useRouter();
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const transactions = useAppStore((s) => s.transactions);
  const paymentRequests = useAppStore((s) => s.paymentRequests);
  const accounts = useAppStore((s) => s.accounts);

  const [tab, setTab] = useState<Tab>("Party");
  const [txnType, setTxnType] = useState<TxnType | null>(null);
  const [showParty, setShowParty] = useState(false);
  const [showPayReq, setShowPayReq] = useState(false);
  const [showBank, setShowBank] = useState(false);

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "—";
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  const partyTotals = useMemo(() => {
    const toReceive = parties.reduce((s, p) => s + p.toReceive, 0);
    const toPay = parties.reduce((s, p) => s + p.toPay, 0);
    return { toReceive, toPay, advancePaid: 8806202, advanceReceived: 1435409 };
  }, [parties]);

  const txnTotals = useMemo(() => {
    const sales = transactions.filter((t) => t.category === "Sales");
    const expense = transactions.filter((t) => t.category === "Expense");
    const totalInvoice = sales.reduce((s, t) => s + t.amount, 0);
    const unpaidInvoice = sales.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0);
    const totalExpense = expense.reduce((s, t) => s + t.amount, 0);
    const unpaidExpense = expense.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0);
    const inSum = transactions.filter((t) => t.flow === "in" && t.paid).reduce((s, t) => s + t.amount, 0);
    const outSum = transactions.filter((t) => t.flow === "out" && t.paid).reduce((s, t) => s + t.amount, 0);
    const balance = accounts.reduce((s, a) => s + a.balance, 0);
    return { totalInvoice, unpaidInvoice, totalExpense, unpaidExpense, inSum, outSum, balance };
  }, [transactions, accounts]);

  function handlePick(type: TxnType) {
    if (type === "Sales Invoice") {
      router.push("/finance/new-sale");
      return;
    }
    setTxnType(type);
  }

  return (
    <AppShell title="Finance">
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap ${
              tab === t
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ---------------- PARTY TAB ---------------- */}
      {tab === "Party" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <BalanceCard label="Advance Paid" value={partyTotals.advancePaid} tone="green" />
            <BalanceCard label="To Pay" value={partyTotals.toPay} tone="rose" />
            <BalanceCard label="To Receive" value={partyTotals.toReceive} tone="pink" />
            <BalanceCard label="Advance Received" value={partyTotals.advanceReceived} tone="green" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <Search size={15} className="text-gray-400" />
                <input placeholder="Search party" className="w-40 text-sm outline-none" readOnly />
              </div>
              <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                <Filter size={14} />
                Filter
              </button>
            </div>
            <button
              onClick={() => setShowParty(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={15} />
              New Party
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {parties.map((p) => {
              const net = p.toReceive - p.toPay;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${projectAvatarColor(p.id)}`}
                  >
                    {projectInitials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        {p.type}
                      </span>
                      <span className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={11}
                            className={i < p.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {net === 0 ? (
                      <span className="text-sm text-gray-400">₹ 0</span>
                    ) : net > 0 ? (
                      <div>
                        <div className="text-sm font-semibold text-green-600">{formatRupee(net)}</div>
                        <div className="text-[11px] text-gray-400">To Receive</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-semibold text-rose-600">{formatRupee(-net)}</div>
                        <div className="text-[11px] text-gray-400">To Pay</div>
                      </div>
                    )}
                  </div>
                  <MoreVertical size={16} className="text-gray-300" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- TRANSACTION TAB ---------------- */}
      {tab === "Transaction" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                <Filter size={14} />
                Filter
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                <Calendar size={14} />
                Date Filter
              </button>
              <span className="flex items-center gap-1 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-600">
                Unbilled Materials
                <span className="rounded-full bg-cyan-600 px-1.5 text-white">71</span>
              </span>
              <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-600">
                Pending Entries
                <span className="rounded-full bg-amber-500 px-1.5 text-white">12</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
                <Download size={16} />
              </button>
              <CreateTransactionMenu onPick={handlePick} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard
              icon={<Wallet size={22} />}
              label="Total Invoice"
              value={formatRupee(txnTotals.totalInvoice)}
              sub={`Unpaid: ${formatRupee(txnTotals.unpaidInvoice)}`}
              tint="text-cyan-500"
            />
            <SummaryCard
              icon={<Landmark size={22} />}
              label="Total Expense"
              value={formatRupee(txnTotals.totalExpense)}
              sub={`Unpaid: ${formatRupee(txnTotals.unpaidExpense)}`}
              tint="text-rose-500"
            />
            <SummaryCard
              icon={<Wallet size={22} />}
              label="Company Balance"
              value={formatRupee(txnTotals.balance)}
              sub={`In: ${formatRupee(txnTotals.inSum)} · Out: ${formatRupee(txnTotals.outSum)}`}
              tint="text-green-500"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[1.6fr_1.4fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              <div>Party</div>
              <div>Details</div>
              <div className="text-right">Amount</div>
            </div>
            {transactions.map((t) => {
              const style = txnStyle(t.type, t.flow);
              const Icon =
                t.flow === "in" ? ArrowDownLeft : t.flow === "out" ? ArrowUpRight : ArrowLeftRight;
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1.6fr_1.4fr_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${style.tint}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{partyName(t.partyId)}</div>
                      <div className="text-xs text-gray-400">
                        {t.type} · {t.date}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-700">{t.description}</div>
                    <div className="truncate text-xs text-gray-400">{projectName(t.projectId)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${style.amountColor}`}>
                      {style.sign}
                      {formatRupee(t.amount)}
                    </div>
                    {!t.paid && <div className="text-[11px] text-amber-500">Unpaid</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- PAYMENT REQUESTS TAB ---------------- */}
      {tab === "Payment Requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
              <Calendar size={14} />
              Date Filter
            </button>
            <button
              onClick={() => setShowPayReq(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={15} />
              Payment Request
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[1.6fr_1.6fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              <div>Party Name</div>
              <div>Project Name</div>
              <div className="text-right">Amount</div>
            </div>
            {paymentRequests.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1.6fr_1.6fr_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
              >
                <div>
                  <div className="text-sm font-medium text-gray-800">{partyName(r.partyId)}</div>
                  <div className="text-xs text-gray-400">Payment Request {r.number}</div>
                </div>
                <div>
                  <div className="truncate text-sm text-gray-700">{projectName(r.projectId)}</div>
                  <div className="text-xs text-gray-400">{r.against}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-800">{formatRupee(r.amount)}</div>
                  <span
                    className={`text-[11px] font-medium ${
                      r.status === "Paid" ? "text-green-600" : "text-amber-500"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- ACCOUNTS TAB ---------------- */}
      {tab === "Accounts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Company Cash &amp; Bank Accounts</h2>
            <button
              onClick={() => setShowBank(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={15} />
              New Bank Account
            </button>
          </div>

          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      a.type === "Cash" ? "bg-green-50 text-green-600" : "bg-cyan-50 text-cyan-600"
                    }`}
                  >
                    {a.type === "Cash" ? <Wallet size={20} /> : <Landmark size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{a.name}</span>
                      {a.isPrimary && (
                        <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-600">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    {a.accountNo && <div className="text-xs text-gray-400">A/C: {a.accountNo}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-800">{formatRupee(a.balance)}</div>
                  <button className="text-xs font-medium text-brand-accent hover:underline">View Statement</button>
                </div>
              </div>
              {a.type === "Bank" && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-50 pt-3 text-xs md:grid-cols-3">
                  <Field label="AC Holder" value={a.acHolder} />
                  <Field label="IFSC Code" value={a.ifsc} />
                  <Field label="UPI" value={a.upi} />
                  <Field label="Opening Balance" value={a.openingBalance ? formatRupee(a.openingBalance) : "—"} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {txnType && <TransactionFormModal type={txnType} onClose={() => setTxnType(null)} />}
      {showParty && <PartyModal onClose={() => setShowParty(false)} />}
      {showPayReq && <PaymentRequestModal onClose={() => setShowPayReq(false)} />}
      {showBank && <BankAccountModal onClose={() => setShowBank(false)} />}
    </AppShell>
  );
}

function BalanceCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "rose" | "pink";
}) {
  const bg =
    tone === "green" ? "bg-green-50" : tone === "rose" ? "bg-rose-50" : "bg-pink-50";
  const text =
    tone === "green" ? "text-green-700" : tone === "rose" ? "text-rose-600" : "text-pink-600";
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <div className={`text-sm font-medium ${text}`}>{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-800">{formatRupee(value)}</div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tint: string;
}) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
        <div className="mt-0.5 text-xs text-gray-400">{sub}</div>
      </div>
      <div className={tint}>{icon}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="text-gray-700">{value || "—"}</div>
    </div>
  );
}
