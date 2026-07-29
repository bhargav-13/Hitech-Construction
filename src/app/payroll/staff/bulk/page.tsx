"use client";

import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { ArrowRight, Settings2, Users } from "lucide-react";

/**
 * Bulk-adding staff no longer happens here. People are Members (Settings → tick "On payroll").
 * Kept as a pointer to the new flow so old links don't 404.
 */
export default function BulkAddStaffMovedPage() {
  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
            <Users size={22} />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Bulk add moved to Settings</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Payroll people are Members now. Add them in Settings and tick{" "}
            <span className="font-medium text-gray-700">On payroll</span> to enroll them under People.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Settings2 size={15} /> Add Members in Settings
            </Link>
            <Link
              href="/payroll/staff"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              Go to People <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}
