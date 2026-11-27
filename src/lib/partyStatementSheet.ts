/**
 * One party's ledger as Vyapar's "Party statement" sheet.
 *
 * Vyapar's layout, column for column: Date · Txn Type · Ref No. · Payment Status · Total ·
 * Received / Paid · Txn Balance · Receivable Balance · Payable Balance. It opens on a
 * "Receivable / Payable Beginning Balance" row, hangs each bill's items under it, prints a payment's
 * description and payment type beneath it, and closes on a grey Total row carrying the balance.
 *
 * The running balance is worked **backwards from the party's own balance** — the figure the server
 * keeps and every other screen shows — so the statement always closes on that number and the
 * beginning balance is whatever is left once the period's entries are taken off it.
 */

import * as vyapar from "./vyaparApi";
import { fullInvoiceNo, type Party, type Payment } from "./vyaparApi";
import { bookDate, inr, qty, toIsoDate } from "./format";
import type { ReportPrintDetail, ReportPrintExtras } from "./vyaparExport";

type Cell = string | number | null | undefined;

/** Documents that add to what the party owes us; the rest of the posted ones add to what we owe. */
const RECEIVABLE_DOCS = new Set(["SALE", "PURCHASE_RETURN"]);
const PAYABLE_DOCS = new Set(["PURCHASE", "EXPENSE", "SALE_RETURN"]);

const TXN_TYPE: Record<string, string> = {
  SALE: "Sale",
  PURCHASE: "Purchase",
  SALE_RETURN: "Credit Note",
  PURCHASE_RETURN: "Debit Note",
  EXPENSE: "Expense",
};

interface Entry {
  date: string;
  /** Ties on a date: documents before the money that settles them, then by id. */
  order: number;
  /** What this entry does to the party's balance; positive = they owe us more. */
  effect: number;
  cells: Cell[];
  lines: Cell[][];
  subTotal: number | null;
  note: string | null;
  paymentType: string | null;
}

export interface PartyStatementSheet {
  title: string;
  subtitle: string;
  head: string[];
  rows: Cell[][];
  extras: ReportPrintExtras;
}

export async function partyStatementSheet(
  party: Party,
  range: { from: string; to: string },
  projectId?: number,
): Promise<PartyStatementSheet> {
  const [allInvoices, allPayments] = await Promise.all([
    vyapar.getInvoices(undefined, projectId),
    vyapar.getPayments(undefined, projectId),
  ]);
  const invoices = allInvoices.filter((i) => i.partyId === party.id || i.transferToPartyId === party.id);
  // The payments list carries each payment's linked amount but not which documents it settled,
  // and that is what tells a linked receipt from money taken with the bill itself.
  const payments: Payment[] = await Promise.all(
    allPayments
      .filter((p) => p.partyId === party.id)
      .map(async (p) =>
        p.linkedAmount > 0 && !(p.links ?? []).length ? { ...p, links: await vyapar.getPaymentLinks(p.id).catch(() => []) } : p,
      ),
  );
  const linked = new Map<number, number>();
  for (const p of payments) for (const l of p.links ?? []) linked.set(l.invoiceId, (linked.get(l.invoiceId) ?? 0) + l.amount);

  const entries: Entry[] = [];
  for (const inv of invoices) {
    if (inv.cancelled) continue;
    const date = toIsoDate(inv.invoiceDate ?? "");
    if (inv.docType === "PARTY_TRANSFER") {
      // Half a transfer moves nothing — the same rule as the server's balance.
      if (inv.transferToPartyId == null) continue;
      const incoming = inv.transferToPartyId === party.id;
      entries.push({
        date,
        order: inv.id * 2,
        effect: incoming ? inv.total : -inv.total,
        cells: [bookDate(inv.invoiceDate), "Party To Party Transfer", fullInvoiceNo(inv), "", inr(inv.total), "", ""],
        lines: [],
        subTotal: null,
        note: inv.description?.trim() || null,
        paymentType: null,
      });
      continue;
    }
    const receivable = RECEIVABLE_DOCS.has(inv.docType);
    if (!receivable && !PAYABLE_DOCS.has(inv.docType)) continue; // estimates, orders, challans post nothing
    // Whatever a bill shows as paid beyond its linked payments was taken with the bill itself and
    // has no payment row of its own, so it comes off this entry's effect.
    const direct = Math.max(0, (inv.paidAmount ?? 0) - (linked.get(inv.id) ?? 0));
    const owed = inv.total - direct;
    entries.push({
      date,
      order: inv.id * 2,
      effect: receivable ? owed : -owed,
      cells: [
        bookDate(inv.invoiceDate),
        TXN_TYPE[inv.docType] ?? inv.docType,
        fullInvoiceNo(inv),
        inv.status,
        inr(inv.total),
        inr(inv.paidAmount ?? 0),
        inr(inv.balance),
      ],
      lines: inv.lines.length
        ? [
            ...inv.lines.map((l, n) => [n + 1, l.itemName, l.hsn?.trim() || "", qty(l.quantity), l.unit ?? "", inr(l.rate), inr(l.amount)]),
            ["", "Total", "", qty(inv.lines.reduce((t, l) => t + l.quantity, 0)), "", "", inr(inv.lines.reduce((t, l) => t + l.amount, 0))],
          ]
        : [],
      subTotal: inv.lines.length ? inv.subTotal : null,
      note: inv.description?.trim() || null,
      paymentType: null,
    });
  }
  for (const p of payments) {
    const isIn = p.direction === "IN";
    entries.push({
      date: toIsoDate(p.paymentDate ?? ""),
      order: 1e12 + p.id,
      effect: isIn ? -p.amount : p.amount,
      cells: [
        bookDate(p.paymentDate),
        isIn ? "Payment-In" : "Payment-Out",
        "",
        p.unusedAmount <= 0.005 ? "Used" : p.linkedAmount > 0.005 ? "Partially Used" : "Unused",
        inr(p.amount),
        inr(p.amount),
        "",
      ],
      lines: [],
      subTotal: null,
      note: p.notes?.trim() || null,
      paymentType: p.mode?.trim() || null,
    });
  }
  // Oldest first so the balance reads down the page; undated entries sink to the end.
  entries.sort((a, b) => {
    const da = a.date || "9999";
    const db = b.date || "9999";
    return da === db ? a.order - b.order : da < db ? -1 : 1;
  });

  // Back from the party's balance: the balance after each entry, newest to oldest.
  const after: number[] = new Array(entries.length);
  let running = party.balance;
  for (let i = entries.length - 1; i >= 0; i--) {
    after[i] = running;
    running -= entries[i].effect;
  }
  const beforeAll = running;

  const inPeriod = (e: Entry) => (!range.from || !e.date || e.date >= range.from) && (!range.to || !e.date || e.date <= range.to);
  const shown = entries.map((e, i) => ({ e, i })).filter(({ e }) => inPeriod(e));
  const firstIndex = shown.length ? shown[0].i : entries.findIndex((e) => !!range.from && !!e.date && e.date >= range.from);
  const opening = firstIndex > 0 ? after[firstIndex - 1] : firstIndex === 0 ? beforeAll : party.balance;
  const closing = shown.length ? after[shown[shown.length - 1].i] : opening;

  const money = (n: number) => inr(Math.abs(Math.round(n * 100) / 100));
  // The balance sits under Receivable when they owe us and under Payable when we owe them.
  const balanceCells = (n: number): [string, string] => (Math.abs(n) < 0.005 ? [money(0), ""] : n > 0 ? [money(n), ""] : ["", money(n)]);

  const head = ["Date", "Txn Type", "Ref No.", "Payment Status", "Total", "Received / Paid", "Txn Balance", "Receivable Balance", "Payable Balance"];
  const openingDate = range.from || shown[0]?.e.date || "";
  const rows: Cell[][] = [
    [
      openingDate ? bookDate(openingDate) : "",
      `${opening < -0.005 ? "Payable" : "Receivable"} Beginning Balance`,
      "",
      "",
      "",
      "",
      money(opening),
      ...balanceCells(opening),
    ],
    ...shown.map(({ e, i }) => [...e.cells, ...balanceCells(after[i])]),
  ];
  const detail: ReportPrintDetail = {
    head: ["#", "Item name", "HSN/ SAC", "Quantity", "Unit", "Price/ Unit", "Amount"],
    alignRightFrom: 3,
    indentCol: 1,
    rows: [[], ...shown.map(({ e }) => e.lines)],
    footer: [[], ...shown.map(({ e }) => (e.subTotal == null ? [] : ([["Sub Total", inr(e.subTotal)]] as [string, string][])))],
    notes: [null, ...shown.map(({ e }) => e.note)],
    extra: [[], ...shown.map(({ e }) => (e.paymentType ? ([["Payment Type", e.paymentType]] as [string, string][]) : []))],
  };

  return {
    title: "Party statement",
    subtitle: [
      `Party name: ${party.name}`,
      party.phone ? `~Contact No.: ${party.phone}` : null,
      range.from || range.to ? `Duration: From ${range.from ? bookDate(range.from) : "the start"} to ${range.to ? bookDate(range.to) : "today"}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    head,
    rows,
    extras: {
      rightAlignFrom: 4,
      detail,
      totals: [["", "Total", "", "", "", "", "", ...balanceCells(closing)]],
    },
  };
}
