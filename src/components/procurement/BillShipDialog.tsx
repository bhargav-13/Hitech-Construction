"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";

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
 * Bill To and Ship To for an enquiry.
 *
 * These are two different places and routinely differ: the bill goes to the Rajkot office, the
 * goods go to a site three hours away. A supplier quoting freight needs the second one, so an
 * enquiry that cannot state a delivery address is not really sendable.
 *
 * Bill To defaults from the firm profile; Ship To offers the project name as a starting point,
 * since the site is nearly always where the material is wanted.
 */
export function BillShipDialog({
  value,
  projectName,
  onClose,
  onSave,
}: {
  value: BillShip;
  projectName?: string;
  onClose: () => void;
  onSave: (next: BillShip) => void;
}) {
  const [v, setV] = useState<BillShip>(value);
  const set = (patch: Partial<BillShip>) => setV((p) => ({ ...p, ...patch }));

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
              <DrawerField label="Name">
                <div className="flex gap-2">
                  <input
                    value={v.shipToName}
                    onChange={(e) => set({ shipToName: e.target.value })}
                    placeholder="Site or store"
                    className="input"
                  />
                  {projectName && v.shipToName !== projectName && (
                    <button
                      onClick={() => set({ shipToName: projectName })}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                      title="Use the project name"
                    >
                      Use project
                    </button>
                  )}
                </div>
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
