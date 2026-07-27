"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { usePayrollStore } from "@/lib/payrollApi";
import { useStaffDraft } from "@/lib/staffDraft";
import { useRolesAndUsers } from "@/lib/payrollUsers";
import { Search, UserCheck, UserRound } from "lucide-react";

/**
 * Pick an existing ERP user (created in Settings → Users) to turn into a staff member. Only users
 * not already linked to a staff record are shown; choosing one pre-fills the Add-Staff form and
 * links the login automatically.
 */
export function UserPickerDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { users, loading } = useRolesAndUsers();
  const setFromUser = useStaffDraft((s) => s.setFromUser);
  // Select the stable array ref, then derive linkedIds in a memo. Deriving inside the selector
  // returns a fresh array every render, which trips useSyncExternalStore's infinite-loop guard.
  const employees = usePayrollStore((s) => s.employees);
  const linkedIds = useMemo(
    () => employees.map((e) => e.userId).filter((x): x is number => x != null),
    [employees]
  );
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !linkedIds.includes(u.id))
      .filter((u) => !q || [u.fullName, u.email, u.role?.name].some((f) => f?.toLowerCase().includes(q)));
  }, [users, linkedIds, search]);

  function pick(u: (typeof users)[number]) {
    setFromUser({ id: u.id, name: u.fullName, email: u.email, phone: u.phoneNumber ?? null });
    router.push("/payroll/staff/add");
  }

  return (
    <Drawer title="Add Staff from Existing User" onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Pick a user you already created in Settings. We&apos;ll pre-fill their details and link the login — you just add their department, role and salary.</p>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, role…" className="w-full bg-transparent text-sm outline-none" autoFocus />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading users…</div>
        ) : available.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-gray-400">
            <UserRound size={24} className="text-gray-300" />
            {users.length === 0 ? "No users found." : "Every user is already linked to a staff member."}
          </div>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {available.map((u) => (
              <button
                key={u.id}
                onClick={() => pick(u)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all hover:border-brand-accent hover:bg-cyan-50/40 active:scale-[0.99]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                  {u.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{u.fullName}</div>
                  <div className="truncate text-xs text-gray-400">{u.email}</div>
                </div>
                <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{u.role?.name ?? "—"}</span>
                <UserCheck size={15} className="shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
