"use client";

import { useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { useTenderStore } from "@/lib/tenderStore";
import type { HardcopyDispatch } from "@/lib/tenderTypes";

const ARRIVED_OPTIONS = [
  { value: "", label: "—" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "NOT ARRIVED", label: "Not arrived" },
];

/** Add or edit a hardcopy dispatch record. */
export function HardcopyForm({ dispatch, onClose }: { dispatch?: HardcopyDispatch; onClose: () => void }) {
  const addHardcopy = useTenderStore((s) => s.addHardcopy);
  const updateHardcopy = useTenderStore((s) => s.updateHardcopy);
  const isEdit = !!dispatch;

  const [f, setF] = useState<Partial<HardcopyDispatch>>(dispatch ?? { arrived: "" });
  const set = (patch: Partial<HardcopyDispatch>) => setF((prev) => ({ ...prev, ...patch }));

  function save() {
    const record: HardcopyDispatch = {
      id: dispatch?.id ?? `hc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date: f.date || null,
      nameOfWork: f.nameOfWork || null,
      tenderId: f.tenderId || null,
      documentList: f.documentList || null,
      packedBy: f.packedBy || null,
      dispatchBy: f.dispatchBy || null,
      trackingNo: f.trackingNo || null,
      arrived: f.arrived || null,
      arrivedDate: f.arrivedDate || null,
      remarks: f.remarks || null,
    };
    if (isEdit) updateHardcopy(record.id, record);
    else addHardcopy(record);
    onClose();
  }

  return (
    <Drawer title={isEdit ? "Edit Dispatch" : "Add Dispatch"} onClose={onClose} onSave={save} saveLabel={isEdit ? "Save" : "Add"}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DrawerField label="Dispatch Date">
          <DatePicker value={f.date ?? ""} onChange={(v) => set({ date: v })} />
        </DrawerField>
        <DrawerField label="Tender ID">
          <input className="input" value={f.tenderId ?? ""} onChange={(e) => set({ tenderId: e.target.value })} placeholder="Portal / GeM ID" />
        </DrawerField>
        <DrawerField label="Name of Work" className="col-span-2">
          <textarea className="input min-h-[56px]" value={f.nameOfWork ?? ""} onChange={(e) => set({ nameOfWork: e.target.value })} />
        </DrawerField>
        <DrawerField label="Documents" className="col-span-2">
          <textarea className="input min-h-[56px]" value={f.documentList ?? ""} onChange={(e) => set({ documentList: e.target.value })} placeholder="What was couriered" />
        </DrawerField>
        <DrawerField label="Packed By">
          <input className="input" value={f.packedBy ?? ""} onChange={(e) => set({ packedBy: e.target.value })} />
        </DrawerField>
        <DrawerField label="Dispatch By">
          <input className="input" value={f.dispatchBy ?? ""} onChange={(e) => set({ dispatchBy: e.target.value })} />
        </DrawerField>
        <DrawerField label="Tracking No.">
          <input className="input" value={f.trackingNo ?? ""} onChange={(e) => set({ trackingNo: e.target.value })} />
        </DrawerField>
        <DrawerField label="Arrived">
          <Select value={f.arrived ?? ""} onChange={(v) => set({ arrived: v })} options={ARRIVED_OPTIONS} />
        </DrawerField>
        <DrawerField label="Arrived Date">
          <DatePicker value={f.arrivedDate ?? ""} onChange={(v) => set({ arrivedDate: v })} />
        </DrawerField>
        <DrawerField label="Remarks" className="col-span-2">
          <input className="input" value={f.remarks ?? ""} onChange={(e) => set({ remarks: e.target.value })} />
        </DrawerField>
      </div>
    </Drawer>
  );
}
