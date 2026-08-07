"use client";

import { useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { useTenderStore } from "@/lib/tenderStore";
import type { TenderDocuments } from "@/lib/tenderTypes";

/** Add or edit a documentation-tracker record (identity). Soft/hard copy status is toggled elsewhere. */
export function DocumentForm({ document, onClose }: { document?: TenderDocuments; onClose: () => void }) {
  const addDocument = useTenderStore((s) => s.addDocument);
  const updateDocument = useTenderStore((s) => s.updateDocument);
  const isEdit = !!document;

  const [tenderId, setTenderId] = useState(document?.tenderId ?? "");
  const [nameOfWork, setNameOfWork] = useState(document?.nameOfWork ?? "");
  const [progress, setProgress] = useState(document?.progress ?? "");
  const [viewDocuments, setViewDocuments] = useState(document?.viewDocuments ?? "");

  function save() {
    if (isEdit && document) {
      updateDocument(document.id, { tenderId, nameOfWork, progress: progress || null, viewDocuments: viewDocuments || null });
    } else {
      addDocument({
        id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        tenderId,
        nameOfWork,
        progress: progress || null,
        viewDocuments: viewDocuments || null,
        raBills: [],
      });
    }
    onClose();
  }

  return (
    <Drawer title={isEdit ? "Edit Documentation Record" : "Add Documentation Record"} onClose={onClose} onSave={save} saveLabel={isEdit ? "Save" : "Add"}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DrawerField label="Tender ID">
          <input className="input" value={tenderId} onChange={(e) => setTenderId(e.target.value)} placeholder="Portal / GeM ID" />
        </DrawerField>
        <DrawerField label="Progress note">
          <input className="input" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="e.g. 31% & Work Order Issued" />
        </DrawerField>
        <DrawerField label="Name of Work" className="col-span-2">
          <textarea className="input min-h-[60px]" value={nameOfWork} onChange={(e) => setNameOfWork(e.target.value)} placeholder="Scope / title of the work" />
        </DrawerField>
        <DrawerField label="View Documents (link/name)" className="col-span-2">
          <input className="input" value={viewDocuments} onChange={(e) => setViewDocuments(e.target.value)} placeholder="Folder link or reference" />
        </DrawerField>
      </div>
    </Drawer>
  );
}
