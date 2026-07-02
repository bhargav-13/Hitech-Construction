"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import type { PaymentDirection } from "@/lib/types";

const MODES = ["Cash", "Bank Transfer", "Cheque", "UPI"];

export function PaymentModal({
  direction,
  onClose,
}: {
  direction: PaymentDirection;
  onClose: () => void;
}) {
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const addPayment = useAppStore((s) => s.addPayment);

  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("0");
  const [mode, setMode] = useState(MODES[0]);
  const [note, setNote] = useState("");

  function save() {
    if (!partyId || !projectId) return;
    addPayment({
      direction,
      partyId,
      projectId,
      date: date || "02-Jul-2026",
      amount: Number(amount) || 0,
      mode,
      note,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">
          {direction === "In" ? "Payment In" : "Payment Out"}
        </h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Party</span>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="input">
              {parties.map((p) => (
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
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Amount (₹)</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="input">
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g. 02-Jul-2026"
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
          </label>
          <button
            onClick={save}
            className={`w-full rounded-lg py-2.5 text-sm font-medium text-white hover:opacity-90 ${
              direction === "In" ? "bg-green-600" : "bg-rose-600"
            }`}
          >
            Save Payment
          </button>
        </div>
      </div>
    </Modal>
  );
}
