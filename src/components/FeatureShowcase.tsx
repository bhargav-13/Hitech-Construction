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
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { BRAND_NAME, WHITE_LABEL } from "@/lib/brand";

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
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI features"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 px-8 pb-7 pt-8 text-white">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Sparkles size={13} /> Built-in AI
          </div>
          <h2 className="mt-3 text-2xl font-semibold leading-tight">Welcome to {BRAND_NAME}</h2>
          <p className="mt-1.5 max-w-xl text-sm text-white/80">
            Tenders, projects, purchase, billing and payroll in one place — with AI doing the paperwork for you.
          </p>
        </div>

        <div className="px-8 py-6">
          <div className="grid gap-4 md:grid-cols-3">
            {AI_FEATURES.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                onClick={close}
                className="group flex flex-col rounded-xl border border-violet-100 bg-gradient-to-b from-violet-50/70 to-white p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-sm">
                  <f.icon size={20} />
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  {f.title}
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">AI</span>
                </div>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-500">{f.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 group-hover:gap-2">
                  {f.cta} <ArrowRight size={13} className="transition-all" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">Also smart</div>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {SMART_FEATURES.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                onClick={close}
                className="flex gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-cyan-200 hover:bg-cyan-50/40"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                  <f.icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800">{f.title}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{f.body}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-[11px] text-gray-400">Open this again any time from “AI features” in the sidebar.</span>
            <button
              onClick={close}
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Start exploring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
