/**
 * The one PDF renderer behind every designed document — invoices, purchase orders, RFQs, work
 * orders. Callers describe *what* is on the document as a {@link PrintModel}; the company's saved
 * {@link DocTemplate} decides *how* it looks. Real vector text through jsPDF + autotable.
 *
 * The default ("classic") reproduces the client's Onsite documents: logo + firm block top-left,
 * title and number top-right, a hairline, two grey detail panels, a dark-headed item table, then
 * totals, words, bank, terms and the signature over "Authorised Signatory".
 */

import type { jsPDF as JsPdf } from "jspdf";
import { amountInWords, getAppLogo, getCachedFirmProfile, imageSize } from "./vyaparExport";
import { getTemplate, type DocKind, type DocTemplate } from "./docTemplates";
import type { FirmProfile } from "./vyaparApi";
import { todayIST } from "@/lib/datetime";

export type Align = "left" | "right" | "center";

export interface PrintColumn {
  label: string;
  align?: Align;
  /** Points; omit to share the leftover width. */
  width?: number;
  /** Lets the template hide it: "hsn" follows show.hsn, "tax" follows show.tax. */
  key?: "hsn" | "tax";
}

export interface PrintModel {
  kind: DocKind;
  /** For the file name, e.g. "PO-7". */
  number: string;
  /** Right-aligned under the title: [["RFQ No:", "Sluice & Air Valve7"], ["RFQ Date:", "12-Oct-26"]]. */
  meta: [string, string][];
  /** Up to two grey panels under the header, left then right. Each row is label + value. */
  panels: { title?: string; rows: [string, string][] }[];
  /** Bill To / Ship To style address blocks. */
  addresses?: { title: string; lines: string[] }[];
  columns: PrintColumn[];
  /** Cell text, one array per row, same order as `columns`. A cell may hold "\n" for a sub-line. */
  rows: string[][];
  /** Rows under the item table, right side. `strong` marks the grand total. */
  totals?: { label: string; value: string; strong?: boolean }[];
  /** GST rate-wise summary, printed left of the totals. */
  taxSummary?: { head: string[]; body: string[][]; foot?: string[] };
  /** The grand total, spelled out when the template asks for it. */
  amountForWords?: number | null;
  bank?: [string, string][];
  terms?: string | null;
  /** Free notes printed above the terms. */
  notes?: string | null;
}

const FONT = { small: 0.92, normal: 1, large: 1.1 } as const;

/** jsPDF's standard fonts have no ₹ glyph; it prints as "¹" and breaks column widths. */
const clean = (s: string | null | undefined) => String(s ?? "").replace(/₹\s?/g, "Rs. ");

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [33, 37, 41];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Image format jsPDF should decode a data URL as. */
function imgFormat(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

async function drawImageFit(doc: JsPdf, dataUrl: string, x: number, y: number, maxW: number, maxH: number, alignRight = false) {
  try {
    const { width, height } = await imageSize(dataUrl);
    const scale = Math.min(maxW / width, maxH / height);
    const w = width * scale;
    const h = height * scale;
    doc.addImage(dataUrl, imgFormat(dataUrl), alignRight ? x + maxW - w : x, y + (maxH - h), w, h);
    return { w, h };
  } catch {
    return { w: 0, h: 0 };
  }
}

/**
 * The letterhead every designed document starts with: logo and firm block on the left, the title
 * and its meta rows (number, date) on the right, then a hairline — or a colour band in the "band"
 * style. Shared by documents and HR letters so the two can never drift apart. Returns the y to
 * continue from.
 */
async function drawLetterhead(
  doc: JsPdf,
  tpl: DocTemplate,
  firm: FirmProfile | null,
  meta: [string, string][],
  titleText: string,
): Promise<number> {
  const fs = FONT[tpl.fontScale] ?? 1;
  const accent = hexToRgb(tpl.accent);
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;
  const contentW = pageW - M * 2;
  const firmName = tpl.companyName.trim() || firm?.businessName || "";
  const firmAddress = tpl.companyAddress.trim() || firm?.address || "";
  const ink = () => doc.setTextColor(33, 37, 41);
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size * fs);
  };

  const band = tpl.style === "band";
  let y = 30;
  let textX = M;
  if (band) {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageW, 100, "F");
  }
  const logo = tpl.showLogo ? firm?.logoDataUrl || (await getAppLogo()) : null;
  if (logo) {
    if (band) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M - 4, y - 4, 66, 58, 4, 4, "F");
    } else {
      doc.setFillColor(246, 247, 249);
      doc.roundedRect(M - 4, y - 4, 66, 58, 6, 6, "F");
    }
    await drawImageFit(doc, logo, M, y, 58, 50);
    textX = M + 76;
  }

  // Firm block
  const firmLines: string[] = [];
  if (firmAddress) firmLines.push(...(doc.splitTextToSize(clean(firmAddress), 250) as string[]));
  if (tpl.showContact) {
    const c = [firm?.phone, firm?.email].filter(Boolean).join("  ·  ");
    if (c) firmLines.push(c);
  }
  font("bold", 10.5);
  if (band) doc.setTextColor(255, 255, 255);
  else ink();
  if (firmName) doc.text(clean(firmName), textX, y + 8);
  font("normal", 9);
  if (band) doc.setTextColor(214, 226, 240);
  else ink();
  let fy = y + 22;
  for (const l of firmLines.slice(0, 5)) {
    doc.text(l, textX, fy);
    fy += 12;
  }
  if (tpl.showGstin && firm?.gstin) {
    font("normal", 8);
    doc.text(`GST : ${firm.gstin}`, textX, fy);
    fy += 12;
  }

  // Title + meta, right side
  const title = clean(titleText);
  font("bold", 18);
  if (band) doc.setTextColor(255, 255, 255);
  else ink();
  if (title) doc.text(title, pageW - M, y + 16, { align: "right" });
  let my = title ? y + 40 : y + 8;
  for (const [label, value] of meta) {
    font("bold", 9);
    doc.text(clean(label), pageW - M - 150, my, { align: "right" });
    font("normal", 9);
    const v = doc.splitTextToSize(clean(value), 130) as string[];
    doc.text(v, pageW - M, my, { align: "right" });
    my += 13 * Math.max(1, v.length);
  }

  y = Math.max(fy, my, logo ? y + 58 : y) + 6;
  if (band) y = Math.max(y, 110);
  if (tpl.headerNote.trim()) {
    font("normal", 8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(doc.splitTextToSize(clean(tpl.headerNote), contentW) as string[], M, y + 4);
    y += 14;
  }
  if (!band) {
    doc.setDrawColor(222, 226, 230);
    doc.setLineWidth(1);
    doc.line(M, y, pageW - M, y);
  }
  return y + 18;
}

/**
 * Draw a document. Returns the jsPDF instance so the designer can preview it in an iframe; pass
 * `save: true` to download it instead.
 */
export async function renderDocPdf(
  model: PrintModel,
  opts: { template?: DocTemplate; firm?: FirmProfile | null; save?: boolean } = {},
): Promise<JsPdf> {
  const [{ jsPDF }, autoTableMod, tpl, firmLoaded] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    opts.template ? Promise.resolve(opts.template) : getTemplate(model.kind),
    opts.firm !== undefined ? Promise.resolve(opts.firm) : getCachedFirmProfile(),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;
  const lastY = (d: JsPdf) => (d as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const firm = firmLoaded;
  const fs = FONT[tpl.fontScale] ?? 1;
  const accent = hexToRgb(tpl.accent);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = pageW - M * 2;
  const bottomLimit = pageH - 56;

  const firmName = tpl.companyName.trim() || firm?.businessName || "";
  const ink = () => doc.setTextColor(33, 37, 41);
  const grey = (n = 90) => doc.setTextColor(n, n, n);
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size * fs);
  };
  /** Start a new page when `need` points won't fit. */
  const ensure = (y: number, need: number) => {
    if (y + need <= bottomLimit) return y;
    doc.addPage();
    return 50;
  };

  // ================= Header =================
  let y = await drawLetterhead(doc, tpl, firm, model.meta, tpl.title || "");

  // ================= Detail panels =================
  const panels = tpl.show.partyPanel ? model.panels.filter((p) => p.rows.length) : [];
  if (panels.length) {
    const gap = 12;
    const w = panels.length === 1 ? contentW : (contentW - gap) / 2;
    const heights = panels.map((p) => {
      font("normal", 9);
      let h = 12 + (p.title ? 14 : 0);
      for (const [, v] of p.rows) h += 15 * Math.max(1, (doc.splitTextToSize(clean(v) || "N/A", w - 120) as string[]).length);
      return h + 2;
    });
    const h = Math.max(...heights);
    y = ensure(y, h);
    panels.forEach((p, i) => {
      const x = M + i * (w + gap);
      doc.setFillColor(246, 247, 249);
      doc.rect(x, y, w, h, "F");
      let py = y + 16;
      if (p.title) {
        font("bold", 8.5);
        grey(110);
        doc.text(clean(p.title).toUpperCase(), x + 10, py);
        py += 14;
      }
      for (const [label, value] of p.rows) {
        font("bold", 9);
        ink();
        doc.text(clean(label), x + 10, py);
        font("normal", 9);
        const lines = doc.splitTextToSize(clean(value) || "N/A", w - 120) as string[];
        doc.text(lines, x + 108, py);
        py += 15 * Math.max(1, lines.length);
      }
    });
    y += h + 16;
  }

  // ================= Addresses =================
  const addresses = tpl.show.addresses ? (model.addresses ?? []).filter((a) => a.lines.length) : [];
  if (addresses.length) {
    const gap = 12;
    const w = addresses.length === 1 ? contentW : (contentW - gap) / 2;
    font("normal", 9);
    const wrapped = addresses.map((a) => a.lines.flatMap((l) => doc.splitTextToSize(clean(l), w - 20) as string[]));
    const h = 22 + Math.max(...wrapped.map((l) => l.length)) * 12;
    y = ensure(y, h);
    addresses.forEach((a, i) => {
      const x = M + i * (w + gap);
      doc.setDrawColor(222, 226, 230);
      doc.setLineWidth(0.75);
      doc.rect(x, y, w, h);
      font("bold", 8.5);
      grey(110);
      doc.text(clean(a.title).toUpperCase(), x + 10, y + 14);
      font("normal", 9);
      ink();
      wrapped[i].forEach((l, j) => doc.text(l, x + 10, y + 28 + j * 12));
    });
    y += h + 16;
  }

  // ================= Item table =================
  const keep = model.columns.map((c) => (c.key === "hsn" ? tpl.show.hsn : c.key === "tax" ? tpl.show.tax : true));
  const cols = model.columns.filter((_, i) => keep[i]);
  const rows = model.rows.map((r) =>
    r
      .filter((_, i) => keep[i])
      .map((cell) => {
        const text = clean(cell);
        // The second line of an item cell is its description; the template may drop it.
        return tpl.show.itemDescription ? text : text.split("\n")[0];
      }),
  );
  const columnStyles: Record<number, { halign?: Align; cellWidth?: number }> = {};
  cols.forEach((c, i) => {
    columnStyles[i] = { halign: c.align ?? "left", ...(c.width ? { cellWidth: c.width } : {}) };
  });
  autoTable(doc, {
    head: [cols.map((c) => clean(c.label))],
    body: rows,
    startY: ensure(y, 60),
    theme: "grid",
    styles: { fontSize: 9 * fs, cellPadding: 6, lineColor: [222, 226, 230], lineWidth: 0.6, textColor: [33, 37, 41], valign: "middle" },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold", lineColor: [255, 255, 255], lineWidth: 0.8 },
    // The header row's alignment follows each column's, as Onsite's does (Qty / Amount right).
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (data.section === "head") data.cell.styles.halign = cols[data.column.index]?.align ?? "left";
    },
    columnStyles,
    margin: { left: M, right: M, bottom: 56 },
  });
  y = lastY(doc) + 2;

  // ================= Totals (right) + tax summary (left) =================
  const totals = tpl.show.totals ? (model.totals ?? []) : [];
  const summary = tpl.show.taxSummary ? model.taxSummary : undefined;
  if (totals.length || summary) {
    const startY = ensure(y + 10, 90);
    let leftEnd = startY;
    if (summary) {
      autoTable(doc, {
        head: [summary.head.map(clean)],
        body: summary.body.map((r) => r.map(clean)),
        ...(summary.foot ? { foot: [summary.foot.map(clean)] } : {}),
        startY,
        tableWidth: contentW * 0.52,
        theme: "grid",
        styles: { fontSize: 8 * fs, cellPadding: 4, lineColor: [222, 226, 230], lineWidth: 0.5, halign: "right", textColor: [33, 37, 41] },
        headStyles: { fillColor: [246, 247, 249], textColor: [33, 37, 41], fontStyle: "bold", halign: "right" },
        footStyles: { fillColor: [246, 247, 249], textColor: [33, 37, 41], fontStyle: "bold", halign: "right" },
        columnStyles: { 0: { halign: "left" } },
        margin: { left: M, right: M },
      });
      leftEnd = lastY(doc);
    }
    if (totals.length) {
      const tw = 230;
      autoTable(doc, {
        body: totals.map((t) => [clean(t.label), clean(t.value)]),
        startY,
        tableWidth: tw,
        theme: "grid",
        styles: { fontSize: 9 * fs, cellPadding: 6, lineColor: [222, 226, 230], lineWidth: 0.6, textColor: [33, 37, 41] },
        columnStyles: { 0: { halign: "right" }, 1: { halign: "right", cellWidth: 100 } },
        didParseCell: (data: { row: { index: number }; cell: { styles: { fontStyle: string; fillColor?: number[] } } }) => {
          if (totals[data.row.index]?.strong) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [246, 247, 249];
          }
        },
        margin: { left: pageW - M - tw, right: M },
      });
      y = Math.max(leftEnd, lastY(doc));
    } else {
      y = leftEnd;
    }
  }
  y += 22;

  // ================= Words + bank =================
  const sigW = 190;
  const sigX = pageW - M - sigW;
  const leftW = sigX - M - 20;
  const blockTop = ensure(y, 60);
  let ly = blockTop;

  if (tpl.show.amountInWords && model.amountForWords != null) {
    font("bold", 9);
    ink();
    doc.text("Total in words", M, ly);
    font("normal", 9);
    const w = doc.splitTextToSize(amountInWords(model.amountForWords), leftW) as string[];
    doc.text(w, M, ly + 13);
    ly += 13 + w.length * 12 + 10;
  }
  if (tpl.show.bank && model.bank?.length) {
    font("bold", 9);
    ink();
    doc.text("Bank Details", M, ly);
    ly += 14;
    for (const [label, value] of model.bank) {
      font("bold", 9);
      doc.text(clean(label), M, ly);
      font("normal", 9);
      doc.text(doc.splitTextToSize(clean(value) || "N/A", leftW - 90) as string[], M + 90, ly);
      ly += 13;
    }
    ly += 8;
  }

  y = ly;

  // ================= Notes + terms =================
  const terms = (model.terms && model.terms.trim()) || tpl.defaultTerms.trim();
  const blocks: [string, string][] = [];
  if (model.notes?.trim()) blocks.push(["Notes", model.notes.trim()]);
  if (tpl.show.terms && terms) blocks.push(["Terms & Conditions", terms]);
  for (const [heading, body] of blocks) {
    y = ensure(y + 4, 40);
    font("bold", 9.5);
    ink();
    doc.text(heading, M, y);
    y += 14;
    font("normal", 9);
    grey(60);
    for (const line of doc.splitTextToSize(clean(body), contentW) as string[]) {
      y = ensure(y, 12);
      doc.text(line, M, y);
      y += 12;
    }
    y += 10;
  }

  // ================= Signature, bottom right (after terms, as on Onsite's documents) =================
  if (tpl.show.signature) {
    let sy = ensure(y + 6, 100);
    if (tpl.forFirmLine && firmName) {
      font("normal", 9);
      grey(90);
      doc.text(`For ${clean(firmName)}`, pageW - M, sy, { align: "right" });
      sy += 6;
    }
    if (tpl.stampImage) await drawImageFit(doc, tpl.stampImage, sigX - 6, sy, 70, 64);
    if (tpl.signatureImage) await drawImageFit(doc, tpl.signatureImage, sigX + 30, sy, sigW - 30, 64, true);
    const lineY = sy + 70;
    doc.setDrawColor(200, 204, 208);
    doc.setLineWidth(0.8);
    doc.line(sigX, lineY, pageW - M, lineY);
    font("bold", 9);
    ink();
    doc.text(clean(tpl.signatory || "Authorised Signatory"), sigX + sigW / 2, lineY + 13, { align: "center" });
    y = lineY + 28;
  }

  // ================= Footer on every page =================
  const pages = doc.getNumberOfPages();
  const footer = tpl.footerNote.trim() || firm?.footerNote || "";
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font("normal", 7.5);
    grey(140);
    if (footer) doc.text(doc.splitTextToSize(clean(footer), contentW - 70) as string[], M, pageH - 24);
    if (tpl.show.pageNumbers && pages > 1) doc.text(`Page ${p} of ${pages}`, pageW - M, pageH - 24, { align: "right" });
  }

  if (opts.save) {
    const safe = (model.number || tpl.title || "document").replace(/[\\/:*?"<>|\s]+/g, "-");
    doc.save(`${safe}-${todayIST()}.pdf`);
  }
  return doc;
}

/** "12-Oct-26", the date format on the client's Onsite documents. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1].slice(2)}`;
}

/** Indian-grouped figure with fixed places, "1,600.000". */
export function fig(n: number | null | undefined, places = 2): string {
  return Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places });
}

/**
 * An HR letter (Templates → Payroll): the shared letterhead with Ref / Date on the right, the
 * heading centred, the employee's "To" block, the subject, the wording, and the signature. Text
 * arrives already filled; `{{placeholders}}` are resolved by the caller (see lib/letters.ts).
 */
export async function renderLetterPdf(
  letter: {
    kind: DocKind;
    subject: string;
    body: string;
    date: string;
    refNo?: string | null;
    /** The "To" block — name, designation, address. Empty for to-whom-it-may-concern letters. */
    to?: string[];
    /** Employee name for the acceptance line on offer / appointment letters. */
    acceptanceBy?: string | null;
    fileName?: string;
  },
  opts: { template?: DocTemplate; firm?: FirmProfile | null; save?: boolean } = {},
): Promise<JsPdf> {
  const [{ jsPDF }, tpl, firm] = await Promise.all([
    import("jspdf"),
    opts.template ? Promise.resolve(opts.template) : getTemplate(letter.kind),
    opts.firm !== undefined ? Promise.resolve(opts.firm) : getCachedFirmProfile(),
  ]);
  const fs = FONT[tpl.fontScale] ?? 1;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 56;
  const contentW = pageW - M * 2;
  const bottomLimit = pageH - 60;
  const firmName = tpl.companyName.trim() || firm?.businessName || "";
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size * fs);
  };
  const ink = () => doc.setTextColor(33, 37, 41);
  const ensure = (y: number, need: number) => {
    if (y + need <= bottomLimit) return y;
    doc.addPage();
    return 56;
  };

  const meta: [string, string][] = [];
  if (letter.refNo?.trim()) meta.push(["Ref No:", letter.refNo.trim()]);
  meta.push(["Date:", letter.date]);
  let y = await drawLetterhead(doc, tpl, firm, meta, "");

  // Heading, centred and underlined.
  const heading = clean(tpl.title || "");
  if (heading) {
    font("bold", 14);
    ink();
    doc.text(heading, pageW / 2, y + 6, { align: "center" });
    const w = doc.getTextWidth(heading);
    doc.setDrawColor(33, 37, 41);
    doc.setLineWidth(0.8);
    doc.line(pageW / 2 - w / 2, y + 9, pageW / 2 + w / 2, y + 9);
    y += 34;
  }

  // To block
  if (tpl.show.partyPanel && letter.to?.length) {
    font("normal", 10.5);
    ink();
    doc.text("To,", M, y);
    y += 15;
    letter.to.forEach((line, i) => {
      font(i === 0 ? "bold" : "normal", 10.5);
      for (const l of doc.splitTextToSize(clean(line), contentW / 1.6) as string[]) {
        doc.text(l, M, y);
        y += 14;
      }
    });
    y += 10;
  }

  // Subject
  if (letter.subject.trim()) {
    y = ensure(y, 20);
    font("bold", 10.5);
    ink();
    const subj = doc.splitTextToSize(`Subject: ${clean(letter.subject)}`, contentW) as string[];
    doc.text(subj, M, y);
    y += 15 * subj.length + 10;
  }

  // Body — paragraphs keep their blank lines; long lines wrap.
  font("normal", 10.5);
  ink();
  const lineH = 15 * fs;
  for (const para of clean(letter.body).split("\n")) {
    if (!para.trim()) {
      y += lineH * 0.6;
      continue;
    }
    for (const l of doc.splitTextToSize(para, contentW) as string[]) {
      y = ensure(y, lineH);
      doc.text(l, M, y);
      y += lineH;
    }
  }

  // Signature, on the left as letters are signed; acceptance on the right where asked for.
  y = ensure(y + 24, 130);
  if (tpl.show.signature) {
    font("normal", 10.5);
    ink();
    doc.text("Yours sincerely,", M, y);
    y += 16;
    if (tpl.forFirmLine && firmName) {
      font("bold", 10.5);
      doc.text(`For ${clean(firmName)}`, M, y);
      y += 6;
    }
    const top = y;
    if (tpl.signatureImage) await drawImageFit(doc, tpl.signatureImage, M, top, 150, 56);
    if (tpl.stampImage) await drawImageFit(doc, tpl.stampImage, M + 160, top - 4, 70, 64);
    const lineY = top + 62;
    doc.setDrawColor(200, 204, 208);
    doc.setLineWidth(0.8);
    doc.line(M, lineY, M + 170, lineY);
    font("bold", 10);
    ink();
    doc.text(clean(tpl.signatory || "Authorised Signatory"), M, lineY + 14);

    if (letter.acceptanceBy) {
      const x = pageW - M - 190;
      doc.line(x, lineY, pageW - M, lineY);
      font("normal", 9.5);
      doc.text("Accepted by", x, lineY + 14);
      font("bold", 10);
      doc.text(clean(letter.acceptanceBy), x, lineY + 28);
      font("normal", 9);
      doc.setTextColor(120, 120, 120);
      doc.text("Signature & date", x, lineY + 41);
    }
    y = lineY + 50;
  }

  const pages = doc.getNumberOfPages();
  const footer = tpl.footerNote.trim() || firm?.footerNote || "";
  for (let pg = 1; pg <= pages; pg++) {
    doc.setPage(pg);
    font("normal", 7.5);
    doc.setTextColor(140, 140, 140);
    if (footer) doc.text(doc.splitTextToSize(clean(footer), contentW - 70) as string[], M, pageH - 26);
    if (tpl.show.pageNumbers && pages > 1) doc.text(`Page ${pg} of ${pages}`, pageW - M, pageH - 26, { align: "right" });
  }

  if (opts.save) {
    const safe = (letter.fileName || tpl.title || "letter").replace(/[\/:*?"<>|\s]+/g, "-");
    doc.save(`${safe}.pdf`);
  }
  return doc;
}
