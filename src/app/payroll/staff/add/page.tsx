"use client";

import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { ArrowRight, Settings2, UserRoundPlus } from "lucide-react";

/**
 * Adding payroll staff no longer happens here. People are Members: created in Settings and enrolled
 * into payroll by ticking "On payroll". Their salary/statutory/bank detail is filled from the People
 * list. This page just points to the new flow (kept so old links/bookmarks don't 404).
 */
export default function AddStaffMovedPage() {
  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
            <UserRoundPlus size={22} />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Adding people moved to Settings</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            A payroll person is now a <span className="font-medium text-gray-700">Member</span>. Add them once in
            Settings and tick <span className="font-medium text-gray-700">On payroll</span> — they&apos;ll appear under
            People, where you set up their salary, statutory and bank details.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Settings2 size={15} /> Add a Member in Settings
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
