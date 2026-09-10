"use client";

import { useState } from "react";
import {
  CalendarDays,
  Hammer,
  HardHat,
  Link2,
  Package,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { inr } from "@/lib/format";
import { useUsers } from "@/lib/useUsers";
import * as api from "@/lib/projectTargetApi";
import type {
  ApiBoqItem,
  ApiTarget,
  ResourceKind,
  TargetStatus,
} from "@/lib/projectTargetApi";
import { TARGET_STATUS_META, delayOf, shortDate, workingDays } from "@/lib/useProjectTargets";

/**
 * One target, opened.
 *
 * <p>Laid out the way site staff already read work: the quantity and status at the top, the plan
 * beneath it, then three tabs for the three things that actually get updated — what was done, what
 * it needs, and why it slipped.
 *
 * <p>**Progress is a quantity against one BOQ line**, and it is entered against this target alone.
 * There is no way to report against a family, because a family holds no quantity — that is the
 * change this screen exists to make.
 */
export function TargetDrawer({
  projectId,
  target,
  item,
  siblings,
  onClose,
  onChanged,
}: {
  projectId: number;
  target: ApiTarget;
  item: ApiBoqItem;
  /** Other targets on this project, for the dependency picker. */
  siblings: ApiTarget[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"progress" | "resources" | "delay">("progress");
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pr = target.targetQty > 0 ? Math.min(1, target.doneQty / target.targetQty) : 0;
  const remaining = Math.max(0, target.targetQty - target.doneQty);
  const wd = workingDays(target.startDate, target.dueDate);
  const delay = delayOf(target);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change was refused.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer title={target.name} onClose={onClose} width="max-w-3xl" guardOnClose={false}>
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* The line being measured. Named first because the target's own name can be edited to
            anything, and "which BOQ line is this billing against" is the question behind the row. */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 text-xs text-gray-500">
          <span className="mr-1.5 font-semibold text-gray-400">{item.srNo}</span>
          {item.description}
          <span className="ml-2 tabular-nums text-gray-400">
            · {item.qty.toLocaleString("en-IN")} {item.unit} @ {inr(item.saleRate)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <QtyPill done={target.doneQty} total={target.targetQty} unit={target.unit} />
          <StatusPicker
            value={target.status}
            busy={busy}
            onChange={(s) => run(() => api.setTargetStatus(projectId, target.id, s))}
          />
          <span className={`text-sm font-medium ${delay.tone}`}>{delay.label}</span>
          <span className="ml-auto text-sm tabular-nums text-gray-500">{(pr * 100).toFixed(1)}%</span>
        </div>

        {/* The plan. Actual and forecast sit alongside the planned pair, because the gap between
            them is the only honest measure of whether this is going to land. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-100 bg-white p-4 sm:grid-cols-4">
          <Field label="Assigned to" className="col-span-2">
            <Assignees
              target={target}
              busy={busy}
              onChange={(ids) => run(() => api.updateTarget(projectId, target.id, { assigneeUserIds: ids }))}
            />
          </Field>
          <Field label="Duration">
            {wd == null ? <Dash /> : <span className="tabular-nums">{wd} <span className="text-[11px] text-gray-400">wd</span></span>}
          </Field>
          <Field label="Remaining">
            <span className="tabular-nums">
              {remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {target.unit}
            </span>
          </Field>

          <DateField
            label="Start"
            value={target.startDate}
            onChange={(v) => run(() => api.updateTarget(projectId, target.id, { ...dates(target), startDate: v }))}
          />
          <DateField
            label="End"
            value={target.dueDate}
            onChange={(v) => run(() => api.updateTarget(projectId, target.id, { ...dates(target), dueDate: v }))}
          />
          <DateField
            label="Actual start"
            value={target.actualStart}
            onChange={(v) => run(() => api.updateTarget(projectId, target.id, { ...dates(target), actualStart: v }))}
          />
          <DateField
            label="Actual end"
            value={target.actualEnd}
            onChange={(v) => run(() => api.updateTarget(projectId, target.id, { ...dates(target), actualEnd: v }))}
          />
          <DateField
            label="Forecast end"
            value={target.forecastEnd}
            onChange={(v) => run(() => api.updateTarget(projectId, target.id, { ...dates(target), forecastEnd: v }))}
          />
          <Field label="Tag">
            <input
              defaultValue={target.tag ?? ""}
              placeholder="—"
              aria-label="Tag"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (target.tag ?? "")) {
                  void run(() => api.updateTarget(projectId, target.id, { ...dates(target), tag: v || null }));
                }
              }}
              className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
            />
          </Field>
          <Field label="Dependencies" className="col-span-2">
            <Dependencies
              projectId={projectId}
              target={target}
              siblings={siblings}
              busy={busy}
              onChanged={onChanged}
              onError={setError}
            />
          </Field>
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(
            [
              ["progress", `Progress${target.entries.length ? ` (${target.entries.length})` : ""}`],
              ["resources", `Resources${target.resources.length ? ` (${target.resources.length})` : ""}`],
              ["delay", `Delay & status logs${target.delayLogs.length ? ` (${target.delayLogs.length})` : ""}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                tab === k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "progress" && (
          <ProgressTab
            projectId={projectId}
            target={target}
            busy={busy}
            onAdd={() => setLogging(true)}
            onRemove={(entryId) => run(() => api.removeProgress(projectId, target.id, entryId))}
          />
        )}
        {tab === "resources" && (
          <ResourcesTab projectId={projectId} target={target} busy={busy} onChanged={onChanged} onError={setError} />
        )}
        {tab === "delay" && (
          <DelayTab projectId={projectId} target={target} busy={busy} onChanged={onChanged} onError={setError} />
        )}
      </div>

      {logging && (
        <ProgressModal
          target={target}
          onClose={() => setLogging(false)}
          onSave={async (body) => {
            await api.logProgress(projectId, target.id, body);
            await onChanged();
            setLogging(false);
          }}
        />
      )}
    </Drawer>
  );
}

/** The date fields the server treats as a set — sent together so one edit can't blank the others. */
const dates = (t: ApiTarget) => ({
  startDate: t.startDate,
  dueDate: t.dueDate,
  actualStart: t.actualStart,
  actualEnd: t.actualEnd,
  forecastEnd: t.forecastEnd,
  tag: t.tag,
});

// ---------------------------------------------------------------- progress

function ProgressTab({
  target,
  busy,
  onAdd,
  onRemove,
}: {
  projectId: number;
  target: ApiTarget;
  busy: boolean;
  onAdd: () => void;
  onRemove: (entryId: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Reported</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={busy || target.status === "COMPLETED"}
          title={target.status === "COMPLETED" ? "This target is complete." : undefined}
          className="flex items-center gap-1 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <Plus size={13} /> Progress
        </button>
      </div>

      {target.entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400">
          Nothing reported yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {target.entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>{e.reportedBy ?? "Site"}</span>
                <span>·</span>
                <span>{shortDate(e.date)}</span>
                {e.location && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{e.location}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  disabled={busy}
                  aria-label="Remove this entry"
                  className="ml-auto text-gray-300 transition-colors duration-150 hover:text-rose-600 disabled:opacity-40"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-800">
                {e.qty.toLocaleString("en-IN")} {target.unit}
              </div>
              {e.note && <div className="mt-0.5 text-xs text-gray-500">{e.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProgressModal({
  target,
  onClose,
  onSave,
}: {
  target: ApiTarget;
  onClose: () => void;
  onSave: (body: { qty: number; date: string; note: string | null; location: string | null }) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const n = Number(qty);
  const valid = Number.isFinite(n) && n > 0;
  const remaining = Math.max(0, target.targetQty - target.doneQty);

  return (
    <Modal onClose={onClose}>
      <div className="w-[400px] max-w-full space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Update progress</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-brand-accent focus:outline-none"
          />
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Progress quantity ({target.unit})
          </span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="MH-14, Ch. 1200–1400 …"
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Gang, weather, anything worth recording"
            className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-sm placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
          />
        </label>

        {valid && n > remaining && (
          <p className="text-[11px] text-amber-700">
            More than remains — it will be capped at {remaining.toLocaleString("en-IN")} {target.unit}.
          </p>
        )}

        <button
          type="button"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onSave({ qty: n, date, note: note.trim() || null, location: location.trim() || null });
            } catch (e) {
              setError(e instanceof Error ? e.message : "That entry was refused.");
              setSaving(false);
            }
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save progress"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- resources

const RESOURCE_META: Record<ResourceKind, { label: string; icon: typeof Package }> = {
  MATERIAL: { label: "Material", icon: Package },
  WORKFORCE: { label: "Workforce", icon: HardHat },
  EQUIPMENT: { label: "Equipment", icon: Hammer },
};

function ResourcesTab({
  projectId,
  target,
  busy,
  onChanged,
  onError,
}: {
  projectId: number;
  target: ApiTarget;
  busy: boolean;
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [adding, setAdding] = useState<ResourceKind | null>(null);

  return (
    <section className="space-y-3">
      {(Object.keys(RESOURCE_META) as ResourceKind[]).map((kind) => {
        const rows = target.resources.filter((r) => r.kind === kind);
        const Icon = RESOURCE_META[kind].icon;
        const total = rows.reduce((s, r) => s + r.amount, 0);

        return (
          <div key={kind} className="rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
              <Icon size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{RESOURCE_META[kind].label}</span>
              {rows.length > 0 && <span className="text-xs tabular-nums text-gray-400">{inr(total)}</span>}
              <button
                type="button"
                onClick={() => setAdding(kind)}
                disabled={busy}
                className="ml-auto rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-400">
                No {RESOURCE_META[kind].label.toLowerCase()} planned against this yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-gray-700">{r.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">
                      {r.quantity.toLocaleString("en-IN")} {r.unit ?? ""}
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-gray-500">{inr(r.rate)}</span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums text-gray-700">{inr(r.amount)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await api.removeResource(projectId, target.id, r.id);
                          await onChanged();
                        } catch (e) {
                          onError(e instanceof Error ? e.message : "Couldn't remove that.");
                        }
                      }}
                      aria-label={`Remove ${r.name}`}
                      className="shrink-0 text-gray-300 transition-colors duration-150 hover:text-rose-600 disabled:opacity-40"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {adding && (
        <ResourceModal
          kind={adding}
          onClose={() => setAdding(null)}
          onSave={async (body) => {
            await api.addResource(projectId, target.id, { kind: adding, ...body });
            await onChanged();
            setAdding(null);
          }}
        />
      )}
    </section>
  );
}

function ResourceModal({
  kind,
  onClose,
  onSave,
}: {
  kind: ResourceKind;
  onClose: () => void;
  onSave: (b: { name: string; unit: string | null; quantity: number; rate: number; note: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = (Number(quantity) || 0) * (Number(rate) || 0);

  return (
    <Modal onClose={onClose}>
      <div className="w-[400px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">Add {RESOURCE_META[kind].label.toLowerCase()}</h2>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder={kind === "MATERIAL" ? "DWC pipe 300mm" : kind === "WORKFORCE" ? "Pipe gang" : "JCB 3DX"}
          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder="Qty"
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit"
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
          />
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="Rate"
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
          />
        </div>
        {amount > 0 && <p className="text-right text-xs tabular-nums text-gray-500">{inr(amount)}</p>}

        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onSave({
                name: name.trim(),
                unit: unit.trim() || null,
                quantity: Number(quantity) || 0,
                rate: Number(rate) || 0,
                note: null,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "That was refused.");
              setSaving(false);
            }
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- delay & status

const DELAY_REASONS = [
  "Client drawing awaited",
  "Material not available",
  "Labour shortage",
  "Rain / weather",
  "Equipment breakdown",
  "Approval pending",
  "Site not handed over",
  "Other",
];

function DelayTab({
  projectId,
  target,
  busy,
  onChanged,
  onError,
}: {
  projectId: number;
  target: ApiTarget;
  busy: boolean;
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState(DELAY_REASONS[0]);
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");

  return (
    <section className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Delay log</h3>
          <button
            type="button"
            onClick={() => setAdding((p) => !p)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            <Plus size={12} /> Delay reason
          </button>
        </div>

        {adding && (
          <div className="mb-2 space-y-2 rounded-lg border border-gray-200 p-3">
            <Select
              value={reason}
              onChange={setReason}
              options={DELAY_REASONS.map((r) => ({ value: r, label: r }))}
              size="sm"
            />
            <div className="flex gap-2">
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                inputMode="numeric"
                placeholder="Days lost"
                className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs tabular-nums focus:border-brand-accent focus:outline-none"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-brand-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await api.addDelay(projectId, target.id, {
                      reason,
                      days: Number(days) || 0,
                      note: note.trim() || null,
                    });
                    setDays("");
                    setNote("");
                    setAdding(false);
                    await onChanged();
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "That was refused.");
                  }
                }}
                className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                Log
              </button>
            </div>
          </div>
        )}

        {target.delayLogs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-400">
            No delay reasons recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50 rounded-lg border border-gray-200">
            {target.delayLogs.map((d) => (
              <li key={d.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-700">{d.reason}</div>
                  <div className="text-[11px] text-gray-400">
                    {shortDate(d.loggedOn)}
                    {d.byName ? ` · ${d.byName}` : ""}
                    {d.note ? ` · ${d.note}` : ""}
                  </div>
                </div>
                {d.days > 0 && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {d.days}d
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await api.removeDelay(projectId, target.id, d.id);
                      await onChanged();
                    } catch (e) {
                      onError(e instanceof Error ? e.message : "Couldn't remove that.");
                    }
                  }}
                  aria-label="Remove this delay reason"
                  className="shrink-0 text-gray-300 transition-colors duration-150 hover:text-rose-600 disabled:opacity-40"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Status changes</h3>
        {target.statusLogs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-400">
            No status changes recorded yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {target.statusLogs.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TARGET_STATUS_META[l.toStatus].dot}`} />
                <span className="text-gray-700">
                  {l.fromStatus ? `${TARGET_STATUS_META[l.fromStatus].label} → ` : ""}
                  {TARGET_STATUS_META[l.toStatus].label}
                </span>
                {l.note && <span className="truncate text-gray-400">· {l.note}</span>}
                <span className="ml-auto shrink-0 text-[11px] text-gray-400">
                  {l.byName ?? "—"} · {shortDate(l.at.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- bits

/**
 * Done / total, with the fill showing how far along it is.
 *
 * <p>`size="row"` is the compact form for a table: fixed width so the column does not jog as the
 * numbers change length, and small enough that thirty of them stacked read as a list rather than as
 * thirty buttons. `size="drawer"` is the larger one for the single target being looked at.
 */
export function QtyPill({
  done,
  total,
  unit,
  size = "drawer",
}: {
  done: number;
  total: number;
  unit: string;
  size?: "row" | "drawer";
}) {
  const pr = total > 0 ? Math.min(1, done / total) : 0;
  const n = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const row = size === "row";

  return (
    <span
      className={`relative inline-flex items-center overflow-hidden rounded-md bg-gray-100 ${
        row ? "w-[150px] gap-0.5 px-2 py-0.5" : "gap-1 rounded-full px-3 py-1"
      }`}
      title={`${n(done)} of ${n(total)} ${unit} · ${(pr * 100).toFixed(1)}%`}
    >
      <span
        className="absolute inset-y-0 left-0 bg-cyan-200/70"
        style={{ width: `${pr * 100}%` }}
        aria-hidden
      />
      <span
        className={`relative font-semibold tabular-nums text-gray-800 ${row ? "text-xs" : "text-[13px]"}`}
      >
        {n(done)}
      </span>
      <span className={`relative tabular-nums text-gray-400 ${row ? "text-xs" : "text-[13px]"}`}>
        / {n(total)}
      </span>
      <span
        className={`relative ml-auto shrink-0 tracking-wide text-gray-400 uppercase ${
          row ? "text-[9px]" : "text-[10px]"
        }`}
      >
        {unit}
      </span>
    </span>
  );
}

function StatusPicker({
  value,
  busy,
  onChange,
}: {
  value: TargetStatus;
  busy: boolean;
  onChange: (s: TargetStatus) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(v) => onChange(v as TargetStatus)}
      disabled={busy}
      size="sm"
      className="w-36"
      options={(Object.keys(TARGET_STATUS_META) as TargetStatus[]).map((s) => ({
        value: s,
        label: TARGET_STATUS_META[s].label,
      }))}
    />
  );
}

function Assignees({
  target,
  busy,
  onChange,
}: {
  target: ApiTarget;
  busy: boolean;
  onChange: (ids: number[]) => void;
}) {
  const { users } = useUsers();
  const [open, setOpen] = useState(false);
  const chosen = new Set(target.assignees.map((a) => a.userId));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={busy}
        className="flex w-full items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-40"
      >
        {target.assignees.length === 0 ? (
          <span className="text-gray-300">Nobody yet</span>
        ) : (
          <span className="truncate">{target.assignees.map((a) => a.name ?? `#${a.userId}`).join(", ")}</span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {users.map((u) => {
              const id = Number(u.id);
              const on = chosen.has(id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    const next = on ? [...chosen].filter((x) => x !== id) : [...chosen, id];
                    onChange(next);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <input type="checkbox" readOnly checked={on} className="accent-brand-accent" />
                  <span className="min-w-0 flex-1 truncate text-gray-700">{u.name}</span>
                  <span className="shrink-0 text-[10px] text-gray-400">{u.role}</span>
                </button>
              );
            })}
            {users.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No team members found.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Dependencies({
  projectId,
  target,
  siblings,
  busy,
  onChanged,
  onError,
}: {
  projectId: number;
  target: ApiTarget;
  siblings: ApiTarget[];
  busy: boolean;
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const already = new Set(target.dependencies.map((d) => d.dependsOn));
  const options = siblings.filter((s) => s.id !== target.id && !already.has(s.id));

  return (
    <div className="space-y-1">
      {target.dependencies.length === 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-gray-400 transition-colors duration-150 hover:text-brand-accent"
        >
          <Link2 size={12} /> Add dependency
        </button>
      )}

      {target.dependencies.map((d) => (
        <div key={d.id} className="flex items-center gap-1.5 text-xs">
          <Link2 size={11} className="shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-gray-600" title={d.dependsOnName ?? ""}>
            {d.dependsOnName ?? `#${d.dependsOn}`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                await api.removeDependency(projectId, target.id, d.id);
                await onChanged();
              } catch (e) {
                onError(e instanceof Error ? e.message : "Couldn't remove that.");
              }
            }}
            aria-label="Remove dependency"
            className="shrink-0 text-gray-300 transition-colors duration-150 hover:text-rose-600 disabled:opacity-40"
          >
            <X size={11} />
          </button>
        </div>
      ))}

      {adding ? (
        <Select
          value=""
          onChange={async (v) => {
            setAdding(false);
            if (!v) return;
            try {
              await api.addDependency(projectId, target.id, { dependsOn: Number(v) });
              await onChanged();
            } catch (e) {
              onError(e instanceof Error ? e.message : "That dependency was refused.");
            }
          }}
          size="sm"
          options={[
            { value: "", label: "Pick what this waits on…" },
            ...options.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
      ) : (
        target.dependencies.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[11px] text-gray-400 transition-colors duration-150 hover:text-brand-accent"
          >
            <Plus size={10} /> Add another
          </button>
        )
      )}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <CalendarDays size={12} className="shrink-0 text-gray-300" />
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label={label}
          className="w-full rounded border border-gray-200 bg-white px-1 py-1 text-xs focus:border-brand-accent focus:outline-none"
        />
      </div>
    </Field>
  );
}

const Dash = () => <span className="text-gray-300">—</span>;
