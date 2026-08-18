/**
 * Procurement — RFQ and quote comparison.
 *
 * Still UI-first and seeded, like Tender and Payroll started: the seed is realistic enough to
 * design against, and the shapes here are the ones the backend will take.
 *
 * The module used to model the whole chain (indent → RFQ → PO → GRN → bill) in demo data. Purchase
 * orders, receipts and vendors were removed once it was clear Vyapar already holds all three for
 * real. What remains is the sourcing middle: ask several suppliers, compare what comes back, and
 * decide who gets each line.
 *
 * The important shape change: **a quote is priced per line, and an award is made per line.** A
 * five-line enquiry routinely ends up split across three suppliers — cheapest cement here, fastest
 * steel there — and the old model (one winner per RFQ) could not say that.
 */

export type Priority = "High" | "Medium" | "Low";

export type RfqStatus = "Draft" | "Sent" | "Responses In" | "Awarded" | "Closed";

/** One vendor's price for one line of the enquiry. */
export interface QuoteLine {
  /** Null when the vendor did not quote this line — rendered as "no quote", never as zero. */
  rate: number | null;
  /** Vendors sometimes quote a different quantity (pack sizes); null means "as asked". */
  qty?: number | null;
  note?: string;
}

/** Everything one vendor came back with. */
export interface VendorQuote {
  vendor: string;
  /** Quotes get revised; keep the version so the comparison can say which one it is showing. */
  version: number;
  receivedOn?: string;
  /** Whole-quote terms, applied after the lines are totalled. */
  deliveryDays: number | null;
  discount?: number;
  charges?: number;
  taxPercent?: number;
  /** Vendor track record, 0–5, carried from the party. */
  rating?: number;
  note?: string;
  /** Priced per RFQ line, index-aligned with `Rfq.lines`. */
  lines: QuoteLine[];
}

export interface RfqLine {
  itemName: string;
  unit: string;
  qty: number;
  /**
   * The agreed rate for this item with the winning vendor, where a rate card exists. Quotes are
   * judged against it, so the screen can say "cheapest, and still above what we agreed in April"
   * rather than only "cheapest of these three".
   */
  budgetRate?: number | null;
  /** Set on the comparison screen. Null until decided. */
  awardedTo?: string | null;
  /** Why this vendor, when it isn't the cheapest — the sentence someone asks for months later. */
  awardReason?: string;
}

export interface Rfq {
  id: string;
  number: string;
  title: string;
  project: string;
  date: string;
  /** The window vendors may respond in. */
  dueBy?: string;
  status: RfqStatus;
  lines: RfqLine[];
  quotes: VendorQuote[];
}

// =====================================================================================
//  SEED
// =====================================================================================

export const RFQ_SEED: Rfq[] = [
  {
    id: "rfq-8",
    number: "RFQ-2026-08",
    title: "Valves — Pedak Road chambers",
    project: "Pedak Road (D.I. Pipeline)",
    date: "05 Aug 2026",
    dueBy: "12 Aug 2026",
    status: "Responses In",
    lines: [
      { itemName: "450MM Sluice Valve", unit: "Nos", qty: 1, budgetRate: 1_40_000, awardedTo: null },
      { itemName: "150MM Air Valve", unit: "Nos", qty: 3, budgetRate: 18_000, awardedTo: null },
    ],
    quotes: [
      {
        vendor: "Omaxe Trading", version: 1, receivedOn: "03 Aug 2026", deliveryDays: 12, rating: 3,
        taxPercent: 18,
        lines: [{ rate: 1_55_051 }, { rate: null, note: "Not stocked" }],
      },
      {
        vendor: "GM Engineering", version: 1, receivedOn: "03 Aug 2026", deliveryDays: 7, rating: 4,
        taxPercent: 18,
        lines: [{ rate: 1_06_290 }, { rate: 19_460 }],
      },
      {
        vendor: "Indian Valve International", version: 2, receivedOn: "04 Aug 2026", deliveryDays: 5, rating: 4,
        taxPercent: 18, discount: 2_000,
        lines: [{ rate: 1_08_400 }, { rate: 17_900, note: "Kirloskar" }],
      },
      {
        vendor: "Flowcen Global", version: 1, receivedOn: "03 Aug 2026", deliveryDays: 18, rating: 2,
        taxPercent: 18,
        lines: [{ rate: 1_02_500, note: "Ex-works Coimbatore" }, { rate: 21_200 }],
      },
    ],
  },
  {
    id: "rfq-7",
    number: "RFQ-2026-07",
    title: "Cement & steel — slab casting",
    project: "Pedak Road (D.I. Pipeline)",
    date: "05 Aug 2026",
    dueBy: "10 Aug 2026",
    status: "Responses In",
    lines: [
      { itemName: "Cement OPC 53", unit: "Bag", qty: 100, budgetRate: 375, awardedTo: null },
      { itemName: "TMT Bar 12mm", unit: "Kg", qty: 500, budgetRate: 61, awardedTo: null },
    ],
    quotes: [
      {
        vendor: "Adarsh Cement Traders", version: 1, receivedOn: "05 Aug 2026", deliveryDays: 2, rating: 4,
        taxPercent: 18,
        lines: [{ rate: 380 }, { rate: null }],
      },
      {
        vendor: "Nakoda Cement Products", version: 1, receivedOn: "05 Aug 2026", deliveryDays: 4, rating: 4,
        taxPercent: 18,
        lines: [{ rate: 372 }, { rate: null }],
      },
      {
        vendor: "Shakti Steel Corporation", version: 1, receivedOn: "06 Aug 2026", deliveryDays: 5, rating: 3,
        taxPercent: 18,
        lines: [{ rate: null }, { rate: 62 }],
      },
      {
        vendor: "National Engineering Works", version: 1, receivedOn: "06 Aug 2026", deliveryDays: 9, rating: 3,
        taxPercent: 18,
        lines: [{ rate: null }, { rate: 60.8, note: "Lowest, but longest lead time" }],
      },
    ],
  },
  {
    id: "rfq-6",
    number: "RFQ-2026-06",
    title: "SFRC Rectangular Pipe — 60 Nos",
    project: "RMC D.I. Pipeline - Phase 2",
    date: "30 Jul 2026",
    status: "Awarded",
    lines: [{ itemName: "SFRC Rectangular Pipe", unit: "Nos", qty: 60, budgetRate: 3_050, awardedTo: "Bharat Pipe Industries" }],
    quotes: [
      { vendor: "Bharat Pipe Industries", version: 1, receivedOn: "31 Jul 2026", deliveryDays: 6, rating: 3, taxPercent: 18, lines: [{ rate: 3_100 }] },
      { vendor: "Signet Industries Ltd", version: 1, receivedOn: "31 Jul 2026", deliveryDays: 8, rating: 4, taxPercent: 18, lines: [{ rate: 3_200 }] },
    ],
  },
  {
    id: "rfq-5",
    number: "RFQ-2026-05",
    title: "Diesel — 200 Litre",
    project: "Ishwariya (Gram Panchayat) Amreli",
    date: "03 Aug 2026",
    dueBy: "09 Aug 2026",
    status: "Sent",
    lines: [{ itemName: "Diesel", unit: "Litre", qty: 200, awardedTo: null }],
    quotes: [],
  },
];
