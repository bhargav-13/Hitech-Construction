import * as XLSX from "xlsx";
import type { BoqRow } from "@/lib/boqPdf";

/**
 * KAN-113: read a BOQ from an Excel / CSV sheet.
 *
 * Department BOQs come in every shape, so the header row is found rather than assumed: the first
 * row (in the first 30) that names a description column and at least a quantity or a rate. Columns
 * are matched by name — "Item Description", "Particulars", "Qty", "Quantity", "Unit", "Rate",
 * "Amount", "Sr. No." … A row with a description but no quantity and no rate is a heading.
 */
export async function readBoqExcel(file: File): Promise<{ rows: BoqRow[]; sheet: string }> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  let best: { rows: BoqRow[]; sheet: string } = { rows: [], sheet: wb.SheetNames[0] ?? "" };
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const rows = readGrid(grid);
    if (rows.length > best.rows.length) best = { rows, sheet: name };
  }
  return best;
}

type Col = "sr" | "desc" | "unit" | "qty" | "rate" | "amount";

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");

function colOf(header: unknown): Col | null {
  const h = norm(header);
  if (!h) return null;
  if (/^(sr|srno|sno|slno|serial|itemno|no|sn)$/.test(h) || h.startsWith("srno") || h.startsWith("slno")) return "sr";
  if (h.includes("desc") || h.includes("particular") || h.includes("nameofwork") || h === "item" || h.includes("itemofwork") || h.includes("work")) return "desc";
  if (h.includes("amount") || h === "total" || h.includes("value")) return "amount";
  if (h.includes("qty") || h.includes("quantity") || h.includes("quantities")) return "qty";
  if (h.includes("rate") || h.includes("price")) return "rate";
  if (h.includes("unit") || h === "uom") return "unit";
  return null;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function readGrid(grid: unknown[][]): BoqRow[] {
  let headerAt = -1;
  let map: Partial<Record<Col, number>> = {};
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const m: Partial<Record<Col, number>> = {};
    (grid[r] ?? []).forEach((c, i) => {
      const k = colOf(c);
      if (k && m[k] === undefined) m[k] = i;
    });
    if (m.desc !== undefined && (m.qty !== undefined || m.rate !== undefined)) {
      headerAt = r;
      map = m;
      break;
    }
  }
  if (headerAt < 0) return [];

  const out: BoqRow[] = [];
  for (let r = headerAt + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const description = String(row[map.desc!] ?? "").replace(/\s+/g, " ").trim();
    if (!description) continue;
    // Totals rows close a section; they aren't work.
    if (/^(sub\s*-?\s*total|grand\s*total|total)\b/i.test(description)) continue;
    const qty = map.qty !== undefined ? num(row[map.qty]) : 0;
    const rate = map.rate !== undefined ? num(row[map.rate]) : 0;
    const amountRaw = map.amount !== undefined ? num(row[map.amount]) : 0;
    out.push({
      srNo: map.sr !== undefined ? String(row[map.sr] ?? "").trim() : "",
      description,
      unit: map.unit !== undefined ? String(row[map.unit] ?? "").trim() : "",
      qty,
      rate,
      amount: amountRaw || (qty && rate ? qty * rate : null),
      heading: !qty && !rate,
    });
  }
  return out;
}
