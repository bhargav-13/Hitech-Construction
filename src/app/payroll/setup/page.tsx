"use client";

import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { usePayrollStore } from "@/lib/payrollApi";
import { useShifts, useHolidayPolicies, useLeavePolicies } from "@/lib/usePayrollSetup";
import { CalendarDays, Clock, MapPin, Landmark, Palmtree, ChevronRight } from "lucide-react";

/**
 * Payroll Setup — the pre-setup hub. Reusable policies are configured here once, then assigned to
 * each person on their Payroll Profile. Modelled on PagarBook's onboarding, trimmed to what a
 * construction workforce needs.
 */
export default function PayrollSetupPage() {
  const { shifts } = useShifts();
  const { holidayPolicies } = useHolidayPolicies();
  const { leavePolicies } = useLeavePolicies();
  const locations = usePayrollStore((s) => s.locations);
  const taxProfiles = usePayrollStore((s) => s.taxProfiles);

  const cards = [
    {
      href: "/payroll/setup/shifts",
      icon: Clock,
      title: "Shifts",
      desc: "Work timings, weekly-offs, grace period and overtime rules.",
      count: `${shifts.length} shift${shifts.length === 1 ? "" : "s"}`,
      ready: shifts.length > 0,
    },
    {
      href: "/payroll/setup/holidays",
      icon: Palmtree,
      title: "Holiday Policy",
      desc: "Named holiday calendars — public and optional holidays per year.",
      count: `${holidayPolicies.length} ${holidayPolicies.length === 1 ? "policy" : "policies"}`,
      ready: holidayPolicies.length > 0,
    },
    {
      href: "/payroll/setup/leave",
      icon: CalendarDays,
      title: "Leave Policy",
      desc: "Leave types with annual counts and how they accrue.",
      count: `${leavePolicies.length} ${leavePolicies.length === 1 ? "policy" : "policies"}`,
      ready: leavePolicies.length > 0,
    },
  ];

  // Policies that already have a home elsewhere in the ERP.
  const existing = [
    { href: "/payroll/locations", icon: MapPin, title: "Work Locations", count: `${Object.keys(locations).length} location(s)`, desc: "Geofenced sites people may punch from." },
    { href: "/payroll/run/tax-profiles", icon: Landmark, title: "Tax Profiles", count: `${taxProfiles.length} profile(s)`, desc: "TDS deductor profiles for statutory filing." },
  ];

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Setup</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Configure your payroll policies once, then assign them to people on their profile.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md active:scale-[0.99]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
                  <c.icon size={19} />
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {c.count}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-800">{c.title}</div>
              <p className="mt-1 flex-1 text-xs text-gray-500">{c.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-brand-accent opacity-0 transition-opacity group-hover:opacity-100">
                Configure <ChevronRight size={12} />
              </div>
            </Link>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Already set up elsewhere</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {existing.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors duration-150 hover:bg-gray-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  <c.icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">{c.title}</div>
                  <div className="text-xs text-gray-400">{c.desc}</div>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{c.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}
