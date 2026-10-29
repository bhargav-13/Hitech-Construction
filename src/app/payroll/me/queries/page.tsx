"use client";

import { PayrollShell } from "@/components/payroll/PayrollShell";
import { QueryDesk } from "@/components/payroll/QueryDesk";

/** Self Service → Query / Problem: ask HR anything, in English, Gujarati or Hindi, by text or voice. */
export default function MyQueriesPage() {
  return (
    <PayrollShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Query / Problem</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Ask HR about salary, leave, attendance or documents — type, speak or send a voice note, in English, ગુજરાતી or हिन्दी.
          </p>
        </div>
        <QueryDesk mode="me" />
      </div>
    </PayrollShell>
  );
}
