"use client";

import { useState } from "react";
import { Contact, Target, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { formatLakh } from "@/lib/format";

type LeadStage = "New" | "Contacted" | "Quotation Sent" | "Negotiation" | "Won" | "Lost";

interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  value: number;
  stage: LeadStage;
  nextFollowUp: string;
}

const STAGES: LeadStage[] = ["New", "Contacted", "Quotation Sent", "Negotiation", "Won", "Lost"];

const STAGE_CLS: Record<LeadStage, string> = {
  New: "bg-gray-100 text-gray-600",
  Contacted: "bg-blue-100 text-blue-700",
  "Quotation Sent": "bg-indigo-100 text-indigo-700",
  Negotiation: "bg-amber-100 text-amber-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-rose-100 text-rose-700",
};

const SEED_LEADS: Lead[] = [
  { id: "lead-1", name: "Prakash Mehta", company: "Gondal Nagarpalika", phone: "98790-12345", value: 4500000, stage: "Quotation Sent", nextFollowUp: "05-Jul-2026" },
  { id: "lead-2", name: "Jayesh Dobariya", company: "Jamnagar Municipal Corp", phone: "98250-67890", value: 12000000, stage: "Negotiation", nextFollowUp: "04-Jul-2026" },
  { id: "lead-3", name: "Hetal Sanghvi", company: "Morbi Ceramics Cluster", phone: "94270-45678", value: 2800000, stage: "New", nextFollowUp: "08-Jul-2026" },
  { id: "lead-4", name: "Bharat Kanani", company: "Surendranagar R&B", phone: "99040-33221", value: 7600000, stage: "Contacted", nextFollowUp: "06-Jul-2026" },
  { id: "lead-5", name: "Dinesh Rathod", company: "Junagadh Agri University", phone: "90999-88776", value: 5200000, stage: "Won", nextFollowUp: "—" },
];

export default function CrmPage() {
  const [leads, setLeads] = useState(SEED_LEADS);
  const [stageFilter, setStageFilter] = useState<"All" | LeadStage>("All");
  const [showAdd, setShowAdd] = useState(false);

  const pipeline = leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const pipelineValue = pipeline.reduce((s, l) => s + l.value, 0);
  const wonValue = leads.filter((l) => l.stage === "Won").reduce((s, l) => s + l.value, 0);

  const visible = stageFilter === "All" ? leads : leads.filter((l) => l.stage === stageFilter);

  function setStage(id: string, stage: LeadStage) {
    setLeads(leads.map((l) => (l.id === id ? { ...l, stage } : l)));
  }

  return (
    <AppShell title="CRM">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={Contact} label="Active Leads" value={String(pipeline.length)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={Target} label="Pipeline Value" value={formatLakh(pipelineValue)} tint="bg-amber-100 text-amber-600" />
        <Kpi icon={TrendingUp} label="Won This Quarter" value={formatLakh(wonValue)} tint="bg-green-100 text-green-600" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(["All", ...STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                stageFilter === s ? "bg-brand-accent text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + New Lead
        </button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Deal Value</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => (
              <tr key={lead.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-4 py-3 font-medium text-gray-800">{lead.name}</td>
                <td className="px-4 py-3 text-gray-600">{lead.company}</td>
                <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                <td className="px-4 py-3 text-gray-700">{formatLakh(lead.value)}</td>
                <td className="px-4 py-3">
                  <select
                    value={lead.stage}
                    onChange={(e) => setStage(lead.id, e.target.value as LeadStage)}
                    className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${STAGE_CLS[lead.stage]}`}
                  >
                    {STAGES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-600">{lead.nextFollowUp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddLeadModal
          onClose={() => setShowAdd(false)}
          onSave={(l) => {
            setLeads([l, ...leads]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, tint }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; tint: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}

function AddLeadModal({ onClose, onSave }: { onClose: () => void; onSave: (l: Lead) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("0");
  const [nextFollowUp, setNextFollowUp] = useState("");

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Lead</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Contact Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Company / Department</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Deal Value (₹)</span>
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Next Follow-up</span>
            <input value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} placeholder="e.g. 08-Jul-2026" className="input" />
          </label>
          <button
            onClick={() =>
              name.trim() &&
              onSave({
                id: `lead-${Date.now()}`,
                name,
                company,
                phone,
                value: Number(value) || 0,
                stage: "New",
                nextFollowUp: nextFollowUp || "—",
              })
            }
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Lead
          </button>
        </div>
      </div>
    </Modal>
  );
}
