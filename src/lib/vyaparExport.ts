/**
 * Shared export helpers for the Vyapar module: Excel (CSV), a print-ready sheet, and a real
 * branded PDF (jsPDF + autotable — genuine vector text, not a screenshot or a print-dialog).
 */

import { getFirmProfile, DOC_LABEL, type FirmProfile, type Invoice, type Party } from "./vyaparApi";

type Cell = string | number | null | undefined;

let firmProfileCache: FirmProfile | null | undefined;

/** Fetches the firm's letterhead once per page load and reuses it for every PDF after that. */
async function getCachedFirmProfile(): Promise<FirmProfile | null> {
  if (firmProfileCache !== undefined) return firmProfileCache;
  try {
    firmProfileCache = await getFirmProfile();
  } catch {
    firmProfileCache = null;
  }
  return firmProfileCache;
}

/** Call after the firm profile is edited so the next PDF picks up the change immediately. */
export function clearFirmProfileCache() {
  firmProfileCache = undefined;
}

/** Download rows as a CSV that Excel opens natively. */
export function exportRowsToCsv(filename: string, head: string[], rows: Cell[][]) {
  const esc = (c: Cell) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  // The BOM makes Excel read UTF-8 (and ₹) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a clean, print-ready sheet in a new window, letterheaded with the firm's logo and
 * details when a profile has been set up.
 */
export async function printRows(title: string, head: string[], rows: Cell[][], subtitle?: string) {
  const w = window.open("", "_blank", "width=980,height=720");
  if (!w) return;
  const firm = await getCachedFirmProfile();
  const esc = (v: Cell) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const letterhead = firm?.businessName || firm?.logoDataUrl
    ? `<div class="letterhead">
        ${firm.logoDataUrl ? `<img src="${firm.logoDataUrl}" alt="" />` : ""}
        <div>
          ${firm.businessName ? `<div class="biz">${esc(firm.businessName)}</div>` : ""}
          <div class="biz-meta">${[firm.address, firm.gstin ? `GSTIN ${firm.gstin}` : null, firm.phone, firm.email].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
      </div>`
    : "";
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
<meta charset="utf-8" />
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px}
  .letterhead{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #e2e8f0}
  .letterhead img{height:44px;width:44px;object-fit:contain}
  .biz{font-size:15px;font-weight:700}
  .biz-meta{font-size:11px;color:#64748b;margin-top:2px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;font-weight:600}
  td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  td:nth-child(n+4){text-align:right}
  .footer-note{margin-top:16px;font-size:11px;color:#94a3b8}
  @media print{body{margin:12mm} .noprint{display:none}}
</style></head><body>
${letterhead}
<h1>${esc(title)}</h1>
<div class="sub">${esc(subtitle ?? "")}${subtitle ? " · " : ""}Generated ${new Date().toLocaleString("en-IN")}</div>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
${firm?.footerNote ? `<div class="footer-note">${esc(firm.footerNote)}</div>` : ""}
<script>window.onload=()=>window.print()</script>
</body></html>`);
  w.document.close();
}

/** Parse a pasted/uploaded CSV into rows. Handles quoted cells and embedded commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Natural pixel size of a data-URL image, needed to draw a logo without distorting it. */
function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("logo failed to load"));
    img.src = dataUrl;
  });
}

/**
 * Download a real, selectable-text PDF (not a screenshot). Uses jsPDF + autotable so the file
 * has proper vector text, repeating headers and page numbers — letterheaded with the firm's
 * logo and details from Vyapar Settings ▸ Firm Profile when one has been set up.
 */
export async function downloadPdf(
  title: string,
  head: string[],
  rows: Cell[][],
  opts?: { subtitle?: string; landscape?: boolean; rightAlignFrom?: number }
) {
  const [{ jsPDF }, autoTableMod, firm] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getCachedFirmProfile(),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;

  const doc = new jsPDF({ orientation: opts?.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let headerBottom = 34;
  let textX = margin;

  // ---- Letterhead: logo + business name/GSTIN/address, when a firm profile is set up ----
  if (firm?.logoDataUrl) {
    try {
      const { width, height } = await imageSize(firm.logoDataUrl);
      const logoH = 34;
      const logoW = Math.min(70, logoH * (width / height));
      doc.addImage(firm.logoDataUrl, "PNG", margin, 20, logoW, logoH);
      textX = margin + logoW + 12;
    } catch {
      // A broken logo shouldn't block the export.
    }
  }
  if (firm?.businessName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(firm.businessName, textX, 34);

    const metaLine = [firm.address, firm.gstin ? `GSTIN ${firm.gstin}` : null, firm.phone, firm.email].filter(Boolean).join("  ·  ");
    if (metaLine) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(metaLine, textX, 47, { maxWidth: pageWidth - textX - margin });
    }
    headerBottom = 62;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
    headerBottom += 20;
  }
  doc.setTextColor(0);

  // ---- Document title ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, headerBottom);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const sub = `${opts?.subtitle ? opts.subtitle + "  ·  " : ""}Generated ${new Date().toLocaleString("en-IN")}`;
  doc.text(sub, margin, headerBottom + 16);
  doc.setTextColor(0);

  // jsPDF's built-in fonts have no rupee glyph, so render it as "Rs." in the PDF only.
  const clean = (c: Cell) => String(c ?? "").replace(/₹/g, "Rs.");
  const from = opts?.rightAlignFrom;
  const columnStyles: Record<number, { halign: "right" }> = {};
  if (from != null) for (let i = from; i < head.length; i++) columnStyles[i] = { halign: "right" };

  autoTable(doc, {
    head: [head.map(clean)],
    body: rows.map((r) => r.map(clean)),
    startY: headerBottom + 30,
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: margin, right: margin, bottom: 46 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageH - 34, pageWidth - margin, pageH - 34);
      doc.setFontSize(8);
      doc.setTextColor(150);
      if (firm?.footerNote) doc.text(firm.footerNote, margin, pageH - 20, { maxWidth: pageWidth - margin * 2 - 60 });
      doc.text(`Page ${page}`, pageWidth - margin, pageH - 20, { align: "right" });
      doc.setTextColor(0);
    },
  });

  doc.save(`${title.replace(/[^\w\-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Download one sale/purchase document as a proper invoice PDF — letterhead, bill-to, the line
 * item table and totals — rather than a screenshot of the on-screen list.
 */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigitWords(n: number): string {
  if (n >= 100) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigitWords(n % 100) : "");
  return twoDigitWords(n);
}

/** Indian numbering (lakh/crore) amount-in-words, for the invoice total. */
function amountInWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  const parts = [
    crore ? `${threeDigitWords(crore)} Crore` : "",
    lakh ? `${threeDigitWords(lakh)} Lakh` : "",
    thousand ? `${threeDigitWords(thousand)} Thousand` : "",
    rest ? threeDigitWords(rest) : "",
  ].filter(Boolean);
  return `Rupees ${parts.join(" ")} Only`;
}

/**
 * Download one sale/purchase document as a proper GST tax-invoice PDF — bordered header meta,
 * bill-to panel, itemised table with tax split, a boxed totals summary and amount-in-words —
 * built to match how a real printed Vyapar invoice reads, not a plain export sheet.
 */
export async function downloadInvoicePdf(invoice: Invoice, party?: Party | null) {
  const [{ jsPDF }, autoTableMod, firm] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getCachedFirmProfile(),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
  const gray = (n: number) => doc.setTextColor(n, n, n);
  const setFill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  // ---- The ERP's own palette, so an invoice looks like it came from this product ----
  const NAVY = [14, 42, 71] as const;        // --sidebar-bg
  const NAVY_SOFT = [19, 53, 90] as const;   // --navy-soft
  const CYAN = [8, 145, 178] as const;       // --brand-accent
  const INK = [15, 23, 42] as const;
  const HAIRLINE = [226, 232, 240] as const;

  // ---- Branded header band ----
  const bandH = 92;
  setFill(NAVY);
  doc.rect(0, 0, pageWidth, bandH, "F");
  // A cyan keyline along the bottom of the band, echoing the sidebar's active accent.
  setFill(CYAN);
  doc.rect(0, bandH - 3, pageWidth, 3, "F");

  let textX = margin;
  if (firm?.logoDataUrl) {
    try {
      const { width, height } = await imageSize(firm.logoDataUrl);
      const logoH = 38;
      const logoW = Math.min(78, logoH * (width / height));
      // White plate behind the logo so dark-on-transparent marks stay legible on navy.
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin - 4, 22, logoW + 8, logoH + 8, 4, 4, "F");
      doc.addImage(firm.logoDataUrl, "PNG", margin, 26, logoW, logoH);
      textX = margin + logoW + 16;
    } catch {
      // A broken logo shouldn't block the export.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(firm?.businessName ?? "Tax Invoice", textX, 44);
  const metaLine = [firm?.address, firm?.gstin ? `GSTIN ${firm.gstin}` : null, firm?.phone, firm?.email]
    .filter(Boolean)
    .join("   ·   ");
  if (metaLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(186, 214, 235);
    doc.text(metaLine, textX, 58, { maxWidth: pageWidth - textX - margin - 150 });
  }

  // ---- Document title + number, right-aligned inside the band ----
  const docTitle = (DOC_LABEL[invoice.docType] ?? "Document").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(docTitle, pageWidth - margin, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 228, 245);
  doc.text(`# ${invoice.invoiceNo}`, pageWidth - margin, 60, { align: "right" });

  let y = bandH + 22;

  // ---- Bill To (left) + invoice meta (right), each in a titled panel ----
  const panelTop = y;
  const panelW = contentWidth / 2 - 8;
  const billToX = margin;
  const metaX = margin + panelW + 16;
  const headerH = 20;

  // Panel header strips.
  setFill(NAVY_SOFT);
  doc.rect(billToX, panelTop, panelW, headerH, "F");
  doc.rect(metaX, panelTop, panelW, headerH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("BILL TO", billToX + 10, panelTop + 13.5);
  doc.text("INVOICE DETAILS", metaX + 10, panelTop + 13.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  setText(INK);
  doc.text(party?.name ?? invoice.partyName ?? "Cash", billToX + 10, panelTop + headerH + 18);

  let billLine = panelTop + headerH + 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  gray(90);
  const billDetails = [
    party?.billingAddress,
    [party?.city, party?.state].filter(Boolean).join(", ") || null,
    party?.gstin ? `GSTIN: ${party.gstin}` : null,
    party?.phone ? `Phone: ${party.phone}` : null,
  ].filter(Boolean) as string[];
  for (const d of billDetails) {
    doc.text(d, billToX + 10, billLine, { maxWidth: panelW - 20 });
    billLine += 12;
  }

  let metaLine2 = panelTop + headerH + 16;
  doc.setFontSize(9);
  const metaRows: [string, string][] = [
    ["Invoice Date", invoice.invoiceDate ?? "—"],
    ...(invoice.dueDate ? ([["Due Date", invoice.dueDate]] as [string, string][]) : []),
    ...(invoice.stateOfSupply ? ([["Place of Supply", invoice.stateOfSupply]] as [string, string][]) : []),
    ["Payment Type", invoice.isCash || invoice.paidAmount > 0 ? invoice.paymentType : "Credit"],
  ];
  for (const [label, value] of metaRows) {
    doc.setFont("helvetica", "normal");
    gray(110);
    doc.text(label, metaX + 10, metaLine2);
    doc.setFont("helvetica", "bold");
    setText(INK);
    doc.text(value, metaX + panelW - 10, metaLine2, { align: "right" });
    metaLine2 += 14;
  }

  const panelBottom = Math.max(billLine, metaLine2) + 8;
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.setLineWidth(0.75);
  doc.rect(billToX, panelTop, panelW, panelBottom - panelTop);
  doc.rect(metaX, panelTop, panelW, panelBottom - panelTop);
  doc.setTextColor(0);
  y = panelBottom + 20;

  // ---- Line items — taxable value shown separately from the tax charged on it ----
  const sameState =
    !!invoice.stateOfSupply && !!firm?.state && invoice.stateOfSupply.trim().toLowerCase() === firm.state.trim().toLowerCase();
  autoTable(doc, {
    head: [["#", "Item", "Qty", "Rate", "Taxable Value", "GST%", "GST Amt", "Amount"]],
    body: invoice.lines.map((l, i) => {
      // Derive the split from the line's own amount/tax% rather than trust a stored per-line
      // taxAmount — it isn't always populated, and this stays exactly consistent with the total.
      const taxable = l.taxPercent ? l.amount / (1 + l.taxPercent / 100) : l.amount;
      const taxAmt = l.amount - taxable;
      return [
        String(i + 1),
        l.itemName + (l.description ? `\n${l.description}` : ""),
        `${l.quantity}${l.unit ? " " + l.unit : ""}`,
        rs(l.rate),
        rs(taxable),
        l.taxPercent ? `${l.taxPercent}%` : "—",
        taxAmt ? rs(taxAmt) : "—",
        rs(l.amount),
      ];
    }),
    startY: y,
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [...HAIRLINE], lineWidth: 0.5, valign: "middle" },
    headStyles: { fillColor: [...NAVY], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 251, 253] },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      2: { halign: "right", cellWidth: 46 },
      3: { halign: "right", cellWidth: 56 },
      4: { halign: "right", cellWidth: 68 },
      5: { halign: "right", cellWidth: 36 },
      6: { halign: "right", cellWidth: 56 },
      7: { halign: "right", cellWidth: 64 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      gray(150);
      doc.text(`Page ${page}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      doc.setTextColor(0);
    },
  });

  // ---- Totals — boxed summary, GST split into CGST/SGST for an intra-state supply ----
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  const boxW = 220;
  const boxX = pageWidth - margin - boxW;
  const rowH = 15;
  const taxableAmount = invoice.subTotal;
  const rows: [string, string, boolean][] = [
    ["Taxable Amount", rs(taxableAmount), false],
    ...(invoice.discount > 0 ? ([["Discount", `- ${rs(invoice.discount)}`, false]] as [string, string, boolean][]) : []),
    ...(invoice.taxAmount > 0
      ? sameState
        ? ([
            ["CGST", rs(invoice.taxAmount / 2), false],
            ["SGST", rs(invoice.taxAmount / 2), false],
          ] as [string, string, boolean][])
        : ([["IGST", rs(invoice.taxAmount), false]] as [string, string, boolean][])
      : []),
    ...(invoice.roundOff !== 0 ? ([["Round Off", (invoice.roundOff >= 0 ? "+ " : "- ") + rs(Math.abs(invoice.roundOff)), false]] as [string, string, boolean][]) : []),
  ];
  const grandH = 26;
  const boxH = rowH * rows.length + 16 + grandH + (invoice.paidAmount || invoice.balance ? rowH * 2 : 0);
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.setLineWidth(0.75);
  doc.rect(boxX, afterTable, boxW, boxH);

  let ty = afterTable + 16;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    gray(90);
    doc.text(label, boxX + 12, ty);
    setText(INK);
    doc.text(value, boxX + boxW - 12, ty, { align: "right" });
    ty += rowH;
  }

  // Grand total sits in a navy band so it reads first.
  const grandY = ty - 10;
  setFill(NAVY);
  doc.rect(boxX, grandY, boxW, grandH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(255, 255, 255);
  doc.text("Grand Total", boxX + 12, grandY + 17);
  doc.text(rs(invoice.total), boxX + boxW - 12, grandY + 17, { align: "right" });
  ty = grandY + grandH + 15;
  if (invoice.paidAmount) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    gray(90);
    doc.text(invoice.docType === "PURCHASE" ? "Paid" : "Received", boxX + 12, ty);
    doc.setTextColor(16, 129, 87);
    doc.text(rs(invoice.paidAmount), boxX + boxW - 12, ty, { align: "right" });
    ty += rowH;
  }
  if (invoice.balance > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(190, 40, 40);
    doc.text("Balance Due", boxX + 12, ty);
    doc.text(rs(invoice.balance), boxX + boxW - 12, ty, { align: "right" });
  }
  doc.setTextColor(0);

  // ---- Amount in words, in a tinted callout beside the totals ----
  const wordsW = contentWidth - boxW - 16;
  const wordsY = afterTable;
  doc.setFillColor(240, 250, 253);
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.rect(margin, wordsY, wordsW, 44, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(CYAN);
  doc.text("AMOUNT IN WORDS", margin + 10, wordsY + 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(INK);
  doc.text(amountInWords(invoice.total), margin + 10, wordsY + 30, { maxWidth: wordsW - 20 });

  let noteY = Math.max(afterTable + boxH, wordsY + 44) + 26;

  // ---- Terms (left) + signature block (right) ----
  const sigX = pageWidth - margin - 160;
  if (invoice.terms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(CYAN);
    doc.text("TERMS & CONDITIONS", margin, noteY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    gray(90);
    doc.text(invoice.terms, margin, noteY + 12, { maxWidth: sigX - margin - 20 });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  gray(90);
  doc.text(`For ${firm?.businessName ?? ""}`.trim(), sigX, noteY, { align: "left" });
  doc.setDrawColor(200, 200, 200);
  doc.line(sigX, noteY + 44, pageWidth - margin, noteY + 44);
  doc.setFontSize(8);
  gray(120);
  doc.text("Authorized Signatory", sigX, noteY + 56);
  doc.setTextColor(0);
  noteY += 76;

  if (firm?.footerNote) {
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.75);
    doc.line(margin, noteY - 12, pageWidth - margin, noteY - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    gray(150);
    doc.text(firm.footerNote, margin, noteY, { maxWidth: contentWidth });
  }

  doc.save(`${invoice.invoiceNo || docTitle}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
