"use client";

import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { ReceiptText } from "lucide-react";

/**
 * Tax Profiles (TDS deductor profiles for statutory filings) — not backed by the API yet, so the
 * page shows an honest notice instead of the old client-only mock. Hidden from nav until wired.
 */
export default function TaxProfilesPage() {
  return (
    <PayrollShell requireAdmin>
      <PayrollEmpty
        icon={ReceiptText}
        title="Tax Profiles are coming soon"
        hint="TDS deductor profiles for statutory filings and Form 16 aren't wired to the backend yet. Statutory toggles (PF / ESIC / PT) are already captured per member in their Payroll Profile."
      />
    </PayrollShell>
  );
}
