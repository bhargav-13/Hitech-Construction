"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import {
  AssetFormDialog, AssignDialog, EditAssignmentDialog, ReturnDialog, StockDialog,
} from "@/components/asset/AssetDialogs";
import { ApiError } from "@/lib/api";
import {
  assignAsset, deleteAsset, deleteAssignment, editAssignment, getAsset, listAssetTypes, returnAsset, transferAsset,
} from "@/lib/assetApi";
import type { AssetAssignment, AssetDetail, AssetEvent, AssetType } from "@/lib/assetApi";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { formatDateTimeIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import {
  ArrowLeft, ArrowLeftRight, Boxes, CornerDownLeft, Pencil, Trash2, TriangleAlert, UserCheck, Wrench,
} from "lucide-react";

type Dialog =
  | null
  | { kind: "EDIT" }
  | { kind: "STOCK" }
  | { kind: "ASSIGN" }
  | { kind: "RETURN"; row: AssetAssignment }
  | { kind: "TRANSFER"; row: AssetAssignment }
  | { kind: "EDIT_ROW"; row: AssetAssignment };

const EVENT_LABEL: Record<AssetEvent["kind"], string> = {
  ASSIGNED: "Assigned",
  RETURNED: "Returned",
  TRANSFERRED_OUT: "Transferred out",
  TRANSFERRED_IN: "Transferred in",
  STOCK_UPDATED: "Stock updated",
  ASSIGNMENT_EDITED: "Assignment corrected",
};
const EVENT_TONE: Record<AssetEvent["kind"], string> = {
  ASSIGNED: "bg-emerald-500",
  RETURNED: "bg-rose-500",
  TRANSFERRED_OUT: "bg-indigo-500",
  TRANSFERRED_IN: "bg-indigo-500",
  STOCK_UPDATED: "bg-amber-500",
  ASSIGNMENT_EDITED: "bg-gray-400",
};

/**
 * One asset: its four buckets (available / assigned / in repair / damaged), everyone holding some
 * with Return and Transfer on each, and the timeline of every hand-over and stock correction.
 */
export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const can = useCan();
  const id = Number(params.id);
  const { projects } = useProjects();
  const projectName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects]);
  const [data, setData] = useState<AssetDetail | null>(null);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([getAsset(id), listAssetTypes()]);
      setData(d);
      setTypes(t);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the asset.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return (
      <AppShell title="Asset">
        {error ? (
          <div className="mx-auto max-w-md space-y-3 py-16 text-center">
            <p className="text-sm text-rose-600">{error}</p>
            <Link href="/asset" className="text-sm font-medium text-brand-accent hover:underline">Back to assets</Link>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        )}
      </AppShell>
    );
  }

  const { asset, holders, events } = data;
  const canEdit = can("ASSET_REGISTER:EDIT");
  const canAssign = can("ASSET_ASSIGN:CREATE");
  const canMove = can("ASSET_ASSIGN:EDIT");
  const canUnassign = can("ASSET_ASSIGN:DELETE");

  async function removeAsset() {
    if (!confirm(`Delete ${asset.code} ${asset.name}? Its whole history goes with it.`)) return;
    try {
      await deleteAsset(asset.id);
      router.push("/asset");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to delete.");
    }
  }

  async function removeRow(row: AssetAssignment) {
    if (!confirm(`Delete this assignment to ${row.holderName}? Use it only for a mistake — the ${row.qty} unit(s) become available and its timeline entries are removed.`)) return;
    try {
      setData(await deleteAssignment(row.id));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to delete the assignment.");
    }
  }

  const holderHref = (r: AssetAssignment) =>
    r.holderKind === "USER" && r.holderUserId ? `/payroll/staff/${r.holderUserId}` : r.holderPartyId ? `/vyapar/parties?open=${r.holderPartyId}` : null;

  return (
    <AppShell title="Asset">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <button onClick={() => router.push("/asset")} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" title="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-brand-accent"><Boxes size={22} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-800">{asset.name}</h2>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{asset.code}</span> · {inr(asset.unitRate)} each · Total {asset.totalQty}
              {asset.typeName && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{asset.typeName}</span>}
            </p>
            {asset.description && <p className="mt-1 text-xs text-gray-500">{asset.description}</p>}
          </div>
          {canAssign && (
            <button
              onClick={() => setDialog({ kind: "ASSIGN" })}
              disabled={asset.availableQty <= 0}
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              title={asset.availableQty <= 0 ? "None available" : undefined}
            >
              Assign
            </button>
          )}
          {(canEdit || can("ASSET_REGISTER:DELETE")) && (
            <RowMenu align="right" buttonLabel="Asset actions">
              {(close) => (
                <>
                  {canEdit && <RowMenuItem icon={Pencil} label="Edit asset" onClick={() => { close(); setDialog({ kind: "EDIT" }); }} />}
                  {can("ASSET_REGISTER:DELETE") && <RowMenuItem icon={Trash2} label="Delete asset" tone="danger" onClick={() => { close(); void removeAsset(); }} />}
                </>
              )}
            </RowMenu>
          )}
        </div>

        {notice && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}

        {/* Buckets */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Bucket label="Available" value={asset.availableQty} tone="text-emerald-600" icon={Boxes} />
          <Bucket label="Assigned" value={asset.assignedQty} tone="text-brand-accent" icon={UserCheck} />
          <Bucket label="In repair" value={asset.repairQty} tone="text-amber-600" icon={Wrench} />
          <Bucket label="Damaged" value={asset.damagedQty} tone="text-rose-600" icon={TriangleAlert} />
        </div>
        {canEdit && (
          <div className="-mt-1 flex justify-end">
            <button onClick={() => setDialog({ kind: "STOCK" })} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              <Pencil size={12} /> Update stock (total / in repair / damaged)
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Holders */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">With ({holders.length})</h3>
            {holders.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">
                Nobody holds this asset right now.
              </div>
            )}
            {holders.map((r) => {
              const href = holderHref(r);
              const mine = events.filter((e) => e.assignmentId === r.id);
              const expanded = openRow === r.id;
              return (
                <div key={r.id} className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <button onClick={() => setOpenRow(expanded ? null : r.id)} className="text-left">
                      <span className="font-medium text-gray-800">{r.holderName}</span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{r.holderKind === "USER" ? "Staff" : "Party"}</span>
                    </button>
                    <span className="text-xs text-gray-500">{r.projectId ? projectName.get(r.projectId) ?? `Project #${r.projectId}` : "No project"}</span>
                    <span className="ml-auto rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-700">Holds {r.qty}</span>
                    {canMove && (
                      <>
                        <button onClick={() => setDialog({ kind: "RETURN", row: r })} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700">
                          <CornerDownLeft size={12} /> Return
                        </button>
                        <button onClick={() => setDialog({ kind: "TRANSFER", row: r })} className="flex items-center gap-1 rounded-lg border border-brand-accent px-2.5 py-1 text-xs font-semibold text-brand-accent hover:bg-cyan-50">
                          <ArrowLeftRight size={12} /> Transfer
                        </button>
                      </>
                    )}
                    {(canMove || canUnassign || href) && (
                      <RowMenu align="right" buttonLabel={`Actions for ${r.holderName}`}>
                        {(close) => (
                          <>
                            {href && <RowMenuItem icon={UserCheck} label={r.holderKind === "USER" ? "Open staff profile" : "Open party ledger"} onClick={() => { close(); router.push(href); }} />}
                            {canMove && <RowMenuItem icon={Pencil} label="Edit assignment" onClick={() => { close(); setDialog({ kind: "EDIT_ROW", row: r }); }} />}
                            {canUnassign && <RowMenuItem icon={Trash2} label="Delete (entered by mistake)" tone="danger" onClick={() => { close(); void removeRow(r); }} />}
                          </>
                        )}
                      </RowMenu>
                    )}
                  </div>
                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <Timeline events={mine} projectName={projectName} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Asset timeline</h3>
            {events.length === 0 ? <p className="text-sm text-gray-400">No activity yet.</p> : <Timeline events={events} projectName={projectName} />}
          </div>
        </div>
      </div>

      {dialog?.kind === "EDIT" && <AssetFormDialog existing={asset} types={types} onClose={() => setDialog(null)} onSaved={() => void load()} />}
      {dialog?.kind === "STOCK" && <StockDialog asset={asset} onClose={() => setDialog(null)} onSaved={() => void load()} />}
      {dialog?.kind === "ASSIGN" && (
        <AssignDialog asset={asset} onClose={() => setDialog(null)} onDone={() => void load()} run={(b) => assignAsset(asset.id, b)} />
      )}
      {dialog?.kind === "TRANSFER" && (
        <AssignDialog asset={asset} from={dialog.row} onClose={() => setDialog(null)} onDone={() => void load()} run={(b) => transferAsset(dialog.row.id, b)} />
      )}
      {dialog?.kind === "RETURN" && (
        <ReturnDialog asset={asset} from={dialog.row} onClose={() => setDialog(null)} onDone={() => void load()} run={(b) => returnAsset(dialog.row.id, b)} />
      )}
      {dialog?.kind === "EDIT_ROW" && (
        <EditAssignmentDialog from={dialog.row} onClose={() => setDialog(null)} onDone={() => void load()} run={(b) => editAssignment(dialog.row.id, b)} />
      )}
    </AppShell>
  );
}

function Bucket({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <Icon size={18} className={tone} />
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-xl font-semibold ${tone}`}>{value}</div>
      </div>
    </div>
  );
}

function Timeline({ events, projectName, compact = false }: { events: AssetEvent[]; projectName: Map<number, string>; compact?: boolean }) {
  return (
    <ol className="relative space-y-3 border-l border-dashed border-gray-200 pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${EVENT_TONE[e.kind]}`} />
          <div className="text-[11px] text-gray-400">{formatDateTimeIST(e.happenedAt)}{e.byName && ` · by ${e.byName}`}</div>
          <div className="text-sm text-gray-800">
            <span className="font-medium">{EVENT_LABEL[e.kind]}</span>
            {e.qty > 0 && <span> {e.qty} qty</span>}
            {!compact && e.holderName && <span className="text-gray-600"> · {e.holderName}</span>}
          </div>
          {e.projectId && <div className="text-xs text-gray-500">Project: {projectName.get(e.projectId) ?? `#${e.projectId}`}</div>}
          {e.note && <div className="text-xs text-gray-500">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}
