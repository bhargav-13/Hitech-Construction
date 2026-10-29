"use client";

import { PayrollShell } from "@/components/payroll/PayrollShell";
import { QueryDesk } from "@/components/payroll/QueryDesk";

/** HR's side of Self Service → Query / Problem: every staff query, newest activity first. */
export default function HrQueriesPage() {
  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Staff Queries</h2>
          <p className="mt-0.5 text-sm text-gray-500">Questions and problems raised by staff from Self Service. A red dot means the employee is waiting on a reply.</p>
        </div>
        <QueryDesk mode="hr" />
      </div>
    </PayrollShell>
  );
}
