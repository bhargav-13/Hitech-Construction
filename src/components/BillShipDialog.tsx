"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import type { ProjectOption } from "@/lib/useProjects";

export interface BillShip {
  billToName: string;
  billToAddress: string;
  billToGstin: string;
  shipToName: string;
  shipToAddress: string;
  shipToGstin: string;
  shipSameAsBill: boolean;
}

/**
 * Bill To and Ship To — shared by the RFQ builder and the Vyapar purchase order.
 *
 * These are two different places and routinely differ: the bill goes to the Rajkot office, the
 * goods go to a site three hours away. A supplier quoting freight needs the second one, so an
 * enquiry that cannot state a delivery address is not really sendable — and neither is the order
 * that comes out of it.
 *
 * Bill To defaults from the firm profile; Ship To offers the project name as a starting point,
 * since the site is nearly always where the material is wanted.
 */
export function BillShipDialog({
  value,
  projects = [],
  projectId,
  onClose,
  onSave,
}: {
  value: BillShip;
  /** Sites the goods could go to. Picking one fills the name and address in one action. */
  projects?: ProjectOption[];
  /** The project the document is already on — offered first, since it is nearly always the answer. */
  projectId?: string | null;
  onClose: () => void;
  onSave: (next: BillShip) => void;
}) {
  const [v, setV] = useState<BillShip>(value);
  const set = (patch: Partial<BillShip>) => setV((p) => ({ ...p, ...patch }));

  /**
   * Ship To, filled from a project.
   *
   * It used to be a single "Use project" button that copied the name of whichever project the
   * document was on — which is the common case but not the only one: material for one site is
   * routinely delivered to another, or to the store. A picker covers both, and it brings the
   * project's own address across rather than leaving the buyer to type a site address from memory.
   */
  const current = projects.find((p) => String(p.id) === String(projectId ?? ""));
  const ordered = current ? [current, ...projects.filter((p) => p.id !== current.id)] : projects;

  function useProject(id: string) {
    const p = projects.find((x) => String(x.id) === id);
    if (!p) return;
    set({
      shipToName: p.name,
      // Only overwrite an address the user hasn't written themselves.
      shipToAddress: [p.address, p.city].filter(Boolean).join(", ") || v.shipToAddress,
    });
  }

  return (
    <Drawer title="Additional Details" onClose={onClose} onSave={() => onSave(v)} dirty width="max-w-2xl">
      <div className="space-y-6">
        {/* ---- Bill To ---- */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Bill To</h3>
            {(v.billToName || v.billToAddress) && (
              <button
                onClick={() => set({ billToName: "", billToAddress: "", billToGstin: "" })}
                className="flex items-center gap-1 text-xs font-medium text-rose-600 transition-opacity duration-150 hover:opacity-80"
              >
                <Trash2 size={12} /> Remove Address
              </button>
            )}
          </div>
          <div className="space-y-3">
            <DrawerField label="Name">
              <input
                value={v.billToName}
                onChange={(e) => set({ billToName: e.target.value })}
                placeholder="Your firm"
                className="input"
              />
            </DrawerField>
            <DrawerField label="Address">
              <textarea
                value={v.billToAddress}
                onChange={(e) => set({ billToAddress: e.target.value })}
                rows={3}
                placeholder="Office address"
                className="input resize-none"
              />
            </DrawerField>
            <DrawerField label="GSTIN">
              <input
                value={v.billToGstin}
                onChange={(e) => set({ billToGstin: e.target.value.toUpperCase() })}
                placeholder="24XXXXXXXXXXXZX"
                className="input font-mono"
              />
            </DrawerField>
          </div>
        </section>

        {/* ---- Ship To ---- */}
        <section className="border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Ship To</h3>
            {!v.shipSameAsBill && (v.shipToName || v.shipToAddress) && (
              <button
                onClick={() => set({ shipToName: "", shipToAddress: "", shipToGstin: "" })}
                className="flex items-center gap-1 text-xs font-medium text-rose-600 transition-opacity duration-150 hover:opacity-80"
              >
                <Trash2 size={12} /> Remove Address
              </button>
            )}
          </div>

          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={v.shipSameAsBill}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? {
                        shipSameAsBill: true,
                        shipToName: v.billToName,
                        shipToAddress: v.billToAddress,
                        shipToGstin: v.billToGstin,
                      }
                    : { shipSameAsBill: false },
                )
              }
              className="h-4 w-4 accent-cyan-600"
            />
            Same as Bill To Address
          </label>

          {!v.shipSameAsBill && (
            <div className="space-y-3">
              {ordered.length > 0 && (
                <DrawerField label="Project / site" hint="Fills the name and address below from the site's own details.">
                  <Select
                    value={ordered.some((p) => p.name === v.shipToName) ? String(ordered.find((p) => p.name === v.shipToName)!.id) : ""}
                    onChange={useProject}
                    placeholder="Pick a site"
                    options={[
                      { value: "", label: "Type it below instead" },
                      ...ordered.map((p) => ({ value: String(p.id), label: p.name })),
                    ]}
                  />
                </DrawerField>
              )}
              <DrawerField label="Name">
                <input
                  value={v.shipToName}
                  onChange={(e) => set({ shipToName: e.target.value })}
                  placeholder="Site or store"
                  className="input"
                />
              </DrawerField>
              <DrawerField label="Address">
                <textarea
                  value={v.shipToAddress}
                  onChange={(e) => set({ shipToAddress: e.target.value })}
                  rows={3}
                  placeholder="Where the material is to be delivered"
                  className="input resize-none"
                />
              </DrawerField>
              <DrawerField label="GSTIN">
                <input
                  value={v.shipToGstin}
                  onChange={(e) => set({ shipToGstin: e.target.value.toUpperCase() })}
                  placeholder="Optional"
                  className="input font-mono"
                />
              </DrawerField>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
