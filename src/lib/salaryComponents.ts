/**
 * Dynamic salary components — the configurable earnings & deductions that replace the old
 * hardcoded Basic 50% / HRA 20% split and the fixed PF/ESIC/PT toggles.
 *
 * A component is stored as delimited text (NOT JSON) because the backend payroll-service has no
 * Jackson on its classpath — the same reason work-location polygons are delimited. One string holds
 * the whole list so it round-trips as a single profile/template field:
 *   `name|kind|calc|value|cap|threshold` per component, components joined by `;`.
 *   kind = E|D, calc = CTC|BASIC|GROSS|FLAT, cap/threshold blank when unset.
 * The backend parses the identical format when generating payslips, so the two must stay in sync.
 */

export type ComponentKind = "EARNING" | "DEDUCTION";
/** What the value is a percentage OF — or FLAT for a fixed rupee amount. */
export type ComponentCalc = "CTC" | "BASIC" | "GROSS" | "FLAT";

export interface SalaryComponent {
  name: string;
  kind: ComponentKind;
  calc: ComponentCalc;
  /** Percent (for CTC/BASIC/GROSS) or rupee amount (for FLAT). */
  value: number;
  /** Caps the base amount before the percent is applied — e.g. PF: 12% of min(basic, 15000). */
  cap: number | null;
  /** Component only applies when monthly gross exceeds this — e.g. PT above ₹15,000. */
  threshold: number | null;
}

/** The statutory + standard components every new employee starts with (today's real rules). */
export const DEFAULT_COMPONENTS: SalaryComponent[] = [
  { name: "Basic", kind: "EARNING", calc: "CTC", value: 50, cap: null, threshold: null },
  { name: "HRA", kind: "EARNING", calc: "CTC", value: 20, cap: null, threshold: null },
  { name: "PF", kind: "DEDUCTION", calc: "BASIC", value: 12, cap: 15000, threshold: null },
  { name: "ESIC", kind: "DEDUCTION", calc: "GROSS", value: 0.75, cap: null, threshold: null },
  { name: "Professional Tax", kind: "DEDUCTION", calc: "FLAT", value: 200, cap: null, threshold: 15000 },
];

const KIND_OUT: Record<ComponentKind, string> = { EARNING: "E", DEDUCTION: "D" };
const num = (v: string) => (v.trim() === "" ? null : Number(v));
/** Names can't contain the delimiters; strip them defensively. */
const clean = (s: string) => s.replace(/[|;]/g, " ").trim();

/** Serialize a component list to the delimited wire format (blank/empty -> ""). */
export function encodeComponents(list: SalaryComponent[]): string {
  return list
    .filter((c) => c.name.trim())
    .map((c) =>
      [clean(c.name), KIND_OUT[c.kind], c.calc, c.value, c.cap ?? "", c.threshold ?? ""].join("|")
    )
    .join(";");
}

/** Parse the delimited wire format back into components; a bad/blank string yields []. */
export function decodeComponents(text: string | null | undefined): SalaryComponent[] {
  if (!text || !text.trim()) return [];
  return text
    .split(";")
    .map((part) => part.split("|"))
    .filter((f) => f.length >= 4 && f[0].trim())
    .map((f) => ({
      name: f[0],
      kind: f[1] === "D" ? "DEDUCTION" : "EARNING",
      calc: (["CTC", "BASIC", "GROSS", "FLAT"].includes(f[2]) ? f[2] : "FLAT") as ComponentCalc,
      value: Number(f[3]) || 0,
      cap: num(f[4] ?? ""),
      threshold: num(f[5] ?? ""),
    }));
}

/** The Basic component's monthly amount — drives PF and shows on the payslip. */
export function basicAmount(list: SalaryComponent[], ctc: number): number {
  const basic = list.find((c) => c.kind === "EARNING" && /basic/i.test(c.name));
  if (!basic) return 0;
  return Math.round(componentAmount(basic, { ctc, basic: 0, gross: ctc }));
}

/** Evaluate one component against a pay context. Mirrors the backend formula exactly. */
export function componentAmount(
  c: SalaryComponent,
  ctx: { ctc: number; basic: number; gross: number }
): number {
  if (c.threshold != null && ctx.gross <= c.threshold) return 0;
  if (c.calc === "FLAT") return c.value;
  const base = c.calc === "CTC" ? ctx.ctc : c.calc === "BASIC" ? ctx.basic : ctx.gross;
  const capped = c.cap != null ? Math.min(base, c.cap) : base;
  return (capped * c.value) / 100;
}

export const CALC_LABEL: Record<ComponentCalc, string> = {
  CTC: "% of CTC",
  BASIC: "% of Basic",
  GROSS: "% of Gross",
  FLAT: "Flat ₹",
};
