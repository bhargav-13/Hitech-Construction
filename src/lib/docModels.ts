/**
 * Print models for the documents Procurement produces — the RFQ and the work order — plus sample
 * documents the Templates screen previews a design against. Layout follows the client's Onsite PDFs
 * line for line: same labels, same columns, same date style ("12-Oct-26").
 */

import { fig, shortDate, type PrintModel } from "./docPdf";
import type { DocKind } from "./docTemplates";
import type { Rfq } from "./procurementApi";
import type { WorkOrder } from "./workOrderApi";
import type { Invoice, Party } from "./vyaparApi";
import { invoicePrintModel } from "./vyaparExport";

export interface PlaceInfo {
  name: string | null;
  address: string | null;
}

/** An enquiry as suppliers receive it. Quantities print to three places, as Onsite's do; no prices. */
export function rfqPrintModel(rfq: Rfq, project?: PlaceInfo | null): PrintModel {
  const site = [rfq.shipToName, rfq.shipToAddress].filter(Boolean).join("\n") || project?.address || "";
  return {
    kind: "RFQ",
    number: rfq.rfqNo,
    meta: [
      ["RFQ No:", rfq.rfqNo],
      ["RFQ Date:", shortDate(rfq.rfqDate)],
    ],
    panels: [
      {
        rows: [
          ["Bidding Start Date:", shortDate(rfq.biddingStartDate) || "—"],
          ["Bidding End Date:", shortDate(rfq.biddingEndDate) || "—"],
          ["Delivery Date:", shortDate(rfq.deliveryDate) || "—"],
        ],
      },
      {
        rows: [
          ["Project Name:", project?.name ?? rfq.title],
          ["Delivery Location:", site || "—"],
        ],
      },
    ],
    columns: [
      { label: "Sr. No.", align: "left", width: 50 },
      { label: "Item Name" },
      { label: "HSN Code", width: 110, key: "hsn" },
      { label: "Qty", align: "right", width: 120 },
    ],
    rows: rfq.lines.map((l, i) => [
      String(i + 1),
      [l.itemName, [l.specification, l.description].filter(Boolean).join(" — ")].filter(Boolean).join("\n"),
      l.hsnCode ?? "",
      `${fig(l.quantity, 3)} ${l.unit ?? ""}`.trim(),
    ]),
    terms: rfq.terms,
    notes: rfq.notes,
  };
}

/** A subcontract order: party and site panels, the measured items, totals and the bank to pay. */
export function workOrderPrintModel(
  wo: WorkOrder,
  opts: { project?: PlaceInfo | null; party?: Pick<Party, "gstin" | "phone" | "billingAddress"> | null } = {},
): PrintModel {
  const { project, party } = opts;
  const rows = wo.items.map((it, i) => [
    String(i + 1),
    it.itemName + (it.description ? `\n${it.description}` : ""),
    `${fig(it.quantity, 3).replace(/\.?0+$/, "") || "0"} ${it.unit ?? ""}`.trim(),
    fig(it.rate, 2).replace(/\.00$/, ""),
    `${wo.taxPercent ?? 0}%`,
    fig(it.amount, 2),
  ]);
  const totals: PrintModel["totals"] = [{ label: "Item Subtotal", value: `Rs. ${fig(wo.itemSubTotal)}` }];
  if (wo.discount) totals.push({ label: "Discount", value: `- Rs. ${fig(wo.discount)}` });
  if (wo.taxAmount) totals.push({ label: `Tax (${wo.taxPercent}%)`, value: `Rs. ${fig(wo.taxAmount)}` });
  if (wo.charges) totals.push({ label: "Additional Charges", value: `Rs. ${fig(wo.charges)}` });
  totals.push({ label: "Total", value: `Rs. ${fig(wo.orderValue)}`, strong: true });

  const bank: [string, string][] = [["Name", wo.bankAccountName || wo.vendorName]];
  if (wo.bankAccountNumber) bank.push(["A/c No.", wo.bankAccountNumber]);
  if (wo.bankIfsc) bank.push(["IFSC", wo.bankIfsc]);
  if (wo.bankName) bank.push(["Bank", wo.bankName]);

  return {
    kind: "WORK_ORDER",
    number: wo.woNo,
    meta: [
      ["Work Order No:", wo.woNo],
      ["Work Order Date:", shortDate(wo.woDate)],
      ["Work Order Title:", wo.title],
    ],
    panels: [
      {
        rows: [
          ["Party:", wo.vendorName],
          ["GST:", party?.gstin || "N/A"],
          ["Mobile:", party?.phone || wo.vendorPhone || "N/A"],
          ["Address:", party?.billingAddress || "N/A"],
        ],
      },
      {
        rows: [
          ["Project:", project?.name ?? "—"],
          ["Site Address:", project?.address ?? "—"],
          ...(wo.startDate || wo.endDate
            ? ([["Duration:", [shortDate(wo.startDate), shortDate(wo.endDate)].filter(Boolean).join(" to ")]] as [string, string][])
            : []),
        ],
      },
    ],
    columns: [
      { label: "S.No.", align: "left", width: 40 },
      { label: "Item Name" },
      { label: "Qty", align: "right", width: 90 },
      { label: "Rate", align: "right", width: 70 },
      { label: "Tax", align: "right", width: 50, key: "tax" },
      { label: "Amount", align: "right", width: 90 },
    ],
    rows,
    totals,
    amountForWords: wo.orderValue,
    bank,
    terms: wo.terms,
    notes: wo.notes,
  };
}

// ---------------------------------------------------------------- samples for the designer

const SAMPLE_INVOICE = (docType: string): Invoice =>
  ({
    id: 0,
    docType,
    invoicePrefix: docType === "PURCHASE_ORDER" ? "PO-" : "",
    invoiceNo: "24",
    invoiceDate: "2026-10-24",
    dueDate: null,
    partyId: null,
    partyName: "Shree Nakoda Cement Products",
    billingName: null,
    billingAddress: "G-2, City Center, Udaipur Road, Nimbahera, Rajasthan 312601",
    billToName: "Hi-Tech Construction",
    billToAddress: "Office No. 420, Level 6, Opp. Imperial Heights, 150 Feet Ring Road, Rajkot, Gujarat 360005",
    billToGstin: "24BKIPP9665F1ZP",
    shipToName: "Sewerage Network Zone 8 & 9 at Ujjain",
    shipToAddress: "Vasant Vihar, Near Taramandal, Nanakheda, Ujjain, Madhya Pradesh 456010",
    shipToGstin: null,
    stateOfSupply: "Madhya Pradesh",
    paymentType: "Cash",
    isCash: false,
    subTotal: 406935,
    discount: 0,
    discountPercent: 0,
    taxAmount: 73248.3,
    roundOff: -0.3,
    total: 480183,
    paidAmount: 0,
    balance: 480183,
    terms:
      "1. Delivery & Delay Penalty: All items must be delivered to the site within 4 days. Any delay will attract a penalty of 0.5% of the PO value per week.\n2. Quality & Rejection: Materials must be brand new and undamaged; defective items are replaced by the vendor within 3 days at their own cost.",
    notes: null,
    lines: [
      { itemId: null, itemName: "SFRC rectangular Manhole Cover and frame (medium duty) 600 x 450 mm", description: null, hsn: "6810", quantity: 265, unit: "nos", rate: 1279, taxPercent: 18, taxCode: "IGST@18%", amount: 399943.3 },
      { itemId: null, itemName: "SFRC rectangular Manhole Cover (medium duty) 600 x 450 mm", description: null, hsn: "6810", quantity: 100, unit: "nos", rate: 680, taxPercent: 18, taxCode: "IGST@18%", amount: 80240 },
    ],
  }) as unknown as Invoice;

const SAMPLE_PARTY = {
  name: "Shree Nakoda Cement Products",
  gstin: "08ADDFS8816L1ZI",
  phone: "98290 00000",
  billingAddress: "G-2, City Center, Udaipur Road",
  city: "Nimbahera",
  state: "Rajasthan",
} as unknown as Party;

/** A believable document of the given kind, for previewing a design before it is saved. */
export async function sampleModel(kind: DocKind): Promise<PrintModel> {
  if (kind === "RFQ") {
    return rfqPrintModel(
      {
        rfqNo: "Sluice & Air Valve7",
        title: "Sluice & Air Valve",
        rfqDate: "2026-10-12",
        biddingStartDate: "2026-10-12",
        biddingEndDate: "2026-10-14",
        deliveryDate: "2026-10-15",
        shipToName: "Sewer Zone 8, 9",
        shipToAddress: "Ujjain, Madhya Pradesh - 456010",
        terms:
          "1. Delivery & Delay Penalty\nAll items must be delivered to the Ujjain site within 4 days. Any delay will attract a penalty of 0.5% of the PO value per week.\n\n2. Quality & Rejection\nMaterials must be brand new and undamaged.",
        notes: null,
        lines: [
          ["110mm 45 degree bend", 1600],
          ["REDUCER 110X90MM", 162],
          ["Reducer 75*110mm", 162],
          ["110mm T-Joint", 1125],
          ["110mm Socket", 2400],
        ].map(([n, q], i) => ({ id: i, itemName: n, quantity: q, unit: "nos", hsnCode: null, specification: null, description: null })),
      } as unknown as Rfq,
      { name: "Sewerage Network Zone 8 & 9 at Ujjain", address: null },
    );
  }
  if (kind === "WORK_ORDER") {
    return workOrderPrintModel(
      {
        woNo: "WO-24",
        title: "Manhole chamber construction",
        woDate: "2026-09-15",
        vendorName: "Hitech Infraspace Pvt Ltd",
        vendorPhone: null,
        startDate: null,
        endDate: null,
        taxPercent: 18,
        discount: 0,
        charges: 0,
        itemSubTotal: 94500,
        taxAmount: 17010,
        orderValue: 111510,
        bankAccountName: "Hitech Infraspace Pvt Ltd",
        bankAccountNumber: "50200012345678",
        bankIfsc: "HDFC0001234",
        bankName: "HDFC Bank",
        terms: "Work to be completed as per drawings and site engineer's instructions.",
        notes: null,
        items: [
          { itemName: "PCC M15 in chamber base", description: null, quantity: 0.945, unit: "cum", rate: 100000, amount: 94500 },
        ],
      } as unknown as WorkOrder,
      { project: { name: "Sewerage Network Zone 8 & 9 at Ujjain", address: "Vasant Vihar, Nanakheda, Ujjain" } },
    );
  }
  const docType = kind === "REPORT" || kind === "PAYSLIP" ? "SALE" : kind;
  const model = await invoicePrintModel(SAMPLE_INVOICE(docType), SAMPLE_PARTY, [], undefined);
  return { ...model, kind };
}
