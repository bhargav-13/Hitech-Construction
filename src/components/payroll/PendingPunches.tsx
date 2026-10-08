"use client";

import { useEffect, useState } from "react";
import { ApiError, decidePunch, getPendingPunches } from "@/lib/api";
import type { AttendanceApiResponse } from "@/lib/api";
import { formatDateIST } from "@/lib/datetime";
import { Check, MapPinOff, X } from "lucide-react";

/**
 * Punches made outside every work site, at a site set to "allow punch outside, with approval".
 * They don't pay until an admin approves; rejecting marks the day absent. Renders nothing when
 * there is nothing waiting.
 */
export function PendingPunches({ onDecided }: { onDecided?: () => void }) {
  const [rows, setRows] = useState<AttendanceApiResponse[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPendingPunches()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  async function decide(r: AttendanceApiResponse, approve: boolean) {
    const key = `${r.userId}-${r.date}`;
    setBusy(key);
    setError("");
    try {
      await decidePunch(r.userId, r.date, approve);
      setRows((all) => all.filter((x) => !(x.userId === r.userId && x.date === r.date)));
      onDecided?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save the decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
        <MapPinOff size={15} /> {rows.length} punch{rows.length === 1 ? "" : "es"} outside site waiting for approval
      </div>
      {error && <div className="px-4 pt-2 text-xs text-rose-600">{error}</div>}
      <div className="divide-y divide-amber-100">
        {rows.map((r) => {
          const key = `${r.userId}-${r.date}`;
          const map = r.punchInLat != null && r.punchInLng != null
            ? `https://www.google.com/maps?q=${r.punchInLat},${r.punchInLng}`
            : null;
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-800">{r.memberName}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {formatDateIST(r.date)} · in {r.inTime ?? "—"}{r.outTime ? ` · out ${r.outTime}` : ""}
                </span>
                {map && (
                  <a href={map} target="_blank" rel="noreferrer" className="ml-2 text-xs text-brand-accent hover:underline">
                    View location
                  </a>
                )}
              </div>
              <button
                disabled={busy === key}
                onClick={() => decide(r, true)}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Check size={13} /> Approve
              </button>
              <button
                disabled={busy === key}
                onClick={() => decide(r, false)}
                className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <X size={13} /> Reject
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
