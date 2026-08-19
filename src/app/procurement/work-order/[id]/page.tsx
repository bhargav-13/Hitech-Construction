"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Plus, Receipt, Trash2, TriangleAlert, X } from "lucide-react";
import { ProcurementShell } from "@/components/procurement/ProcurementShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useWorkOrder } from "@/lib/useWorkOrders";
import { useProjects } from "@/lib/useProjects";
import { WORK_ORDER_STATUS_CLS } from "@/lib/procurementConfig";
import { gstCodeForPercent } from "@/lib/gstRates";
import { stashPoDraft, vyaparUnit } from "@/lib/poHandoff";
import * as wo from "@/lib/workOrderApi";
import { inr } from "@/lib/format";

/**
 * One subcontract: what was ordered, what has been billed, and what material he is holding.
 *
 * The header answers the only three questions anyone opens this screen with — what is it worth, how
 * much of the work is done, how much have we already paid out — and the tabs below hold the detail
 * behind each. Progress is edited on the line, not the order, because that is where it is known:
 * the foreman knows the laying is 90% done, nobody knows what "the order" is.
 */
export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { workOrder, setWorkOrder, loading, error, setError } = useWorkOrder(Number(id));
  const { projects } = useProjects();

  const [tab, setTab] = useState<"items" | "bills" | "materials">("items");
  const [billing, setBilling] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);

  const project = useMemo(
    () => projects.find((p) => workOrder?.projectId != null && p.id === String(workOrder.projectId)),
    [projects, workOrder],
  );

  async function run(fn: () => Promise<wo.WorkOrder>) {
    setBusy(true);
    setError("");
    try {
      setWorkOrder(await fn());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Hand a running bill to Vyapar's purchase form, filled in.
   *
   * Retention and material recovery go across as a discount, so what Vyapar books is what he is
   * actually paid — the two deductions are the whole reason the gross figure is not the payment.
   */
  function bookInVyapar(bill: wo.SubconBill) {
    if (!workOrder) return;
    const deductions = bill.retention + bill.materialRecovery;
    stashPoDraft({
      rfqId: workOrder.id,
      rfqNo: workOrder.woNo,
      partyId: workOrder.vendorPartyId,
      partyName: workOrder.vendorName,
      projectId: workOrder.projectId,
      orderDate: bill.billDate,
      deliveryDate: null,
      terms: workOrder.terms,
      notes: [
        `Against ${workOrder.woNo} — ${workOrder.title}.`,
        bill.billNo ? `Contractor bill ${bill.billNo}.` : null,
        bill.retention ? `Retention held ${inr(bill.retention)}.` : null,
        bill.materialRecovery ? `Material recovered ${inr(bill.materialRecovery)}.` : null,
        bill.note,
      ]
        .filter(Boolean)
        .join("\n"),
      discountAmount: deductions,
      lines: [
        {
          itemId: null,
          itemName: `Work done — ${workOrder.title}`,
          description: `${workOrder.woNo}${bill.billNo ? ` · bill ${bill.billNo}` : ""}`,
          unit: vyaparUnit(null),
          quantity: 1,
          rate: bill.amount,
          taxCode: gstCodeForPercent(workOrder.taxPercent),
        },
      ],
    });
    router.push("/vyapar/purchase?new=1&from=wo");
  }

  if (loading) {
    return (
      <ProcurementShell>
        <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading work order…
        </div>
      </ProcurementShell>
    );
  }

  if (!workOrder) {
    return (
      <ProcurementShell>
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">{error || "That work order no longer exists."}</p>
          <Link href="/procurement/work-order" className="mt-3 inline-block text-sm font-medium text-brand-accent">
            Back to work orders
          </Link>
        </div>
      </ProcurementShell>
    );
  }

  const w = workOrder;
  const overBilled = w.billedValue > w.orderValue && w.orderValue > 0;

  return (
    <ProcurementShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/procurement/work-order"
              className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 transition-colors duration-150 hover:text-brand-accent"
            >
              <ArrowLeft size={12} /> Work Orders
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{w.woNo}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                  WORK_ORDER_STATUS_CLS[w.status] ?? WORK_ORDER_STATUS_CLS.Draft
                }`}
              >
                {w.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{w.title}</p>
            <p className="text-xs text-gray-400">
              {w.vendorName}
              {w.vendorPhone && ` · ${w.vendorPhone}`}
              {project && ` · ${project.name}`}
              {w.woDate && ` · raised ${w.woDate}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={w.status}
              onChange={(v) =>
                run(() =>
                  wo.updateWorkOrder(w.id, {
                    title: w.title,
                    woNo: w.woNo,
                    projectId: w.projectId,
                    vendorPartyId: w.vendorPartyId,
                    status: v as wo.WorkOrderStatus,
                    woDate: w.woDate,
                    startDate: w.startDate,
                    endDate: w.endDate,
                    taxPercent: w.taxPercent,
                    discount: w.discount,
                    charges: w.charges,
                    bankAccountName: w.bankAccountName,
                    bankAccountNumber: w.bankAccountNumber,
                    bankIfsc: w.bankIfsc,
                    terms: w.terms,
                    notes: w.notes,
                    items: w.items.map((i) => ({
                      id: i.id,
                      itemId: i.itemId,
                      itemName: i.itemName,
                      description: i.description,
                      unit: i.unit,
                      dimN: i.dimN,
                      dimL: i.dimL,
                      dimW: i.dimW,
                      dimH: i.dimH,
                      quantity: i.quantity,
                      rate: i.rate,
                      progressPercent: i.progressPercent,
                    })),
                  }),
                )
              }
              size="sm"
              className="w-36"
              options={wo.WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            <Link
              href={`/procurement/work-order/build?id=${w.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
            >
              <Pencil size={14} /> Edit
            </Link>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

        {/* ---- The three questions ---- */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Order value" value={inr(w.orderValue)} sub={`${w.items.length} items`} tone="brand" />
          <Figure
            label="Work done"
            value={`${w.physicalProgress.toFixed(0)}%`}
            sub={inr(w.workDoneValue)}
            bar={w.physicalProgress}
            tone="sky"
          />
          <Figure
            label="Billed"
            value={inr(w.billedValue)}
            sub={overBilled ? `${inr(-w.outstanding)} over the order` : `${inr(w.outstanding)} still to bill`}
            bar={w.orderValue > 0 ? (w.billedValue / w.orderValue) * 100 : 0}
            tone={overBilled ? "rose" : "emerald"}
          />
          <Figure
            label="Held back"
            value={inr(w.retentionHeld)}
            sub={w.materialIssuedValue > 0 ? `${inr(w.materialIssuedValue)} material issued` : "No material issued"}
            tone="amber"
          />
        </div>

        {overBilled && (
          <p className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <TriangleAlert size={14} className="shrink-0" />
            He has billed {inr(-w.outstanding)} more than this order is worth. Raise a revision before paying.
          </p>
        )}

        {/* ---- Tabs ---- */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex gap-1 border-b border-gray-100 px-4 pt-3">
            {(
              [
                ["items", `Items (${w.items.length})`],
                ["bills", `Bills (${w.bills.length})`],
                ["materials", `Materials (${w.materialSummary.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors duration-150 ${
                  tab === key
                    ? "border-brand-accent text-brand-accent"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "items" && <ItemsTab w={w} busy={busy} onProgress={(itemId, pct) => run(() => wo.setItemProgress(w.id, itemId, pct))} />}

          {tab === "bills" && (
            <BillsTab
              w={w}
              busy={busy}
              onAdd={() => setBilling(true)}
              onDelete={(billId) => run(() => wo.deleteSubconBill(w.id, billId))}
              onBook={bookInVyapar}
            />
          )}

          {tab === "materials" && (
            <MaterialsTab
              w={w}
              busy={busy}
              onAdd={() => setIssuing(true)}
              onDelete={(mId) => run(() => wo.deleteSubconMaterial(w.id, mId))}
            />
          )}
        </div>

        {/* ---- Order footer: bank, terms, totals ---- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">Payment details</h2>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <Pair label="Account holder" value={w.bankAccountName} />
              <Pair label="Account number" value={w.bankAccountNumber} mono />
              <Pair label="IFSC" value={w.bankIfsc} mono />
            </dl>
            {(w.terms || w.notes) && (
              <div className="mt-3 grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
                {w.terms && (
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Terms</p>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-600">{w.terms}</p>
                  </div>
                )}
                {w.notes && (
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Notes</p>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-600">{w.notes}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">Order value</h2>
            <dl className="space-y-1.5 text-sm">
              <Pair label="Item sub total" value={inr(w.itemSubTotal)} inline />
              {!!w.discount && <Pair label="Discount" value={`− ${inr(w.discount)}`} inline />}
              {!!w.charges && <Pair label="Additional charges" value={`+ ${inr(w.charges)}`} inline />}
              <Pair label={`GST ${w.taxPercent}%`} value={inr(w.taxAmount)} inline />
              <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-semibold text-gray-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{inr(w.orderValue)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {billing && (
        <BillDialog
          w={w}
          onClose={() => setBilling(false)}
          onSave={async (body) => {
            await run(() => wo.saveSubconBill(w.id, body));
            setBilling(false);
          }}
        />
      )}

      {issuing && (
        <IssueDialog
          onClose={() => setIssuing(false)}
          onSave={async (body) => {
            await run(() => wo.saveSubconMaterial(w.id, body));
            setIssuing(false);
          }}
        />
      )}
    </ProcurementShell>
  );
}

// ------------------------------------------------------------------ items

function ItemsTab({
  w,
  busy,
  onProgress,
}: {
  w: wo.WorkOrder;
  busy: boolean;
  onProgress: (itemId: number, pct: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th className="w-10 px-3 py-2">#</th>
            <th className="px-3 py-2">Item of work</th>
            <th className="px-3 py-2">N × L × W × H</th>
            <th className="px-3 py-2 text-right">Quantity</th>
            <th className="px-3 py-2 text-right">Rate</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="min-w-[180px] px-3 py-2">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {w.items.map((i, idx) => {
            const dims = [i.dimN, i.dimL, i.dimW, i.dimH];
            const measured = dims.some((d) => d != null && d > 0);
            return (
              <tr key={i.id} className="align-top">
                <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-800">{i.itemName}</div>
                  {i.description && <div className="text-xs text-gray-500">{i.description}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">
                  {measured ? dims.map((d) => (d != null && d > 0 ? d : "–")).join(" × ") : "—"}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700 tabular-nums">
                  {i.quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {i.unit}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{inr(i.rate)}</td>
                <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-gray-800 tabular-nums">
                  {inr(i.amount)}
                </td>
                <td className="px-3 py-2.5">
                  {/* Progress is recorded on the line because that is where it is actually known. */}
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={i.progressPercent}
                      disabled={busy}
                      onMouseUp={(e) => onProgress(i.id, Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => onProgress(i.id, Number((e.target as HTMLInputElement).value))}
                      className="h-1 w-24 accent-sky-600"
                    />
                    <span className="w-10 text-right text-xs text-gray-600 tabular-nums">
                      {i.progressPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400 tabular-nums">
                    {inr((i.amount * i.progressPercent) / 100)} earned
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ bills

function BillsTab({
  w,
  busy,
  onAdd,
  onDelete,
  onBook,
}: {
  w: wo.WorkOrder;
  busy: boolean;
  onAdd: () => void;
  onDelete: (billId: number) => void;
  onBook: (bill: wo.SubconBill) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-gray-500">
          Running bills against this order. {inr(w.billedValue)} of {inr(w.orderValue)} billed.
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
        >
          <Plus size={13} /> Subcon Bill
        </button>
      </div>
      {w.bills.length === 0 ? (
        <p className="px-4 pb-8 text-center text-sm text-gray-400">
          Nothing billed yet. Record his running bill here, then book it in Vyapar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2">Bill</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Retention</th>
                <th className="px-3 py-2 text-right">Material recovery</th>
                <th className="px-3 py-2 text-right">Net payable</th>
                <th className="px-3 py-2">In Vyapar</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {w.bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2.5 text-gray-800">{b.billNo || "—"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{b.billDate}</td>
                  <td className="px-3 py-2.5 text-right text-gray-800 tabular-nums">{inr(b.amount)}</td>
                  <td className="px-3 py-2.5 text-right text-amber-700 tabular-nums">
                    {b.retention ? `− ${inr(b.retention)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-amber-700 tabular-nums">
                    {b.materialRecovery ? `− ${inr(b.materialRecovery)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-800 tabular-nums">
                    {inr(b.netPayable)}
                  </td>
                  <td className="px-3 py-2.5">
                    {b.vyaparInvoiceId ? (
                      <Link
                        href={`/vyapar/purchase?open=${b.vyaparInvoiceId}`}
                        className="text-xs font-medium text-brand-accent"
                      >
                        Booked
                      </Link>
                    ) : (
                      <button
                        onClick={() => onBook(b)}
                        title="Open a Vyapar purchase bill, filled in from this"
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
                      >
                        <Receipt size={11} /> Book <ArrowRight size={11} />
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => onDelete(b.id)}
                      disabled={busy}
                      aria-label="Remove bill"
                      className="rounded p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- materials

function MaterialsTab({
  w,
  busy,
  onAdd,
  onDelete,
}: {
  w: wo.WorkOrder;
  busy: boolean;
  onAdd: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-gray-500">
          Material issued to him from our store. {inr(w.materialIssuedValue)} issued, recovered on his bills.
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
        >
          <Plus size={13} /> Subcon Issue
        </button>
      </div>

      {w.materialSummary.length === 0 ? (
        <p className="px-4 pb-8 text-center text-sm text-gray-400">
          Nothing issued. Record cement, steel or shuttering given to him here so it can be recovered.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border-b border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Total issued</th>
                  <th className="px-3 py-2 text-right">Returned</th>
                  <th className="px-3 py-2 text-right">Consumed</th>
                  <th className="px-3 py-2 text-right">In hand</th>
                  <th className="px-3 py-2 text-right">Issued value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {w.materialSummary.map((m) => (
                  <tr key={m.itemName}>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{m.itemName}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">
                      {m.totalIssued} {m.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{m.returned || "—"}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{m.consumed || "—"}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        m.inHand > 0 ? "text-amber-800" : "text-gray-500"
                      }`}
                    >
                      {m.inHand} {m.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{inr(m.issuedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The movements behind the roll-up — the rows an argument about recovery gets settled on. */}
          <div className="px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Movements</p>
            <div className="space-y-1">
              {w.materials.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      m.movement === "ISSUE"
                        ? "bg-sky-100 text-sky-800"
                        : m.movement === "RETURN"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {m.movement}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-700">{m.itemName}</span>
                  <span className="text-gray-600 tabular-nums">
                    {m.quantity} {m.unit}
                  </span>
                  {!!m.rate && <span className="text-gray-500 tabular-nums">@ {inr(m.rate)}</span>}
                  <span className="text-gray-400">{m.movedOn}</span>
                  <button
                    onClick={() => onDelete(m.id)}
                    disabled={busy}
                    aria-label="Remove movement"
                    className="rounded p-0.5 text-gray-300 transition-colors duration-150 hover:text-rose-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- dialogs

function BillDialog({
  w,
  onClose,
  onSave,
}: {
  w: wo.WorkOrder;
  onClose: () => void;
  onSave: (body: wo.SubconBillInput) => void;
}) {
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [retention, setRetention] = useState("");
  const [recovery, setRecovery] = useState("");
  const [note, setNote] = useState("");

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
  const net = n(amount) - n(retention) - n(recovery);
  // What is left on the order before this bill — the figure that says whether it is reasonable.
  const wouldExceed = w.billedValue + n(amount) > w.orderValue && w.orderValue > 0;

  return (
    <Dialog title="Record subcon bill" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contractor bill no.">
          <input value={billNo} onChange={(e) => setBillNo(e.target.value)} className="input" />
        </Field>
        <Field label="Bill date">
          <DatePicker value={billDate} onChange={setBillDate} />
        </Field>
        <Field label="Bill amount" required>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" autoFocus />
        </Field>
        <Field label="Retention held">
          <input value={retention} onChange={(e) => setRetention(e.target.value)} inputMode="decimal" className="input" />
        </Field>
        <Field label="Material recovery">
          <input value={recovery} onChange={(e) => setRecovery(e.target.value)} inputMode="decimal" className="input" />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        </Field>
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Net payable</span>
          <span className="font-semibold text-gray-900 tabular-nums">{inr(net)}</span>
        </div>
        <div className="mt-0.5 flex justify-between text-xs">
          <span className="text-gray-500">Billed after this</span>
          <span className={`tabular-nums ${wouldExceed ? "font-medium text-rose-700" : "text-gray-500"}`}>
            {inr(w.billedValue + n(amount))} of {inr(w.orderValue)}
          </span>
        </div>
      </div>
      {wouldExceed && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert size={12} className="shrink-0" /> This takes him past the order value. It will still save —
          the order may simply need a revision.
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              billNo: billNo.trim() || null,
              billDate,
              amount: n(amount),
              retention: n(retention),
              materialRecovery: n(recovery),
              note: note.trim() || null,
            })
          }
          disabled={n(amount) <= 0}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
        >
          Save bill
        </button>
      </div>
    </Dialog>
  );
}

function IssueDialog({ onClose, onSave }: { onClose: () => void; onSave: (body: wo.SubconMaterialInput) => void }) {
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("Nos");
  const [movement, setMovement] = useState<wo.MaterialMovement>("ISSUE");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [movedOn, setMovedOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);

  return (
    <Dialog title="Material to subcontractor" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Material" required>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Cement OPC 53"
            className="input"
            autoFocus
          />
        </Field>
        <Field label="Movement">
          <Select
            value={movement}
            onChange={(v) => setMovement(v as wo.MaterialMovement)}
            options={[
              { value: "ISSUE", label: "Issued to him" },
              { value: "RETURN", label: "Returned to us" },
              { value: "CONSUMED", label: "Consumed on the work" },
            ]}
          />
        </Field>
        <Field label="Quantity" required>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className="input" />
        </Field>
        <Field label="Unit">
          <Select
            value={unit}
            onChange={setUnit}
            options={["Nos", "Bag", "Kg", "MT", "Rmt", "Sqm", "Cum", "Litre"].map((u) => ({ value: u, label: u }))}
          />
        </Field>
        <Field label="Recovery rate">
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="0 = free issue"
            className="input"
          />
        </Field>
        <Field label="Date">
          <DatePicker value={movedOn} onChange={setMovedOn} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              itemName: itemName.trim(),
              unit,
              movement,
              quantity: n(quantity),
              rate: n(rate),
              movedOn,
              note: note.trim() || null,
            })
          }
          disabled={!itemName.trim() || n(quantity) <= 0}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
        >
          Record
        </button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ pieces

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Figure({
  label,
  value,
  sub,
  bar,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  bar?: number;
  tone: "brand" | "sky" | "emerald" | "rose" | "amber";
}) {
  const box =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/50"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50/50"
          : tone === "sky"
            ? "border-sky-200 bg-sky-50/50"
            : "border-gray-200 bg-white";
  const fill =
    tone === "emerald" ? "bg-emerald-500" : tone === "rose" ? "bg-rose-500" : tone === "sky" ? "bg-sky-500" : "bg-gray-400";
  return (
    <div className={`rounded-xl border p-3 ${box}`}>
      <div className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
      {bar != null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/80">
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

function Pair({
  label,
  value,
  mono,
  inline,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "flex justify-between" : ""}>
      <dt className={inline ? "text-gray-500" : "text-[11px] font-medium tracking-wide text-gray-400 uppercase"}>
        {label}
      </dt>
      <dd className={`text-gray-800 ${mono ? "font-mono" : ""} ${inline ? "tabular-nums" : "text-sm"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}
