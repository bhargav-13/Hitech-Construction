"use client";

import { useEffect, useState } from "react";
import { Clock, Lock } from "lucide-react";
import { BRAND_NAME, TRIAL_CONTACT, TRIAL_ENDS_AT } from "@/lib/brand";

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

/**
 * Trial countdown + lock for demo installs. Driven by NEXT_PUBLIC_TRIAL_ENDS_AT (see lib/brand):
 * unset → renders nothing, which is how Hi-Tech's own install runs.
 *
 * Before the end date a small countdown sits in the bottom-right corner; after it, a full-screen
 * screen covers every page (login included) until the date is moved and the app redeployed.
 * The clock is the visitor's own — fine for a demo, and the backend can be stopped as a backstop.
 */
export function TrialGate() {
  // Rendered only after mount: the server's clock and the browser's would otherwise disagree and
  // trip a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (TRIAL_ENDS_AT == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
            The free trial of {BRAND_NAME} is over. Your data is safe — get in touch to continue using it.
          </p>
          {TRIAL_CONTACT && (
            <div className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800">{TRIAL_CONTACT}</div>
          )}
        </div>
      </div>
    );
  }

  const t = remaining(left);
  const warn = left <= WARN_MS;
  const label = t.days > 0 ? `${t.days}d ${pad(t.hours)}h ${pad(t.minutes)}m` : `${pad(t.hours)}:${pad(t.minutes)}:${pad(t.seconds)}`;

  return (
    <div
      title={TRIAL_CONTACT ? `To continue after the trial: ${TRIAL_CONTACT}` : undefined}
      className={`pointer-events-auto fixed bottom-4 right-4 z-[9000] flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg ring-1 ${
        warn ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-gray-700 ring-gray-200"
      }`}
    >
      <Clock size={14} className={warn ? "text-amber-600" : "text-cyan-600"} />
      <span>
        Trial · <span className="font-semibold tabular-nums">{label}</span> left
      </span>
    </div>
  );
}
