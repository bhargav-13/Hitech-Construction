"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  FileScan,
  FileSpreadsheet,
  MapPinned,
  ScanFace,
  Scale,
  Smartphone,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { POWERED_BY, PRODUCT_NAME, WHITE_LABEL } from "@/lib/brand";

/**
 * "What's inside" tour for white-label (demo) builds: opens once per person per browser after
 * they sign in, and again from the sidebar's "AI features" button. Hi-Tech's own build never
 * renders it.
 */

const OPEN_EVENT = "brand:feature-showcase";
const seenKey = (userId: number | string) => `brand.showcase.seen.${userId}`;

/** Opens the tour from anywhere (the sidebar button). */
export function openFeatureShowcase() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Feature = { icon: LucideIcon; title: string; body: string; href: string; cta: string };

const AI_FEATURES: Feature[] = [
  {
    icon: FileScan,
    title: "Scan with AI",
    body: "Snap a bill, quotation, expense or work order — AI reads it and fills the form for you. No typing, works in 15+ screens.",
    href: "/vyapar/expenses",
    cta: "Try on an expense",
  },
  {
    icon: Scale,
    title: "AI quotation analysis",
    body: "Upload supplier quotes and get a side-by-side comparison, an online background check of each supplier and a clear recommendation on whom to award.",
    href: "/procurement/compare",
    cta: "Compare quotes",
  },
  {
    icon: FileSpreadsheet,
    title: "BOQ from PDF",
    body: "Drop in a tender's BOQ PDF and get every item, quantity and unit as an editable sheet in seconds.",
    href: "/tender/analysis",
    cta: "Import a BOQ",
  },
];

const SMART_FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: "Tender health analysis",
    body: "Per-item costing and margin, a bid-% lever to test prices, and one click to turn a won tender into a live project.",
    href: "/tender/analysis",
    cta: "Open",
  },
  {
    icon: ScanFace,
    title: "Face + GPS attendance",
    body: "Staff punch in with a selfie that is matched to their face, tagged to the site they are standing on.",
    href: "/punch",
    cta: "Open",
  },
  {
    icon: MapPinned,
    title: "Live staff map",
    body: "See where your field team is right now, on one map.",
    href: "/payroll/live",
    cta: "Open",
  },
];

const MODULES = [
  "Projects, BOQ & DPR",
  "Cash, Bank & Accounts",
  "Inventory & Warehouse",
  "Attendance & Payroll",
  "Procurement",
  "Tenders & Rate Analysis",
  "Equipment & Assets",
  "Approvals",
  "Tasks & Checklists",
  "Documents & Files",
  "HR Desk",
  "Dashboards & Reports",
];

const VALUES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Sparkles, title: "AI built in", body: "Reads bills, quotes and BOQs for you" },
  { icon: Smartphone, title: "Web + Mobile", body: "Office on web, site teams on Android & iOS" },
  { icon: Users, title: "No per-user fee", body: "Add your whole team freely" },
];

export function FeatureShowcase() {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // First visit after sign-in opens the tour once for this person on this browser.
  useEffect(() => {
    if (!WHITE_LABEL || !user || pathname.startsWith("/login")) return;
    try {
      if (localStorage.getItem(seenKey(user.id))) return;
      localStorage.setItem(seenKey(user.id), new Date().toISOString());
    } catch {
      return;
    }
    const id = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(id);
  }, [user, pathname]);

  useEffect(() => {
    if (!WHITE_LABEL) return;
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!WHITE_LABEL || !open) return null;

  const close = () => setOpen(false);

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-900/55 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${PRODUCT_NAME} features`}
        onClick={(e) => e.stopPropagation()}
        className="relative grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[320px_1fr]"
      >
        {/* Product panel — the app's own navy chrome */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden bg-navy p-7 text-white md:flex"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(34,211,238,0.14) 1px, transparent 0), linear-gradient(160deg, #0e2a47 0%, #13355a 100%)",
            backgroundSize: "18px 18px, 100% 100%",
          }}
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sidebar-active/30 bg-sidebar-active/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-active">
              {PRODUCT_NAME}
            </div>
            <h2 className="mt-5 text-[26px] font-semibold leading-tight">
              One platform.
              <br />
              Every site.
              <br />
              <span className="text-sidebar-active">Full control.</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-sidebar-text">
              Projects, sites, stores, money and people — connected from the site to the office.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            {VALUES.map((v) => (
              <div key={v.title} className="flex gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sidebar-active">
                  <v.icon size={17} />
                </div>
                <div>
                  <div className="text-sm font-medium">{v.title}</div>
                  <div className="text-xs text-sidebar-text">{v.body}</div>
                </div>
              </div>
            ))}
          </div>

          {POWERED_BY && <div className="mt-8 text-[11px] text-sidebar-text/80">Built by {POWERED_BY}</div>}
        </div>

        {/* Features */}
        <div className="flex min-h-0 flex-col">
          <button
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-5 pt-7">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-accent">Built-in AI</div>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">Let AI do the paperwork</h3>

            <div className="mt-4 space-y-2.5">
              {AI_FEATURES.map((f) => (
                <Link
                  key={f.title}
                  href={f.href}
                  onClick={close}
                  className="group flex items-center gap-4 rounded-xl border border-gray-200 p-4 transition hover:border-brand-accent/50 hover:shadow-sm"
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-brand-accent transition group-hover:bg-brand-accent group-hover:text-white">
                    <f.icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">{f.title}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{f.body}</p>
                  </div>
                  <span className="hidden flex-shrink-0 items-center gap-1 text-xs font-medium text-brand-accent sm:inline-flex">
                    {f.cta} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
              {SMART_FEATURES.map((f) => (
                <Link
                  key={f.title}
                  href={f.href}
                  onClick={close}
                  className="rounded-xl bg-background/70 p-3.5 transition hover:bg-cyan-50"
                >
                  <f.icon size={18} className="text-navy" />
                  <div className="mt-2 text-[13px] font-semibold text-gray-800">{f.title}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{f.body}</p>
                </Link>
              ))}
            </div>

            <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {MODULES.length} modules · one login
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODULES.map((m) => (
                <span key={m} className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600">
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-7 py-4">
            <span className="text-[11px] text-gray-400">Reopen any time from “Features” in the sidebar.</span>
            <button
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-accent-strong"
            >
              Start exploring <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
