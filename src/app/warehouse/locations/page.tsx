"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useWarehouseStore, stockByItem, reportRefusal } from "@/lib/warehouseStore";
import { useWarehouseRights } from "@/lib/warehouseScope";
import { WAREHOUSE_KIND_META } from "@/lib/warehouseConfig";
import type { Warehouse, WarehouseKind } from "@/lib/warehouseTypes";
import { useProjects } from "@/lib/useProjects";
import { useUsers } from "@/lib/useUsers";
import { Lock, MapPin, Pencil, Plus, Power, Trash2, Users, Warehouse as WarehouseIcon } from "lucide-react";

/**
 * Where stock is kept.
 *
 * Two kinds that behave differently and one that nobody visits:
 *
 * - **Central store** — the main yard. Not tied to a project, buys for everyone.
 * - **Site store** — belongs to a project, and that link is what makes access work without anyone
 *   granting it: whoever runs the site can see the site's store. Most material actually sits here.
 * - **In transit** — a system store holding what has left one place and not arrived at the other, so
 *   a lorry-load is never invisible. Created once, never edited, never picked to issue from.
 *
 * A store that has moved stock is deactivated rather than deleted: its movements are what explain
 * today's figures everywhere else, and orphaning them would make the rest of the module wrong.
 */
export default function WarehouseLocationsPage() {
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const movements = useWarehouseStore((s) => s.movements);
  const members = useWarehouseStore((s) => s.members);
  const addWarehouse = useWarehouseStore((s) => s.addWarehouse);
  const updateWarehouse = useWarehouseStore((s) => s.updateWarehouse);
  const removeWarehouse = useWarehouseStore((s) => s.removeWarehouse);
  const rights = useWarehouseRights("all");
  const { projects } = useProjects();
  const { users } = useUsers();

  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () =>
      warehouses
        .filter((w) => w.kind !== "TRANSIT")
        .map((w) => {
          const onHand = stockByItem(movements, w.id);
          return {
            w,
            lines: [...onHand.values()].filter((q) => q !== 0).length,
            team: members.filter((m) => m.warehouseId === w.id).length,
            used: movements.some((m) => m.warehouseId === w.id || m.counterWarehouseId === w.id),
          };
        })
        .sort((a, b) => Number(b.w.isActive) - Number(a.w.isActive) || a.w.name.localeCompare(b.w.name)),
    [warehouses, movements, members],
  );

  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—");
  const userName = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "—") : "Nobody yet");

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Warehouses"
        subtitle="A central store buys for everyone; a site store belongs to one project and inherits its team."
        right={
          <button
            onClick={() => setCreating(true)}
            disabled={!rights.canAdminister}
            title={rights.canAdminister ? "Add a store" : "Needs Warehouse edit rights"}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={15} /> New Warehouse
          </button>
        }
      />

      {!rights.canAdminister && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock size={14} className="shrink-0" />
          You can see the stores but not change them — that needs Warehouse edit rights.
        </div>
      )}

      {rows.length === 0 ? (
        <WarehouseEmpty
          icon={WarehouseIcon}
          title="No stores yet"
          hint="Add your central store first, then one per site. Nothing else in this module works until there is somewhere to put stock."
          action={
            rights.canAdminister ? (
              <button
                onClick={() => setCreating(true)}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Add the first store
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ w, lines, team, used }) => {
            const kindMeta = WAREHOUSE_KIND_META[w.kind];
            return (
              <div
                key={w.id}
                className={`rounded-xl border bg-white p-4 transition-all duration-150 ${
                  w.isActive ? "border-gray-200 hover:border-brand-accent" : "border-dashed border-gray-200 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-600">
                        {w.code}
                      </span>
                      <span className="truncate font-medium text-gray-800">{w.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${kindMeta.chip}`}>
                        {kindMeta.label}
                      </span>
                      {!w.isActive && (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Closed</span>
                      )}
                    </div>
                    {w.kind === "SITE" && (
                      <div className="mt-1 truncate text-xs text-gray-500">Site: {projectName(w.projectId)}</div>
                    )}
                    {w.address && (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
                        <MapPin size={11} className="shrink-0" /> {w.address}
                      </div>
                    )}
                  </div>
                  <RowMenu align="right" buttonLabel={`Actions for ${w.name}`}>
                    {(close) => (
                      <>
                        <RowMenuItem
                          icon={Pencil}
                          label="Edit"
                          disabled={!rights.canAdminister}
                          onClick={() => { close(); setEditing(w); }}
                        />
                        <RowMenuItem
                          icon={Power}
                          label={w.isActive ? "Close this store" : "Reopen"}
                          disabled={!rights.canAdminister}
                          onClick={() => { close(); updateWarehouse(w.id, { isActive: !w.isActive }).catch(reportRefusal); }}
                        />
                        <RowMenuDivider />
                        <RowMenuItem
                          icon={Trash2}
                          label={used ? "Delete (keeps history)" : "Delete"}
                          tone="danger"
                          disabled={!rights.canAdminister}
                          disabledHint="Needs Warehouse edit rights"
                          onClick={() => {
                            close();
                            const warning = used
                              ? `${w.name} has movements against it, so it will be closed rather than deleted — its history explains stock elsewhere. Continue?`
                              : `Delete ${w.name}?`;
                            if (confirm(warning)) removeWarehouse(w.id).catch(reportRefusal);
                          }}
                        />
                      </>
                    )}
                  </RowMenu>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <span>
                    <span className="font-semibold text-gray-800 tabular-nums">{lines}</span> items held
                  </span>
                  <Link href="/warehouse/access" className="flex items-center gap-1 hover:text-brand-accent">
                    <Users size={12} />
                    <span className="font-semibold text-gray-800 tabular-nums">{team}</span> on the team
                  </Link>
                  <span className="truncate">In charge: {userName(w.inChargeUserId)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <WarehouseDialog
          existing={editing ?? undefined}
          takenCodes={warehouses.filter((w) => w.id !== editing?.id).map((w) => w.code)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(draft) => {
            if (editing) updateWarehouse(editing.id, draft).catch(reportRefusal);
            else addWarehouse({ ...draft, isActive: true }).catch(reportRefusal);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </WarehouseShell>
  );
}

function WarehouseDialog({
  existing,
  takenCodes,
  onClose,
  onSave,
}: {
  existing?: Warehouse;
  takenCodes: string[];
  onClose: () => void;
  onSave: (draft: Omit<Warehouse, "id" | "isActive">) => void;
}) {
  const { projects } = useProjects();
  const { users } = useUsers();
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<WarehouseKind>(existing?.kind ?? "SITE");
  const [projectId, setProjectId] = useState(existing?.projectId ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [inChargeUserId, setInChargeUserId] = useState(existing?.inChargeUserId ?? "");
  const [error, setError] = useState("");

  function save() {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return setError("Give the store a short code — it goes on every document.");
    if (takenCodes.some((c) => c.toUpperCase() === cleanCode)) return setError(`Code "${cleanCode}" is already in use.`);
    if (!name.trim()) return setError("Give the store a name.");
    if (kind === "SITE" && !projectId) return setError("A site store belongs to a project — pick one.");

    onSave({
      code: cleanCode,
      name: name.trim(),
      kind,
      // A central store is deliberately not tied to a project even if one was picked first.
      projectId: kind === "SITE" ? projectId : null,
      address: address.trim() || null,
      inChargeUserId: inChargeUserId || null,
    });
  }

  return (
    <Drawer
      title={existing ? `Edit ${existing.name}` : "New Warehouse"}
      onClose={onClose}
      onSave={save}
      saveLabel="Save"
      width="max-w-xl"
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <DrawerField label="Code" required hint="Short — it prefixes documents.">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CS"
              maxLength={6}
              className="input font-mono uppercase"
            />
          </DrawerField>
          <DrawerField label="Name" required className="col-span-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Central Store — Rajkot"
              className="input"
            />
          </DrawerField>
        </div>

        <DrawerField label="Kind" required>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["CENTRAL", "SITE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                  kind === k ? "border-brand-accent bg-cyan-50/60" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="block text-sm font-medium text-gray-800">
                  {k === "CENTRAL" ? "Central store" : "Site store"}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {k === "CENTRAL"
                    ? "Buys for every site. Not tied to a project."
                    : "Belongs to one project — its team gets access automatically."}
                </span>
              </button>
            ))}
          </div>
        </DrawerField>

        {kind === "SITE" && (
          <DrawerField
            label="Project"
            required
            hint="Whoever runs this site can read its store without a separate grant."
          >
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="Which site"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </DrawerField>
        )}

        <DrawerField label="Address">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Where the store physically is"
            className="input resize-none"
          />
        </DrawerField>

        <DrawerField
          label="In charge"
          hint="Accountable for what is in it. Who may issue from it is set on the Access screen."
        >
          <Select
            value={inChargeUserId}
            onChange={setInChargeUserId}
            placeholder="Nobody yet"
            options={[{ value: "", label: "Nobody yet" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          />
        </DrawerField>
      </div>
    </Drawer>
  );
}
