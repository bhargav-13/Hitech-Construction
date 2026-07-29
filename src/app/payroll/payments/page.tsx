"use client";

import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Banknote } from "lucide-react";

/**
 * Payments & payout tracking (Phase 6) — not wired to the backend yet. The page is kept so any
 * stale bookmark lands on an honest "coming soon" notice rather than seeded mock data.
 * Re-enable in PAYROLL_NAV once `payroll_payments` + record-payment endpoints ship.
 */
export default function PaymentsPage() {
  return (
    <PayrollShell requireAdmin>
      <PayrollEmpty
        icon={Banknote}
        title="Payments tracking is coming soon"
        hint="Recording bank transfers, UTR references and cash payouts against payslips is being finalized. For now, lock a monthly run to mark salaries as processed."
      />
    </PayrollShell>
  );
}
