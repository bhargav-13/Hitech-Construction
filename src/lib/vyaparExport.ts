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
import { todayIST } from "@/lib/datetime";

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
  a.download = `${filename}-${todayIST()}.csv`;
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
  XLSX.writeFile(book, `${filename}-${todayIST()}.xlsx`, { compression: true });
}

/**
 * Item lines printed under each row of a report — Vyapar's Day Book / Sale Report layout, where a
 * bill's items sit in their own small table beneath it, then "Sub Total", then its description.
 * Every array is parallel to the report's rows.
 */
export interface ReportPrintDetail {
  head: string[];
  rows: Cell[][][];
  footer?: [string, string][][];
  notes?: (string | null | undefined)[];
  alignRightFrom?: number;
}

/** Extra content for a report print-out / PDF beyond its plain rows. */
export interface ReportPrintExtras {
  rightAlignFrom?: number;
  detail?: ReportPrintDetail;
  /** Grey, bold rows under the table — "Total", "Money In - Money Out". */
  totals?: Cell[][];
}

/** Vyapar prints its reports with a grey header row unless the user picked a colour in Templates. */
const DEFAULT_REPORT_ACCENT = "#212529";
const VYAPAR_GREY: [number, number, number] = [217, 217, 217];

/** The letterhead line under the firm name, Vyapar's way: "Phone no.: … Email: …". */
function contactLine(firm: { phone?: string | null; email?: string | null; gstin?: string | null } | null): string {
  if (!firm) return "";
  return [firm.phone ? `Phone no.: ${firm.phone}` : null, firm.email ? `Email: ${firm.email}` : null, firm.gstin ? `GSTIN: ${firm.gstin}` : null]
    .filter(Boolean)
    .join("  ");
}

/**
 * Open a print-ready sheet in a new window, laid out like Vyapar's own report print-outs: the firm
 * centred at the top, the report name centred and underlined, the period on the left, a grey header
 * row and plain ruled rows.
 */
export async function printRows(title: string, head: string[], rows: Cell[][], subtitle?: string, extras?: ReportPrintExtras) {
  const w = window.open("", "_blank", "width=980,height=720");
  if (!w) return;
  const [firm, tpl] = await Promise.all([getCachedFirmProfile(), getTemplate("REPORT")]);
  const esc = (v: Cell) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = tpl.companyName.trim() || firm?.businessName || "";
  const address = tpl.companyAddress.trim() || firm?.address || "";
  const logo = tpl.showLogo ? firm?.logoDataUrl : null;
  const contact = contactLine(firm ? { ...firm, gstin: tpl.showGstin ? firm.gstin : null } : null);
  const footerNote = tpl.footerNote.trim() || firm?.footerNote || "";
  const custom = tpl.accent.trim().toLowerCase() !== DEFAULT_REPORT_ACCENT;
  const right = (i: number, from?: number) => (from != null && i >= from ? ' class="r"' : "");
  const from = extras?.rightAlignFrom;
  const d = extras?.detail;

  const body = rows
    .map((r, ri) => {
      let html = `<tr class="main">${r.map((c, i) => `<td${right(i, from)}>${esc(c)}</td>`).join("")}</tr>`;
      const lines = d?.rows[ri] ?? [];
      const foot = d?.footer?.[ri] ?? [];
      const note = d?.notes?.[ri];
      if (lines.length || foot.length || note) {
        const dr = d?.alignRightFrom ?? d?.head.length ?? 0;
        html += `<tr class="sub"><td colspan="${head.length}">`;
        if (lines.length) {
          html += `<table class="items"><thead><tr>${d!.head.map((h, i) => `<th${right(i, dr)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${lines
            .map((l) => `<tr${/^total$/i.test(String(l[1] ?? l[0] ?? "")) ? ' class="t"' : ""}>${l.map((c, i) => `<td${right(i, dr)}>${esc(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
        }
        if (foot.length) html += `<div class="foot">${foot.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div>`;
        if (note) html += `<div class="note"><b>Description:</b> ${esc(note)}</div>`;
        html += `</td></tr>`;
      }
      return html;
    })
    .join("");
  const totals = (extras?.totals ?? []).map((r) => `<tr class="total">${r.map((c, i) => `<td${right(i, from)}>${esc(c)}</td>`).join("")}</tr>`).join("");

  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box}
  body{font-family:Roboto,Arial,sans-serif;color:#000;margin:28px;font-size:12px}
  .firm{text-align:center;position:relative;min-height:40px}
  .firm img{position:absolute;left:0;top:0;height:46px;max-width:90px;object-fit:contain}
  .biz{font-size:17px;font-weight:700}
  .meta{font-size:11px;margin-top:3px}
  h1{text-align:center;font-size:22px;font-weight:700;text-decoration:underline;margin:22px 0 14px}
  .period{font-size:15px;font-weight:700;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:${custom ? esc(tpl.accent) : "#d9d9d9"};color:${custom ? "#fff" : "#000"};text-align:left;padding:6px;font-weight:700}
  td{padding:6px;vertical-align:top}
  tr.main td{border-top:1px solid #bbb;font-weight:700}
  .r{text-align:right}
  tr.sub td{padding:4px 0 8px 0}
  table.items{width:calc(100% - 60px);margin-left:60px}
  table.items th{background:#d9d9d9;color:#000;font-weight:700}
  table.items td{font-weight:400;border-bottom:1px solid #ccc}
  table.items tr.t td{font-weight:700;border-bottom:1px solid #000}
  .foot{display:flex;flex-direction:column;align-items:flex-end;margin-top:4px}
  .foot div{display:flex;justify-content:space-between;width:320px;border-bottom:1px solid #000;padding:3px 6px}
  .note{margin-top:6px;font-weight:400}
  tr.total td{background:#d9d9d9;font-weight:700}
  .footer-note{margin-top:16px;font-size:11px;color:#666}
  @media print{body{margin:10mm}}
</style></head><body>
${name || logo ? `<div class="firm">${logo ? `<img src="${logo}" alt="" />` : ""}${name ? `<div class="biz">${esc(name)}</div>` : ""}${address ? `<div class="meta">${esc(address)}</div>` : ""}${contact ? `<div class="meta">${esc(contact)}</div>` : ""}</div>` : ""}
<h1>${esc(title)}</h1>
${subtitle ? `<div class="period">${esc(subtitle)}</div>` : ""}
<table><thead><tr>${head.map((h, i) => `<th${right(i, from)}>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${body}${totals}</tbody></table>
${footerNote ? `<div class="footer-note">${esc(footerNote)}</div>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
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

// Roboto — the face Vyapar's PDFs use, and unlike jsPDF's built-in fonts it has a ₹ glyph. Fetched
// once from jsDelivr (pinned) on the first export, so it doesn't ship in the app bundle.
const ROBOTO = {
  normal: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/roboto@0.2.3/Roboto_400Regular.ttf",
  bold: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/roboto@0.2.3/Roboto_700Bold.ttf",
};
let robotoLoad: Promise<{ normal: string; bold: string } | null> | null = null;

function robotoFiles(): Promise<{ normal: string; bold: string } | null> {
  const b64 = async (url: string) => {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  robotoLoad ??= Promise.all([b64(ROBOTO.normal), b64(ROBOTO.bold)])
    .then(([normal, bold]) => ({ normal, bold }))
    .catch(() => {
      robotoLoad = null; // offline: this export falls back to Helvetica, the next one tries again
      return null;
    });
  return robotoLoad;
}

type JsPdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

/** Register Roboto on this document. Returns the font to use, or Helvetica when it couldn't load. */
async function registerReportFont(doc: JsPdfDoc): Promise<"Roboto" | "helvetica"> {
  const files = await robotoFiles();
  if (!files) return "helvetica";
  doc.addFileToVFS("Roboto-Regular.ttf", files.normal);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", files.bold);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  return "Roboto";
}

/**
 * Download a real, selectable-text PDF (not a screenshot), laid out the way Vyapar's own report
 * PDFs are: the firm's name centred with "Phone no.: … Email: …" under it, the report's name
 * centred, bold and underlined, the period on the left ("Date: 30/04/2026"), a grey header row,
 * plain ruled rows, item lines under each bill when asked for, and grey total rows at the end.
 * Name, address, logo, GSTIN, footer and colour still come from Templates → "Reports & lists".
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
  } & Omit<ReportPrintExtras, "rightAlignFrom">
) {
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
  const custom = tpl.accent.trim().toLowerCase() !== DEFAULT_REPORT_ACCENT;
  const headFill = (() => {
    if (!custom) return VYAPAR_GREY;
    const m = /^#?([0-9a-f]{6})$/i.exec(tpl.accent.trim());
    const n = m ? parseInt(m[1], 16) : 0x212529;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number];
  })();
  const headText: [number, number, number] = custom ? [255, 255, 255] : [0, 0, 0];

  const doc = new jsPDF({ orientation: opts?.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const font = await registerReportFont(doc);
  // Helvetica has no ₹ — it printed as "¹" and broke the column widths. Roboto has it.
  const clean = (c: Cell) => (font === "Roboto" ? String(c ?? "") : String(c ?? "").replace(/₹\s?/g, "Rs. "));
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;
  let y = 34;

  // ---- Letterhead: name centred, contact line under it; logo on the left when there is one ----
  if (firm?.logoDataUrl) {
    try {
      const { width, height } = await imageSize(firm.logoDataUrl);
      const logoH = 40;
      doc.addImage(firm.logoDataUrl, "PNG", margin, 18, Math.min(80, logoH * (width / height)), logoH);
    } catch {
      // A broken logo shouldn't block the export.
    }
  }
  if (firm?.businessName) {
    doc.setFont(font, "bold");
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(firm.businessName, pageWidth / 2, y, { align: "center" });
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    for (const line of [firm.address, contactLine(firm)].filter(Boolean) as string[]) {
      y += 12;
      doc.text(line, pageWidth / 2, y, { align: "center", maxWidth: pageWidth - margin * 2 - 100 });
    }
    y += 26;
  } else {
    y += 6;
  }

  // ---- Report name: centred, bold, underlined ----
  doc.setFont(font, "bold");
  doc.setFontSize(17);
  doc.text(clean(title), pageWidth / 2, y, { align: "center" });
  const tw = doc.getTextWidth(clean(title));
  doc.setLineWidth(0.9);
  doc.setDrawColor(0);
  doc.line(pageWidth / 2 - tw / 2, y + 3, pageWidth / 2 + tw / 2, y + 3);
  y += 26;

  // ---- Period, on the left ----
  if (opts?.subtitle) {
    doc.setFontSize(12);
    doc.text(clean(opts.subtitle), margin, y);
    y += 14;
  }

  const from = opts?.rightAlignFrom;
  const columnStyles: Record<number, { halign: "right" }> = {};
  if (from != null) for (let i = from; i < head.length; i++) columnStyles[i] = { halign: "right" };
  const base = {
    theme: "plain",
    styles: { font, fontSize: 8.5, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, textColor: [0, 0, 0] },
    headStyles: { fillColor: headFill, textColor: headText, fontStyle: "bold" },
    margin: { left: margin, right: margin, bottom: 40 },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFont(font, "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      if (firm?.footerNote) doc.text(clean(firm.footerNote), margin, pageH - 18, { maxWidth: pageWidth - margin * 2 - 60 });
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageH - 18, { align: "right" });
      doc.setTextColor(0);
    },
  };
  // A thin rule under every row, no grid — Vyapar's ruled-paper look.
  const ruleBelow = (data: { section: string; cell: { x: number; y: number; width: number; height: number } }) => {
    if (data.section !== "body") return;
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const totalRows = (opts?.totals ?? []).map((r) =>
    r.map((c) => ({ content: clean(c), styles: { fillColor: VYAPAR_GREY, fontStyle: "bold" } })),
  );

  const d = opts?.detail;
  const hasDetail = !!d && rows.some((_, i) => (d.rows[i]?.length ?? 0) > 0 || !!d.notes?.[i]);
  if (!hasDetail) {
    autoTable(doc, {
      ...base,
      head: [head.map(clean)],
      body: [...rows.map((r) => r.map(clean)), ...totalRows],
      startY: y,
      columnStyles,
      bodyStyles: { fontStyle: "normal" },
      didDrawCell: ruleBelow,
    });
  } else {
    // Row by row: the bill, then its items as an indented table, Sub Total, Description.
    let at = y;
    const dr = d!.alignRightFrom ?? d!.head.length;
    const detailCols: Record<number, { halign: "right" }> = {};
    for (let i = dr; i < d!.head.length; i++) detailCols[i] = { halign: "right" };
    const width = pageWidth - margin * 2;
    rows.forEach((r, ri) => {
      autoTable(doc, {
        ...base,
        head: ri === 0 ? [head.map(clean)] : undefined,
        showHead: ri === 0 ? "firstPage" : "never",
        body: [r.map(clean)],
        startY: at,
        columnStyles,
        bodyStyles: { fontStyle: "bold" },
        didDrawCell: (data: { section: string; cell: { x: number; y: number; width: number; height: number } }) => {
          // A rule above each bill separates the entries.
          if (data.section !== "body") return;
          doc.setDrawColor(150);
          doc.setLineWidth(0.6);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        },
      });
      at = lastY();
      const lines = d!.rows[ri] ?? [];
      if (lines.length) {
        autoTable(doc, {
          ...base,
          head: [d!.head.map(clean)],
          body: lines.map((l) => {
            const isTotal = l.some((c) => /^total$/i.test(String(c ?? "")));
            return l.map((c) => (isTotal ? { content: clean(c), styles: { fontStyle: "bold" } } : clean(c)));
          }),
          startY: at + 4,
          margin: { ...base.margin, left: margin + 50 },
          tableWidth: width - 50,
          styles: { ...base.styles, fontSize: 8 },
          headStyles: { fillColor: VYAPAR_GREY, textColor: [0, 0, 0], fontStyle: "bold" },
          columnStyles: detailCols,
          didDrawCell: ruleBelow,
        });
        at = lastY();
      }
      const foot = d!.footer?.[ri] ?? [];
      if (foot.length) {
        doc.setFont(font, "normal");
        doc.setFontSize(8);
        for (const [k, v] of foot) {
          at += 13;
          if (at > doc.internal.pageSize.getHeight() - 50) {
            doc.addPage();
            at = 40;
          }
          doc.text(clean(k), pageWidth - margin - 180, at);
          doc.text(clean(v), pageWidth - margin - 4, at, { align: "right" });
          doc.setDrawColor(0);
          doc.setLineWidth(0.5);
          doc.line(pageWidth - margin - 190, at + 4, pageWidth - margin, at + 4);
        }
        at += 6;
      }
      const note = d!.notes?.[ri];
      if (note) {
        at += 14;
        if (at > doc.internal.pageSize.getHeight() - 50) {
          doc.addPage();
          at = 40;
        }
        doc.setFontSize(8.5);
        doc.setFont(font, "bold");
        doc.text("Description:", margin + 2, at);
        const lw = doc.getTextWidth("Description: ");
        doc.setFont(font, "normal");
        doc.text(clean(note), margin + 2 + lw, at, { maxWidth: width - lw - 4 });
        at += 4;
      }
      at += 2;
    });
    if (totalRows.length) {
      autoTable(doc, { ...base, body: totalRows, startY: at + 2, columnStyles, showHead: "never" });
    }
  }

  if (opts?.preview) return doc;
  doc.save(`${title.replace(/[^\w\-]+/g, "-").toLowerCase()}-${todayIST()}.pdf`);
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
  if (invoice.paymentCategory) detailRows.push(["Payment For:", invoice.paymentCategory]);

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
