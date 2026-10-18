"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Field, Footer, Shell } from "@/components/asset/AssetDialogs";
import { ApiError } from "@/lib/api";
import { useProjects } from "@/lib/useProjects";
import { getParties } from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { todayIST } from "@/lib/datetime";
import { createEquipment, deployEquipment, logUsage, updateDeployment, updateEquipment } from "@/lib/equipmentApi";
import type { Deployment, Equipment, Ownership } from "@/lib/equipmentApi";

/** Equipment dialogs — the machine form, Deploy to a project (with rent), and a usage entry. */

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const UNITS = [
  { value: "hours", label: "Clock based · hours" },
  { value: "km", label: "Clock based · km" },
  { value: "trips", label: "Trip based" },
  { value: "days", label: "Day based" },
];
const RENT_TYPES = [
  { value: "monthly", label: "Monthly" },
  { value: "daily", label: "Daily" },
  { value: "hourly", label: "Hourly" },
  { value: "trip", label: "Per trip" },
];

export const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** Hours / km as people read them: up to two decimals, no trailing zeros (560, 7.5). */
export const num2 = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function usePartyOptions() {
  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => { getParties().then(setParties).catch(() => setParties([])); }, []);
  return useMemo(
    () => [
      { value: "", label: "No vendor" },
      ...parties.filter((p) => p.isActive !== false).map((p) => ({ value: String(p.id), label: p.partyGroup ? `${p.name} · ${p.partyGroup}` : p.name })),
    ],
    [parties],
  );
}

// ---------------------------------------------------------------- machine form

export function EquipmentFormDialog({ existing, onClose, onSaved }: {
  existing?: Equipment; onClose: () => void; onSaved: (e: Equipment) => void;
}) {
  const partyOptions = usePartyOptions();
  const [name, setName] = useState(existing?.name ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [ownership, setOwnership] = useState<Ownership>(existing?.ownership ?? "RENTED");
  const [unit, setUnit] = useState(existing?.unit ?? "hours");
  const [fuel, setFuel] = useState(existing?.fuel ?? "");
  const [vendor, setVendor] = useState(existing?.vendorPartyId ? String(existing.vendorPartyId) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Enter the equipment name."); return; }
    setBusy(true); setError("");
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        ownership,
        unit,
        fuel: fuel.trim() || null,
        vendorPartyId: vendor ? Number(vendor) : null,
        notes: notes.trim() || null,
        active,
      };
      const saved = existing ? await updateEquipment(existing.id, body) : await createEquipment(body);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save the equipment."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title={existing ? `Edit ${existing.name}` : "New Equipment"}
        subtitle="A machine the sites run — a tractor, JCB, breaker or DG set."
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} />}
      >
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Equipment name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramlal Tractor" className="input w-full" autoFocus /></Field>
          <Field label="Code"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="R01" className="input w-full" /></Field>
        </div>
        <Field label="Type">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {(["RENTED", "OWNED"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOwnership(k)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${ownership === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {k === "RENTED" ? "Rented" : "Owned"}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit of measurement"><Select value={unit} onChange={setUnit} options={UNITS} /></Field>
          <Field label="Fuel"><input value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="Diesel" className="input w-full" /></Field>
        </div>
        <Field label="Vendor" hint="The Vyapar party it is hired from — its hire bills are purchase bills there.">
          <Select value={vendor} onChange={setVendor} placeholder="Select party" options={partyOptions} />
        </Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input w-full" placeholder="Model, registration no., operator…" /></Field>
        {existing && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (uncheck when it has left for good)
          </label>
        )}
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- deploy

export function DeployDialog({ equipment, existing, onClose, onDone }: {
  equipment: Equipment; existing?: Deployment; onClose: () => void; onDone: () => void;
}) {
  const { projects } = useProjects();
  const partyOptions = usePartyOptions();
  const [projectId, setProjectId] = useState(existing?.projectId ? String(existing.projectId) : "");
  const [vendor, setVendor] = useState(
    existing?.vendorPartyId ? String(existing.vendorPartyId) : equipment.vendorPartyId ? String(equipment.vendorPartyId) : "",
  );
  const [rent, setRent] = useState(existing ? String(existing.rentAmount ?? 0) : "");
  const [rentType, setRentType] = useState(existing?.rentType ?? "monthly");
  const [startedOn, setStartedOn] = useState(existing?.startedOn ?? todayIST());
  const [endedOn, setEndedOn] = useState(existing?.endedOn ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!projectId) { setError("Pick the project it goes to."); return; }
    if (endedOn && startedOn && endedOn < startedOn) { setError("It can't leave before it arrived."); return; }
    setBusy(true); setError("");
    try {
      const body = {
        projectId: Number(projectId),
        vendorPartyId: vendor ? Number(vendor) : null,
        rentAmount: Number(rent) || 0,
        rentType,
        startedOn: startedOn || null,
        endedOn: endedOn || null,
        active: !endedOn,
      };
      if (existing) await updateDeployment(existing.id, body);
      else await deployEquipment(equipment.id, body);
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save the deployment."));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title={existing ? "Edit deployment" : `Deploy ${equipment.name}`}
        subtitle="Which site it is on, from when, and the rent agreed."
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} label={existing ? "Save" : "Deploy"} />}
      >
        <Field label="Project" required>
          <Select value={projectId} onChange={setProjectId} placeholder="Select project" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label="Vendor"><Select value={vendor} onChange={setVendor} placeholder="Select party" options={partyOptions} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rent (₹)"><input type="number" min={0} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="0" className="input w-full" /></Field>
          <Field label="Rent basis"><Select value={rentType} onChange={setRentType} options={RENT_TYPES} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><DatePicker value={startedOn} onChange={setStartedOn} /></Field>
          <Field label="Until" hint="Blank while it is still on site"><DatePicker value={endedOn} onChange={setEndedOn} /></Field>
        </div>
      </Shell>
    </Modal>
  );
}

// ---------------------------------------------------------------- usage entry

export function UsageDialog({ equipment, projectId: initialProject, onClose, onDone }: {
  equipment: Equipment; projectId?: number | null; onClose: () => void; onDone: () => void;
}) {
  const { projects } = useProjects();
  const deployedOn = equipment.activeProjectIds;
  const [projectId, setProjectId] = useState(
    initialProject ? String(initialProject) : deployedOn.length === 1 ? String(deployedOn[0]) : "",
  );
  const [usedOn, setUsedOn] = useState(todayIST());
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [hours, setHours] = useState("");
  const [distance, setDistance] = useState("");
  const [trips, setTrips] = useState("");
  const [fuel, setFuel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Start/stop on the same day: show what the clock comes to, so a typo is caught before saving.
  const clockHours = useMemo(() => {
    if (!start || !stop) return null;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = stop.split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : null;
  }, [start, stop]);

  async function save() {
    if (!projectId) { setError("Pick the project it ran on."); return; }
    if (start && stop && clockHours == null) { setError("Stop time must be after start time."); return; }
    setBusy(true); setError("");
    try {
      await logUsage(equipment.id, {
        projectId: Number(projectId),
        usedOn,
        startAt: start ? `${usedOn}T${start}` : null,
        stopAt: stop ? `${usedOn}T${stop}` : null,
        usedHours: hours ? Number(hours) : null,
        distance: distance ? Number(distance) : null,
        trips: trips ? Number(trips) : null,
        fuelQty: fuel ? Number(fuel) : null,
        note: note.trim() || null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, "Unable to save the entry."));
      setBusy(false);
    }
  }

  const projectOptions = projects
    .map((p) => ({ value: p.id, label: deployedOn.includes(Number(p.id)) ? `${p.name} · deployed` : p.name }))
    .sort((a, b) => Number(deployedOn.includes(Number(b.value))) - Number(deployedOn.includes(Number(a.value))));

  return (
    <Modal onClose={onClose}>
      <Shell
        title={`Usage · ${equipment.name}`}
        subtitle="One day's run: start and stop, or just the hours."
        onClose={onClose}
        footer={<Footer busy={busy} error={error} onCancel={onClose} onSave={save} />}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project" required><Select value={projectId} onChange={setProjectId} placeholder="Select project" options={projectOptions} /></Field>
          <Field label="Date"><DatePicker value={usedOn} onChange={setUsedOn} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input w-full" /></Field>
          <Field label="Stop"><input type="time" value={stop} onChange={(e) => setStop(e.target.value)} className="input w-full" /></Field>
          <Field label="Hours" hint={clockHours != null && !hours ? `${clockHours} h from the clock` : undefined}>
            <input type="number" min={0} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder={clockHours != null ? String(clockHours) : "0"} className="input w-full" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Distance (km)"><input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="0" className="input w-full" /></Field>
          <Field label="Trips"><input type="number" min={0} step={1} value={trips} onChange={(e) => setTrips(e.target.value)} placeholder="0" className="input w-full" /></Field>
          <Field label={`Fuel${equipment.fuel ? ` (${equipment.fuel})` : ""}`}><input type="number" min={0} value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="Litres" className="input w-full" /></Field>
        </div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Work done, breakdown…" className="input w-full" /></Field>
      </Shell>
    </Modal>
  );
}
