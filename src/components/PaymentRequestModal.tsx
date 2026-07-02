"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";

const AGAINST = ["Against Labour", "Against Subcon WO", "Against Petty Cash", "Against Material", "Against Other"];

export function PaymentRequestModal({ onClose }: { onClose: () => void }) {
  const parties = useAppStore((s) => s.parties);
  const projects = useAppStore((s) => s.projects);
  const addPaymentRequest = useAppStore((s) => s.addPaymentRequest);

  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [against, setAgainst] = useState(AGAINST[0]);
  const [date, setDate] = useState("02-Jul-2026");

  function save() {
    if (!partyId || !projectId || Number(amount) <= 0) return;
    addPaymentRequest({ partyId, projectId, amount: Number(amount), against, date });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Payment Request</h2>
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
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="0" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Against</span>
              <select value={against} onChange={(e) => setAgainst(e.target.value)} className="input">
                {AGAINST.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
            <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </label>
          <button
            onClick={save}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Raise Request
          </button>
        </div>
      </div>
    </Modal>
  );
}
