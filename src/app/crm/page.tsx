"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { SimpleTable } from "@/components/SimpleTable";
import { formatLakh } from "@/lib/format";

const TABS = ["Leads", "Quotation"] as const;
type Tab = (typeof TABS)[number];

const LEAD_STATUSES = [
  "New",
  "Under Research",
  "Technical Evaluation",
  "Quotation Sent",
  "Negotiation",
  "Won",
  "Lost",
];
const LEAD_TYPES = ["Department", "Private", "PSU", "Contractor", "Individual"];
const SOURCES = ["MPTenders", "GeM Portal", "State Tender Portal", "Reference", "Website", "Cold Call"];
const CATEGORIES = ["Roads & Buildings", "Water Supply", "Sewerage", "Fire System", "Electrical", "Irrigation"];
const PRIORITIES = ["High", "Medium", "Low"];
const ASSIGNEES = ["Rakesh Shah", "Priya Mehta", "Bhargav", "Field Sales Team"];

interface Lead {
  id: string;
  leadType: string;
  contactName: string;
  contactNumber: string;
  email: string;
  company: string;
  address: string;
  lastUpdated: string;
  status: string;
  source: string;
  category: string;
  priority: string;
  assignee: string;
  lastContacted: string;
  followUp: string;
  expectedClosure: string;
  budget: string;
  description: string;
}

const SEED_LEADS: Lead[] = [
  { id: "l1", leadType: "Department", contactName: "Commissioner, Municipal Corporation, Ujjain", contactNumber: "7342535244", email: "commissioner@mcujjain.gov.in", company: "Municipal Corporation Ujjain", address: "Ujjain, MP", lastUpdated: "29 June 2026", status: "Under Research", source: "MPTenders", category: "Sewerage", priority: "High", assignee: "Rakesh Shah", lastContacted: "25 Jun 2026", followUp: "05 Jul 2026", expectedClosure: "31 Aug 2026", budget: "4500000", description: "Sewerage network zone tender" },
  { id: "l2", leadType: "Department", contactName: "Executive Engineer, R&B Division", contactNumber: "9879012345", email: "ee.rb@gujarat.gov.in", company: "R&B Division", address: "Rajkot, Gujarat", lastUpdated: "28 June 2026", status: "Technical Evaluation", source: "State Tender Portal", category: "Roads & Buildings", priority: "High", assignee: "Priya Mehta", lastContacted: "24 Jun 2026", followUp: "04 Jul 2026", expectedClosure: "15 Sep 2026", budget: "12000000", description: "CC road works, technical bid submitted" },
  { id: "l3", leadType: "Private", contactName: "Morbi Ceramics Cluster", contactNumber: "9427045678", email: "info@morbicluster.in", company: "Morbi Ceramics", address: "Morbi, Gujarat", lastUpdated: "27 June 2026", status: "New", source: "Website", category: "Electrical", priority: "Medium", assignee: "Field Sales Team", lastContacted: "", followUp: "08 Jul 2026", expectedClosure: "", budget: "2800000", description: "" },
];

const QUOTATIONS = [
  { no: "QT-6", date: "11 Jun 2026", subject: "Labour supply NCC", client: "GSK Infra", amount: 450000, status: "Sent" },
  { no: "QT-5", date: "02 Jun 2026", subject: "Pipe laying 200 dia", client: "Gondal Nagarpalika", amount: 2800000, status: "Draft" },
  { no: "QT-4", date: "28 May 2026", subject: "CC Road restoration", client: "Rajkot Municipal Corp", amount: 1250000, status: "Accepted" },
];

const STATUS_CLS: Record<string, string> = {
  New: "bg-gray-100 text-gray-600",
  "Under Research": "bg-amber-100 text-amber-700",
  "Technical Evaluation": "bg-blue-100 text-blue-700",
  "Quotation Sent": "bg-cyan-100 text-cyan-700",
  Negotiation: "bg-purple-100 text-purple-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-rose-100 text-rose-700",
};

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>("Leads");
  const [leads, setLeads] = useState(SEED_LEADS);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <AppShell title="CRM">
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

      {tab === "Leads" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <Search size={15} className="text-gray-400" />
                <input placeholder="Search" className="w-24 text-sm outline-none" readOnly />
              </div>
              {["Assignee", "Priority", "Status", "Source", "Category"].map((f) => (
                <button key={f} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                  {f}
                  <ChevronDown size={13} />
                </button>
              ))}
            </div>
            <button onClick={() => setShowAdd(true)} className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
              + New Lead
            </button>
          </div>
          <p className="text-sm text-gray-400">Showing {leads.length} of {leads.length} leads</p>

          <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">S.No</th>
                  <th className="px-4 py-3">Lead Type</th>
                  <th className="px-4 py-3">Contact Name</th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3">Contact Number</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 text-gray-700">{l.leadType}</td>
                    <td className="max-w-[240px] px-4 py-3 font-medium text-gray-800">{l.contactName}</td>
                    <td className="px-4 py-3 text-gray-600">{l.lastUpdated}</td>
                    <td className="px-4 py-3 text-gray-600">{l.contactNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_CLS[l.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{l.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Quotation" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input placeholder="Search Quotation" className="w-40 text-sm outline-none" readOnly />
            </div>
            <button className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">+ New Quotation</button>
          </div>
          <SimpleTable
            columns={[
              { key: "no", label: "S.No" },
              { key: "date", label: "Date" },
              { key: "subject", label: "Subject" },
              { key: "client", label: "Client" },
              { key: "amount", label: "Est. Amount" },
              { key: "status", label: "Status" },
            ]}
            rows={QUOTATIONS.map((q) => ({ ...q, amount: formatLakh(q.amount) }))}
          />
        </div>
      )}

      {showAdd && (
        <LeadDrawer
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

function LeadDrawer({ onClose, onSave }: { onClose: () => void; onSave: (l: Lead) => void }) {
  const [f, setF] = useState<Omit<Lead, "id" | "lastUpdated">>({
    leadType: "Department",
    contactName: "",
    contactNumber: "",
    email: "",
    company: "",
    address: "",
    status: "New",
    source: "MPTenders",
    category: "Roads & Buildings",
    priority: "Medium",
    assignee: ASSIGNEES[0],
    lastContacted: "",
    followUp: "",
    expectedClosure: "",
    budget: "",
    description: "",
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  function save() {
    if (!f.contactName.trim() || !f.contactNumber.trim()) return;
    onSave({ ...f, id: `l${Date.now()}`, lastUpdated: "02 Jul 2026" });
  }

  const selCls = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400";

  return (
    <Drawer title="New Lead" onClose={onClose} onSave={save} saveLabel="Save">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <DrawerField label="Lead Assignee">
            <select value={f.assignee} onChange={(e) => set("assignee", e.target.value)} className={selCls}>
              {ASSIGNEES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </DrawerField>
          <DrawerField label="Date">
            <input type="date" defaultValue="2026-07-02" className={selCls} />
          </DrawerField>
        </div>

        <DrawerField label="Lead Type" required>
          <select value={f.leadType} onChange={(e) => set("leadType", e.target.value)} className={selCls}>
            {LEAD_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </DrawerField>

        <DrawerField label="Contact Name" required>
          <input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} className={selCls} />
        </DrawerField>

        <DrawerField label="Phone No." required>
          <div className="flex gap-2">
            <span className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">🇮🇳 +91</span>
            <input value={f.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} className={selCls} />
          </div>
        </DrawerField>

        <DrawerField label="Email">
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={selCls} />
        </DrawerField>

        <DrawerField label="Company Name">
          <input value={f.company} onChange={(e) => set("company", e.target.value)} className={selCls} />
        </DrawerField>

        <DrawerField label="Address">
          <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2} className={`${selCls} resize-none`} />
        </DrawerField>

        <DrawerField label="Source">
          <select value={f.source} onChange={(e) => set("source", e.target.value)} className={selCls}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </DrawerField>

        <DrawerField label="Category">
          <select value={f.category} onChange={(e) => set("category", e.target.value)} className={selCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </DrawerField>

        <div className="grid grid-cols-2 gap-4">
          <DrawerField label="Lead Status">
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={selCls}>
              {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </DrawerField>
          <DrawerField label="Priority">
            <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className={selCls}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </DrawerField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <DrawerField label="Last Contacted Date">
            <input type="date" value={dateVal(f.lastContacted)} onChange={(e) => set("lastContacted", e.target.value)} className={selCls} />
          </DrawerField>
          <DrawerField label="Follow Up Date">
            <input type="date" value={dateVal(f.followUp)} onChange={(e) => set("followUp", e.target.value)} className={selCls} />
          </DrawerField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <DrawerField label="Expected Closure Date">
            <input type="date" value={dateVal(f.expectedClosure)} onChange={(e) => set("expectedClosure", e.target.value)} className={selCls} />
          </DrawerField>
          <DrawerField label="Budget">
            <input type="number" value={f.budget} onChange={(e) => set("budget", e.target.value)} className={selCls} placeholder="₹" />
          </DrawerField>
        </div>

        <DrawerField label="Description">
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} className={`${selCls} resize-none`} />
        </DrawerField>
      </div>
    </Drawer>
  );
}

function dateVal(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}
