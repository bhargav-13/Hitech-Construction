/**
 * Generates src/lib/tenderAnalysisSeed.ts from the client's tender-analysis workbook.
 *
 * The workbook keeps a priced BOQ at the top of each sheet and then LABOUR / MATERIAL / SITE
 * EXPENCES blocks below it, which have to be reconciled against the BOQ by hand. The app prices
 * everything on the item instead, so this script folds those blocks back onto the BOQ lines:
 *
 *   - a LABOUR or MATERIAL row whose item name matches a BOQ line sets that line's rate directly;
 *   - a lump-sum row ("road, ₹6.31 Cr LS") is matched to the BOQ line or family whose amount it
 *     equals — the workbook's own subtotals make these exact, not guesses — and spread by value;
 *   - anything still unattributed is spread across the still-uncosted lines by value, so the
 *     per-line rates always add back up to the sheet's own labour + material totals.
 *
 * Regenerate rather than hand-edit:  node scripts/generate-tender-analysis-seed.mjs
 */
import XLSX from "xlsx";
import { writeFileSync } from "node:fs";

const SRC = process.argv[2] ?? "C:/Users/bharg/Downloads/tender analisis boq.xlsx";
const OUT = "src/lib/tenderAnalysisSeed.ts";
const MAIN_SHEET = "20cr";

const wb = XLSX.readFile(SRC);

/* ---------------- helpers ---------------- */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v == null ? "" : String(v).trim());
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const rowsOf = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The Sub Total column holds `SUM(Fa:Fb)` — those ranges are the client's actual item families,
 * which srNo prefixes only approximate (rows 1–6 are one "excavation" family with no shared stem).
 */
function groupRangesFromFormulas(ws, col, lastRow) {
  const out = [];
  for (let r = 1; r <= lastRow; r += 1) {
    const cell = ws[`${col}${r + 1}`];
    if (!cell?.f) continue;
    const m = String(cell.f).match(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/i);
    if (!m) continue;
    out.push({ startRow: Number(m[2]) - 1, endRow: Number(m[4]) - 1 });
  }
  return out;
}

/** A family name from its lines' longest common leading / trailing word runs. */
const UNIT_FRAGMENT = /^(mm|cm|m|dia|kg|no|nos|mm\)|\)|-|–|&)$/i;

function familyLabel(descriptions) {
  if (descriptions.length === 1) return descriptions[0];
  const toks = descriptions.map((d) => d.split(/\s+/));
  const shortest = Math.min(...toks.map((t) => t.length));

  let pre = 0;
  while (pre < shortest && toks.every((t) => t[pre].toLowerCase() === toks[0][pre].toLowerCase())) pre += 1;

  let suf = 0;
  while (
    suf < shortest - pre &&
    toks.every((t) => t[t.length - 1 - suf].toLowerCase() === toks[0][toks[0].length - 1 - suf].toLowerCase())
  )
    suf += 1;

  const head = toks[0].slice(0, pre);
  const tail = toks[0].slice(toks[0].length - suf);
  while (head.length && UNIT_FRAGMENT.test(head[head.length - 1])) head.pop();
  while (tail.length && UNIT_FRAGMENT.test(tail[0])) tail.shift();

  const h = head.join(" ");
  const t = tail.join(" ");
  if (h.length + t.length < 4) return descriptions[0];
  if (!h) return t;
  if (!t) return h;
  return `${h} … ${t}`;
}

/** Find a labelled block ("LABOUR", "MATERIAL", "SITE EXPENCES") and return its data rows. */
function findBlock(rows, label) {
  const start = rows.findIndex((r) => str(r[0]).toUpperCase() === label);
  if (start < 0) return null;
  let head = -1;
  for (let i = start + 1; i < Math.min(start + 5, rows.length); i += 1) {
    if (str(rows[i][0]).toUpperCase().startsWith("NO")) { head = i; break; }
  }
  if (head < 0) return null;
  const body = [];
  for (let i = head + 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (str(r[0]).toUpperCase().startsWith("TOTAL")) break;
    if (r.every((c) => c == null || c === "")) {
      if (rows[i + 1] && rows[i + 1].every((c) => c == null || c === "")) break;
      continue;
    }
    body.push(r);
  }
  return { rows: body };
}

/* ---------------- the worked example: 20cr ---------------- */

const ws = wb.Sheets[MAIN_SHEET];
const rows = rowsOf(ws);

const totalRow = rows.findIndex((r) => str(r[2]).toLowerCase() === "total");
const boqEnd = totalRow > 0 ? totalRow - 1 : rows.length;

const lines = [];
for (let i = 1; i <= boqEnd; i += 1) {
  const r = rows[i];
  const desc = str(r[1]);
  const qty = num(r[2]);
  const rate = num(r[4]);
  if (!desc || qty == null || rate == null) continue;
  lines.push({
    id: `bl-${lines.length + 1}`,
    row: i,
    srNo: str(r[0]) || String(lines.length + 1),
    description: desc,
    qty,
    unit: str(r[3]) || "No",
    rate,
    // Cost comes from the LABOUR / MATERIAL sheets below, never from the BOQ's own "market" column.
    // For every line that appears in both, the two agree to the rupee — except the house-connection
    // labour rows, where "market" holds a labour rate (₹400/no) for work the LABOUR sheet already
    // prices as "connection" (₹350/no). Reading both would charge that work twice.
    materialRate: null,
    labourRate: null,
    otherRate: null,
  });
}

// Families, from the Sub Total SUM() ranges.
const ranges = groupRangesFromFormulas(ws, "G", boqEnd);
const groups = [];
for (const line of lines) {
  const hit = ranges.find((g) => line.row >= g.startRow && line.row <= g.endRow);
  const key = hit ? `g${hit.startRow}` : `s${line.srNo}`;
  let g = groups.find((x) => x.key === key);
  if (!g) { g = { key, lines: [] }; groups.push(g); }
  g.lines.push(line);
  line.groupKey = key;
}
for (const g of groups) g.label = familyLabel(g.lines.map((l) => l.description));

const amountOf = (l) => l.qty * l.rate;
const byName = new Map(lines.map((l) => [norm(l.description), l]));

/* ---------------- fold the cost blocks onto the lines ---------------- */

/** Running tally per component, so we can prove the per-line rates add up to the sheet's totals. */
const blockTotals = { materialRate: 0, labourRate: 0 };
/** Lump sums that matched nothing by name — resolved against BOQ amounts below. */
const lumpSums = [];

function foldBlock(label, field) {
  const block = findBlock(rows, label);
  if (!block) return;
  for (const r of block.rows) {
    const item = str(r[1]);
    if (!item) continue;
    const unit = str(r[2]);
    const qty = num(r[3]);
    const rate = num(r[4]);
    const amount = num(r[5]);
    const isLump = unit.toUpperCase() === "LS" || qty == null || rate == null;

    const rowAmount = isLump ? amount : amount ?? qty * rate;
    if (rowAmount == null) continue;
    // Tally each row exactly once — the lump-sum pass below must not re-count it.
    blockTotals[field] += rowAmount;

    const hit = isLump ? null : byName.get(norm(item));
    if (hit) {
      // The block's own quantity can differ from the BOQ's (they re-measure between sheets). The
      // rate is what we want; the BOQ quantity is the one that will actually be built and billed.
      hit[field] = round2(rate);
    } else {
      lumpSums.push({ item, amount: rowAmount, field });
    }
  }
}

foldBlock("LABOUR", "labourRate");
foldBlock("MATERIAL", "materialRate");

/**
 * Resolve a lump sum against the BOQ.
 *
 * <p>Preference order: a single line whose amount equals it, then a family whose subtotal equals
 * it, then the still-uncosted lines. The first two are exact — the workbook's own subtotals were
 * built from these very lump sums — so "road, ₹6,31,13,929.46" lands precisely on the road family.
 */
const EPS = 1;
for (const ls of lumpSums) {
  const line = lines.find((l) => Math.abs(amountOf(l) - ls.amount) < EPS);
  if (line) {
    line[ls.field] = (line[ls.field] ?? 0) + ls.amount / line.qty;
    ls.resolved = "line";
    continue;
  }

  const group = groups.find((g) => Math.abs(g.lines.reduce((s, l) => s + amountOf(l), 0) - ls.amount) < EPS);
  if (group) {
    const total = group.lines.reduce((s, l) => s + amountOf(l), 0);
    for (const l of group.lines) {
      const share = (ls.amount * amountOf(l)) / total;
      l[ls.field] = (l[ls.field] ?? 0) + share / l.qty;
    }
    ls.resolved = "family";
    continue;
  }
  ls.resolved = "spread";
}

// Anything a lump sum could not be pinned to is spread across the lines still carrying no cost,
// by value — so the per-line rates always reconcile with the sheet's block totals.
const unresolved = lumpSums.filter((x) => x.resolved === "spread");
for (const field of ["materialRate", "labourRate"]) {
  const pot = unresolved.filter((x) => x.field === field).reduce((s, x) => s + x.amount, 0);
  if (pot <= 0) continue;
  const targets = lines.filter((l) => l.materialRate == null && l.labourRate == null && l.otherRate == null);
  const total = targets.reduce((s, l) => s + amountOf(l), 0);
  if (total <= 0) continue;
  for (const l of targets) {
    // Not rounded: at quantities in the tens of thousands, rounding a per-unit share to paise
    // loses whole rupees off a total that must reconcile with the sheet.
    l.otherRate = (l.otherRate ?? 0) + (pot * amountOf(l)) / total / l.qty;
  }
}

/* ---------------- site expenses ---------------- */

const expBlock = findBlock(rows, "SITE EXPENCES");
const expenses = [];
if (expBlock) {
  for (const r of expBlock.rows) {
    const item = str(r[1]);
    if (!item || item.toLowerCase() === "bjp") continue;
    const pct = num(r[2]);
    expenses.push({
      id: `ex-${expenses.length + 1}`,
      item: item.replace(/\s+/g, " "),
      basis: pct != null ? "PCT_OF_TENDER" : "FLAT",
      value: pct != null ? round2(pct * 100) : 0,
    });
  }
}

/* ---------------- rate library, harvested from every sheet ---------------- */

const library = new Map();
const keyOf = (name, unit) => `${norm(name)}|${unit.toLowerCase()}`;

function harvest(sheetName) {
  const sws = wb.Sheets[sheetName];
  if (!sws) return;
  let srows;
  try { srows = rowsOf(sws); } catch { return; }
  for (const [label, field] of [["LABOUR", "labourRate"], ["MATERIAL", "materialRate"]]) {
    const block = findBlock(srows, label);
    if (!block) continue;
    for (const r of block.rows) {
      const name = str(r[1]);
      const unit = str(r[2]);
      const rate = num(r[4]);
      if (!name || !unit || rate == null || rate <= 0) continue;
      if (unit.toUpperCase() === "LS") continue;
      // Not every sheet keeps the NO|ITEM|UNIT|QTY|RATE order — a numeric or essay-length "unit"
      // means the columns are shifted and the rate we read is not a rate. Skip rather than guess.
      if (unit.length > 12 || /^[\d.,]+$/.test(unit)) continue;
      if (name.length > 120) continue;

      const k = keyOf(name, unit);
      const existing = library.get(k);
      if (existing) {
        existing[field] = existing[field] ?? round2(rate);
        existing.usageCount += 1;
        if (!existing.sources.includes(sheetName)) existing.sources.push(sheetName);
      } else {
        library.set(k, {
          name, unit, labourRate: null, materialRate: null,
          [field]: round2(rate), usageCount: 1, sources: [sheetName],
        });
      }
    }
  }
}

harvest(MAIN_SHEET);
for (const name of wb.SheetNames) if (name !== MAIN_SHEET) harvest(name);

const libraryOut = [...library.values()]
  .filter((x) => x.labourRate != null || x.materialRate != null)
  .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name))
  .slice(0, 400)
  .map((x, i) => ({
    id: `rl-${i + 1}`,
    name: x.name,
    unit: x.unit,
    labourRate: x.labourRate,
    materialRate: x.materialRate,
    usageCount: x.usageCount,
    sourceSheets: x.sources.slice(0, 6),
  }));

/* ---------------- emit ---------------- */

const strip = ({ row, ...rest }) => rest;
const tenderValue = lines.reduce((s, l) => s + amountOf(l), 0);
const perLine = {
  materialRate: lines.reduce((s, l) => s + (l.materialRate ?? 0) * l.qty, 0),
  labourRate: lines.reduce((s, l) => s + (l.labourRate ?? 0) * l.qty, 0),
  otherRate: lines.reduce((s, l) => s + (l.otherRate ?? 0) * l.qty, 0),
};

const body = `// AUTO-GENERATED from the client tender-analysis workbook via
// scripts/generate-tender-analysis-seed.mjs. Regenerate rather than hand-edit.
//
// Source: "${MAIN_SHEET}" sheet — tender 287517, Rajkot Municipal Corporation (₹${(tenderValue / 1e7).toFixed(2)} Cr).
// The workbook's separate LABOUR / MATERIAL sheets have been folded onto the BOQ lines they belong
// to, so every line carries its own rates. Item families come from the sheet's own Sub Total SUM()
// ranges, not from the Sr No prefixes — rows 1–6 are one excavation family with no shared stem.
import type { BoqLine, BoqGroup, ExpenseLine, RateLibraryItem } from "./tenderAnalysisTypes";

/** The BOQ as the department priced it, with our own material / labour / other rates per line. */
export const ANALYSIS_BOQ_SEED: BoqLine[] = ${JSON.stringify(lines.map(strip), null, 2)};

/** Item families, keyed to BoqLine.groupKey. */
export const ANALYSIS_GROUP_SEED: BoqGroup[] = ${JSON.stringify(groups.map((g) => ({ key: g.key, label: g.label })), null, 2)};

/** Site overheads, carried as a percentage of the tender value the way the sheet does it. */
export const ANALYSIS_EXPENSE_SEED: ExpenseLine[] = ${JSON.stringify(expenses, null, 2)};

/**
 * Every labour / material rate the workbook has recorded, across all ${wb.SheetNames.length} sheets.
 * This is the asset that makes the second analysis quick — matched on name + unit.
 */
export const RATE_LIBRARY_SEED: RateLibraryItem[] = ${JSON.stringify(libraryOut, null, 2)};
`;

writeFileSync(OUT, body);

const f = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
console.log(`BOQ lines       ${lines.length}  (${lines.filter((l) => l.materialRate != null || l.labourRate != null || l.otherRate != null).length} costed)`);
console.log(`Groups          ${groups.length}`);
console.log(`Expense lines   ${expenses.length}`);
console.log(`Library items   ${libraryOut.length}`);
console.log(`Lump sums       ${lumpSums.length} (${lumpSums.filter((x) => x.resolved === "line").length} to a line, ${lumpSums.filter((x) => x.resolved === "family").length} to a family, ${unresolved.length} spread)`);
console.log("");
console.log(`Tender value    ${f(tenderValue)}   sheet 20,90,49,236`);
console.log(`Material        ${f(perLine.materialRate)}`);
console.log(`Labour          ${f(perLine.labourRate)}`);
console.log(`Other           ${f(perLine.otherRate)}`);
console.log(`Direct cost     ${f(perLine.materialRate + perLine.labourRate + perLine.otherRate)}   sheet 16,34,60,179 (labour+material)`);
console.log(`Block totals    ${f(blockTotals.materialRate + blockTotals.labourRate)}   <- what the sheets say`);
console.log(`-> ${OUT}`);
