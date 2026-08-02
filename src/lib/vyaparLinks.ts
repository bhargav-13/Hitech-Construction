/**
 * Cross-links between Vyapar records. A party's ledger and an item's stock ledger both list
 * documents by a short label (from the backend `docLabel`) plus a `kind`. These helpers turn one
 * of those rows into the route that opens the underlying document, so ledgers become navigable
 * instead of dead text.
 *
 * Deep-linking convention: every list page opens a specific record when visited with `?open=<id>`
 * (see InvoiceWorkspace / PaymentWorkspace / ExpenseWorkspace).
 */

import type { PartyLedgerRow, ItemLedgerRow } from "./vyaparApi";

/** Backend `docLabel` output → the /vyapar route segment that lists that document type. */
const LABEL_TO_SLUG: Record<string, string> = {
  Sale: "sale",
  Purchase: "purchase",
  "Credit Note": "sale-return",
  "Debit Note": "purchase-return",
  Estimate: "estimate",
  Proforma: "proforma",
  "Sale Order": "sale-order",
  "Purchase Order": "purchase-order",
  "Delivery Challan": "delivery-challan",
  Expense: "expenses",
  "Payment-In": "payment-in",
  "Payment-Out": "payment-out",
};

/**
 * The route that opens the document behind a party-ledger row, or null when there's nothing to
 * open (an unmapped/synthetic row). Payments route to their register; documents to their list.
 */
export function partyLedgerHref(row: Pick<PartyLedgerRow, "kind" | "type" | "id">): string | null {
  if (row.kind === "PAYMENT") {
    const slug = LABEL_TO_SLUG[row.type];
    return slug ? `/vyapar/${slug}?open=${row.id}` : null;
  }
  const slug = LABEL_TO_SLUG[row.type];
  return slug ? `/vyapar/${slug}?open=${row.id}` : null;
}

/**
 * The route that opens the document behind an item's stock-ledger row. Manual stock adjustments
 * ("Stock Added"/"Stock Reduced") have no document, so they return null.
 */
export function itemLedgerHref(row: Pick<ItemLedgerRow, "type" | "id">): string | null {
  const slug = LABEL_TO_SLUG[row.type];
  return slug ? `/vyapar/${slug}?open=${row.id}` : null;
}
