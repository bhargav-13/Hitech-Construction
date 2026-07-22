"use client";

import { usePathname } from "next/navigation";
import { Bell, FolderKanban, Landmark, UserCircle } from "lucide-react";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useBankAccounts, useBankScope } from "@/lib/bankScope";
import { GlobalSearch } from "./GlobalSearch";
import { Select } from "./Select";

/** Vyapar routes where the bank-account filter has nothing to filter. */
const BANK_SCOPE_EXEMPT = [
  "/vyapar/bank",
  "/vyapar/cash",
  "/vyapar/cheques",
  "/vyapar/loans",
  "/vyapar/settings",
  "/vyapar/utilities/import-items",
  "/vyapar/utilities/import-parties",
  "/vyapar/utilities/bulk-items",
];

export function Topbar({ title }: { title: string }) {
  const pathname = usePathname();
  const isVyapar = pathname.startsWith("/vyapar");
  // The project scope dropdown sits beside every page title — compulsory across modules, except
  // the Projects screens themselves (they already are the project list / a single project) and
  // Vyapar, which is personal and scoped by bank account instead.
  const showProjectScope = !pathname.startsWith("/project") && !isVyapar;
  // The bank picker only belongs on screens whose data is actually scoped by bank account
  // (parties, items, documents, payments, expenses, reports, dashboard). Bank Accounts is the
  // switcher itself, and Cash/Cheques/Loans/Settings/imports are either their own account or
  // global, so the filter would do nothing there.
  const showBankScope = isVyapar && !BANK_SCOPE_EXEMPT.some((p) => pathname.startsWith(p));

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-black/5 bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        {showProjectScope && <ProjectScopePicker />}
        {showBankScope && <BankScopePicker />}
      </div>
      <div className="flex items-center gap-4 text-sm text-brand-accent">
        <GlobalSearch />
        <button className="text-gray-500 hover:text-gray-700">
          <Bell size={20} />
        </button>
        <button className="text-orange-500 hover:text-orange-600">
          <UserCircle size={26} />
        </button>
      </div>
    </header>
  );
}

function ProjectScopePicker() {
  const { projects } = useProjects();
  const projectId = useProjectScope((s) => s.projectId);
  const setProjectId = useProjectScope((s) => s.setProjectId);

  return (
    <Select
      value={projectId}
      onChange={setProjectId}
      title="Filter this page by project"
      icon={<FolderKanban size={15} className="shrink-0 text-brand-accent" />}
      className="w-[240px]"
      buttonClassName="font-medium"
      options={[
        { value: "all", label: "All Projects" },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
      ]}
    />
  );
}

function BankScopePicker() {
  const { accounts } = useBankAccounts();
  const bankAccountId = useBankScope((s) => s.bankAccountId);
  const setBankAccountId = useBankScope((s) => s.setBankAccountId);

  return (
    <Select
      value={bankAccountId}
      onChange={setBankAccountId}
      title="Filter Vyapar by bank account"
      icon={<Landmark size={15} className="shrink-0 text-brand-accent" />}
      className="w-[240px]"
      buttonClassName="font-medium"
      options={[
        { value: "all", label: "All Banks" },
        ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
      ]}
    />
  );
}
