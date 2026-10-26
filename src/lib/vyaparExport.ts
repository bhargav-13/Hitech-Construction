/**
 * Shared export helpers for the Vyapar module: Excel (CSV), a print-ready sheet, and a real
 * branded PDF (jsPDF + autotable — genuine vector text, not a screenshot or a print-dialog).
 */

import {
  getBankAccounts,
  getFirmProfile,
  fullInvoiceNo,
  DOC_LABEL,
  type BankAccount,
  type FirmProfile,
  type Invoice,
  type InvoiceLine,
  type Party,
} from "./vyaparApi";
import { apiRequest, getActiveCompanyId } from "./api";
import type { Company } from "./companyScope";
import { getAmountDecimals } from "./format";
import { gstRate } from "./gstRates";
import { getTemplate, type DocKind, type DocTemplate } from "./docTemplates";
import type { PrintModel } from "./docPdf";

type Cell = string | number | null | undefined;

let firmProfileCache: FirmProfile | null | undefined;

/**
 * The letterhead to stamp on this document, fetched once per page load.
 *
 * Two records can describe the firm, for historical reasons: the newer per-company record behind
 * Settings ▸ Companies, and the older per-user Vyapar ▸ Settings ▸ Firm Profile. The company record
 * wins field by field, with the legacy profile filling any gap — so books set up before companies
 * existed keep printing exactly as they did, and a second firm only has to be entered in one place.
 *
 * Without this, an R.P. Enterprise invoice printed blank: its name, GSTIN and logo had been entered
 * against the company, and the exporter was still reading the empty legacy profile.
 */
/**
 * The bank account whose details belong on a printed document.
 *
 * Cash & Bank has carried a "print bank details on invoice" toggle since it was built and nothing
 * ever read it, so a customer got an invoice with no account to pay into — the client's "bank
 * account is not showing, they added account also".
 *
 * The document's own settlement account wins when it has one: that is the account this bill was
 * actually taken through. Otherwise the first active account flagged for printing. Cash carries no
 * details worth printing, so an account with neither a number nor a UPI id is skipped.
 */
let bankAccountsCache: BankAccount[] | undefined;

async function printableBankAccount(invoice: Invoice): Promise<BankAccount | null> {
  if (bankAccountsCache === undefined) {
    bankAccountsCache = await getBankAccounts().catch(() => []);
  }
  const hasDetails = (a: BankAccount) => !!(a.accountNumber?.trim() || a.upiId?.trim());
  const own = bankAccountsCache.find((a) => a.id === invoice.bankAccountId);
  if (own && hasDetails(own)) return own;
  return bankAccountsCache.find((a) => a.isActive && a.printBankDetails && hasDetails(a)) ?? null;
}

export async function getCachedFirmProfile(): Promise<FirmProfile | null> {
  if (firmProfileCache !== undefined) return firmProfileCache;
  const [company, legacy] = await Promise.all([
    apiRequest<Company[]>("/api/v1/companies")
      .then((list) => list.find((c) => c.id === getActiveCompanyId()) ?? null)
      .catch(() => null),
    getFirmProfile().catch(() => null),
  ]);
  const pick = (a: string | null | undefined, b: string | null | undefined) =>
    a && String(a).trim() ? a : (b ?? null);
  firmProfileCache = company
    ? {
        businessName: pick(company.name, legacy?.businessName),
        address: pick(
          [company.address, [company.city, company.state].filter(Boolean).join(", ")]
            .filter((s) => s && String(s).trim())
            .join(", "),
          legacy?.address
        ),
        phone: pick(company.phone, legacy?.phone),
        email: pick(company.email, legacy?.email),
        gstin: pick(company.gstin, legacy?.gstin),
        state: pick(company.state, legacy?.state),
        logoDataUrl: pick(company.logoDataUrl, legacy?.logoDataUrl),
        footerNote: pick(company.footerNote, legacy?.footerNote),
      }
    : legacy;
  return firmProfileCache;
}

/** Call after the firm profile is edited so the next PDF picks up the change immediately. */
export function clearFirmProfileCache() {
  firmProfileCache = undefined;
}

/**
 * A titled block written above the table — who this sheet is about.
 *
 * The PDF and the print-out have always carried the party's name, GSTIN and balance at the top; the
 * spreadsheet dropped straight into the column headers, so an exported ledger arrived with no
 * indication of whose it was. Passing this puts the same identity on the sheet.
 */
export interface SheetHeading {
  title: string;
  /** Label/value pairs, written one per row beneath the title. Blank values are dropped. */
  meta?: [string, Cell][];
}

/** The heading as spreadsheet rows: title, each meta pair, then a blank separator. */
function headingRows(heading: SheetHeading | undefined, width: number): Cell[][] {
  if (!heading) return [];
  const pad = (cells: Cell[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  const rows: Cell[][] = [pad([heading.title])];
  for (const [label, value] of heading.meta ?? []) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    rows.push(pad([label, value]));
  }
  rows.push(pad([]));
  return rows;
}

/** Download rows as a CSV that Excel opens natively. */
export function exportRowsToCsv(filename: string, head: string[], rows: Cell[][], heading?: SheetHeading) {
  const esc = (c: Cell) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [...headingRows(heading, head.length), head, ...rows]
    .map((r) => r.map(esc).join(","))
    .join("\n");
  // The BOM makes Excel read UTF-8 (and ₹) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A rectangle of cells to merge, in the shape SheetJS wants (0-based, inclusive). */
export interface CellMerge {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

/**
 * Download a real .xlsx, optionally with merged cells.
 *
 * CSV has no concept of a merged cell — it is one value per comma, full stop — so a sales register
 * expanded to one row per line item had to repeat the invoice's date, number and party against
 * every one of its items. This writes a genuine spreadsheet instead, where an invoice's own columns
 * span its item rows and read as a single cell.
 *
 * `xlsx` is loaded on demand: it is a large dependency and only this one action needs it.
 */
export async function exportRowsToXlsx(
  filename: string,
  head: string[],
  rows: Cell[][],
  merges: CellMerge[] = [],
  heading?: SheetHeading
) {
  const XLSX = await import("xlsx");
  const above = headingRows(heading, head.length);
  const sheet = XLSX.utils.aoa_to_sheet([...above, head, ...rows]);
  // Everything below the heading block shifts down by that many rows, header row included.
  const offset = above.length;
  const allMerges = merges.map((m) => ({
    s: { r: m.startRow + offset + 1, c: m.startCol },
    e: { r: m.endRow + offset + 1, c: m.endCol },
  }));
  if (above.length) {
    // The title spans the table's full width so it reads as a caption, not a stray cell.
    allMerges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, head.length - 1) } });
    const titleCell = sheet[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };
  }
  if (allMerges.length) sheet["!merges"] = allMerges;
  // Rough auto-width: the widest value in each column, clamped so one long address doesn't
  // push the money columns off the screen.
  // Measured from the table only: the heading's long title would otherwise blow out column A.
  sheet["!cols"] = head.map((h, c) => {
    const widest = rows.reduce((w, r) => Math.max(w, String(r[c] ?? "").length), h.length);
    return { wch: Math.min(42, Math.max(9, widest + 2)) };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Export");
  XLSX.writeFile(book, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

/**
 * Open a clean, print-ready sheet in a new window, letterheaded with the firm's logo and
 * details when a profile has been set up.
 */
export async function printRows(title: string, head: string[], rows: Cell[][], subtitle?: string) {
  const w = window.open("", "_blank", "width=980,height=720");
  if (!w) return;
  const [firm, appLogo] = await Promise.all([getCachedFirmProfile(), getAppLogo()]);
  const esc = (v: Cell) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Same fallback as the PDF letterhead: the product's own mark until a firm logo is uploaded.
  const mark = firm?.logoDataUrl || appLogo;
  const letterhead = firm?.businessName || mark
    ? `<div class="letterhead">
        ${mark ? `<img src="${mark}" alt="" />` : ""}
        <div>
          ${firm?.businessName ? `<div class="biz">${esc(firm.businessName)}</div>` : ""}
          <div class="biz-meta">${[firm?.address, firm?.gstin ? `GSTIN ${firm.gstin}` : null, firm?.phone, firm?.email].filter(Boolean).map(esc).join(" · ")}</div>
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

let appLogoCache: string | null | undefined;

/**
 * The product's own mark, read out of `/public`, used as the letterhead logo when the firm profile
 * has none uploaded. Every invoice was coming out logo-less simply because nobody had been through
 * Settings ▸ Firm Profile to upload one; falling back to the app's logo means a document looks
 * right on day one, and an uploaded logo still wins the moment there is one.
 */
export async function getAppLogo(): Promise<string | null> {
  if (appLogoCache !== undefined) return appLogoCache;
  try {
    appLogoCache = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("logo failed to load"));
      img.onload = () => {
        // Downscaled to the same 220px the firm-profile uploader enforces. jsPDF embeds the
        // decoded bitmap, so handing it the full 834×834 source made every invoice a 2 MB file
        // for a logo that prints 38pt tall.
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = "/logo.png";
    });
  } catch {
    appLogoCache = null;
  }
  return appLogoCache;
}

/** Natural pixel size of a data-URL image, needed to draw a logo without distorting it. */
export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("logo failed to load"));
    img.src = dataUrl;
  });
}

/**
 * The first two digits of a GSTIN are the state code (24 = Gujarat, 27 = Maharashtra …). Comparing
 * those is the only reliable read on whether a supply crossed a state border: the place-of-supply
 * field is free text a clerk may leave blank, and the firm profile's `state` is optional and was in
 * practice never filled in — which is exactly why every invoice was printing IGST.
 */
function stateCodeOf(gstin: string | null | undefined): string | null {
  const m = String(gstin ?? "").trim().match(/^(\d{2})/);
  return m ? m[1] : null;
}

/** One rate slab on the invoice's tax summary — a GST invoice has to show the split rate-wise. */
interface TaxBucket {
  percent: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface TaxSplit {
  buckets: TaxBucket[];
  cgst: number;
  sgst: number;
  igst: number;
  /** True when nothing on the document carries a levy — the summary is then not worth printing. */
  empty: boolean;
}

/**
 * Split a document's tax into CGST/SGST (intra-state) or IGST (inter-state), rate by rate.
 *
 * The levy is read off each line's own `taxCode` — `GST@18%` is the intra-state pair, `IGST@18%`
 * the single inter-state levy — because that is precisely what the user picked in the Tax column.
 * Lines saved before the Tax column became a code carry only a bare percentage; those fall back to
 * the supply's geography, comparing GSTIN state codes first and the place-of-supply text second.
 */
function splitTax(lines: InvoiceLine[], firm: FirmProfile | null, party: Party | null | undefined, stateOfSupply: string | null): TaxSplit {
  const firmCode = stateCodeOf(firm?.gstin);
  const partyCode = stateCodeOf(party?.gstin);
  // Both GSTINs present and differing = inter-state, full stop. With one missing, fall back to
  // comparing the place of supply against the firm's own state; if that is unknown too, assume the
  // common case for this business — a Gujarat firm billing within Gujarat.
  const interState =
    firmCode && partyCode
      ? firmCode !== partyCode
      : !!stateOfSupply && !!firm?.state
        ? stateOfSupply.trim().toLowerCase() !== firm.state.trim().toLowerCase()
        : false;

  const byRate = new Map<string, TaxBucket>();
  for (const l of lines) {
    const percent = Number(l.taxPercent) || 0;
    // Derive from the line's own amount rather than a stored taxAmount, which isn't always
    // populated — this keeps the summary exactly consistent with the printed line total.
    const taxable = percent ? l.amount / (1 + percent / 100) : l.amount;
    const tax = l.amount - taxable;
    const kind = gstRate(l.taxCode)?.kind;
    const igst = kind === "IGST" || (kind !== "GST" && interState);
    const key = `${igst ? "I" : "C"}${percent}`;
    const b = byRate.get(key) ?? { percent, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    b.taxable += taxable;
    if (igst) b.igst += tax;
    else {
      b.cgst += tax / 2;
      b.sgst += tax / 2;
    }
    byRate.set(key, b);
  }

  const buckets = [...byRate.values()].filter((b) => b.percent > 0).sort((a, b) => a.percent - b.percent);
  const sum = (pick: (b: TaxBucket) => number) => buckets.reduce((t, b) => t + pick(b), 0);
  return {
    buckets,
    cgst: sum((b) => b.cgst),
    sgst: sum((b) => b.sgst),
    igst: sum((b) => b.igst),
    empty: buckets.length === 0,
  };
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
  opts?: {
    subtitle?: string;
    landscape?: boolean;
    rightAlignFrom?: number;
    /** An unsaved design to draw with (the Templates preview); default = the saved REPORT design. */
    template?: DocTemplate;
    /** Return the document instead of downloading it. */
    preview?: boolean;
  }
) {
  // jsPDF's built-in fonts have no ₹ glyph — it printed as "¹" and broke the column widths. Every
  // caller passes `inr()` strings, so swap the symbol here once rather than at forty call sites.
  rows = rows.map((r) => r.map((c) => (typeof c === "string" ? c.replace(/₹\s?/g, "Rs. ") : c)));
  const [{ jsPDF }, autoTableMod, firmProfile, tpl] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getCachedFirmProfile(),
    // Templates → Vyapar → "Reports & lists": colour, logo, letterhead name and footer of every list.
    opts?.template ? Promise.resolve(opts.template) : getTemplate("REPORT"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;
  const firm = firmProfile
    ? {
        ...firmProfile,
        businessName: tpl.companyName.trim() || firmProfile.businessName,
        address: tpl.companyAddress.trim() || firmProfile.address,
        logoDataUrl: tpl.showLogo ? firmProfile.logoDataUrl : null,
        gstin: tpl.showGstin ? firmProfile.gstin : null,
        footerNote: tpl.footerNote.trim() || firmProfile.footerNote,
      }
    : null;
  const accentRgb = (() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(tpl.accent.trim());
    const n = m ? parseInt(m[1], 16) : 0x212529;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  })();

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
    headStyles: { fillColor: accentRgb, textColor: [255, 255, 255], fontStyle: "bold" },
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

  if (opts?.preview) return doc;
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

/**
 * Indian numbering (lakh/crore) amount-in-words, for the invoice total.
 *
 * Carries paise, as Vyapar does — it prints "… Rupees and Thirty Two Paisa only". Rounding the
 * paise away made the words disagree with the figure beside them on any non-round total.
 */
export function amountInWords(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const n = Math.floor(abs);
  const paise = Math.round((abs - n) * 100);

  const parts = [];
  if (n === 0) {
    parts.push("Zero");
  } else {
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const rest = n % 1e3;
    if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
    if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
    if (rest) parts.push(threeDigitWords(rest));
  }

  const tail = paise > 0 ? ` and ${twoDigitWords(paise)} Paisa` : "";
  return `${negative ? "Minus " : ""}Rupees ${parts.join(" ")}${tail} Only`;
}

/** Which saved design (Templates) prints each Vyapar document type. */
export function templateKindFor(docType: string | null | undefined): DocKind {
  switch (docType) {
    case "SALE_ORDER":
    case "ESTIMATE":
    case "PROFORMA":
    case "DELIVERY_CHALLAN":
    case "SALE_RETURN":
    case "PURCHASE":
    case "PURCHASE_RETURN":
    case "PURCHASE_ORDER":
    case "EXPENSE":
      return docType;
    default:
      return "SALE";
  }
}

/**
 * A Vyapar document as a print model for the shared renderer: party and details panels, Bill To /
 * Ship To, the item table with HSN and tax, the boxed totals with the CGST/SGST/IGST split, the
 * rate-wise tax summary, bank details and terms. Which of those actually print is the template's
 * call (Templates screen); this only says what the document holds.
 */
export async function invoicePrintModel(
  invoice: Invoice,
  party?: Party | null,
  items?: { id: number; hsn: string | null }[],
  firmOverride?: FirmProfile | null,
): Promise<PrintModel> {
  const [firm, bank] = await Promise.all([
    firmOverride !== undefined ? Promise.resolve(firmOverride) : getCachedFirmProfile(),
    invoice.id > 0 ? printableBankAccount(invoice) : Promise.resolve(null),
  ]);
  const places = getAmountDecimals();
  const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
  const hsnOf = (itemId: number | null) => (itemId == null ? null : (items?.find((i) => i.id === itemId)?.hsn ?? null));
  const kind = templateKindFor(invoice.docType);
  const isPo = invoice.docType === "PURCHASE_ORDER";
  const dateLabel = isPo ? "PO Date:" : kind === "ESTIMATE" ? "Quotation Date:" : "Date:";
  const noLabel = isPo ? "PO No:" : kind === "ESTIMATE" ? "Quotation No:" : `${DOC_LABEL[invoice.docType] ?? "Document"} No:`;
  const dmy = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
    if (!m) return iso ?? "";
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1].slice(2)}`;
  };

  const meta: [string, string][] = [
    [noLabel, fullInvoiceNo(invoice) || "—"],
    [dateLabel, dmy(invoice.invoiceDate) || "—"],
  ];
  if (invoice.dueDate) meta.push([isPo ? "Delivery By:" : "Due Date:", dmy(invoice.dueDate)]);

  const partyRows: [string, string][] = [
    [isPo || kind === "PURCHASE" || kind === "PURCHASE_RETURN" ? "Vendor:" : "Party:", party?.name ?? invoice.partyName ?? invoice.billingName ?? "Cash"],
    ["GST:", party?.gstin ?? "N/A"],
    ["Mobile:", party?.phone ?? "N/A"],
    ["Address:", [party?.billingAddress ?? invoice.billingAddress, [party?.city, party?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ") || "N/A"],
  ];
  const detailRows: [string, string][] = [];
  if (invoice.stateOfSupply) detailRows.push(["Place of Supply:", invoice.stateOfSupply]);
  detailRows.push(["Payment:", invoice.isCash || invoice.paidAmount > 0 ? invoice.paymentType : "Credit"]);

  const addresses: { title: string; lines: string[] }[] = [];
  const place = (name: string | null, address: string | null, gstin: string | null) =>
    [name, address, gstin ? `GSTIN: ${gstin}` : null].filter(Boolean) as string[];
  const billPlace = place(invoice.billToName, invoice.billToAddress, invoice.billToGstin);
  const shipPlace = place(invoice.shipToName, invoice.shipToAddress, invoice.shipToGstin);
  if (billPlace.length) addresses.push({ title: "Bill To", lines: billPlace });
  if (shipPlace.length) addresses.push({ title: "Ship To", lines: shipPlace });

  const tax = splitTax(invoice.lines, firm, party, invoice.stateOfSupply);
  const rows = invoice.lines.map((l, i) => [
    String(i + 1),
    l.itemName + (l.description ? `\n${l.description}` : ""),
    l.hsn?.trim() || hsnOf(l.itemId) || "",
    `${fmtQty(l.quantity)}${l.unit ? " " + l.unit : ""}`,
    rs(l.rate),
    l.taxPercent ? `${gstRate(l.taxCode)?.kind === "IGST" ? "IGST" : "GST"} ${l.taxPercent}%` : "0%",
    rs(l.amount),
  ]);

  const totals: { label: string; value: string; strong?: boolean }[] = [{ label: "Item Subtotal", value: rs(invoice.subTotal) }];
  if (invoice.discount > 0) totals.push({ label: "Discount", value: `- ${rs(invoice.discount)}` });
  if (tax.cgst > 0) totals.push({ label: "CGST", value: rs(tax.cgst) });
  if (tax.sgst > 0) totals.push({ label: "SGST", value: rs(tax.sgst) });
  if (tax.igst > 0) totals.push({ label: "IGST", value: rs(tax.igst) });
  if (invoice.roundOff) totals.push({ label: "Round Off", value: (invoice.roundOff >= 0 ? "+ " : "- ") + rs(Math.abs(invoice.roundOff)) });
  totals.push({ label: "Total", value: rs(invoice.total), strong: true });
  if (invoice.paidAmount) totals.push({ label: kind === "PURCHASE" ? "Paid" : "Received", value: rs(invoice.paidAmount) });
  if (invoice.balance > 0) totals.push({ label: "Balance Due", value: rs(invoice.balance) });

  const interState = tax.igst > 0 && tax.cgst === 0;
  const taxSummary = tax.empty
    ? undefined
    : {
        head: interState ? ["Tax Rate", "Taxable Value", "IGST", "Total Tax"] : ["Tax Rate", "Taxable Value", "CGST", "SGST", "Total Tax"],
        body: tax.buckets.map((b) =>
          interState
            ? [`${b.percent}%`, rs(b.taxable), rs(b.igst), rs(b.igst)]
            : [`${b.percent}%`, rs(b.taxable), rs(b.cgst), rs(b.sgst), rs(b.cgst + b.sgst)],
        ),
      };

  const bankRows: [string, string][] = bank
    ? ([
        ["Bank", bank.bankName?.trim() || bank.name],
        ["Name", bank.accountHolder?.trim() || ""],
        ["A/c No.", bank.accountNumber?.trim() || ""],
        ["IFSC", bank.ifsc?.trim() || ""],
        ["UPI", bank.upiId?.trim() || ""],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return {
    kind,
    number: fullInvoiceNo(invoice) || DOC_LABEL[invoice.docType] || "document",
    meta,
    panels: [{ rows: partyRows }, ...(detailRows.length ? [{ rows: detailRows }] : [])],
    addresses,
    columns: [
      { label: "S.No.", align: "center", width: 34 },
      { label: "Item Name" },
      { label: "HSN/SAC", align: "center", width: 60, key: "hsn" },
      { label: "Qty", align: "right", width: 64 },
      { label: "Rate", align: "right", width: 70 },
      { label: "Tax", align: "right", width: 58, key: "tax" },
      { label: "Amount", align: "right", width: 82 },
    ],
    rows,
    totals,
    taxSummary,
    amountForWords: invoice.total,
    bank: bankRows,
    terms: invoice.terms,
    notes: invoice.notes,
  };
}

function fmtQty(q: number): string {
  return Number(q).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * Download one Vyapar document (invoice, bill, order, note) as a PDF in the company's saved design —
 * Templates decides the look; the default follows the client's Onsite layout.
 */
export async function downloadInvoicePdf(invoice: Invoice, party?: Party | null, items?: { id: number; hsn: string | null }[]) {
  const [{ renderDocPdf }, model] = await Promise.all([import("./docPdf"), invoicePrintModel(invoice, party, items)]);
  await renderDocPdf(model, { save: true });
}
