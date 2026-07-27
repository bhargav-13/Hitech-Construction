"use client";

import { PayrollShell } from "@/components/payroll/PayrollShell";
import { OTHERS_TILES } from "@/lib/payrollConfig";
import {
  CheckSquare,
  FileText,
  Gift,
  LayoutGrid,
  Shield,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

const ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  file: FileText, shield: Shield, grid: LayoutGrid, wallet: Wallet, trophy: Trophy, check: CheckSquare, users: Users, gift: Gift,
};

/** Others — the extra HR tools: letters, assets, cashbook, goals, scorecard, job posts and more. */
export default function OthersPage() {
  return (
    <PayrollShell requireAdmin>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Others</h2>
          <p className="mt-0.5 text-sm text-gray-500">Additional HR tools and workspace utilities.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OTHERS_TILES.map((t) => {
            const Icon = ICON[t.icon] ?? LayoutGrid;
            return (
              <button key={t.name} className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm active:scale-[0.99]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={18} /></div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{t.name}</div>
                  <p className="mt-0.5 text-xs text-gray-400">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </PayrollShell>
  );
}
