"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { ApiError } from "@/lib/api";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { getParties } from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { todayIST } from "@/lib/datetime";
import {
  createAsset, createAssetType, deleteAssetType, renameAssetType, updateAsset, updateAssetStock,
} from "@/lib/assetApi";
import type { Asset, AssetAssignment, AssetType, HolderBody, HolderKind } from "@/lib/assetApi";
import { Pencil, Trash2, X } from "lucide-react";

/** Shared Asset dialogs — the register form, Assign / Transfer, Return, Update Stock and Types. */

export function Shell({ title, subtitle, children, footer, onClose }: {
  title: string; subtitle?: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 pr-12">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="sr-only">Close</button>
      </div>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">{children}</div>
      <div className="border-t border-gray-100 px-5 py-3">{footer}</div>
    </>
  );
}

export function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-500">
      {label}{required && <span className="text-rose-500"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
      {hint && <p className="mt-1 text-[11px] font-normal text-gray-400">{hint}</p>}
    </label>
  );
}

export function Footer({ busy, error, onCancel, onSave, label = "Save", tone = "brand" }: {
  busy: boolean; error: string; onCancel: () => void; onSave: () => void; label?: string; tone?: "brand" | "danger";
}) {
  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button
          onClick={onSave}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-accent hover:opacity-90"}`}
        >
          {busy && <Spinner size={14} />} {label}
        </button>
      </div>
    </div>
  );
}

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** "14:27" now, IST. */
function nowTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** Date + time picker returning "2026-10-07T14:27" (IST wall clock, as the backend expects). */
function useWhen() {
  const [date, setDate] = useState(todayIST());
  const [time, setTime] = useState(nowTime());
  return {
    at: `${date}T${time}`,
    field: (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input w-full" /></Field>
      </div>
    ),
  };
}

// ---------------------------------------------------------------- register form

export function AssetFormDialog({ existing, types, onClose, onSaved }: {
  existing?: Asset; types: AssetType[]; onClose: () => void; onSaved: (a: Asset) => void;
}) {
  const [prefix, setPrefix] = useState(existing?.codePrefix ?? "AS");
  const [number, setNumber] = useState(existing ? String(existing.codeNumber) : "");
  const [name, setName] = useState(existing?.name ?? "");
  const [typeId, setTypeId] = useState(existing?.typeId ? String(existing.typeId) : "");
  const [rate, setRate] = useState(existing ? String(existing.unitRate ?? 0) : "");
  const [total, setTotal] = useState(existing ? String(existing.totalQty) : "1");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Enter the asset name."); return; }
    const qty = Number(total);
    if (!Number.isInteger(qty) || qty < 0) { setError("Total count must be a whole number."); return; }
    setBusy(true); setError("");
    try {
      const body = {
        codePrefix: prefix.trim() || "AS",
        codeNumber: number.trim() ? Number(number) : null,
        name: name.trim(),
        typeId: typeId ? Number(typeId) : null,
        unitRate: Number(rate) || 0,
        totalQty: qty,
        description: description.trim() || null,
      };
      const saved = existing ? await updateAsset(existing.id, body) : await createAsset(body);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save the asset."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title={existing ? `Edit ${existing.code}` : "New Asset"}
        subtitle="Something the firm owns and hands out — a camera, mixer, pump or tractor."
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} />}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code prefix"><input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={10} className="input w-full" /></Field>
          <Field label="Code number" hint="Blank = next free number"><input type="number" min={1} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto" className="input w-full" /></Field>
        </div>
        <Field label="Asset name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mixer Machine" className="input w-full" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit rate (₹)"><input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" className="input w-full" /></Field>
          <Field label="Total count"><input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className="input w-full" /></Field>
        </div>
        <Field label="Asset type">
          <Select value={typeId} onChange={setTypeId} placeholder="Select type" options={[{ value: "", label: "No type" }, ...types.map((t) => ({ value: String(t.id), label: t.name }))]} />
        </Field>
        <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input w-full" placeholder="Make, model, serial no., condition…" /></Field>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- holder picker

/** Project + a staff member or a Vyapar party. Shared by Assign and Transfer. */
function useHolderPicker(initial?: { projectId: number | null }) {
  const { users } = useUsers();
  const { projects } = useProjects();
  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => { getParties().then(setParties).catch(() => setParties([])); }, []);
  const [kind, setKind] = useState<HolderKind>("USER");
  const [who, setWho] = useState("");
  const [projectId, setProjectId] = useState(initial?.projectId ? String(initial.projectId) : "");

  const whoOptions = useMemo(
    () => kind === "USER"
      ? users.map((u) => ({ value: u.id, label: u.name }))
      : parties.filter((p) => p.isActive !== false).map((p) => ({ value: String(p.id), label: p.partyGroup ? `${p.name} · ${p.partyGroup}` : p.name })),
    [kind, users, parties],
  );

  const body = (): HolderBody | string => {
    if (!who) return kind === "USER" ? "Pick the staff member taking it." : "Pick the party taking it.";
    return {
      projectId: projectId ? Number(projectId) : null,
      holderKind: kind,
      holderUserId: kind === "USER" ? Number(who) : null,
      holderPartyId: kind === "PARTY" ? Number(who) : null,
    };
  };

  const fields = (
    <>
      <Field label="Project">
        <Select value={projectId} onChange={setProjectId} placeholder="Select project" options={[{ value: "", label: "No project (office)" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
      </Field>
      <Field label="Assign to" required>
        <div className="mb-2 inline-flex rounded-lg border border-gray-200 p-0.5">
          {(["USER", "PARTY"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setWho(""); }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${kind === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {k === "USER" ? "Staff member" : "Party"}
            </button>
          ))}
        </div>
        <Select value={who} onChange={setWho} placeholder={kind === "USER" ? "Select staff member" : "Select party"} options={whoOptions} />
      </Field>
    </>
  );
  return { fields, body };
}

// ---------------------------------------------------------------- assign / transfer

export function AssignDialog({ asset, from, onClose, onDone, run }: {
  asset: Asset;
  /** Set for a transfer: the holding the units leave. */
  from?: AssetAssignment;
  onClose: () => void;
  onDone: () => void;
  run: (body: HolderBody & { qty: number; at: string; note?: string }) => Promise<unknown>;
}) {
  const picker = useHolderPicker();
  const when = useWhen();
  const max = from ? from.qty : asset.availableQty;
  const [qty, setQty] = useState(String(Math.min(1, max) || 1));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) { setError("Quantity must be at least 1."); return; }
    if (n > max) { setError(from ? `${from.holderName} holds only ${max}.` : `Only ${max} available.`); return; }
    const holder = picker.body();
    if (typeof holder === "string") { setError(holder); return; }
    setBusy(true); setError("");
    try {
      await run({ ...holder, qty: n, at: when.at, note: note.trim() || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title={from ? `Transfer ${asset.name}` : `Assign ${asset.name}`}
        subtitle={from ? `From ${from.holderName} · holds ${from.qty}` : `${asset.code} · ${asset.availableQty} available`}
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} label={from ? "Transfer" : "Assign"} />}
      >
        {picker.fields}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required><input type="number" min={1} max={max} value={qty} onChange={(e) => setQty(e.target.value)} className="input w-full" /></Field>
        </div>
        {when.field}
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, purpose…" className="input w-full" /></Field>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- return

export function ReturnDialog({ asset, from, onClose, onDone, run }: {
  asset: Asset; from: AssetAssignment; onClose: () => void; onDone: () => void;
  run: (body: { qty: number; at: string; note?: string }) => Promise<unknown>;
}) {
  const when = useWhen();
  const [qty, setQty] = useState(String(from.qty));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1 || n > from.qty) { setError(`Enter 1 to ${from.qty}.`); return; }
    setBusy(true); setError("");
    try {
      await run({ qty: n, at: when.at, note: note.trim() || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to record the return."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title={`Return ${asset.name}`}
        subtitle={`From ${from.holderName} · holds ${from.qty}`}
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} label="Return" />}
      >
        <Field label="Quantity returned" required><input type="number" min={1} max={from.qty} value={qty} onChange={(e) => setQty(e.target.value)} className="input w-full" /></Field>
        {when.field}
        <Field label="Note" hint="If it came back broken, return it and then move it to Damaged / In Repair with Update Stock.">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition on return…" className="input w-full" />
        </Field>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- edit assignment

export function EditAssignmentDialog({ from, onClose, onDone, run }: {
  from: AssetAssignment; onClose: () => void; onDone: () => void;
  run: (body: { projectId?: number | null; qty?: number; at?: string }) => Promise<unknown>;
}) {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState(from.projectId ? String(from.projectId) : "");
  const [qty, setQty] = useState(String(from.qty));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) { setError("Quantity must be at least 1 — use Return to take it all back."); return; }
    setBusy(true); setError("");
    try {
      await run({ projectId: projectId ? Number(projectId) : null, qty: n });
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell title="Edit assignment" subtitle={from.holderName} onClose={onClose} footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} />}>
        <Field label="Project">
          <Select value={projectId} onChange={setProjectId} placeholder="Select project" options={[{ value: "", label: "No project (office)" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label="Quantity held"><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="input w-full" /></Field>
        <p className="text-[11px] text-gray-400">For a correction. To hand units back or on to someone else, use Return or Transfer so the timeline records it.</p>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- update stock

export function StockDialog({ asset, onClose, onSaved }: { asset: Asset; onClose: () => void; onSaved: () => void }) {
  const [total, setTotal] = useState(String(asset.totalQty));
  const [repair, setRepair] = useState(String(asset.repairQty));
  const [damaged, setDamaged] = useState(String(asset.damagedQty));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const free = Number(total) - Number(repair) - Number(damaged) - asset.assignedQty;

  async function save() {
    const t = Number(total), r = Number(repair), d = Number(damaged);
    if (![t, r, d].every((v) => Number.isInteger(v) && v >= 0)) { setError("Counts must be whole numbers."); return; }
    if (free < 0) { setError(`Total must cover in repair + damaged + the ${asset.assignedQty} assigned.`); return; }
    setBusy(true); setError("");
    try {
      await updateAssetStock(asset.id, { totalQty: t, repairQty: r, damagedQty: d, note: note.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to update stock."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title="Update Stock"
        subtitle={`${asset.name} · ${asset.assignedQty} assigned`}
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} label="Update" />}
      >
        <Field label="Total count"><input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className="input w-full" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="In repair"><input type="number" min={0} value={repair} onChange={(e) => setRepair(e.target.value)} className="input w-full" /></Field>
          <Field label="Damaged"><input type="number" min={0} value={damaged} onChange={(e) => setDamaged(e.target.value)} className="input w-full" /></Field>
        </div>
        <div className={`rounded-lg px-3 py-2 text-sm ${free < 0 ? "bg-rose-50 text-rose-700" : "bg-gray-50 text-gray-700"}`}>
          Available after this: <span className="font-semibold">{Number.isFinite(free) ? free : "—"}</span>
        </div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sent to workshop, motor burnt" className="input w-full" /></Field>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- types

export function TypesDialog({ types, canEdit, canDelete, onClose, onChanged }: {
  types: AssetType[]; canEdit: boolean; canDelete: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); onChanged(); } catch (err) { setError(errText(err, "Unable to save.")); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <Shell title="Asset Types" subtitle="Machinery, Vehicle, Tools… used to group the register." onClose={onClose}
        footer={<div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Done</button></div>}>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {canEdit && (
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type" className="input flex-1" />
            <button
              disabled={busy || !name.trim()}
              onClick={() => act(async () => { await createAssetType(name.trim()); setName(""); })}
              className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {types.length === 0 && <li className="px-3 py-3 text-sm text-gray-400">No types yet.</li>}
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === t.id ? (
                <>
                  <input value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} className="input flex-1" autoFocus />
                  <button disabled={busy} onClick={() => act(async () => { await renameAssetType(t.id, editing.name.trim()); setEditing(null); })} className="text-xs font-semibold text-brand-accent">Save</button>
                  <button onClick={() => setEditing(null)} className="text-gray-400"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-gray-800">{t.name}</span>
                  <span className="text-xs text-gray-400">{t.assetCount} asset{t.assetCount === 1 ? "" : "s"}</span>
                  {canEdit && <button onClick={() => setEditing({ id: t.id, name: t.name })} title="Rename" className="rounded p-1 text-gray-400 hover:text-brand-accent"><Pencil size={13} /></button>}
                  {canDelete && (
                    <button
                      onClick={() => { if (confirm(`Delete the type "${t.name}"? Its assets stay, untyped.`)) void act(() => deleteAssetType(t.id)); }}
                      title="Delete"
                      className="rounded p-1 text-gray-400 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </Shell>
    </Modal>
  );
}
