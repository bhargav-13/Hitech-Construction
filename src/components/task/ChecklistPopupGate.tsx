"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Lock } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { completePopup, getDuePopups, type DuePopupDto } from "@/lib/checklistApi";

const POLL_MS = 60_000;

/**
 * KAN-124: a checklist routine scheduled by Super Admin pops up here, on whatever screen the person
 * is on, once its time comes — or as soon as they next open the app if they were away. A locked one
 * can't be closed until it is marked done; marking it done logs the time and ticks the routine.
 */
export function ChecklistPopupGate() {
  const userId = useAuthStore((s) => s.user?.id);
  const [due, setDue] = useState<DuePopupDto[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      setDue(await getDuePopups());
    } catch {
      /* not signed in yet, or offline — try again on the next tick */
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(() => void check(), 1500);
    const t = setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, check]);

  const keyOf = (p: DuePopupDto) => `${p.routineId}|${p.occurrenceKey}`;
  const current = userId ? due.find((p) => !hidden.has(keyOf(p))) : undefined;
  if (!current) return null;

  async function done() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await completePopup(current.routineId, current.occurrenceKey);
      setDue((d) => d.filter((p) => keyOf(p) !== keyOf(current)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark it done. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const time = current.dueAt.slice(11, 16);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-violet-700">
          <BellRing size={18} />
          <span className="text-xs font-semibold tracking-wide uppercase">Checklist reminder · {time}</span>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-gray-900">{current.name}</h2>
        {current.note && <p className="mt-1 text-sm whitespace-pre-wrap text-gray-600">{current.note}</p>}
        {current.lock && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Lock size={12} /> This has to be done before you continue.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {!current.lock && (
            <button
              onClick={() => setHidden((h) => new Set(h).add(keyOf(current)))}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Later
            </button>
          )}
          <button
            onClick={() => void done()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 size={15} /> {busy ? "Saving…" : "Mark done"}
          </button>
        </div>
      </div>
    </div>
  );
}
