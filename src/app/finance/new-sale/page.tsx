"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText, IndianRupee, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LineItemsEditor, type LineDraft } from "@/components/LineItemsEditor";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";
import { inrNumber } from "@/lib/format";

function amountInWords(value: number): string {
  if (value <= 0) return "Zero Rupees only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(n: number): string {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
  }
  function three(n: number): string {
    return `${n >= 100 ? ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : ""}${n % 100 ? two(n % 100) : ""}`;
  }
  let words = "";
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const rest = value % 1000;
  if (crore) words += `${two(crore)} Crore `;
  if (lakh) words += `${two(lakh)} Lakh `;
  if (thousand) words += `${two(thousand)} Thousand `;
  if (rest) words += three(rest);
  return `${words.trim()} Rupees only`;
}

export default function NewSaleInvoicePage() {
  const router = useRouter();
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const items = useAppStore((s) => s.items);
  const saleInvoices = useAppStore((s) => s.saleInvoices);
  const transactions = useAppStore((s) => s.transactions);
  const addTransaction = useAppStore((s) => s.addTransaction);

  const clients = parties.filter((p) => p.type === "Client");
  const [partyId, setPartyId] = useState(clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [date, setDate] = useState("02-Jul-2026");
  const [received, setReceived] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([{ itemId: items[0]?.id ?? "", qty: 1 }]);

  const salesCount = saleInvoices.length + transactions.filter((t) => t.type === "Sales Invoice").length;
  const invoiceNumber = `INV-2026-${String(1000 + salesCount).padStart(4, "0")}`;

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => {
      const item = items.find((i) => i.id === l.itemId);
      return sum + (item ? item.rate * l.qty : 0);
    }, 0);
    const gst = lines.reduce((sum, l) => {
      const item = items.find((i) => i.id === l.itemId);
      return sum + (item ? (item.rate * l.qty * item.gstRate) / 100 : 0);
    }, 0);
    const total = Math.round(subtotal + gst);
    const balance = Math.max(0, total - (Number(received) || 0));
    return { subtotal, gst: Math.round(gst), total, balance };
  }, [lines, items, received]);

  const party = parties.find((p) => p.id === partyId);

  function save() {
    if (!partyId || !projectId) return;
    const receivedAmount = Math.min(Number(received) || 0, totals.total);
    const fullyPaid = receivedAmount >= totals.total && totals.total > 0;
    addTransaction({
      type: "Sales Invoice",
      partyId,
      projectId,
      date,
      amount: totals.total,
      description: `${invoiceNumber} · ${lines.length} item(s)`,
      paid: fullyPaid,
    });
    if (receivedAmount > 0) {
      addTransaction({
        type: "Payment In",
        partyId,
        projectId,
        date,
        amount: receivedAmount,
        description: `Received against ${invoiceNumber}`,
        paid: true,
      });
    }
    router.push("/finance");
  }

  return (
    <AppShell title="Finance">
      <Link
        href="/finance"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-accent"
      >
        <ChevronLeft size={15} />
        Back to Finance
      </Link>

      <div className="grid gap-6 xl:grid-cols-[1fr_460px]">
        {/* Left: form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-800">New Sale Invoice</h2>
          <p className="mb-6 text-sm text-gray-400">
            Invoice is created in less than a minute.
          </p>

          <div className="mb-5 grid grid-cols-2 gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FileText size={16} className="text-brand-accent" />
                Invoice Details :
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div>Invoice Number : {invoiceNumber.replace("INV-2026-", "")}</div>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Invoice Date</span>
                  <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                </label>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <UserRound size={16} className="text-brand-accent" />
                Bill To :
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Customer Name*</span>
                  <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="input">
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Project</span>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-dashed border-cyan-200 bg-cyan-50/40 p-4">
            <LineItemsEditor items={items} lines={lines} onChange={setLines} />
          </div>

          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ShieldCheck size={16} className="text-brand-accent" />
            Invoice Calculation :
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">Invoice Amount*</span>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <IndianRupee size={13} className="text-gray-400" />
                {inrNumber(totals.total)}
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-400">Received</span>
              <input
                type="number"
                min={0}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                className="input"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg bg-green-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Balance</span>
            <span className="text-base font-semibold text-green-600">
              {formatRupee(totals.balance)}
            </span>
          </div>

          <button
            onClick={save}
            className="mt-6 w-full rounded-full bg-brand-accent py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Create Invoice
          </button>
        </div>

        {/* Right: live Tax Invoice preview */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 text-center text-base font-semibold text-gray-800">Tax Invoice</div>
          <div className="rounded-lg border border-gray-200 p-4 text-sm">
            <div className="mb-4 text-center text-sm font-bold tracking-wide text-gray-800">
              TAX INVOICE
            </div>
            <div className="mb-4 flex justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-700">Bill To</div>
                <div className="text-xs text-gray-500">{party?.name ?? "—"}</div>
                {party?.gstin && <div className="text-xs text-gray-400">GSTIN: {party.gstin}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-gray-700">Invoice Details</div>
                <div className="text-xs text-cyan-500">Invoice No. #{invoiceNumber.slice(-4)}</div>
                <div className="text-xs text-gray-500">Date : {date}</div>
              </div>
            </div>
            <table className="mb-4 w-full border-collapse text-xs">
              <thead>
                <tr className="bg-cyan-400 text-left text-white">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Item name</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5 text-right">Price/ Unit</th>
                  <th className="px-2 py-1.5 text-right">Amt</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const item = items.find((it) => it.id === l.itemId);
                  if (!item) return null;
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-gray-500">{i + 1}</td>
                      <td className="px-2 py-1.5 text-gray-700">{item.name}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{l.qty}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">₹ {inrNumber(item.rate)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        ₹ {inrNumber(item.rate * l.qty)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-gray-700">Total</td>
                  <td className="px-2 py-1.5 text-right text-gray-700">
                    {lines.reduce((s, l) => s + l.qty, 0)}
                  </td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-right text-gray-700">
                    ₹ {inrNumber(totals.subtotal)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between gap-4">
              <div className="flex-1">
                <div className="bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                  Amount In Words -
                </div>
                <div className="px-2 py-1 text-xs text-gray-500 italic">
                  {amountInWords(totals.total)}
                </div>
              </div>
              <div className="w-40 text-xs">
                <div className="flex justify-between px-2 py-1 text-gray-600">
                  <span>Sub Total</span>
                  <span>₹ {inrNumber(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between px-2 py-1 text-gray-600">
                  <span>GST</span>
                  <span>₹ {inrNumber(totals.gst)}</span>
                </div>
                <div className="flex justify-between bg-cyan-400 px-2 py-1 font-semibold text-white">
                  <span>Total</span>
                  <span>₹ {inrNumber(totals.total)}</span>
                </div>
                <div className="flex justify-between px-2 py-1 font-medium text-gray-700">
                  <span>Balance Due</span>
                  <span>₹ {inrNumber(totals.balance)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
