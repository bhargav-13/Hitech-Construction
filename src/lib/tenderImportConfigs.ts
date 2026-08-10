/**
 * Per-entity CSV import configs for the tender module, driven by the shared
 * {@link import("@/components/vyapar/ImportDialog").ImportDialog}. Each factory takes the store's
 * `add` action and returns a config with column auto-detection, a downloadable example template,
 * a preview, and a commit that maps parsed rows onto the tender domain types.
 */
import type { ImportConfig } from "@/components/vyapar/ImportDialog";
import type { HardcopyDispatch, MaterialParty, Tender, TenderDocuments, TenderMilestones } from "./tenderTypes";

const norm = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");
const has = (h: string, ...needles: string[]) => needles.some((n) => h.includes(n));
const mkId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const numOrNull = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const up = (v: unknown, d: string) => String(v ?? d).trim().toUpperCase();

/* ============================ Tenders / EMD ============================ */

export function tenderImportConfig(addTender: (t: Tender) => void): ImportConfig {
  return {
    title: "Import Tenders from CSV",
    entityNoun: "tenders",
    requiredKey: "nameOfWork",
    requiredLabel: "Name of Work",
    base: { stage: "SORTING", source: "PORTAL", emdState: "PENDING" },
    fields: [
      { key: "nameOfWork", label: "Name of Work *" },
      { key: "tenderId", label: "Tender ID" },
      { key: "department", label: "Department" },
      { key: "location", label: "Location" },
      { key: "stage", label: "Stage (SORTING/RESEARCH/APPLIED/WON/LOST)" },
      { key: "source", label: "Source (PORTAL/GEM)" },
      { key: "estimatedCost", label: "Estimated Cost", numeric: true },
      { key: "fee", label: "Fee", numeric: true },
      { key: "emd", label: "EMD Amount", numeric: true },
      { key: "emdMode", label: "EMD Instrument (ONLINE/DD/FDR/BG/EXEMPT)" },
      { key: "emdState", label: "EMD State (PENDING/PAID/RELEASED/FORFEITED)" },
      { key: "emdInstrumentNo", label: "EMD Instrument No." },
      { key: "emdPaidOn", label: "EMD Paid On" },
      { key: "deadline", label: "Deadline" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "nameofwork", "work", "scope") || h === "name") return "nameOfWork";
      if (has(h, "tenderid", "tenderno", "bidid") || h === "id") return "tenderId";
      if (has(h, "department", "dept", "office", "client")) return "department";
      if (h.includes("location")) return "location";
      if (h.includes("stage")) return "stage";
      if (h.includes("source")) return "source";
      if (has(h, "estimatedcost", "estimate", "estcost", "value")) return "estimatedCost";
      if (h.includes("fee")) return "fee";
      if (has(h, "emdinstrumentno", "instrumentno", "fdrno", "bgno")) return "emdInstrumentNo";
      if (has(h, "emdstate", "emdstatus")) return "emdState";
      if (has(h, "emdmode", "emdtype", "emdinstrument")) return "emdMode";
      if (has(h, "emdpaid", "paidon")) return "emdPaidOn";
      if (h.includes("emd")) return "emd";
      if (has(h, "deadline", "duedate", "lastdate")) return "deadline";
      return "skip";
    },
    template: {
      name: "tender-import-template",
      head: ["Name of Work", "Tender ID", "Department", "Location", "Stage", "Source", "Estimated Cost", "Fee", "EMD Amount", "EMD Instrument", "EMD State", "EMD Instrument No.", "EMD Paid On", "Deadline"],
      row: ["Construction of RCC road at Ward 5", "TND-2026-001", "Rajkot Municipal Corporation", "Rajkot", "APPLIED", "PORTAL", "4500000", "5000", "90000", "FDR", "PAID", "FDR-99881", "2026-07-15", "2026-08-01"],
    },
    preview: [
      { key: "nameOfWork", label: "Name of Work" },
      { key: "tenderId", label: "Tender ID" },
      { key: "department", label: "Department" },
      { key: "emd", label: "EMD", align: "right", render: (v) => v ?? "—" },
      { key: "stage", label: "Stage", render: (v) => (v ?? "SORTING").toUpperCase() },
    ],
    commit: async (records) => {
      for (const r of records) {
        addTender({
          id: mkId("tnd"),
          source: up(r.source, "PORTAL"),
          stage: up(r.stage, "SORTING"),
          tenderId: String(r.tenderId ?? ""),
          nameOfWork: str(r.nameOfWork),
          department: str(r.department),
          location: str(r.location),
          estimatedCost: numOrNull(r.estimatedCost),
          fee: numOrNull(r.fee),
          emd: numOrNull(r.emd),
          emdMode: str(r.emdMode) ? up(r.emdMode, "") : null,
          emdState: str(r.emdState) ? up(r.emdState, "PENDING") : "PENDING",
          emdInstrumentNo: str(r.emdInstrumentNo),
          emdPaidOn: str(r.emdPaidOn),
          deadline: str(r.deadline),
        } as unknown as Tender);
      }
      return records.length;
    },
  };
}

/* ============================ Hardcopy dispatch ============================ */

export function hardcopyImportConfig(addHardcopy: (h: HardcopyDispatch) => void): ImportConfig {
  return {
    title: "Import Dispatches from CSV",
    entityNoun: "dispatches",
    requiredKey: "nameOfWork",
    requiredLabel: "Name of Work",
    fields: [
      { key: "nameOfWork", label: "Name of Work *" },
      { key: "tenderId", label: "Tender ID" },
      { key: "date", label: "Dispatch Date" },
      { key: "documentList", label: "Documents" },
      { key: "packedBy", label: "Packed By" },
      { key: "dispatchBy", label: "Dispatch By" },
      { key: "trackingNo", label: "Tracking No." },
      { key: "arrived", label: "Arrived (ARRIVED/NOT ARRIVED)" },
      { key: "arrivedDate", label: "Arrived Date" },
      { key: "remarks", label: "Remarks" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "nameofwork", "work") || h === "name") return "nameOfWork";
      if (has(h, "tenderid", "tenderno")) return "tenderId";
      if (has(h, "arriveddate")) return "arrivedDate";
      if (h.includes("arriv")) return "arrived";
      if (has(h, "dispatchdate", "date")) return "date";
      if (has(h, "document", "docs", "contents")) return "documentList";
      if (has(h, "packedby", "packed")) return "packedBy";
      if (has(h, "dispatchby", "sentby", "courier")) return "dispatchBy";
      if (has(h, "tracking", "awb", "consignment")) return "trackingNo";
      if (has(h, "remark", "note")) return "remarks";
      return "skip";
    },
    template: {
      name: "hardcopy-import-template",
      head: ["Name of Work", "Tender ID", "Dispatch Date", "Documents", "Packed By", "Dispatch By", "Tracking No.", "Arrived", "Arrived Date", "Remarks"],
      row: ["Construction of RCC road at Ward 5", "TND-2026-001", "2026-07-20", "Technical bid + EMD FDR", "Ramesh", "DTDC", "DTDC99887766", "ARRIVED", "2026-07-22", "Received at RMC office"],
    },
    preview: [
      { key: "nameOfWork", label: "Name of Work" },
      { key: "date", label: "Date" },
      { key: "trackingNo", label: "Tracking" },
      { key: "arrived", label: "Arrived", render: (v) => v ?? "—" },
    ],
    commit: async (records) => {
      for (const r of records) {
        addHardcopy({
          id: mkId("hc"),
          date: str(r.date),
          nameOfWork: str(r.nameOfWork),
          tenderId: str(r.tenderId),
          documentList: str(r.documentList),
          packedBy: str(r.packedBy),
          dispatchBy: str(r.dispatchBy),
          trackingNo: str(r.trackingNo),
          arrived: str(r.arrived),
          arrivedDate: str(r.arrivedDate),
          remarks: str(r.remarks),
        });
      }
      return records.length;
    },
  };
}

/* ============================ Documentation records ============================ */

export function documentImportConfig(addDocument: (d: TenderDocuments) => void): ImportConfig {
  return {
    title: "Import Documentation Records from CSV",
    entityNoun: "records",
    requiredKey: "nameOfWork",
    requiredLabel: "Name of Work",
    fields: [
      { key: "nameOfWork", label: "Name of Work *" },
      { key: "tenderId", label: "Tender ID" },
      { key: "progress", label: "Progress note" },
      { key: "viewDocuments", label: "View Documents (link/name)" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "nameofwork", "work") || h === "name") return "nameOfWork";
      if (has(h, "tenderid", "tenderno")) return "tenderId";
      if (has(h, "progress", "status")) return "progress";
      if (has(h, "viewdocument", "link", "folder", "documents")) return "viewDocuments";
      return "skip";
    },
    template: {
      name: "documentation-import-template",
      head: ["Name of Work", "Tender ID", "Progress note", "View Documents"],
      row: ["Construction of RCC road at Ward 5", "TND-2026-001", "31% & Work Order Issued", "https://drive.example.com/rcc-road"],
    },
    preview: [
      { key: "nameOfWork", label: "Name of Work" },
      { key: "tenderId", label: "Tender ID" },
      { key: "progress", label: "Progress" },
    ],
    commit: async (records) => {
      for (const r of records) {
        addDocument({
          id: mkId("doc"),
          tenderId: String(r.tenderId ?? ""),
          nameOfWork: str(r.nameOfWork),
          progress: str(r.progress),
          viewDocuments: str(r.viewDocuments),
          raBills: [],
        });
      }
      return records.length;
    },
  };
}

/* ============================ Status-tracker (milestones) ============================ */

export function milestoneImportConfig(addMilestone: (m: TenderMilestones) => void): ImportConfig {
  return {
    title: "Import Status-Tracker Records from CSV",
    entityNoun: "records",
    requiredKey: "nameOfWork",
    requiredLabel: "Name of Work",
    fields: [
      { key: "nameOfWork", label: "Name of Work *" },
      { key: "tenderId", label: "Tender ID" },
      { key: "workStartDate", label: "Work Start Date" },
      { key: "progress", label: "Progress note" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "nameofwork", "work") || h === "name") return "nameOfWork";
      if (has(h, "tenderid", "tenderno")) return "tenderId";
      if (has(h, "workstart", "startdate", "start")) return "workStartDate";
      if (has(h, "progress", "status")) return "progress";
      return "skip";
    },
    template: {
      name: "status-tracker-import-template",
      head: ["Name of Work", "Tender ID", "Work Start Date", "Progress note"],
      row: ["Construction of RCC road at Ward 5", "TND-2026-001", "2026-08-01", "Analysis done, EMD paid"],
    },
    preview: [
      { key: "nameOfWork", label: "Name of Work" },
      { key: "tenderId", label: "Tender ID" },
      { key: "workStartDate", label: "Work Start" },
    ],
    commit: async (records) => {
      for (const r of records) {
        addMilestone({
          id: mkId("mst"),
          tenderId: String(r.tenderId ?? ""),
          nameOfWork: str(r.nameOfWork),
          workStartDate: str(r.workStartDate),
          progress: str(r.progress),
        });
      }
      return records.length;
    },
  };
}

/* ============================ Materials ============================ */

export function materialImportConfig(addMaterial: (m: MaterialParty) => void): ImportConfig {
  return {
    title: "Import Material Parties from CSV",
    entityNoun: "parties",
    requiredKey: "party",
    requiredLabel: "Party",
    fields: [
      { key: "party", label: "Party *" },
      { key: "manufacturerType", label: "Material / Type" },
      { key: "make", label: "Make" },
      { key: "location", label: "Location" },
      { key: "contact", label: "Contact" },
      { key: "email", label: "Email" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "party", "supplier", "vendor", "manufacturer") || h === "name") return "party";
      if (has(h, "materialtype", "type", "material", "category")) return "manufacturerType";
      if (h.includes("make") || h.includes("brand")) return "make";
      if (h.includes("location") || h.includes("city")) return "location";
      if (has(h, "contact", "phone", "mobile")) return "contact";
      if (h.includes("email")) return "email";
      return "skip";
    },
    template: {
      name: "material-parties-import-template",
      head: ["Party", "Material / Type", "Make", "Location", "Contact", "Email"],
      row: ["Shakti Steel Traders", "TMT Bars", "Kamdhenu", "Rajkot", "9876543210", "sales@shaktisteel.example"],
    },
    preview: [
      { key: "party", label: "Party" },
      { key: "manufacturerType", label: "Material / Type" },
      { key: "make", label: "Make" },
      { key: "location", label: "Location" },
    ],
    commit: async (records) => {
      for (const r of records) {
        addMaterial({
          id: mkId("mat"),
          party: str(r.party),
          manufacturerType: str(r.manufacturerType),
          make: str(r.make),
          location: str(r.location),
          contact: str(r.contact),
          email: str(r.email),
        });
      }
      return records.length;
    },
  };
}
