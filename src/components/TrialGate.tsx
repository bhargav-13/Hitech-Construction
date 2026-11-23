"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Lock, Mail, MessageCircle, Phone, X } from "lucide-react";
import { PRODUCT_NAME, TRIAL_CONTACT, TRIAL_EMAIL, TRIAL_ENDS_AT, TRIAL_WHATSAPP } from "@/lib/brand";

/** Last stretch of the trial, when the countdown turns amber. */
const WARN_MS = 2 * 24 * 60 * 60 * 1000;

function remaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3_600),
    minutes: Math.floor((s % 3_600) / 60),
    seconds: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

const waLink = (text: string) => `https://wa.me/${TRIAL_WHATSAPP}?text=${encodeURIComponent(text)}`;
const mailLink = (subject: string) => `mailto:${TRIAL_EMAIL}?subject=${encodeURIComponent(subject)}`;
const hasContact = () => !!(TRIAL_WHATSAPP || TRIAL_EMAIL || TRIAL_CONTACT);

/** WhatsApp / email / phone buttons — whichever are configured. */
function ContactButtons({ message, compact = false }: { message: string; compact?: boolean }) {
  const base = compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "sm:flex-row sm:justify-center"}`}>
      {TRIAL_WHATSAPP && (
        <a
          href={waLink(message)}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] font-medium text-white hover:opacity-90 ${base}`}
        >
          <MessageCircle size={compact ? 14 : 16} /> Chat on WhatsApp
        </a>
      )}
      {TRIAL_EMAIL && (
        <a
          href={mailLink(message)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg bg-brand-accent font-medium text-white hover:bg-brand-accent-strong ${base}`}
        >
          <Mail size={compact ? 14 : 16} /> Talk to us
        </a>
      )}
      {TRIAL_CONTACT && (
        <div className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 text-gray-700 ${base}`}>
          <Phone size={compact ? 13 : 15} className="text-gray-400" /> {TRIAL_CONTACT}
        </div>
      )}
    </div>
  );
}

/**
 * Trial countdown + lock for demo installs. Driven by NEXT_PUBLIC_TRIAL_ENDS_AT (see lib/brand):
 * unset → renders nothing, which is how Hi-Tech's own install runs.
 *
 * Before the end date a countdown pill sits in the bottom-right corner; clicking it offers
 * WhatsApp / email / phone to continue. After it, a full-screen screen covers every page (login
 * included) until the date is moved and the app redeployed. The clock is the visitor's own — fine
 * for a demo, and the backend can be stopped as a backstop.
 */
export function TrialGate() {
  // Rendered only after mount: the server's clock and the browser's would otherwise disagree and
  // trip a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (TRIAL_ENDS_AT == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (TRIAL_ENDS_AT == null || now == null) return null;

  const left = TRIAL_ENDS_AT - now;

  if (left <= 0) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/95 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Lock size={26} />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-gray-900">Your trial has ended</h1>
          <p className="mt-2 text-sm text-gray-500">
            Thanks for trying {PRODUCT_NAME}. Your data is safe — get in touch and we&apos;ll switch you to a full plan
            with everything you set up still in place.
          </p>
          {hasContact() && (
            <div className="mt-6">
              <ContactButtons message={`Hi, our ${PRODUCT_NAME} trial has ended and we'd like to continue.`} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const t = remaining(left);
  const warn = left <= WARN_MS;
  const label =
    t.days > 0 ? `${t.days}d ${pad(t.hours)}h ${pad(t.minutes)}m` : `${pad(t.hours)}:${pad(t.minutes)}:${pad(t.seconds)}`;
  const dayWord = t.days === 1 ? "day" : "days";

  return (
    <div ref={boxRef} className="fixed bottom-4 right-4 z-[9000] flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {t.days > 0 ? `${t.days} ${dayWord} left in your trial` : "Your trial ends today"}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Like what you see? Keep everything you&apos;ve set up and move to a full plan.
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-gray-100">
              <X size={14} />
            </button>
          </div>
          {hasContact() ? (
            <div className="mt-3">
              <ContactButtons compact message={`Hi, we're trying ${PRODUCT_NAME} and would like to know about plans.`} />
            </div>
          ) : null}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg ring-1 transition hover:shadow-xl ${
          warn ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-gray-700 ring-gray-200"
        }`}
      >
        <Clock size={14} className={warn ? "text-amber-600" : "text-brand-accent"} />
        <span>
          Trial · <span className="font-semibold tabular-nums">{label}</span> left
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${warn ? "bg-amber-500 text-white" : "bg-brand-accent text-white"}`}>
          Upgrade
        </span>
      </button>
    </div>
  );
}
