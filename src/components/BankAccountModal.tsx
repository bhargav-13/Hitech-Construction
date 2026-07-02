"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";

export function BankAccountModal({ onClose }: { onClose: () => void }) {
  const addBankAccount = useAppStore((s) => s.addBankAccount);
  const [name, setName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [acHolder, setAcHolder] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");

  function save() {
    if (!name.trim()) return;
    addBankAccount({
      name,
      type: "Bank",
      accountNo,
      acHolder,
      ifsc,
      upi,
      openingBalance: Number(openingBalance) || 0,
      balance: Number(openingBalance) || 0,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Bank Account</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Bank Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Account Number</span>
              <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Account Holder</span>
              <input value={acHolder} onChange={(e) => setAcHolder(e.target.value)} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">IFSC Code</span>
              <input value={ifsc} onChange={(e) => setIfsc(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">UPI</span>
              <input value={upi} onChange={(e) => setUpi(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Opening Balance (₹)</span>
            <input
              type="number"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="input"
            />
          </label>
          <button
            onClick={save}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Account
          </button>
        </div>
      </div>
    </Modal>
  );
}
