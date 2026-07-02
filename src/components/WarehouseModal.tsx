"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import type { Warehouse, WarehouseType } from "@/lib/types";

const TYPES: WarehouseType[] = ["Central", "Site Store"];

export function WarehouseModal({
  warehouse,
  onClose,
}: {
  warehouse?: Warehouse;
  onClose: () => void;
}) {
  const projects = useAppStore((s) => s.projects);
  const addWarehouse = useAppStore((s) => s.addWarehouse);
  const updateWarehouse = useAppStore((s) => s.updateWarehouse);

  const [name, setName] = useState(warehouse?.name ?? "");
  const [type, setType] = useState<WarehouseType>(warehouse?.type ?? "Central");
  const [projectId, setProjectId] = useState(warehouse?.projectId ?? projects[0]?.id ?? "");
  const [location, setLocation] = useState(warehouse?.location ?? "");
  const [inCharge, setInCharge] = useState(warehouse?.inCharge ?? "");

  function save() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      type,
      projectId: type === "Site Store" ? projectId : undefined,
      location: location.trim(),
      inCharge: inCharge.trim(),
      isActive: warehouse?.isActive ?? true,
    };
    if (warehouse) updateWarehouse(warehouse.id, payload);
    else addWarehouse(payload);
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">
          {warehouse ? "Edit Warehouse" : "New Warehouse"}
        </h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Warehouse Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Site Store - Junagadh"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as WarehouseType)} className="input">
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {type === "Site Store" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Linked Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Store In-charge</span>
            <input value={inCharge} onChange={(e) => setInCharge(e.target.value)} className="input" />
          </label>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {warehouse ? "Save Changes" : "Create Warehouse"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
