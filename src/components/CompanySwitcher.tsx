"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lock, Settings } from "lucide-react";
import { useCompanies, switchCompany, companyAccent, companyInitials, type Company } from "@/lib/companyScope";

/**
 * The company switcher that sits where the firm's name used to be printed at the top of the sidebar.
 *
 * The group trades as two firms behind one login, so "which books am I in?" has to be answerable
 * without reading anything — hence the accent-tinted tile and the coloured bar down the sidebar
 * edge (rendered by Sidebar from the same accent). Billing the wrong firm is the expensive mistake
 * this is here to prevent.
 *
 * The subtitle line carries GSTIN/city rather than the user's role: the role is already shown in
 * the user card at the foot of this same sidebar, and what actually distinguishes two firms is
 * their registration.
 */
export function CompanySwitcher({ collapsed }: { collapsed: boolean }) {
  const { companies, active, loading } = useCompanies();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The menu opens whenever there is more than one company to *see*, not more than one that can be
  // entered. A firm that is still being set up is shown locked rather than hidden: "R.P. Enterprise —
  // being set up" tells the user where things stand, whereas hiding it looks like it doesn't exist.
  // With a single company there is no menu at all, so no affordance promises something that won't
  // happen.
  const canSwitch = companies.length > 1;

  if (loading && !active) return <BrandFallback collapsed={collapsed} />;
  if (!active) return <BrandFallback collapsed={collapsed} />;

  const subtitle = [active.gstin, active.city].filter(Boolean).join(" · ");

  function choose(c: Company) {
    setOpen(false);
    if (!c.enabled || c.id === active?.id) return;
    if (!confirm(`Switch to ${c.name}?\n\nThe page will reload and show that company's data.`)) return;
    switchCompany(c.id);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((o) => !o)}
        disabled={!canSwitch}
        title={canSwitch ? `${active.name} — switch company` : active.name}
        aria-haspopup={canSwitch ? "menu" : undefined}
        aria-expanded={canSwitch ? open : undefined}
        className={`flex w-full min-w-0 items-center rounded-lg transition-colors duration-150 ${
          collapsed ? "justify-center p-1" : "gap-3 p-1 pr-2"
        } ${canSwitch ? "hover:bg-white/[0.07]" : "cursor-default"} ${open ? "bg-white/[0.07]" : ""}`}
      >
        <CompanyMark company={active} size={collapsed ? 38 : 42} />
        {!collapsed && (
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1">
              <span className="truncate text-[15px] font-semibold leading-tight text-white">{active.name}</span>
              {canSwitch && (
                <ChevronDown
                  size={14}
                  className={`flex-shrink-0 text-sidebar-text transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                />
              )}
            </span>
            <span className="block truncate text-xs text-sidebar-text">{subtitle || "Set up in Settings"}</span>
          </span>
        )}
      </button>

      {open && canSwitch && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className={`animate-menu-pop absolute z-40 origin-top rounded-xl border border-sidebar-border bg-navy-soft p-1.5 shadow-xl ${
              collapsed ? "left-full top-0 ml-2 w-64" : "left-0 right-0 top-full mt-1"
            }`}
          >
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-medium tracking-wide text-sidebar-text uppercase">
              Switch company
            </div>
            {companies.map((c) => {
              const isActive = c.id === active.id;
              return (
                <button
                  key={c.id}
                  role="menuitem"
                  onClick={() => choose(c)}
                  disabled={!c.enabled}
                  title={c.enabled ? c.name : `${c.name} — not available yet`}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ${
                    isActive ? companyAccent(c).ring : c.enabled ? "hover:bg-white/[0.07]" : "opacity-50"
                  } ${c.enabled ? "" : "cursor-not-allowed"}`}
                >
                  <CompanyMark company={c} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white">{c.name}</span>
                    <span className="block truncate text-[10px] text-sidebar-text">
                      {c.enabled ? c.gstin || "GSTIN not set" : "Being set up"}
                    </span>
                  </span>
                  {isActive && <Check size={15} className="flex-shrink-0 text-cyan-300" />}
                  {!c.enabled && <Lock size={13} className="flex-shrink-0 text-sidebar-text" />}
                </button>
              );
            })}
            <div className="mt-1.5 border-t border-sidebar-border pt-1.5">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push("/settings?section=Companies");
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-sidebar-text transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
              >
                <Settings size={14} /> Company settings
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The company's logo, or its initials on the accent tile until one is uploaded. */
function CompanyMark({ company, size }: { company: Company; size: number }) {
  const accent = companyAccent(company);
  const style = { width: size, height: size, borderRadius: size >= 38 ? 12 : 7 };
  if (company.logoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={company.logoDataUrl}
        alt=""
        style={style}
        className="flex-shrink-0 bg-white object-contain p-1 shadow-sm"
      />
    );
  }
  return (
    <span
      style={style}
      className={`flex flex-shrink-0 items-center justify-center text-xs font-semibold shadow-sm ${accent.tile}`}
    >
      {companyInitials(company.name)}
    </span>
  );
}

/**
 * What the sidebar showed before companies existed. Used while the list is loading and whenever the
 * endpoint isn't reachable, so an older backend still renders a correct-looking header rather than
 * an empty gap.
 */
function BrandFallback({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/logo.png" alt="" className="h-[38px] w-[38px] rounded-xl bg-white object-contain p-1 shadow-sm" />
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Hi-Tech Construction"
        className="h-[42px] w-[42px] flex-shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm"
      />
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold leading-tight text-white">Hi-Tech Construction</div>
      </div>
    </div>
  );
}
