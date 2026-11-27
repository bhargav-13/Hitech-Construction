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
import { getAmountDecimals, inr, bookDate } from "./format";
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
  /** Labelled lines under an entry, after its description — "Payment Type: Cash" on a party statement. */
  extra?: ([string, string][] | undefined)[];
  /**
   * `true` prints "Description:" on its own line with the text beneath, as Vyapar's Sale, Purchase
   * and Expense reports do; otherwise the text follows the label on the same line (Day Book, Bank
   * statement, Party statement).
   */
  noteBelow?: boolean;
  alignRightFrom?: number;
  /**
   * The report column the item table starts under. Vyapar hangs it under the second column on a Day
   * Book or party statement and under the third (Party Name) on the Sale / Purchase / Expense report.
   */
  indentCol?: number;
}

/** Extra content for a report print-out / PDF beyond its plain rows. */
export interface ReportPrintExtras {
  rightAlignFrom?: number;
  detail?: ReportPrintDetail;
  /** Grey, bold rows under the table — "Total", "Money In - Money Out". */
  totals?: Cell[][];
  /** One bold line under everything, on the right — Vyapar's "Total Sale: ₹ 17,27,450.00". */
  grandTotal?: string;
  /**
   * Print sheet only: a window the caller already opened. A sheet whose data is fetched first has to
   * open its window before the fetch, while the click still counts as the user's — one opened
   * afterwards is a pop-up the browser blocks.
   */
  target?: Window | null;
  /**
   * `false` prints no firm letterhead. Vyapar puts the firm on its transaction reports (Sale,
   * Purchase, Expense, Day Book, Party statement) and leaves it off the summaries (Party Report,
   * Bank statement, the item reports).
   */
  letterhead?: boolean;
}

/** Vyapar prints its reports with a grey header row unless the user picked a colour in Templates. */
const DEFAULT_REPORT_ACCENT = "#212529";
const VYAPAR_GREY: [number, number, number] = [211, 211, 211];
const VYAPAR_GREY_CSS = "#d3d3d3";

/**
 * The lines under the firm's name on a Vyapar report, in its own wording: the address, then
 * "Phone no.: … Email: …", then "GSTIN: …, State: 23-Madhya Pradesh".
 */
function letterheadLines(firm: { address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; state?: string | null } | null): string[] {
  if (!firm) return [];
  const contact = [firm.phone ? `Phone no.: ${firm.phone}` : null, firm.email ? `Email: ${firm.email}` : null].filter(Boolean).join(" ");
  // Vyapar prefixes the state with its GST code, which is simply the GSTIN's first two digits.
  const code = /^(\d{2})/.exec(String(firm.gstin ?? "").trim())?.[1];
  const state = firm.state?.trim() ? `State: ${code ? `${code}-` : ""}${firm.state.trim()}` : null;
  const tax = [firm.gstin ? `GSTIN: ${firm.gstin}` : null, state].filter(Boolean).join(", ");
  return [firm.address?.trim() || "", contact, tax].filter(Boolean);
}

/** "Generated on Nov 17, 2026 at 3:00 pm" — the line Vyapar leaves at the foot of a report (IST). */
function generatedOnLine(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(now).toLowerCase();
  return `Generated on ${date} at ${time}`;
}

/**
 * The bold lines under a report's title, one per line of `subtitle` — "Duration: From … to …",
 * "User: …", "Party name: …", "Bank: …". A line starting with "~" is a small plain one
 * ("Contact No.: 9907405177"), as on Vyapar's party statement.
 */
function subtitleLines(subtitle: string | undefined): { text: string; small: boolean }[] {
  return String(subtitle ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("~") ? { text: l.slice(1).trim(), small: true } : { text: l, small: false }));
}

/**
 * Money as Vyapar prints it: a space after the rupee sign, and a spaced minus before it
 * ("₹ 16,500.00", "- ₹ 14,515.95"). The app's own "₹16,500.00" stays as it is on screen.
 */
function vyaparMoney(text: string): string {
  return text.replace(/-\s?₹\s?(?=\d)/g, "- ₹ ").replace(/₹(?=\d)/g, "₹ ");
}

/** How many columns a total row's label covers: itself plus the blank cells straight after it. */
function labelSpan(row: Cell[], width: number): number {
  let span = 1;
  while (span < width && String(row[span] ?? "") === "") span++;
  return span;
}

/** A report row that is the item table's own "Total" line, which Vyapar prints bold. */
const isTotalLine = (l: Cell[]) => l.some((c) => /^total$/i.test(String(c ?? "").trim()));

/**
 * Open a print-ready sheet in a new window, laid out like Vyapar's own report print-outs: the logo
 * on the left with the firm's name and contact lines right-aligned beside it and a rule beneath, the
 * report name centred, bold and underlined, the period in bold on the left, a grey header row,
 * ruled rows, each bill's items hung under it, grey total rows and "Generated on …" at the foot.
 */
export async function printRows(title: string, head: string[], rows: Cell[][], subtitle?: string, extras?: ReportPrintExtras) {
  const w = extras?.target ?? window.open("", "_blank", "width=980,height=720");
  if (!w) return;
  const [firm, tpl] = await Promise.all([getCachedFirmProfile(), getTemplate("REPORT")]);
  const esc = (v: Cell) =>
    vyaparMoney(String(v ?? "")).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = tpl.companyName.trim() || firm?.businessName || "";
  const logo = tpl.showLogo ? firm?.logoDataUrl : null;
  const lines = letterheadLines(
    firm ? { ...firm, address: tpl.companyAddress.trim() || firm.address, gstin: tpl.showGstin ? firm.gstin : null } : null,
  );
  const footerNote = tpl.footerNote.trim() || firm?.footerNote || "";
  const custom = tpl.accent.trim().toLowerCase() !== DEFAULT_REPORT_ACCENT;
  const right = (i: number, from?: number) => (from != null && i >= from ? ' class="r"' : "");
  const from = extras?.rightAlignFrom;
  // Dates, amounts and document numbers stay on one line; only names wrap.
  const cell = (i: number, c: Cell) => {
    const classes = [from != null && i >= from ? "r" : "", /^\S{1,16}$/.test(String(c ?? "")) || /^[\d₹.,/:\-\s]+$/.test(String(c ?? "")) ? "nw" : ""].filter(Boolean);
    return classes.length ? ` class="${classes.join(" ")}"` : "";
  };
  const d = extras?.detail;
  const hasDetail = !!d && rows.some((_, i) => (d.rows[i]?.length ?? 0) > 0 || !!d.notes?.[i] || (d.extra?.[i]?.length ?? 0) > 0);
  const indent = Math.min(Math.max(0, d?.indentCol ?? 1), Math.max(0, head.length - 1));
  // Vyapar drops to a smaller face as a report gets wider, so eleven columns still fit a portrait page.
  const size = head.length >= 10 ? 10 : head.length >= 9 ? 11 : head.length >= 7 ? 12 : 13;
  const cellPad = head.length >= 10 ? "6px 3px" : "6px 5px";

  const body = rows
    .map((r, ri) => {
      let html = `<tr class="main${hasDetail && d!.head.length ? " b" : hasDetail ? " n" : ""}">${r.map((c, i) => `<td${cell(i, c)}>${esc(c)}</td>`).join("")}</tr>`;
      const items = d?.rows[ri] ?? [];
      const foot = d?.footer?.[ri] ?? [];
      const note = d?.notes?.[ri];
      if (items.length || foot.length) {
        const dr = d?.alignRightFrom ?? d?.head.length ?? 0;
        html += `<tr class="sub">${indent ? `<td colspan="${indent}"></td>` : ""}<td colspan="${head.length - indent}">`;
        if (items.length) {
          html += `<table class="items"><thead><tr>${d!.head.map((h, i) => `<th${right(i, dr)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${items
            .map((l) => `<tr${isTotalLine(l) ? ' class="t"' : ""}>${l.map((c, i) => `<td${right(i, dr)}>${esc(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
        }
        if (foot.length) html += `<div class="foot">${foot.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div>`;
        html += `</td></tr>`;
      }
      if (note) html += `<tr class="note"><td colspan="${head.length}"><b>Description:</b>${d?.noteBelow ? "<br />" : " "}${esc(note)}</td></tr>`;
      for (const [k, v] of d?.extra?.[ri] ?? []) html += `<tr class="note"><td colspan="${head.length}"><b>${esc(k)}:</b> ${esc(v)}</td></tr>`;
      return `<tbody class="entry">${html}</tbody>`;
    })
    .join("");
  const totals = (extras?.totals ?? [])
    .map((r) => {
      const span = labelSpan(r, head.length);
      return `<tr class="total"><td colspan="${span}">${esc(r[0])}</td>${head.slice(span).map((_, i) => `<td${right(span + i, from)}>${esc(r[span + i])}</td>`).join("")}</tr>`;
    })
    .join("");
  const showFirm = extras?.letterhead !== false && !!(name || logo);
  const meta = subtitleLines(subtitle);

  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
<meta charset="utf-8" />
<style>
  @page{size:A4;margin:12mm 14mm 16mm}
  *{box-sizing:border-box}
  body{font-family:"Segoe UI","Open Sans",Roboto,Arial,sans-serif;color:#000;margin:28px;font-size:${size}px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .firm{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #555;padding-bottom:8px;margin-bottom:26px}
  .firm img{max-height:64px;max-width:150px;object-fit:contain}
  .firm .txt{flex:1;text-align:right}
  .biz{font-size:18px;font-weight:700;margin-bottom:3px}
  .meta{font-size:11.5px;line-height:1.5}
  h1{text-align:center;font-size:25px;font-weight:700;text-decoration:underline;margin:0 0 22px}
  .period{font-size:18px;font-weight:700;margin:0 0 18px}
  .period.small{font-size:13px;font-weight:400;margin-top:-4px}
  table{width:100%;border-collapse:collapse}
  thead{display:table-header-group}
  tfoot{display:table-footer-group}
  th{background:${custom ? esc(tpl.accent) : VYAPAR_GREY_CSS};color:${custom ? "#fff" : "#000"};text-align:left;padding:${cellPad};font-weight:700;border-bottom:1px solid #555;vertical-align:middle}
  td{padding:${cellPad};vertical-align:middle}
  .r{text-align:right}
  .nw{white-space:nowrap}
  tr.main td{border-bottom:1px solid #666}
  tr.main.b td{font-weight:700;border-bottom:0;padding-top:11px;padding-bottom:9px}
  tr.main.n td{border-bottom:0}
  tbody.entry{border-bottom:1px solid #666}
  tr.sub>td{padding:0 0 6px}
  table.items th{background:${VYAPAR_GREY_CSS};color:#000;border-top:1px solid #555;border-bottom:1px solid #555}
  table.items td{font-weight:400;border-bottom:1px solid #666}
  table.items tr.t td{font-weight:700}
  .foot{display:flex;flex-direction:column;align-items:flex-end}
  .foot div{display:flex;justify-content:space-between;gap:18px;width:55%;border-bottom:1px solid #666;padding:5px 5px 5px 18%}
  tr.note td{font-weight:400;padding-top:2px}
  tr.total td{background:${VYAPAR_GREY_CSS};font-weight:700;border-bottom:1px solid #666}
  .grand{text-align:right;font-size:18px;font-weight:700;margin-top:36px}
  .spacer{height:26px;padding:0}
  .gen{position:fixed;left:0;bottom:0;font-family:"Times New Roman",Times,serif;font-size:13px}
  .footer-note{position:fixed;right:0;bottom:0;font-size:10.5px;color:#666}
  @media screen{.gen,.footer-note{position:static;margin-top:18px}.footer-note{text-align:right}}
</style></head><body>
${showFirm ? `<div class="firm">${logo ? `<img src="${logo}" alt="" />` : "<span></span>"}<div class="txt">${name ? `<div class="biz">${esc(name)}</div>` : ""}${lines.map((l) => `<div class="meta">${esc(l)}</div>`).join("")}</div></div>` : ""}
<h1>${esc(title)}</h1>
${meta.map((m) => `<div class="period${m.small ? " small" : ""}">${esc(m.text)}</div>`).join("")}
<table><thead><tr>${head.map((h, i) => `<th${right(i, from)}>${esc(h)}</th>`).join("")}</tr></thead>
<tfoot><tr><td class="spacer" colspan="${head.length}"></td></tr></tfoot>
${body}${totals ? `<tbody>${totals}</tbody>` : ""}</table>
${extras?.grandTotal ? `<div class="grand">${esc(extras.grandTotal)}</div>` : ""}
<div class="gen">${esc(generatedOnLine())}</div>
${footerNote ? `<div class="footer-note">${esc(footerNote)}</div>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`);
  w.document.close();
}

/**
 * One cash or bank account's entries as Vyapar's "Bank statement" sheet: the account named under the
 * title, Date · Transaction Details · Withdrawal Amount · Deposit Amount, each entry's description
 * beneath it, and the account's balance in a grey row at the end. No letterhead, as Vyapar prints it.
 */
export function bankStatementSheet(
  account: string,
  txns: { type: string; name: string | null; date: string | null; amount: number; direction: "in" | "out"; note: string | null }[],
  closingBalance?: number | null,
) {
  const head = ["Date", "Transaction Details", "Withdrawal Amount", "Deposit Amount"];
  const rows: Cell[][] = txns.map((t) => [
    bookDate(t.date),
    `[${t.type}] ${t.name ?? ""}`.trim(),
    t.direction === "out" ? inr(t.amount) : "",
    t.direction === "in" ? inr(t.amount) : "",
  ]);
  // The description is only worth a line of its own when it says something the name does not.
  const notes = txns.map((t) => (t.note?.trim() && t.note.trim() !== (t.name ?? "").trim() ? t.note.trim() : null));
  return {
    title: "Bank statement",
    head,
    rows,
    subtitle: `Bank: ${account}`,
    extras: {
      rightAlignFrom: 2,
      letterhead: false,
      detail: { head: [], rows: txns.map(() => []), notes } as ReportPrintDetail,
      totals: closingBalance == null ? undefined : ([["", "", "Balance", inr(closingBalance)]] as Cell[][]),
    },
  };
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

// Roboto — a close match for the Segoe UI that Vyapar's own PDFs are set in, and unlike jsPDF's
// built-in fonts it has a ₹ glyph. Fetched once from jsDelivr (pinned) on the first export, so it
// doesn't ship in the app bundle.
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
export async function registerReportFont(doc: JsPdfDoc): Promise<"Roboto" | "helvetica"> {
  const files = await robotoFiles();
  if (!files) return "helvetica";
  doc.addFileToVFS("Roboto-Regular.ttf", files.normal);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", files.bold);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  return "Roboto";
}

/**
 * Vyapar's letterhead, as it heads both its reports and its documents: the logo on the left, the
 * firm's name bold and right-aligned with the address, "Phone no.: … Email: …" and "GSTIN: …,
 * State: …" beneath it, and a rule across the page. Returns the y of that rule.
 */
export async function drawVyaparLetterhead(
  doc: JsPdfDoc,
  font: string,
  firm: { businessName?: string | null; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; state?: string | null; logoDataUrl?: string | null },
  o: { margin: number; top: number; clean: (c: Cell) => string; scale?: number },
): Promise<number> {
  const k = o.scale ?? 1;
  const pageWidth = doc.internal.pageSize.getWidth();
  let logoBottom = o.top;
  let logoW = 0;
  if (firm.logoDataUrl) {
    try {
      const { width, height } = await imageSize(firm.logoDataUrl);
      const scale = Math.min((104 * k) / width, (52 * k) / height);
      logoW = width * scale;
      doc.addImage(firm.logoDataUrl, /^data:image\/jpe?g/i.test(firm.logoDataUrl) ? "JPEG" : "PNG", o.margin, o.top, logoW, height * scale);
      logoBottom = o.top + height * scale;
    } catch {
      // A broken logo shouldn't block the export.
    }
  }
  doc.setTextColor(0);
  let ty = o.top + 11;
  if (firm.businessName) {
    doc.setFont(font, "bold");
    doc.setFontSize(14.5 * k);
    doc.text(o.clean(firm.businessName), pageWidth - o.margin, ty, { align: "right" });
    ty += 14.5 * k;
  }
  doc.setFont(font, "normal");
  doc.setFontSize(9 * k);
  const room = pageWidth - o.margin * 2 - logoW - 16;
  for (const line of letterheadLines(firm)) {
    for (const part of doc.splitTextToSize(o.clean(line), room) as string[]) {
      doc.text(part, pageWidth - o.margin, ty, { align: "right" });
      ty += 12.5 * k;
    }
  }
  const ruleY = Math.max(logoBottom, ty - 8) + 8;
  doc.setDrawColor(85);
  doc.setLineWidth(0.8);
  doc.line(o.margin, ruleY, pageWidth - o.margin, ruleY);
  return ruleY;
}

/** "Generated on …" bottom-left of every page, in the serif Vyapar's own PDFs carry it in. */
export function stampGeneratedOn(doc: JsPdfDoc, margin: number, footerNote?: string | null) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const stamp = generatedOnLine();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(stamp, margin, pageH - 24);
    if (footerNote?.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(footerNote.trim().replace(/₹\s?/g, "Rs. "), pageW - margin, pageH - 24, { align: "right", maxWidth: pageW - margin * 2 - 190 });
      doc.setTextColor(0);
    }
  }
}

/**
 * Download a real, selectable-text PDF (not a screenshot), laid out the way Vyapar's own report
 * PDFs are: the logo on the left and the firm right-aligned beside it over a rule, the report's name
 * centred, bold and underlined, the period in bold on the left ("Duration: From 01/09/2026 to
 * 30/11/2026"), a grey header row, ruled rows, each bill's items hung under it with "Total" and
 * "Sub Total", grey total rows at the end and "Generated on …" at the foot of every page.
 * Name, address, logo, GSTIN, footer and colour still come from Templates → "Reports & lists".
 */
export async function downloadPdf(
  title: string,
  head: string[],
  rows: Cell[][],
  opts?: {
    /** Bold lines under the title, one per "\n"-separated line; a "~" prefix prints it small. */
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
  const clean = (c: Cell) => (font === "Roboto" ? vyaparMoney(String(c ?? "")) : String(c ?? "").replace(/₹\s?/g, "Rs. "));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const pageTop = 36;
  const bottom = 44;
  const width = pageWidth - margin * 2;
  const d = opts?.detail;
  const hasDetail = !!d && rows.some((_, i) => (d.rows[i]?.length ?? 0) > 0 || !!d.notes?.[i] || (d.extra?.[i]?.length ?? 0) > 0);
  const hpad = 3.5;
  const pad = hpad * 2;
  const textWidth = (t: string) => doc.getTextWidth(t);
  // Where a line may break, the way a browser sees it: at a space, and after a hyphen.
  const pieces = (t: string) => t.match(/\S+?-(?=\S)|\S+/g) ?? [];
  /** What each column of a table needs at a given text size: its longest word, and its longest line. */
  const measure = (heads: string[], body: Cell[][], fontSize: number, wholeAmounts = false) => {
    doc.setFont(font, "bold");
    doc.setFontSize(fontSize);
    // With `wholeAmounts` the rupee sign counts as part of its figure, so "₹ 1,000.00" is one word.
    // (A full stop stands in for the space: about as wide, and not somewhere a line can break.)
    const glue = (t: string) => (wholeAmounts ? t.replace(/₹ (?=\d)/g, "₹.") : t);
    const cellsOf = (i: number) => body.map((r) => glue(clean(r[i])));
    const headMin = heads.map((h) => Math.max(0, ...pieces(clean(h)).map(textWidth)) + pad);
    const max = heads.map((h, i) => Math.max(textWidth(clean(h)), ...cellsOf(i).flatMap((c) => c.split("\n").map(textWidth))) + pad);
    const min = heads.map((_, i) => Math.max(headMin[i], Math.max(0, ...cellsOf(i).flatMap((c) => pieces(c).map(textWidth))) + pad));
    // Names may break inside a word when there is no other way ("ABHIS / HEK", as Vyapar's do);
    // dates, amounts and the headings keep their line.
    const rigid = heads.map((_, i) => cellsOf(i).every((c) => /^[\d₹.,/:\-\s]*$/.test(c) || /^\S*$/.test(c)));
    const floor = min.map((m, i) => (rigid[i] ? m : Math.min(m, Math.max(headMin[i], 24 + pad))));
    const sum = (ns: number[]) => ns.reduce((x, n) => x + n, 0);
    // The longest line among the rows alone: a heading wraps happily, a bill number should not.
    const rowMax = heads.map((_, i) => Math.max(min[i], Math.max(0, ...cellsOf(i).flatMap((c) => c.split("\n").map(textWidth))) + pad));
    return { min, max, rowMax, floor, sumMin: sum(min), sumMax: sum(max), sumFloor: sum(floor) };
  };
  /**
   * Widths for one table, measured over every row it will ever show and filling `total` exactly —
   * the same give-and-take a browser's table layout makes, which is what Vyapar's sheets come out
   * of: every column at least its longest word, the spare width shared by how much each could use.
   */
  const fit = (heads: string[], body: Cell[][], total: number, fontSize: number) => {
    // Amounts are kept whole when that fits; only a sheet too tight for it lets "₹" sit on its own
    // line above the figure, as Vyapar's eleven-column Sale Report does.
    const whole = measure(heads, body, fontSize, true);
    const m = whole.sumMin <= total ? whole : measure(heads, body, fontSize);
    if (m.sumMax <= total) return m.max.map((x) => (x * total) / m.sumMax);
    if (m.sumMin <= total) {
      // Spare width goes first to the columns that need least to sit on one line — a bill number, an
      // amount — and what is left is shared by the long ones (names), which are the ones to wrap.
      // The rows are seen to before the headings, which read fine on two lines.
      const widths = [...m.min];
      let spare = total - m.sumMin;
      const pour = (target: number[]) => {
        const byNeed = widths.map((_, i) => i).sort((x, y) => target[x] - widths[x] - (target[y] - widths[y]));
        byNeed.forEach((i, n) => {
          const given = Math.max(0, Math.min(target[i] - widths[i], spare / (byNeed.length - n)));
          widths[i] += given;
          spare -= given;
        });
      };
      pour(m.rowMax);
      pour(m.max);
      return widths;
    }
    const give = m.sumMin - m.sumFloor;
    const need = m.sumMin - total;
    if (give >= need) return m.min.map((x, i) => x - (need * (x - m.floor[i])) / give);
    return m.floor.map((x) => (x * total) / m.sumFloor);
  };
  // A total row can carry a figure wider than anything above it; its label spans, so it is left out.
  const totalsForFit = (opts?.totals ?? []).map((r) => r.map((c, i) => (i < labelSpan(r, head.length) ? "" : c)));
  /**
   * Text size. A plain list steps down as it gains columns. A bill-wise sheet is set at Vyapar's own
   * size and, like Vyapar's, is scaled down as a whole — headings and letterhead with it — only when
   * its columns cannot fit the page: first until one word a line fits, then, with names allowed to
   * break, as far as it takes.
   */
  const FULL = 9.6;
  let size = head.length >= 9 ? 8 : head.length >= 7 ? 8.5 : 9.5;
  if (hasDetail) {
    const body = [...rows, ...totalsForFit];
    size = FULL;
    while (size > 8.05 && measure(head, body, size).sumMin > width) size -= 0.2;
    while (size > 6.45 && measure(head, body, size).sumFloor > width) size -= 0.2;
  }
  const k = hasDetail ? size / FULL : 1;
  let y = pageTop;

  // ---- Letterhead: logo left, the firm right-aligned, a rule beneath ----
  if (opts?.letterhead !== false && firm && (firm.businessName || firm.logoDataUrl)) {
    y = (await drawVyaparLetterhead(doc, font, firm, { margin, top: y, clean, scale: k })) + 36 * k;
  } else {
    y += 14;
  }

  // ---- Report name: centred, bold, underlined ----
  doc.setFont(font, "bold");
  doc.setFontSize(19 * k);
  doc.setTextColor(0);
  doc.text(clean(title), pageWidth / 2, y, { align: "center", maxWidth: width });
  const tw = Math.min(width, doc.getTextWidth(clean(title)));
  doc.setLineWidth(1.2);
  doc.setDrawColor(0);
  doc.line(pageWidth / 2 - tw / 2, y + 3.5, pageWidth / 2 + tw / 2, y + 3.5);
  y += 18;

  // ---- Period and the like, bold on the left, one per line ----
  for (const line of subtitleLines(opts?.subtitle)) {
    if (line.small) {
      doc.setFont(font, "normal");
      doc.setFontSize(9.5 * k);
      y += 14;
      doc.text(clean(line.text), margin + 1, y, { maxWidth: width });
      y += 8;
    } else {
      doc.setFont(font, "bold");
      doc.setFontSize(13 * k);
      y += 18;
      doc.text(clean(line.text), margin, y, { maxWidth: width });
      y += 10;
    }
  }
  y += 4;

  const from = opts?.rightAlignFrom;
  const isRight = (i: number) => from != null && i >= from;
  const columnStyles: Record<number, { halign?: "right"; cellWidth?: number }> = {};
  head.forEach((_, i) => {
    if (isRight(i)) columnStyles[i] = { halign: "right" };
  });
  type DrawnCell = { section: string; column: { index: number }; cell: { x: number; y: number; width: number; height: number; styles: { halign: string } } };
  const rule = (x1: number, yy: number, x2: number, tone = 105, w = 0.7) => {
    doc.setDrawColor(tone);
    doc.setLineWidth(w);
    doc.line(x1, yy, x2, yy);
  };
  const base = {
    theme: "plain",
    styles: { font, fontSize: size, cellPadding: { top: 4.5, bottom: 4.5, left: hpad, right: hpad }, textColor: [0, 0, 0], valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: headFill, textColor: headText, fontStyle: "bold", valign: "middle" },
    margin: { left: margin, right: margin, top: pageTop, bottom },
    // The header row's alignment follows its column's, as Vyapar's does.
    didParseCell: (data: DrawnCell) => {
      if (data.section === "head" && isRight(data.column.index)) data.cell.styles.halign = "right";
    },
  };
  /** A rule under every row and a darker one under the header, no grid — Vyapar's ruled-paper look. */
  const ruleBelow = (data: DrawnCell) => {
    const yy = data.cell.y + data.cell.height;
    if (data.section === "head") rule(data.cell.x, yy, data.cell.x + data.cell.width, 85, 0.8);
    else rule(data.cell.x, yy, data.cell.x + data.cell.width);
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  // A total row's label runs across the blank cells after it ("Total Money In - Total Money Out").
  const totalRows = (opts?.totals ?? []).map((r) => {
    const span = labelSpan(r, head.length);
    const styles = { fillColor: VYAPAR_GREY, fontStyle: "bold" };
    return [
      { content: clean(r[0]), colSpan: span, styles },
      ...head.slice(span).map((_, i) => ({ content: clean(r[span + i]), styles })),
    ];
  });

  let at = y;
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
    at = lastY();
  } else {
    // Every bill is its own little table (the bill, then its items), so the column widths are fixed
    // up front — left to themselves, each bill would size its columns to its own text and no two
    // would line up with the header.
    const tw = textWidth;
    /** Wrap a cell at spaces and after hyphens ("HB/25-" / "26399") so a number is never cut mid-digit. */
    const wrapCell = (text: string, avail: number) =>
      text
        .split("\n")
        .map((line) => {
          if (tw(line) <= avail) return line;
          const out: string[] = [];
          let cur = "";
          for (const m of line.matchAll(/(\S+?-(?=\S)|\S+)(\s*)/g)) {
            const piece = m[1] + (m[2] ? " " : "");
            if (cur && tw((cur + m[1]).trimEnd()) > avail) {
              out.push(cur.trimEnd());
              cur = piece;
            } else cur += piece;
          }
          if (cur.trim()) out.push(cur.trimEnd());
          return out.join("\n");
        })
        .join("\n");
    const widths = fit(head, [...rows, ...totalsForFit], width, size);
    // Vyapar sets a bill in bold over its item lines; an entry with only a description under it
    // (the bank statement) is an ordinary row.
    const billWise = d!.head.length > 0;
    const mainCells = (r: Cell[]) => {
      doc.setFont(font, "bold");
      doc.setFontSize(size);
      return r.map((c, i) => wrapCell(clean(c), widths[i] - pad - 0.5));
    };
    const cols: Record<number, { halign?: "right"; cellWidth: number }> = {};
    widths.forEach((w, i) => (cols[i] = { cellWidth: w, ...(isRight(i) ? { halign: "right" as const } : {}) }));
    const indentCol = Math.min(Math.max(0, d!.indentCol ?? 1), head.length - 1);
    const indent = widths.slice(0, indentCol).reduce((x, w) => x + w, 0);
    const dr = d!.alignRightFrom ?? d!.head.length;
    // The item tables share one set of widths too, so they line up from one bill to the next.
    const detailCols: Record<number, { halign?: "right"; cellWidth: number }> = {};
    if (d!.head.length) {
      fit(d!.head, d!.rows.flat(), width - indent, size).forEach(
        (w, i) => (detailCols[i] = { cellWidth: w, ...(i >= dr ? { halign: "right" as const } : {}) }),
      );
    }
    const limit = pageHeight - bottom;
    const lineH = size * 1.15 + 9;

    // The header is drawn as part of the first bill on each page, so it shares that table's columns
    // exactly — a header-only table sizes itself from its own words and drifts off the rows below.
    let needHead = true;
    if (!rows.length) {
      autoTable(doc, { ...base, head: [head.map(clean)], body: [], startY: at, columnStyles: cols, didDrawCell: ruleBelow });
      at = lastY();
    }

    rows.forEach((r, ri) => {
      const lines = d!.rows[ri] ?? [];
      const foot = d!.footer?.[ri] ?? [];
      const note = d!.notes?.[ri];
      // Keep a bill and its items together when they fit a page; the header repeats on the new page.
      const wraps = Math.max(1, ...mainCells(r).map((c, i) => (doc.splitTextToSize(c, Math.max(10, widths[i] - pad)) as string[]).length));
      const need =
        wraps * size * 1.15 + 14.5 * k + (lines.length ? (lines.length + 1) * lineH + 8 : 0) + foot.length * 15 + (note ? 16 : 0) + (d!.extra?.[ri]?.length ?? 0) * 15 + 8;
      if (at + Math.min(need, 150) > limit || (at + need > limit && need < limit - pageTop - 40)) {
        doc.addPage();
        at = pageTop;
        needHead = true;
      }
      autoTable(doc, {
        ...base,
        ...(needHead ? { head: [head.map(clean)], showHead: "firstPage" } : { showHead: "never" }),
        body: [mainCells(r)],
        startY: at,
        columnStyles: cols,
        bodyStyles: billWise
          ? { fontStyle: "bold", cellPadding: { top: 8 * k, bottom: 6.5 * k, left: hpad, right: hpad } }
          : { fontStyle: "normal" },
        didDrawCell: (data: DrawnCell) => {
          if (data.section === "head") ruleBelow(data);
        },
      });
      needHead = false;
      at = lastY();
      if (lines.length) {
        autoTable(doc, {
          ...base,
          head: [d!.head.map(clean)],
          body: lines.map((l) => {
            const total = isTotalLine(l);
            return l.map((c) => (total ? { content: clean(c), styles: { fontStyle: "bold" } } : clean(c)));
          }),
          startY: at + 2,
          margin: { ...base.margin, left: margin + indent },
          tableWidth: width - indent,
          headStyles: { fillColor: VYAPAR_GREY, textColor: [0, 0, 0], fontStyle: "bold", valign: "middle" },
          columnStyles: detailCols,
          didParseCell: (data: DrawnCell) => {
            if (data.section === "head" && data.column.index >= dr) data.cell.styles.halign = "right";
          },
          didDrawCell: (data: DrawnCell) => {
            if (data.section === "head") rule(data.cell.x, data.cell.y, data.cell.x + data.cell.width, 85, 0.8);
            ruleBelow(data);
          },
        });
        at = lastY();
      }
      if (foot.length) {
        // "Sub Total" and its kin: a ruled strip under the right half of the item table.
        const x0 = margin + indent + (width - indent) * 0.5;
        const x1 = pageWidth - margin;
        doc.setFont(font, "normal");
        doc.setFontSize(size);
        doc.setTextColor(0);
        for (const [k, v] of foot) {
          if (at + 15 > limit) {
            doc.addPage();
            at = pageTop;
          }
          doc.text(clean(k), x0 + (x1 - x0) * 0.32, at + 10.5);
          doc.text(clean(v), x1 - 3.5, at + 10.5, { align: "right" });
          at += 15;
          rule(x0, at, x1);
        }
      }
      if (note) {
        const lw = (() => {
          doc.setFont(font, "bold");
          doc.setFontSize(size);
          return doc.getTextWidth("Description: ");
        })();
        doc.setFont(font, "normal");
        const below = !!d!.noteBelow;
        const text = doc.splitTextToSize(clean(note), below ? width - 8 : width - lw - 8) as string[];
        if (at + 8 + (text.length + (below ? 1 : 0)) * (size + 2.5) > limit) {
          doc.addPage();
          at = pageTop;
        }
        at += size + 5;
        doc.setFont(font, "bold");
        doc.text("Description:", margin + 3.5, at);
        doc.setFont(font, "normal");
        if (below) at += size + 3.5;
        doc.text(text, margin + 3.5 + (below ? 1 : lw), at);
        at += (text.length - 1) * (size + 2.5);
      }
      for (const [label, value] of d!.extra?.[ri] ?? []) {
        if (at + size + 8 > limit) {
          doc.addPage();
          at = pageTop;
        }
        at += size + 5;
        doc.setFontSize(size);
        doc.setFont(font, "bold");
        doc.text(`${clean(label)}:`, margin + 3.5, at);
        const lw = doc.getTextWidth(`${clean(label)}: `);
        doc.setFont(font, "normal");
        doc.text(clean(value), margin + 3.5 + lw, at, { maxWidth: width - lw - 8 });
      }
      at += 6;
      rule(margin, at, pageWidth - margin);
    });
    if (totalRows.length) {
      autoTable(doc, { ...base, body: totalRows, startY: at, columnStyles: cols, showHead: "never", didDrawCell: ruleBelow });
      at = lastY();
    }
  }

  // ---- "Total Sale: ₹ 17,27,450.00", bold on the right under everything ----
  if (opts?.grandTotal) {
    if (at + 46 > pageHeight - bottom) {
      doc.addPage();
      at = pageTop - 10;
    }
    doc.setFont(font, "bold");
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text(clean(opts.grandTotal), pageWidth - margin - 8, at + 36, { align: "right" });
  }

  stampGeneratedOn(doc, margin, firm?.footerNote);

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
  // KAN-105: a Category column only when some line has one picked — otherwise it isn't printed.
  const showCategory = invoice.lines.some((l) => l.category?.trim());
  const rows = invoice.lines.map((l, i) => [
    String(i + 1),
    l.itemName + (l.description ? `\n${l.description}` : ""),
    ...(showCategory ? [l.category?.trim() || ""] : []),
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
      ...(showCategory ? [{ label: "Category", width: 80 }] : []),
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
