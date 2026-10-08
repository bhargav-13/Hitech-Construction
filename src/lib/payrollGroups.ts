import type { PayrollProfileResponse } from "./api";

/**
 * PagarBook groups staff by how they are paid — "Monthly Regular", "Daily", "Hourly", "Work Basis"
 * — on the staff list, attendance board and payroll grid. This is the one place that maps a payroll
 * profile onto those groups.
 */
export type PayGroup = "Monthly Regular" | "Monthly Contractual" | "Daily" | "Hourly" | "Work Basis" | "Not set up";

export const PAY_GROUP_ORDER: PayGroup[] = ["Monthly Regular", "Monthly Contractual", "Daily", "Hourly", "Work Basis", "Not set up"];

export function payGroupOf(p: PayrollProfileResponse | undefined | null): PayGroup {
  if (!p) return "Not set up";
  const wt = p.salary?.workType;
  if (wt === "PIECE" || (p.category === "WORK_BASIS" && !wt)) return "Work Basis";
  if (wt === "DAILY") return "Daily";
  if (wt === "HOURLY") return "Hourly";
  if (p.category === "WORK_BASIS") return "Work Basis";
  return p.category === "CONTRACTOR" ? "Monthly Contractual" : "Monthly Regular";
}

/** "Active" unless the profile was deactivated (deactivated staff drop out of new payroll runs). */
export function staffStatusOf(p: PayrollProfileResponse | undefined | null): "ACTIVE" | "DEACTIVATED" {
  return p?.details?.staffStatus === "DEACTIVATED" ? "DEACTIVATED" : "ACTIVE";
}
