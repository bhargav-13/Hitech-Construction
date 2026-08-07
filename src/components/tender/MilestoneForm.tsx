"use client";

import { useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { useTenderStore } from "@/lib/tenderStore";
import type { TenderMilestones } from "@/lib/tenderTypes";

/** Add or edit a status-tracker record (identity + work-start). Step completion is toggled elsewhere. */
export function MilestoneForm({ milestone, onClose }: { milestone?: TenderMilestones; onClose: () => void }) {
  const addMilestone = useTenderStore((s) => s.addMilestone);
  const updateMilestone = useTenderStore((s) => s.updateMilestone);
  const isEdit = !!milestone;

  const [tenderId, setTenderId] = useState(milestone?.tenderId ?? "");
  const [nameOfWork, setNameOfWork] = useState(milestone?.nameOfWork ?? "");
  const [workStartDate, setWorkStartDate] = useState(milestone?.workStartDate ?? "");
  const [progress, setProgress] = useState(milestone?.progress ?? "");

  function save() {
    if (isEdit && milestone) {
      updateMilestone(milestone.id, { tenderId, nameOfWork, workStartDate: workStartDate || null, progress: progress || null });
    } else {
      addMilestone({
        id: `mst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        tenderId,
        nameOfWork,
        workStartDate: workStartDate || null,
        progress: progress || null,
      });
    }
    onClose();
  }

  return (
    <Drawer title={isEdit ? "Edit Tracker Record" : "Add to Status Tracker"} onClose={onClose} onSave={save} saveLabel={isEdit ? "Save" : "Add"}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DrawerField label="Tender ID">
          <input className="input" value={tenderId} onChange={(e) => setTenderId(e.target.value)} placeholder="Portal / GeM ID" />
        </DrawerField>
        <DrawerField label="Work Start Date">
          <DatePicker value={workStartDate} onChange={setWorkStartDate} />
        </DrawerField>
        <DrawerField label="Name of Work" className="col-span-2">
          <textarea className="input min-h-[60px]" value={nameOfWork} onChange={(e) => setNameOfWork(e.target.value)} placeholder="Scope / title of the work" />
        </DrawerField>
        <DrawerField label="Progress note" className="col-span-2">
          <input className="input" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="e.g. 31% & Work Order Issued" />
        </DrawerField>
      </div>
    </Drawer>
  );
}
