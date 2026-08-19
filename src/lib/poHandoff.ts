"use client";

/**
 * Carries an awarded RFQ into Vyapar's purchase-order form.
 *
 * The award already knows everything the PO needs — who won, at what rate, for how much, against
 * which project, wanted by when. Landing on a blank form after that decision means keying all of it
 * again off the screen you just left, which is both slow and the point at which a rate gets typed
 * wrong.
 *
 * Held in `sessionStorage` rather than the URL: a five-line award does not fit in a query string,
 * and prices and vendor names have no business sitting in a browser history entry. It is read once
 * and cleared, so pressing "Add Purchase Order" an hour later opens a genuinely blank form rather
 * than resurrecting a stale draft.
 */

const KEY = "hitech_po_draft";

export interface PoDraftLine {
  itemId: number | null;
  itemName: string;
  /** The RFQ line's specification, carried into Vyapar's per-line description. */
  description: string;
  /** Already mapped to Vyapar's unit codes — see `vyaparUnit()`. */
  unit: string;
  quantity: number;
  rate: number;
  taxCode: string;
}

export interface PoDraft {
  /** Where this came from, so the PO can say so on its face. */
  rfqId: number;
  rfqNo: string;
  partyId: number | null;
  partyName: string | null;
  projectId: number | null;
  orderDate: string | null;
  /** The date the material is wanted — Vyapar's Due Date on an order. */
  deliveryDate: string | null;
  terms: string | null;
  notes: string | null;
  /** The vendor's whole-quote discount, in rupees. */
  discountAmount: number;
  lines: PoDraftLine[];
}

/** Vyapar's own unit codes. Anything we cannot map lands on NONE rather than an invalid option. */
const UNIT_CODES: Record<string, string> = {
  nos: "NOS",
  no: "NOS",
  pcs: "PCS",
  piece: "PCS",
  set: "PCS",
  kg: "KG",
  kgs: "KG",
  mt: "TON",
  ton: "TON",
  tonne: "TON",
  mtr: "MTR",
  m: "MTR",
  metre: "MTR",
  meter: "MTR",
  sqm: "SQM",
  cum: "CUM",
  bag: "BAG",
  bags: "BAG",
  box: "BOX",
  ltr: "LTR",
  litre: "LTR",
  liter: "LTR",
  l: "LTR",
  hour: "HOUR",
  hr: "HOUR",
};

export const vyaparUnit = (unit: string | null | undefined) =>
  UNIT_CODES[(unit ?? "").trim().toLowerCase()] ?? "NONE";

/** Park a draft for the purchase-order screen to pick up on the next navigation. */
export function stashPoDraft(draft: PoDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* private mode, or the quota is full — the form simply opens blank */
  }
}

/** Read the draft and clear it. One-shot on purpose; see the note at the top. */
export function takePoDraft(): PoDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as PoDraft) : null;
  } catch {
    return null;
  }
}
