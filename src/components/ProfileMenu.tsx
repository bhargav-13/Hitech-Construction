"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IdCard, KeyRound, LogOut, MapPin, UserCircle, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";
import { useAppStore } from "@/lib/store";
import { useCan } from "@/lib/permissions";
import { useCompanies } from "@/lib/companyScope";

/**
 * The top bar's profile icon. It used to be a button with no action ("Profile — not working"):
 * now it opens who you are signed in as, your payroll profile, Punch, a password change and
 * sign-out.
 */
export function ProfileMenu() {
  const user = useAuthStore((s) => s.user);
  const authLogout = useAuthStore((s) => s.logout);
  const appLogout = useAppStore((s) => s.logout);
  const can = useCan();
  const { active: company } = useCompanies();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function signOut() {
    await authLogout();
    appLogout();
    window.location.replace("/login");
  }

  const initials = (user?.fullName ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hasPayroll = can("PAYROLL:VIEW");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Your profile"
        aria-expanded={open}
        title={user?.fullName ?? "Profile"}
        className="flex text-orange-500 transition-colors hover:text-orange-600"
      >
        <UserCircle size={26} />
      </button>
      {open && (
        <div className="animate-menu-pop absolute right-0 top-9 z-50 w-72 origin-top-right rounded-xl border border-gray-100 bg-white p-2 text-sm shadow-2xl ring-1 ring-black/[0.04]">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-gray-800">{user?.fullName ?? "—"}</div>
              <div className="truncate text-xs text-gray-500">{user?.email}</div>
              <div className="mt-0.5 truncate text-[11px] text-gray-400">
                {user?.role?.name}
                {company ? ` · ${company.name}` : ""}
              </div>
            </div>
          </div>
          <div className="my-1 border-t border-gray-100" />
          {hasPayroll && (
            <>
              <MenuLink href="/payroll/me/profile" icon={IdCard} label="My Profile" onClick={() => setOpen(false)} />
              <MenuLink href="/punch" icon={MapPin} label="Punch In / Out" onClick={() => setOpen(false)} />
            </>
          )}
          <button
            onClick={() => {
              setOpen(false);
              setPwOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-gray-700 hover:bg-gray-50"
          >
            <KeyRound size={15} className="text-gray-400" /> Change password
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-rose-600 hover:bg-rose-50"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof IdCard; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-gray-700 hover:bg-gray-50">
      <Icon size={15} className="text-gray-400" /> {label}
    </Link>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (next !== again) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      await apiRequest("/api/v1/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <form onSubmit={save} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-sm shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Change password</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        {done ? (
          <>
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">Password changed. Use the new one next time you sign in.</p>
            <button type="button" onClick={onClose} className="w-full rounded-lg bg-brand-accent px-3 py-2 font-semibold text-white hover:opacity-90">
              Done
            </button>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Current password</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="input w-full" required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">New password</span>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="input w-full" required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">New password again</span>
              <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="input w-full" required />
            </label>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-accent px-3 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {busy ? "Saving…" : "Change password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
