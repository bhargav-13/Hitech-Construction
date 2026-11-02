"use client";

import { MAX_SCAN_PAGES, pdfPageImages, pdfTextRuns, scanPages, type PdfRun, type Progress } from "@/lib/docScan";

/**
 * Reads every row of a tender's BOQ / price schedule out of a PDF, whatever its layout.
 *
 * Most departments publish the schedule from Excel or Word, so the PDF carries a text layer. That
 * is read by its columns: the header row ("Item / Description", "Unit", "Qty", "Rate", "Amount", in
 * any wording) fixes where each column sits, and every run of text below it is filed by position.
 * A description that wraps over many lines is one row; the row ends where its quantity / rate /
 * amount sit. Instant, free and exact — no AI involved.
 *
 * A scanned schedule has no text layer; those pages go to the AI scan a few at a time ("BOQ").
 *
 * Titles are not guessed. A row with no quantity of its own (a parent description such as
 * "Dismantling of flexible pavement…" above "Bituminous courses") comes back as `heading`, and the
 * user decides whether it becomes a title.
 */

export interface BoqRow {
  srNo: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number | null;
  /** No quantity / rate of its own — introduces the rows under it. */
  heading: boolean;
}

export interface BoqReadResult {
  rows: BoqRow[];
  pages: number;
  /** "text" = read from the PDF's text layer; "ai" = scanned pages read by the AI. */
  method: "text" | "ai" | "mixed";
}

type Key = "sr" | "desc" | "unit" | "qty" | "rate" | "amount";

const HEADER: Record<Key, RegExp> = {
  sr: /^(s\.?\s*no\.?|sr\.?(\s*no\.?)?|sl\.?(\s*no\.?)?|s\.|item\s*no\.?|sno)$/i,
  desc: /^(items?|descriptions?|particulars|description\s+of\s+(the\s+)?(items?|works?)|name\s+of\s+(the\s+)?(items?|works?)|item\s+description|work\s+description|items?\s+of\s+work)\b/i,
  unit: /^(units?|uom|u\.o\.m\.?)\b/i,
  qty: /^(qty\.?|quantity|quantities|qnty\.?|estimated\s+quantity)\b/i,
  rate: /^(rates?|unit\s+rate|rate\s*\(|rate\s+in\s+(rs|figures))/i,
  amount: /^(amount|total\s+amount|amount\s*\(|amount\s+in\s+rs|total)\b/i,
};

const SKIP_ROW = /^(grand\s+)?total\b|^sub[\s-]?total\b|^carried\s+(over|forward)|^brought\s+forward|^c\/[fo]\b|^b\/f\b|^amount\s+in\s+words/i;

interface Cols {
  sr: number | null;
  /** Anything starting left of this is description (or Sr). */
  descRight: number;
  /** Numeric columns, left to right, with the x where each one starts. */
  nums: { key: "qty" | "rate" | "amount"; from: number }[];
  unitFrom: number | null;
  descLeft: number;
}

interface Line {
  page: number;
  y: number;
  desc: string;
  sr: string;
  unit: string;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  /** Printed text for the repeated header/footer check. */
  key: string;
}

const center = (r: PdfRun) => r.x + r.w / 2;

/** Indian-grouped numbers ("55,35,110.00"); a dash or blank is null. */
function num(s: string): number | null {
  const t = s.replace(/[₹,\s]|rs\.?/gi, "");
  if (!t || /^[-–—]+$/.test(t)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Runs into printed lines, top to bottom; runs on one line left to right. */
function toLines(runs: PdfRun[]): PdfRun[][] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfRun[][] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    const tol = Math.max(2, Math.min(r.h || 8, 10) * 0.45);
    if (last && Math.abs(last[0].y - r.y) <= tol) last.push(r);
    else lines.push([r]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}

function join(runs: PdfRun[]): string {
  let out = "";
  let end = -Infinity;
  for (const r of runs) {
    const gap = r.x - end;
    out += out && gap > 1 && !out.endsWith(" ") && !r.s.startsWith(" ") ? " " + r.s : r.s;
    end = r.x + r.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Look for the header row in a page's first lines; header cells may wrap over two lines. */
function findHeader(lines: PdfRun[][]): { cols: Cols; bottom: number } | null {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const y0 = lines[i][0].y;
    const found = new Map<Key, PdfRun>();
    let bottom = y0;
    for (let j = i; j < lines.length && lines[j][0].y - y0 <= 22; j++) {
      // A header cell can be split into several runs ("S." / "No"), or two words of one run.
      for (const r of lines[j]) {
        const t = r.s.trim();
        for (const k of Object.keys(HEADER) as Key[]) {
          if (!found.has(k) && HEADER[k].test(t)) {
            // "Item No" is a serial column, not the description.
            if (k === "desc" && HEADER.sr.test(t)) continue;
            found.set(k, r);
            bottom = Math.max(bottom, lines[j][0].y);
          }
        }
      }
    }
    const desc = found.get("desc");
    const hasNumbers = found.has("qty") && (found.has("rate") || found.has("amount"));
    if (!desc || !hasNumbers) continue;

    const numKeys = (["qty", "rate", "amount"] as const)
      .filter((k) => found.has(k))
      .map((k) => ({ key: k, c: center(found.get(k)!) }))
      .filter((n) => n.c > center(desc))
      .sort((a, b) => a.c - b.c);
    if (!numKeys.length) continue;
    const unit = found.get("unit");
    const unitC = unit && center(unit) > center(desc) && center(unit) < numKeys[0].c ? center(unit) : null;
    const firstNumC = numKeys[0].c;
    // A column starts halfway from the previous header — numbers are right-aligned under theirs.
    const nums = numKeys.map((n, idx) => ({
      key: n.key,
      from: idx === 0 ? (unitC != null ? (unitC + firstNumC) / 2 : firstNumC - 40) : (numKeys[idx - 1].c + n.c) / 2,
    }));
    const unitFrom = unitC != null ? unit!.x - Math.max(18, unit!.w) : null;
    // The serial column ends just after its own header ("S. No" is narrow and left-most); the
    // description header is usually centred over a wide column, so its x says nothing about where
    // the description text starts.
    const srRuns = lines
      .slice(i, i + 4)
      .flat()
      .filter((r) => r.y - y0 <= 22 && r.x + r.w < desc.x && (HEADER.sr.test(r.s.trim()) || /^no\.?$/i.test(r.s.trim())));
    const srRight = srRuns.length ? Math.max(...srRuns.map((r) => r.x + r.w)) : null;
    for (const r of srRuns) bottom = Math.max(bottom, r.y);
    return {
      cols: {
        sr: srRight,
        descLeft: srRight != null ? srRight + 3 : -Infinity,
        descRight: unitFrom ?? nums[0].from,
        nums,
        unitFrom,
      },
      bottom,
    };
  }
  return null;
}

function readLine(page: number, runs: PdfRun[], cols: Cols): Line {
  const desc: PdfRun[] = [];
  const sr: PdfRun[] = [];
  const unit: PdfRun[] = [];
  const vals: Record<"qty" | "rate" | "amount", PdfRun[]> = { qty: [], rate: [], amount: [] };
  for (const r of runs) {
    const c = center(r);
    if (r.x < cols.descLeft) sr.push(r);
    else if (r.x < cols.descRight) desc.push(r);
    else if (cols.unitFrom != null && c < cols.nums[0].from) unit.push(r);
    else {
      let k = cols.nums[0].key;
      for (const n of cols.nums) if (c >= n.from) k = n.key;
      vals[k].push(r);
    }
  }
  const text = (rs: PdfRun[]) => join(rs);
  return {
    page,
    y: runs[0].y,
    desc: text(desc),
    sr: text(sr),
    unit: text(unit),
    qty: num(text(vals.qty)),
    rate: num(text(vals.rate)),
    amount: num(text(vals.amount)),
    // Text and height together: a running header sits at the same place on every page, while a
    // repeated phrase inside the table (an SOR reference) moves about.
    key: `${Math.round(runs[0].y / 4)}|${join(runs)}`,
  };
}

/** Text-layer read. Null when no page has a recognisable header row. */
function readText(pages: PdfRun[][]): BoqRow[] | null {
  let cols: Cols | null = null;
  const lines: Line[] = [];
  pages.forEach((runs, p) => {
    if (!runs.length) return;
    const printed = toLines(runs);
    const head = findHeader(printed);
    if (head) cols = head.cols;
    if (!cols) return;
    for (const l of printed) {
      if (head && l[0].y <= head.bottom + 1) continue;
      lines.push(readLine(p, l, cols));
    }
  });
  if (!cols || !lines.length) return null;

  // Running headers / footers (department name, "Signature of contractor") repeat on most pages.
  const pageCount = new Set(lines.map((l) => l.page)).size;
  if (pageCount >= 3) {
    const seen = new Map<string, Set<number>>();
    for (const l of lines) (seen.get(l.key) ?? seen.set(l.key, new Set()).get(l.key)!).add(l.page);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.qty == null && l.rate == null && l.amount == null && (seen.get(l.key)?.size ?? 0) >= Math.max(3, pageCount / 2)) lines.splice(i, 1);
    }
  }

  const priced = (l: Line) => l.qty != null || l.rate != null || l.amount != null || !!l.unit;
  const keep = lines.filter((l) => {
    // A bare page number in a numeric column.
    if (!l.desc && !l.unit && !l.sr && [l.qty, l.rate, l.amount].filter((v) => v != null).length === 1 && Number.isInteger(l.qty ?? l.rate ?? l.amount)) {
      return false;
    }
    return !!(l.desc || l.sr || priced(l));
  });

  // Line spacing inside a cell; a bigger gap is a new table row.
  const gaps: number[] = [];
  for (let i = 1; i < keep.length; i++) if (keep[i].page === keep[i - 1].page) gaps.push(keep[i].y - keep[i - 1].y);
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length * 0.3)] : 12;
  const newRow = (prev: Line | undefined, cur: Line) => !prev || prev.page !== cur.page || cur.y - prev.y > lineGap * 1.12 || !!cur.sr;

  // A unit printed a line above its row's numbers ("Meter" wrapped differently in its cell) belongs
  // with them — on its own it would end the row early.
  for (let i = 0; i + 1 < keep.length; i++) {
    const a = keep[i];
    const b = keep[i + 1];
    const aNums = a.qty != null || a.rate != null || a.amount != null;
    const bNums = b.qty != null || b.rate != null || b.amount != null;
    if (a.unit && !aNums && bNums && !b.unit && !newRow(a, b)) {
      b.unit = a.unit;
      a.unit = "";
    }
  }

  // Do the numbers sit on a row's last line (Excel's default, so most schedules) or its first (Word
  // tables)? Gaps between rows are too uneven to tell, but the first line under each page's header
  // is: a wrapped description starts there with no numbers when they are bottom-aligned.
  let bottomVotes = 0;
  let topVotes = 0;
  for (let i = 0; i < keep.length; i++) {
    if (i > 0 && keep[i - 1].page === keep[i].page) continue;
    const next = keep[i + 1];
    if (!priced(keep[i]) && keep[i].desc && next && next.page === keep[i].page && !newRow(keep[i], next)) bottomVotes++;
    else if (priced(keep[i]) && keep[i].desc && next && !priced(next) && next.desc && !newRow(keep[i], next)) topVotes++;
  }
  const numbersOnTop = topVotes > bottomVotes;

  const rows: BoqRow[] = [];
  let buf: Line[] = [];
  const flushHeading = () => {
    const text = buf.map((b) => b.desc).filter(Boolean).join(" ").trim();
    const srNo = buf.find((b) => b.sr)?.sr ?? "";
    if (text && !SKIP_ROW.test(text)) rows.push({ srNo, description: text, unit: "", qty: 0, rate: 0, amount: null, heading: true });
    buf = [];
  };
  const emit = (desc: Line[], at: Line) => {
    const text = desc.map((b) => b.desc).filter(Boolean).join(" ").trim();
    if (SKIP_ROW.test(text) || (!text && at.qty == null && at.rate == null)) return;
    let qty = at.qty;
    if (qty == null && at.rate && at.amount) qty = Math.round((at.amount / at.rate) * 1000) / 1000;
    rows.push({
      srNo: desc.find((b) => b.sr)?.sr ?? at.sr ?? "",
      description: text,
      unit: at.unit,
      qty: qty ?? 0,
      rate: at.rate ?? (qty && at.amount ? Math.round((at.amount / qty) * 100) / 100 : 0),
      amount: at.amount,
      heading: false,
    });
  };

  if (numbersOnTop) {
    let cur: { desc: Line[]; at: Line } | null = null;
    let prev: Line | undefined;
    for (const l of keep) {
      if (priced(l)) {
        if (cur) emit(cur.desc, cur.at);
        else if (buf.length) flushHeading();
        cur = { desc: [l], at: l };
      } else if (cur && !newRow(prev, l)) {
        cur.desc.push(l);
      } else {
        if (cur) emit(cur.desc, cur.at);
        cur = null;
        if (buf.length && newRow(prev, l)) flushHeading();
        buf.push(l);
      }
      prev = l;
    }
    if (cur) emit(cur.desc, cur.at);
    if (buf.length) flushHeading();
  } else {
    let prev: Line | undefined;
    for (const l of keep) {
      // Text above that ended in its own row (a bigger gap) was a heading over this one.
      if (buf.length && newRow(prev, l)) flushHeading();
      if (priced(l)) {
        emit([...buf, l], l);
        buf = [];
      } else {
        buf.push(l);
      }
      prev = l;
    }
    if (buf.length) flushHeading();
  }

  // Notes and conditions printed under the table are not rows.
  while (rows.length && rows[rows.length - 1].heading) rows.pop();

  // Number the rows the PDF left unnumbered, the way the schedule reads.
  let n = 0;
  for (const r of rows) {
    if (r.heading) continue;
    n++;
    if (!r.srNo) r.srNo = String(n);
  }
  return rows.length ? rows : null;
}

/** Scanned pages, a few per AI call. */
async function readWithAi(file: File, onProgress?: Progress): Promise<{ rows: BoqRow[]; pages: number }> {
  const batch = Math.min(3, MAX_SCAN_PAGES);
  const rows: BoqRow[] = [];
  let total = 1;
  for (let from = 1; from <= total; from += batch) {
    onProgress?.(total > 1 ? `Reading pages ${from}–${Math.min(total, from + batch - 1)} of ${total} with AI…` : "Reading with AI…");
    const imgs = await pdfPageImages(file, from, batch);
    total = imgs.total;
    if (!imgs.pages.length) break;
    const res = await scanPages("BOQ", imgs.pages);
    for (const r of res.rows ?? []) {
      const description = (r.description ?? "").trim();
      if (!description || SKIP_ROW.test(description)) continue;
      const heading = !!r.heading || (r.quantity == null && r.rate == null && r.amount == null && !r.unit);
      rows.push({
        srNo: r.srNo ?? "",
        description,
        unit: r.unit ?? "",
        qty: r.quantity ?? (r.rate && r.amount ? Math.round((r.amount / r.rate) * 1000) / 1000 : 0),
        rate: r.rate ?? 0,
        amount: r.amount,
        heading,
      });
    }
  }
  return { rows, pages: total };
}

async function imageFileRows(file: File): Promise<BoqRow[]> {
  const { fileToPages } = await import("@/lib/docScan");
  const pages = await fileToPages(file);
  const res = await scanPages("BOQ", pages);
  return (res.rows ?? [])
    .filter((r) => r.description && !SKIP_ROW.test(r.description))
    .map((r) => ({
      srNo: r.srNo ?? "",
      description: r.description!.trim(),
      unit: r.unit ?? "",
      qty: r.quantity ?? 0,
      rate: r.rate ?? 0,
      amount: r.amount,
      heading: !!r.heading || (r.quantity == null && r.rate == null && r.amount == null),
    }));
}

/** Every row of the schedule in the file — text layer first, AI for scans and photos. */
export async function readBoq(file: File, onProgress?: Progress): Promise<BoqReadResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    onProgress?.("Reading with AI…");
    return { rows: await imageFileRows(file), pages: 1, method: "ai" };
  }
  const pages = await pdfTextRuns(file, onProgress);
  const textPages = pages.filter((p) => p.length > 5).length;
  // Mostly text: read the layer. A schedule whose layer yields nothing (odd fonts, image tables)
  // still gets the AI.
  if (textPages >= Math.max(1, pages.length / 2)) {
    onProgress?.("Reading the table…");
    const rows = readText(pages);
    if (rows && rows.some((r) => !r.heading)) return { rows, pages: pages.length, method: "text" };
  }
  const ai = await readWithAi(file, onProgress);
  return { rows: ai.rows, pages: ai.pages, method: textPages ? "mixed" : "ai" };
}

/** Exposed for tests. */
export const __test = { readText, toLines, findHeader, readLine };
