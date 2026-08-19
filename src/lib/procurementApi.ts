import { apiRequest } from "./api";

/**
 * Mirrors procurement-service (com.hitech.erp.procurement). Requests for quotation, the quotes
 * against them, and the award decision.
 *
 * Two shapes carry the whole design:
 *
 *  - A quote is priced **per line** (`QuoteLine.rate`), and `rate: null` means the vendor did not
 *    quote that line. It is never 0 — a blank that reads as free has caused real mistakes on a
 *    comparative statement.
 *  - An award is made **per line** (`RfqLine.awardedVendorPartyId`). A five-line enquiry commonly
 *    splits across three suppliers, so awarding produces one Vyapar purchase order per winning
 *    vendor rather than one per enquiry.
 *
 * Vendors are Vyapar parties; procurement keeps no vendor list of its own. The server resolves and
 * sends the name alongside the id so the comparison can label a dozen columns without a second
 * round trip.
 */

export type RfqStatus = "Draft" | "Sent" | "Responses In" | "Awarded" | "Closed";

export interface RfqLine {
  id: number;
  itemId: number | null;
  itemName: string;
  /** Brand/spec sub-line printed under the item name, e.g. "Kirloskar, IVI, GM". */
  specification: string | null;
  /** Suppliers need it to quote tax correctly. */
  hsnCode: string | null;
  /** Overrides the document's delivery date when one line is wanted earlier. */
  deliveryDate: string | null;
  unit: string | null;
  quantity: number;
  /** From a vendor rate card, where one exists. Null means nothing to judge against. */
  budgetRate: number | null;
  awardedVendorPartyId: number | null;
  awardedVendorName: string | null;
  awardReason: string | null;
  sortOrder: number;
}

export interface QuoteLine {
  rfqLineId: number;
  /** Null = this vendor did not quote this line. */
  rate: number | null;
  /** Vendors sometimes quote a different quantity (pack sizes); null means "as asked". */
  quantity: number | null;
  note: string | null;
}

export interface Quote {
  id: number;
  vendorPartyId: number;
  vendorName: string;
  version: number;
  receivedOn: string | null;
  deliveryDays: number | null;
  discount: number;
  charges: number;
  taxPercent: number;
  note: string | null;
  /** BUYER = keyed in here, VENDOR = the supplier filled it in from their link. */
  source: "BUYER" | "VENDOR";
  /** A submitted quote locks so it cannot be revised quietly; unlock invites a revision. */
  locked: boolean;
  submittedAt: string | null;
  lines: QuoteLine[];
}

/** A supplier the enquiry went to — invited is not the same as replied. */
export interface RfqSupplier {
  id: number;
  vendorPartyId: number;
  vendorName: string;
  phone: string | null;
  email: string | null;
  sentAt: string | null;
  responded: boolean;
  /** Present once the enquiry has been sent — the secret in this supplier's quote link. */
  shareToken: string | null;
  /** When they last opened it. "Never opened" is a different problem from "no reply". */
  openedAt: string | null;
}

export interface Rfq {
  id: number;
  rfqNo: string;
  title: string;
  projectId: number | null;
  status: RfqStatus;
  rfqDate: string | null;
  dueBy: string | null;
  /** ITEM = tax per line, BILL = one rate on the whole bill. */
  taxType: "ITEM" | "BILL";
  biddingStartDate: string | null;
  biddingEndDate: string | null;
  deliveryDate: string | null;
  terms: string | null;
  billToName: string | null;
  billToAddress: string | null;
  billToGstin: string | null;
  shipToName: string | null;
  shipToAddress: string | null;
  shipToGstin: string | null;
  shipSameAsBill: boolean;
  notes: string | null;
  lines: RfqLine[];
  suppliers: RfqSupplier[];
  quotes: Quote[];
}

export interface RfqInput {
  title: string;
  /** Editable on the form; blank asks the server for the next running number. */
  rfqNo?: string | null;
  projectId?: number | null;
  /** Only "Closed" is honoured; every other status is derived from the data. */
  status?: RfqStatus;
  rfqDate?: string | null;
  dueBy?: string | null;
  taxType?: "ITEM" | "BILL";
  biddingStartDate?: string | null;
  biddingEndDate?: string | null;
  deliveryDate?: string | null;
  terms?: string | null;
  billToName?: string | null;
  billToAddress?: string | null;
  billToGstin?: string | null;
  shipToName?: string | null;
  shipToAddress?: string | null;
  shipToGstin?: string | null;
  shipSameAsBill?: boolean;
  notes?: string | null;
  lines: {
    /** Present when editing an existing line — keeps the prices already quoted against it. */
    id?: number;
    itemId?: number | null;
    itemName: string;
    specification?: string | null;
    hsnCode?: string | null;
    deliveryDate?: string | null;
    unit?: string | null;
    quantity: number;
    budgetRate?: number | null;
  }[];
  /** Party ids to invite; replaces the current list. Anyone who already quoted is kept. */
  supplierPartyIds?: number[];
}

export interface QuoteInput {
  vendorPartyId: number;
  receivedOn?: string | null;
  deliveryDays?: number | null;
  discount?: number;
  charges?: number;
  taxPercent?: number;
  note?: string | null;
  lines: { rfqLineId: number; rate: number | null; quantity?: number | null; note?: string | null }[];
}

const BASE = "/api/v1/procurement/rfqs";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const parts = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return parts.length ? `?${parts.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
};

export const getRfqs = (projectId?: number) => apiRequest<Rfq[]>(`${BASE}${qs({ projectId })}`);
export const getRfq = (id: number) => apiRequest<Rfq>(`${BASE}/${id}`);

export const createRfq = (body: RfqInput) => apiRequest<Rfq>(BASE, { method: "POST", body });
export const updateRfq = (id: number, body: RfqInput) => apiRequest<Rfq>(`${BASE}/${id}`, { method: "PUT", body });
export const deleteRfq = (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });

/** Record what a vendor came back with. A second save from the same vendor bumps the version. */
export const saveQuote = (rfqId: number, body: QuoteInput) =>
  apiRequest<Rfq>(`${BASE}/${rfqId}/quotes`, { method: "PUT", body });

export const deleteQuote = (rfqId: number, quoteId: number) =>
  apiRequest<Rfq>(`${BASE}/${rfqId}/quotes/${quoteId}`, { method: "DELETE" });

/** Award one line, or clear it by passing null. Returns the whole RFQ so status stays in step. */
export const awardLine = (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) =>
  apiRequest<Rfq>(`${BASE}/${rfqId}/lines/${lineId}/award`, {
    method: "PUT",
    body: { vendorPartyId, reason: reason ?? null },
  });

/**
 * Send the enquiry: the server mints one quote link per supplier and stamps them sent.
 *
 * Passing no ids sends to everyone on the enquiry. Resending is safe — a supplier who already has
 * a link keeps it, so a second send does not break one already sitting in somebody's chat.
 */
export const sendRfq = (rfqId: number, supplierPartyIds?: number[]) =>
  apiRequest<Rfq>(`${BASE}/${rfqId}/send`, { method: "PUT", body: { supplierPartyIds: supplierPartyIds ?? [] } });

/** Reopen a supplier's link so they can revise. Our decision, not theirs. */
export const unlockQuote = (rfqId: number, quoteId: number) =>
  apiRequest<Rfq>(`${BASE}/${rfqId}/quotes/${quoteId}/unlock`, { method: "PUT" });

/** The public quote page for one supplier. Built from a token, not an id. */
export const quoteLink = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/quote/${token}`;

// ---- Supplier-facing (no login) ----

/** One line as the supplier sees it. No budget rate: that is the number we are not anchoring them to. */
export interface PublicRfqLine {
  id: number;
  itemName: string;
  specification: string | null;
  hsnCode: string | null;
  unit: string | null;
  quantity: number;
  deliveryDate: string | null;
  /** Their own price from a previous submission, so the form reopens filled in. */
  rate: number | null;
  note: string | null;
}

export interface PublicRfq {
  rfqNo: string;
  title: string;
  buyerName: string | null;
  vendorName: string | null;
  rfqDate: string | null;
  biddingEndDate: string | null;
  deliveryDate: string | null;
  terms: string | null;
  shipToName: string | null;
  shipToAddress: string | null;
  /** False once the window has closed or the quote is submitted; the form goes read-only. */
  acceptingQuotes: boolean;
  closedReason: string | null;
  alreadySubmitted: boolean;
  submittedAt: string | null;
  deliveryDays: number | null;
  discount: number | null;
  charges: number | null;
  taxPercent: number | null;
  note: string | null;
  lines: PublicRfqLine[];
}

export interface PublicQuoteInput {
  deliveryDays?: number | null;
  discount?: number | null;
  charges?: number | null;
  taxPercent?: number | null;
  note?: string | null;
  lines: { rfqLineId: number; rate: number | null; quantity?: number | null; note?: string | null }[];
}

const PUBLIC = "/api/v1/public/rfq";

/** `auth: false` on purpose — the supplier has no login; the token in the URL is the credential. */
export const getPublicRfq = (token: string) => apiRequest<PublicRfq>(`${PUBLIC}/${token}`, { auth: false });

export const submitPublicQuote = (token: string, body: PublicQuoteInput) =>
  apiRequest<PublicRfq>(`${PUBLIC}/${token}/quote`, { method: "POST", body, auth: false });
