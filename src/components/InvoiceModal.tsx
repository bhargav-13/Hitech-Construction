"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { LineItemsEditor, type LineDraft } from "./LineItemsEditor";
import { useAppStore } from "@/lib/store";
import type { PartyType } from "@/lib/types";

export function InvoiceModal({
  mode,
  onClose,
}: {
  mode: "sale" | "purchase";
  onClose: () => void;
}) {
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const items = useAppStore((s) => s.items);
  const addSaleInvoice = useAppStore((s) => s.addSaleInvoice);
  const addPurchaseEntry = useAppStore((s) => s.addPurchaseEntry);

  const relevantType: PartyType = mode === "sale" ? "Client" : "Vendor";
  const relevantParties = parties.filter((p) => p.type === relevantType);

  const [partyId, setPartyId] = useState(relevantParties[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { itemId: items[0]?.id ?? "", qty: 1 },
  ]);

  function save() {
    if (!partyId || !projectId) return;
    const input = { partyId, projectId, date: date || "02-Jul-2026", lines };
    if (mode === "sale") addSaleInvoice(input);
    else addPurchaseEntry(input);
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">
          {mode === "sale" ? "New Sale Invoice" : "New Purchase Entry"}
        </h2>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              {mode === "sale" ? "Client" : "Vendor"}
            </span>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="input">
              {relevantParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g. 02-Jul-2026"
              className="input"
            />
          </label>
        </div>

        <LineItemsEditor items={items} lines={lines} onChange={setLines} />

        <button
          onClick={save}
          className="mt-6 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          {mode === "sale" ? "Save Invoice" : "Save Purchase Entry"}
        </button>
      </div>
    </Modal>
  );
}
