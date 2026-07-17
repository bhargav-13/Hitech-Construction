"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import { TXN_TYPE_META, type TxnType } from "@/lib/types";
import { formatRupee } from "@/lib/projectHelpers";

export function TransactionFormModal({
  type,
  fixedProjectId,
  onClose,
}: {
  type: TxnType;
  fixedProjectId?: string;
  onClose: () => void;
}) {
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const addTransaction = useAppStore((s) => s.addTransaction);

  const meta = TXN_TYPE_META[type];
  const partyOptions = useMemo(() => {
    if (meta.category === "Sales" || type === "Payment In" || type === "Debit Note") {
      return parties.filter((p) => p.type === "Client");
    }
    if (meta.category === "Expense" || type === "Payment Out" || type === "Credit Note") {
      return parties.filter((p) => p.type !== "Client");
    }
    return parties;
  }, [parties, meta.category, type]);

  const [partyId, setPartyId] = useState(partyOptions[0]?.id ?? "");
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [date, setDate] = useState("02-Jul-2026");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [markPaid, setMarkPaid] = useState(meta.category === "Payment");

  const canSave = partyId && projectId && Number(amount) > 0;

  function save() {
    if (!canSave) return;
    addTransaction({
      type,
      date: date || "02-Jul-2026",
      partyId,
      projectId,
      amount: Number(amount),
      description: description || type,
      paid: markPaid,
    });
    onClose();
  }

  const flowLabel =
    meta.flow === "in" ? "Money In" : meta.flow === "out" ? "Money Out" : "Transfer";
  const flowColor =
    meta.flow === "in" ? "text-green-600" : meta.flow === "out" ? "text-rose-600" : "text-cyan-600";

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">{type}</h2>
          <span className={`text-xs font-medium ${flowColor}`}>{flowLabel}</span>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Party</span>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="input">
              {partyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.type}
                </option>
              ))}
            </select>
          </label>
          {!fixedProjectId && (
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
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Amount (₹)</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
              <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Description / Note</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder={type}
            />
          </label>

          {meta.category !== "Payment" && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={markPaid}
                onChange={(e) => setMarkPaid(e.target.checked)}
                className="h-4 w-4 accent-cyan-600"
              />
              Mark as settled now (records the money movement immediately)
            </label>
          )}

          {Number(amount) > 0 && (
            <div className={`rounded-lg bg-gray-50 px-4 py-3 text-sm`}>
              <span className="text-gray-500">This will record </span>
              <span className={`font-semibold ${flowColor}`}>{formatRupee(Number(amount))}</span>
              <span className="text-gray-500"> as {flowLabel.toLowerCase()}.</span>
            </div>
          )}

          <button
            onClick={save}
            disabled={!canSave}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Save {type}
          </button>
        </div>
      </div>
    </Modal>
  );
}
