"use client";

import { useEffect, useState } from "react";
import { BellRing, Lock, X } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { formatDateTimeIST } from "@/lib/datetime";
import { getPopupLog, type PopupLogRowDto, type PopupSettingsDto } from "@/lib/checklistApi";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const EMPTY_POPUP: PopupSettingsDto = {
  enabled: false,
  repeat: "DAILY",
  time: "10:00",
  date: null,
  weekday: 1,
  lock: true,
  userIds: [],
};

/**
 * KAN-124: Super Admin schedules a routine to pop up on people's screens — once, daily or weekly at
 * a set time — and can lock it so it can't be closed until it is done. Every showing and completion
 * is logged; the history is listed underneath.
 */
export function ChecklistPopupSettings({
  value,
  onChange,
  people,
  assigneeId,
  routineId,
}: {
  value: PopupSettingsDto;
  onChange: (next: PopupSettingsDto) => void;
  people: { id: string; name: string }[];
  assigneeId: string;
  routineId: number | null;
}) {
  const set = (patch: Partial<PopupSettingsDto>) => onChange({ ...value, ...patch });
  const nameOf = (id: number) => people.find((p) => p.id === String(id))?.name ?? `#${id}`;
  const chosen = value.userIds;
  const addable = people.filter((p) => !chosen.includes(Number(p.id)));

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <BellRing size={15} className="text-violet-600" /> Pop up on screen
        </span>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="h-4 w-4 accent-violet-600"
        />
      </label>

      {value.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-500">
              Repeat
              <Select
                value={value.repeat ?? "DAILY"}
                onChange={(v) => set({ repeat: v as PopupSettingsDto["repeat"] })}
                options={[
                  { value: "ONCE", label: "One time" },
                  { value: "DAILY", label: "Every day" },
                  { value: "WEEKLY", label: "Every week" },
                ]}
              />
            </label>
            <label className="block text-xs text-gray-500">
              Time
              <input
                type="time"
                value={value.time ?? ""}
                onChange={(e) => set({ time: e.target.value })}
                className="input mt-0.5"
              />
            </label>
            {value.repeat === "ONCE" && (
              <label className="col-span-2 block text-xs text-gray-500">
                Date
                <DatePicker value={value.date ?? ""} onChange={(d) => set({ date: d || null })} placeholder="Pick the date" />
              </label>
            )}
            {value.repeat === "WEEKLY" && (
              <label className="col-span-2 block text-xs text-gray-500">
                Day
                <Select
                  value={String(value.weekday ?? 1)}
                  onChange={(v) => set({ weekday: Number(v) })}
                  options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
                />
              </label>
            )}
          </div>

          <div className="text-xs text-gray-500">
            Show to
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chosen.length === 0 && (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200">
                  {people.find((p) => p.id === assigneeId)?.name ?? "The assignee"} (assignee)
                </span>
              )}
              {chosen.map((id) => (
                <span key={id} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-violet-200">
                  {nameOf(id)}
                  <button
                    type="button"
                    onClick={() => set({ userIds: chosen.filter((x) => x !== id) })}
                    aria-label={`Remove ${nameOf(id)}`}
                    className="text-gray-400 hover:text-rose-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              <Select
                value=""
                onChange={(v) => v && set({ userIds: [...chosen, Number(v)] })}
                placeholder="+ Add a person"
                options={addable.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={value.lock}
              onChange={(e) => set({ lock: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-violet-600"
            />
            <span>
              <span className="flex items-center gap-1 font-medium">
                <Lock size={13} /> Can&apos;t be closed until done
              </span>
              <span className="block text-xs text-gray-500">The pop-up stays on screen until they mark it done.</span>
            </span>
          </label>
          <p className="text-[11px] text-gray-500">
            It appears at the set time (India time). Anyone offline then sees it as soon as they next open the app.
            Marking it done also ticks the routine on the board.
          </p>
        </>
      )}

      {routineId != null && <PopupHistory routineId={routineId} nameOf={nameOf} />}
    </div>
  );
}

function PopupHistory({ routineId, nameOf }: { routineId: number; nameOf: (id: number) => string }) {
  const [rows, setRows] = useState<PopupLogRowDto[] | null>(null);
  useEffect(() => {
    let off = false;
    getPopupLog(routineId)
      .then((r) => !off && setRows(r))
      .catch(() => !off && setRows([]));
    return () => {
      off = true;
    };
  }, [routineId]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="border-t border-violet-100 pt-2">
      <div className="mb-1 text-xs font-medium text-gray-600">Pop-up history</div>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 rounded-md bg-white px-2 py-1 ring-1 ring-gray-100">
            <span className="text-gray-700">
              {nameOf(r.userId)} · {r.occurrenceKey}
            </span>
            <span className={r.doneAt ? "text-emerald-700" : "text-amber-700"}>
              {r.doneAt ? `Done ${formatDateTimeIST(r.doneAt)}` : `Shown ${r.shownAt ? formatDateTimeIST(r.shownAt) : "—"}, not done`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
