"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { formatRupee } from "@/lib/projectHelpers";

const TABS = ["RFQ", "Purchase Order"] as const;
type Tab = (typeof TABS)[number];

type PoStatus = "Open" | "Closed";
type Approval = "Approved" | "Pending" | "Rejected";

interface PO {
  id: string;
  poNumber: string;
  date: string;
  vendor: string;
  deliverySite: string;
  poStatus: PoStatus;
  approval: Approval;
  amount: number;
}

const SEED_POS: PO[] = [
  { id: "po1", poNumber: "#PO/SB/-1", date: "13 Jun 2026", vendor: "Sethi Brothers", deliverySite: "Sewerage Network Zone 8 & 9 at Ujjain", poStatus: "Closed", approval: "Approved", amount: 22608 },
  { id: "po2", poNumber: "#PO/NEW/-1", date: "12 Jun 2026", vendor: "National Engineering Works", deliverySite: "Sewerage Network Zone 8 & 9 at Ujjain", poStatus: "Closed", approval: "Approved", amount: 84000 },
  { id: "po3", poNumber: "#PO/SC/-1", date: "12 Jun 2026", vendor: "Sadguru CCTV", deliverySite: "Sewerage Network Zone 8 & 9 at Ujjain", poStatus: "Closed", approval: "Approved", amount: 10600 },
  { id: "po4", poNumber: "#PO/NCP/-1", date: "8 Jun 2026", vendor: "Nakoda Cement Products", deliverySite: "Sewerage Network Zone 8 & 9 at Ujjain", poStatus: "Closed", approval: "Approved", amount: 944000 },
  { id: "po5", poNumber: "#PO-11", date: "29 May 2026", vendor: "Signet Industries Ltd", deliverySite: "Sewerage Network Zone 8 & 9 at Ujjain", poStatus: "Open", approval: "Pending", amount: 1211624 },
];

const RFQS = [
  { no: "RFQ-08", date: "20 Jun 2026", title: "TMT Steel Supply", vendors: "3 vendors", status: "Responses Received" },
  { no: "RFQ-07", date: "15 Jun 2026", title: "Cement OPC 53", vendors: "4 vendors", status: "Sent" },
  { no: "RFQ-06", date: "10 Jun 2026", title: "SFRC Pipes", vendors: "2 vendors", status: "Closed" },
];

const STATUS_CLS: Record<PoStatus, string> = { Open: "bg-blue-100 text-blue-700", Closed: "bg-gray-100 text-gray-600" };
const APPROVAL_CLS: Record<Approval, string> = {
  Approved: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  Rejected: "bg-rose-100 text-rose-700",
};

export default function ProcurementPage() {
  const [tab, setTab] = useState<Tab>("Purchase Order");
  const [pos] = useState(SEED_POS);

  return (
    <AppShell title="Procurement">
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Purchase Order" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {["Vendor", "Delivery Site", "Approval Status", "PO Status"].map((f) => (
                <button key={f} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                  {f}
                  <ChevronDown size={13} />
                </button>
              ))}
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <Search size={15} className="text-gray-400" />
                <input placeholder="Search By PO Number" className="w-40 text-sm outline-none" readOnly />
              </div>
            </div>
            <button className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">+ Create PO</button>
          </div>

          <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Vendor Name</th>
                  <th className="px-4 py-3">Delivery Site</th>
                  <th className="px-4 py-3">PO Status</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={po.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-teal-600">{po.poNumber}</div>
                      <div className="text-xs text-gray-400">{po.date}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{po.vendor}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-gray-600">{po.deliverySite}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_CLS[po.poStatus]}`}>{po.poStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${APPROVAL_CLS[po.approval]}`}>{po.approval}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatRupee(po.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "RFQ" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">+ New RFQ</button>
          </div>
          <SimpleTable
            columns={[
              { key: "no", label: "RFQ #" },
              { key: "date", label: "Date" },
              { key: "title", label: "Title" },
              { key: "vendors", label: "Vendors" },
              { key: "status", label: "Status" },
            ]}
            rows={RFQS}
          />
        </div>
      )}
    </AppShell>
  );
}
