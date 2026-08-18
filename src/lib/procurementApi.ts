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
  lines: QuoteLine[];
}

export interface Rfq {
  id: number;
  rfqNo: string;
  title: string;
  projectId: number | null;
  status: RfqStatus;
  rfqDate: string | null;
  dueBy: string | null;
  notes: string | null;
  lines: RfqLine[];
  quotes: Quote[];
}

export interface RfqInput {
  title: string;
  projectId?: number | null;
  /** Only "Closed" is honoured; every other status is derived from the data. */
  status?: RfqStatus;
  rfqDate?: string | null;
  dueBy?: string | null;
  notes?: string | null;
  lines: {
    /** Present when editing an existing line — keeps the prices already quoted against it. */
    id?: number;
    itemId?: number | null;
    itemName: string;
    unit?: string | null;
    quantity: number;
    budgetRate?: number | null;
  }[];
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
