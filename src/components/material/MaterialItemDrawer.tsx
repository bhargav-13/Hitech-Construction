"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import type { ApiMovement } from "@/lib/warehouseApi";
import type { MaterialEntryKind } from "@/components/material/MaterialEntryDrawer";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
};

export interface MaterialItemSummary {
  itemId: number;
  name: string;
  unit: string;
  estimated: number;
  stock: number;
}

/**
 * One material on a site, as Onsite opens it when you click a row: what is left on site, the
 * estimate against everything that came in and went out, and every entry for it — All / Stock In /
 * Stock Out. Click an entry for its details (GRN no., PO, party, who entered it). Received, Issued,
 * Used and Request at the bottom start an entry already set to this material.
 */
export function MaterialItemDrawer({
  item,
  movements,
  typeOf,
  canMove,
  canRequest,
  onEntry,
  onSetEstimate,
  onClose,
}: {
  item: MaterialItemSummary;
  /** Every movement of this site's store — filtered to this material here. */
  movements: ApiMovement[];
  /** The page's own reading of a movement: Onsite label and which way it moves stock. */
  typeOf: (m: ApiMovement) => { label: string; sign: 1 | -1; tone: string };
  canMove: boolean;
  canRequest: boolean;
  onEntry: (kind: MaterialEntryKind) => void;
  onSetEstimate: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [openId, setOpenId] = useState<number | null>(null);

  const entries = useMemo(
    () =>
      movements
        .filter((m) => m.itemId === item.itemId)
        .map((m) => {
          const t = typeOf(m);
          return { m, t, signed: t.sign * m.quantity };
        })
        .sort((a, b) => b.m.movedOn.localeCompare(a.m.movedOn) || b.m.id - a.m.id),
    [movements, item.itemId, typeOf],
  );
  const stockIn = entries.reduce((s, e) => s + (e.signed > 0 ? e.signed : 0), 0);
  const stockOut = entries.reduce((s, e) => s + (e.signed < 0 ? -e.signed : 0), 0);
  const shown = entries.filter((e) => tab === "ALL" || (tab === "IN" ? e.signed > 0 : e.signed < 0));

  const actions: { kind: MaterialEntryKind; label: string; cls: string; show: boolean }[] = [
    { kind: "RECEIVED", label: "Received", cls: "bg-emerald-600 hover:bg-emerald-700", show: canMove },
    { kind: "SUBCON_ISSUE", label: "Issued", cls: "bg-violet-600 hover:bg-violet-700", show: canMove },
    { kind: "USED", label: "Used", cls: "bg-rose-600 hover:bg-rose-700", show: canMove },
    { kind: "REQUEST", label: "Request", cls: "bg-slate-800 hover:bg-slate-900", show: canRequest },
  ];
  const visibleActions = actions.filter((a) => a.show);

  return (
    <Drawer
      title={item.name}
      onClose={onClose}
      width="max-w-2xl"
      guardOnClose={false}
      footer={
        visibleActions.length > 0 ? (
          <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${visibleActions.length}, minmax(0, 1fr))` }}>
            {visibleActions.map((a) => (
              <button
                key={a.kind}
                onClick={() => onEntry(a.kind)}
                disabled={a.kind === "USED" && item.stock <= 0}
                title={a.kind === "USED" && item.stock <= 0 ? "Nothing in stock to use" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white transition disabled:opacity-40 ${a.cls}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="relative text-center">
          {canMove && (
            <div className="absolute top-0 right-0">
              <RowMenu>
                {(close) => (
                  <RowMenuItem
                    label={item.estimated > 0 ? "Change estimated quantity" : "Add estimated quantity"}
                    onClick={() => {
                      close();
                      onSetEstimate();
                    }}
                  />
                )}
              </RowMenu>
            </div>
          )}
          <div className="text-sm text-gray-500">Remaining on site</div>
          <div className={`text-3xl font-bold tabular-nums ${item.stock <= 0 ? "text-rose-600" : "text-gray-900"}`}>
            {fmt(item.stock)} <span className="text-lg font-semibold text-gray-500">{item.unit}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-200 rounded-xl border border-gray-200 bg-white py-3 text-center">
          <div>
            <div className="text-xs text-gray-500">Estimated quantity</div>
            <div className="mt-0.5 font-semibold text-slate-800 tabular-nums">{fmt(item.estimated)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Stock in</div>
            <div className="mt-0.5 font-semibold text-emerald-600 tabular-nums">{fmt(stockIn)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Stock out</div>
            <div className="mt-0.5 font-semibold text-rose-600 tabular-nums">{fmt(stockOut)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["ALL", "All entries"],
              ["IN", "Stock in"],
              ["OUT", "Stock out"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${
                tab === k ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between border-b border-gray-200 pb-2 text-xs font-semibold text-gray-600">
            <span>Material details</span>
            <span>Quantity ({item.unit || "units"})</span>
          </div>
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No entries{tab !== "ALL" ? " here" : " for this material yet"}.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {shown.map(({ m, t, signed }) => {
                const open = openId === m.id;
                const who = m.partyName ?? m.counterWarehouseCode ?? m.issuedToName ?? null;
                return (
                  <div key={m.id}>
                    <button onClick={() => setOpenId(open ? null : m.id)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-gray-50/60">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-gray-500">
                          {dayLabel(m.movedOn)}, <span className={t.tone}>{t.label}</span>
                        </span>
                        <span className="block truncate text-sm font-medium text-gray-800">{who ?? m.note ?? m.number}</span>
                      </span>
                      <span className={`text-sm font-semibold whitespace-nowrap tabular-nums ${signed >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {signed >= 0 ? "+" : "−"} {fmt(Math.abs(signed))} {item.unit}
                      </span>
                      {open ? <ChevronUp size={15} className="mt-0.5 text-gray-400" /> : <ChevronDown size={15} className="mt-0.5 text-gray-400" />}
                    </button>
                    {open && (
                      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 px-3 py-2.5 text-xs">
                        <Field label="Entry no." value={m.number} />
                        <Field label="Date" value={dayLabel(m.movedOn)} />
                        <Field label="Type" value={t.label} />
                        <Field label={m.kind === "RECEIPT" ? "Vendor" : "Party / store"} value={who} />
                        <Field label="PO / challan no." value={m.sourceDocNo} />
                        <Field label="Rate" value={m.rate ? `${inr(m.rate)} / ${item.unit || "unit"}` : null} />
                        <Field label="Amount" value={m.rate ? inr(m.rate * m.quantity) : null} />
                        <Field label="Entered by" value={m.byUserName} />
                        {m.note && (
                          <div className="col-span-2">
                            <dt className="text-gray-500">Note</dt>
                            <dd className="text-gray-800">{m.note}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value || "—"}</dd>
    </div>
  );
}
