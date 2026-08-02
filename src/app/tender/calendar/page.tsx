"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TenderShell } from "@/components/tender/TenderShell";
import { useTenderStore } from "@/lib/tenderStore";
import { DEADLINE_KIND_LABEL, deadlineItems, type DeadlineItem, type DeadlineKind } from "@/lib/tenderMetrics";
import { DEADLINE_TONE_CLASS, deadlineLabel, deadlineTone, tdate, tiso, tmoney, today } from "@/lib/tenderHelpers";
import type { Tender } from "@/lib/tenderTypes";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Colour per event type, so a month grid stays readable at a glance. */
const KIND_DOT: Record<DeadlineKind, string> = {
  deadline: "bg-rose-500",
  hardcopy: "bg-amber-500",
  preBid: "bg-violet-500",
  techOpen: "bg-blue-500",
  priceOpen: "bg-indigo-500",
  opening: "bg-teal-500",
};

/**
 * Month view of every dated tender event.
 *
 * The client's workbook has a "TENDER DUE DATE FOR SUBMISSION" block that currently renders as
 * `#N/A` — this is the working version of it, extended to hardcopy dispatch, pre-bid meetings and
 * bid openings, all of which are dates people currently keep in their heads.
 */
export default function TenderCalendarPage() {
  const tenders = useTenderStore((s) => s.tenders);
  const [cursor, setCursor] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [kinds, setKinds] = useState<Set<DeadlineKind>>(
    () => new Set(Object.keys(DEADLINE_KIND_LABEL) as DeadlineKind[]),
  );

  const items = useMemo(() => deadlineItems(tenders).filter((i) => kinds.has(i.kind)), [tenders, kinds]);

  /** Events keyed by ISO date, for O(1) lookup while painting the grid. */
  const byDate = useMemo(() => {
    const map = new Map<string, DeadlineItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  // Monday-first grid covering the whole month.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = (first.getDay() + 6) % 7; // JS weeks start Sunday; the client reads Monday-first
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < offset; i += 1) out.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push({ date: tiso(new Date(cursor.year, cursor.month, d)), day: d });
    }
    while (out.length % 7 !== 0) out.push({ date: null, day: null });
    return out;
  }, [cursor]);

  const todayIso = tiso(today());
  const monthItems = useMemo(
    () => items.filter((i) => i.date.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`)),
    [items, cursor],
  );

  function shift(by: number) {
    setCursor((c) => {
      const m = c.month + by;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Tender Calendar</h1>
            <p className="text-sm text-gray-500">
              Bid deadlines, hardcopy dispatch, pre-bid meetings and openings across live tenders.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[150px] text-center text-sm font-medium text-gray-700">
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </span>
            <button onClick={() => shift(1)} aria-label="Next month" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
              <ChevronRight size={15} />
            </button>
            <button
              onClick={() => {
                const d = today();
                setCursor({ year: d.getFullYear(), month: d.getMonth() });
              }}
              className="ml-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Today
            </button>
          </div>
        </div>

        {/* Event type filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(DEADLINE_KIND_LABEL) as DeadlineKind[]).map((k) => {
            const on = kinds.has(k);
            return (
              <button
                key={k}
                onClick={() =>
                  setKinds((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  })
                }
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${
                  on ? "border-gray-300 bg-white text-gray-700" : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${on ? KIND_DOT[k] : "bg-gray-300"}`} />
                {DEADLINE_KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          {/* Month grid */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-[11px] font-medium text-gray-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell, i) => {
                const events = cell.date ? byDate.get(cell.date) ?? [] : [];
                const isToday = cell.date === todayIso;
                return (
                  <div
                    key={i}
                    className={`min-h-[92px] border-r border-b border-gray-50 p-1.5 last:border-r-0 ${
                      cell.date ? "" : "bg-gray-50/50"
                    } ${isToday ? "bg-cyan-50/60" : ""}`}
                  >
                    {cell.day && (
                      <div className={`mb-1 text-[11px] font-medium ${isToday ? "text-brand-accent" : "text-gray-400"}`}>
                        {cell.day}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map((e) => (
                        <Link
                          key={`${e.tender.id}-${e.kind}`}
                          href={`/tender/${routeForStage(e.tender)}?open=${e.tender.id}`}
                          title={`${DEADLINE_KIND_LABEL[e.kind]} — ${e.tender.nameOfWork ?? ""}`}
                          className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} />
                          <span className="truncate">{e.tender.nameOfWork ?? e.tender.tenderId}</span>
                        </Link>
                      ))}
                      {events.length > 3 && (
                        <div className="px-1 text-[10px] text-gray-400">+{events.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda for the visible month */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <CalendarDays size={14} className="text-gray-400" />
              {MONTH_NAMES[cursor.month]} agenda
            </h2>
            <p className="mb-3 text-xs text-gray-400">{monthItems.length} events</p>
            {monthItems.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing scheduled this month.</p>
            ) : (
              <ul className="max-h-[560px] divide-y divide-gray-50 overflow-y-auto">
                {monthItems.map((e) => (
                  <li key={`${e.tender.id}-${e.kind}`} className="py-2">
                    <Link href={`/tender/${routeForStage(e.tender)}?open=${e.tender.id}`} className="block hover:text-brand-accent">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} />
                        <span className="text-xs font-medium text-gray-600">{tdate(e.date)}</span>
                        <span
                          className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                            DEADLINE_TONE_CLASS[deadlineTone(e.date)]
                          }`}
                        >
                          {deadlineLabel(e.date)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-gray-700" title={e.tender.nameOfWork ?? ""}>
                        {e.tender.nameOfWork ?? "Untitled tender"}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {DEADLINE_KIND_LABEL[e.kind]} · {tmoney(e.tender.estimatedCost)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </TenderShell>
  );
}

function routeForStage(t: Tender): string {
  if (t.stage === "SORTING") return "sorting";
  if (t.stage === "RESEARCH") return "research";
  return "applied";
}
