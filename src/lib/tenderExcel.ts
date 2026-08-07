"use client";

/**
 * Excel bridge for the Tender module.
 *
 * The client runs their whole tender desk out of one workbook, so the app has to be able to take
 * that workbook in and hand it back. Both directions run entirely in the browser — there is no
 * backend, and nothing is uploaded anywhere.
 *
 * The column names below are the client's own headers, verbatim (including the "RECEVIED/ NOT"
 * typo), so a file exported from their sheet imports without any manual mapping.
 */
import * as XLSX from "xlsx";
import type {
  HardcopyDispatch,
  MaterialParty,
  Tender,
  TenderHandoff,
  TenderSource,
  TenderStage,
  TenderStatus,
} from "./tenderTypes";
import {
  parseAmount,
  parseDurationMonths,
  parseEmdType,
  parseLooseDate,
  parsePriority,
  parseSecurityDetails,
  parseValidityDays,
  tdate,
} from "./tenderHelpers";
import { bucketOf } from "./tenderMetrics";
import { BUCKET_META } from "./tenderTypes";

/* ---------- import ---------- */

export type SheetKind = "SORTING" | "RESEARCH" | "APPLIED" | "GEM_SORTING" | "GEM_APPLIED" | "SKIP";

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  SORTING: "Sorting (portal)",
  RESEARCH: "Research (portal)",
  APPLIED: "Applied (portal)",
  GEM_SORTING: "Sorting (GeM)",
  GEM_APPLIED: "Applied (GeM)",
  SKIP: "Don't import",
};

export interface ParsedSheet {
  name: string;
  /** 0-based index of the detected header row. */
  headerRow: number;
  headers: string[];
  rows: unknown[][];
  /** Best guess at what this sheet is, from its name and columns. */
  kind: SheetKind;
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** The client's sheets put headers on row 2, but never assume — find the row that looks like one. */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const cells = rows[i].map(norm);
    if (cells.includes("TENDER ID") || (cells.includes("NAME OF WORK") && cells.some((c) => c.startsWith("S.NO")))) {
      return i;
    }
  }
  return 0;
}

function guessKind(name: string, headers: string[]): SheetKind {
  const n = norm(name);
  const h = headers.map(norm);
  const gem = n.includes("GEM") || h.includes("MSME RELAXATION") || h.includes("CATEGORY");
  const applied = h.includes("STATUS") || h.includes("DATE OF SUBMISSION") || h.includes("CONTRACT VALUE");
  if (n.includes("RESEARCH")) return "RESEARCH";
  if (applied) return gem ? "GEM_APPLIED" : "APPLIED";
  if (n.includes("SORTING") || h.includes("DEADLINE")) return gem ? "GEM_SORTING" : "SORTING";
  return "SKIP";
}

/** Sheets that are reference/report tabs rather than tender lists. */
const NON_TENDER = /DASHBOARD|MATERIAL|HARDCOPY|DOCUMENT|STATUS$|RA BILLS|WORK IN HAND|COMPLETED PROJECTS|विवरण/i;

export function readWorkbook(data: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const out: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, raw: true });
    if (rows.length < 2) continue;
    const headerRow = findHeaderRow(rows);
    const headers = (rows[headerRow] ?? []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
    const body = rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== null && c !== undefined && c !== "" && c !== "-"));
    if (body.length === 0) continue;
    out.push({
      name,
      headerRow,
      headers,
      rows: body,
      kind: NON_TENDER.test(name) ? "SKIP" : guessKind(name, headers),
    });
  }
  return out;
}

/** Cell → string, normalising the Date objects SheetJS hands back for date-formatted cells. */
function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const s = String(value).replace(/[\r\n]+/g, " ").trim();
  return s === "" || s === "-" ? null : s;
}

/** Every header the client's workbook uses, mapped to a Tender field. */
const FIELD_BY_HEADER: Record<string, keyof Tender> = {
  "DEPARTMENT": "department",
  "TENDER ID": "tenderId",
  "NAME OF WORK": "nameOfWork",
  "LOCATION": "location",
  "OFFICE ADDRESS": "officeAddress",
  "ESTIMATED COST": "estimatedCost",
  "CONTRACT VALUE": "contractValue",
  "VAR.(%)": "variancePct",
  "FEE": "fee",
  "EMD": "emd",
  "EMD TYPE": "emdType",
  "DEADLINE": "deadline",
  "NEXT FOLLOW UP": "nextFollowUp",
  "DUE DATE": "dueDate",
  "DATE OF SUBMISSION": "submissionDate",
  "DATE OF RECEIVED": "dateOfReceived",
  "HARDCOPY DUE": "hardcopyDue",
  "TECH OPEN": "techOpen",
  "PRICE OPEN": "priceOpen",
  "OPENING DATE": "openingDate",
  "DURATION": "duration",
  "COMPLETION PERIOD": "duration",
  "VALIDITY": "validity",
  "DLP": "dlp",
  "PRE BID INFO": "preBidInfo",
  "PQ CRITERIA": "pqCriteria",
  "CLASS": "classReq",
  "GST": "gst",
  "LAB TEST": "labTest",
  "PRICE ESCALATION": "priceEscalation",
  "DEPOSIT DETAILS": "depositDetails",
  "SECURITY DETAILS": "securityDetails",
  "SECURITY": "securityDetails",
  "FIRM": "firm",
  "PRICE BID STAGE (COMPETITIVE REPORT)": "priceBidStage",
  "CATEGORY": "gemCategory",
  "MSME RELAXATION": "msmeRelaxation",
  "EXPERIENCE & TURNOVER": "experienceTurnover",
  "ELIGIBILITY STATUS": "eligibilityStatus",
  "PRIORITY": "priority",
  "STAGE DOCUMENTS": "stageDocuments",
  "UPLOADED DOCUMENTS LIST": "uploadedDocuments",
  "VIEW DOCUMENTS": "viewDocuments",
  "REMARKS": "remarks",
};

const NUMERIC = new Set<keyof Tender>(["estimatedCost", "contractValue", "variancePct", "fee", "emd"]);

const STATUS_BY_LABEL: Record<string, { stage: TenderStage; status: TenderStatus }> = {
  "AWARDED (WIN)": { stage: "WON", status: "WON" },
  "COMPLETED": { stage: "WON", status: "COMPLETED" },
  "LOST": { stage: "LOST", status: "LOST" },
  "TECHNICALLY DISQUALIFIED": { stage: "LOST", status: "TECH_DISQUALIFIED" },
  "CANCELLED": { stage: "LOST", status: "CANCELLED" },
  "RETENDERED": { stage: "APPLIED", status: "RETENDERED" },
  "SUBMITTED / UNDER REVIEW": { stage: "APPLIED", status: "SUBMITTED" },
  "TECHNICAL OPENED": { stage: "APPLIED", status: "TECH_OPENED" },
  "TECHNICALLY QUALIFIED": { stage: "APPLIED", status: "TECH_QUALIFIED" },
};

const KIND_DEFAULTS: Record<Exclude<SheetKind, "SKIP">, { stage: TenderStage; source: TenderSource }> = {
  SORTING: { stage: "SORTING", source: "PORTAL" },
  RESEARCH: { stage: "RESEARCH", source: "PORTAL" },
  APPLIED: { stage: "APPLIED", source: "PORTAL" },
  GEM_SORTING: { stage: "SORTING", source: "GEM" },
  GEM_APPLIED: { stage: "APPLIED", source: "GEM" },
};

/**
 * Turn one parsed sheet into Tender records, applying the same normalisation the seed generator
 * does — so an imported row is indistinguishable from a seeded one.
 */
export function toTenders(sheet: ParsedSheet, kind: SheetKind, idPrefix = "imp"): Tender[] {
  if (kind === "SKIP") return [];
  const { stage: defaultStage, source } = KIND_DEFAULTS[kind];
  const index = new Map<string, number>();
  sheet.headers.forEach((h, i) => {
    const key = norm(h);
    if (key && !index.has(key)) index.set(key, i);
  });
  const at = (row: unknown[], header: string) => {
    const i = index.get(norm(header));
    return i === undefined ? null : cell(row[i]);
  };
  // The received column carries the client's "RECEVIED/ NOT" typo, in two spacing variants.
  const receivedKey = [...index.keys()].find((k) => k.startsWith("RECEVIED") || k.startsWith("RECEIVED"));

  const out: Tender[] = [];
  sheet.rows.forEach((row, i) => {
    const t: Tender = { id: `${idPrefix}-${Date.now().toString(36)}-${i}`, source, stage: defaultStage, tenderId: "" };

    // Written through an indexable alias: the field names come from FIELD_BY_HEADER, so they are
    // known-good keys of Tender, but TypeScript cannot narrow the value type per key here.
    const sink = t as unknown as Record<string, unknown>;
    for (const [header, field] of Object.entries(FIELD_BY_HEADER)) {
      const raw = at(row, header);
      if (raw == null) continue;
      if (NUMERIC.has(field)) {
        const n = parseAmount(raw);
        if (n != null) sink[field] = n;
      } else {
        sink[field] = raw;
      }
    }

    t.tenderId = String(t.tenderId ?? "").trim();
    if (receivedKey) t.receivedStatus = cell(row[index.get(receivedKey)!]);

    // Status decides the real stage for applied sheets.
    const statusLabel = at(row, "STATUS");
    if (statusLabel) {
      const mapped = STATUS_BY_LABEL[norm(statusLabel)];
      t.statusLabel = statusLabel;
      if (mapped) {
        t.stage = mapped.stage;
        t.status = mapped.status;
      } else {
        t.status = "SUBMITTED";
      }
    } else if (defaultStage === "APPLIED") {
      t.status = "SUBMITTED";
    }

    // Same normalisation as scripts/generate-tender-seed.py.
    const emd = parseEmdType(t.emdType);
    t.emdMode = emd.mode;
    t.emdState = emd.state ?? (t.stage === "SORTING" || t.stage === "RESEARCH" ? "PENDING" : "PAID");
    Object.assign(t, parseSecurityDetails(t.securityDetails));
    t.durationMonths = parseDurationMonths(t.duration);
    t.validityDays = parseValidityDays(t.validity);
    t.preBidDate = parseLooseDate(t.preBidInfo);
    t.priority = parsePriority(typeof t.priority === "string" ? t.priority : null);

    // A row with neither an id nor a name is a stray formatting artefact, not a tender.
    if (!t.tenderId && !t.nameOfWork) return;
    out.push(t);
  });
  return out;
}

/* ---------- export ---------- */

const asSheet = (rows: Record<string, unknown>[]) => XLSX.utils.json_to_sheet(rows);

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { compression: true });
}

/** The columns we write back out, in the client's own order and naming. */
function tenderRow(t: Tender) {
  return {
    "DEPARTMENT": t.department ?? "",
    "TENDER ID": t.tenderId ?? "",
    "NAME OF WORK": t.nameOfWork ?? "",
    "LOCATION": t.location ?? "",
    "STAGE": BUCKET_META[bucketOf(t)].label,
    "STATUS": t.statusLabel ?? (t.status ?? ""),
    "ESTIMATED COST": t.estimatedCost ?? "",
    "CONTRACT VALUE": t.contractValue ?? "",
    "VAR.(%)": t.variancePct ?? "",
    "FEE": t.fee ?? "",
    "EMD": t.emd ?? "",
    "EMD MODE": t.emdMode ?? "",
    "EMD STATE": t.emdState ?? "",
    "EMD RELEASED ON": t.emdReleasedOn ?? "",
    "SECURITY TYPE": t.securityType ?? "",
    "SECURITY AMOUNT": t.securityAmount ?? "",
    "ADDITIONAL SECURITY": t.additionalSecurityAmount ?? "",
    "BG CHARGES": t.bgCharges ?? "",
    "DEADLINE": t.deadline ?? "",
    "NEXT FOLLOW UP": t.nextFollowUp ?? "",
    "HARDCOPY DUE": t.hardcopyDue ?? "",
    "DATE OF SUBMISSION": t.submissionDate ?? "",
    "DUE DATE": t.dueDate ?? "",
    "DURATION": t.duration ?? "",
    "VALIDITY": t.validity ?? "",
    "DLP": t.dlp ?? "",
    "PQ CRITERIA": t.pqCriteria ?? "",
    "CLASS": t.classReq ?? "",
    "OFFICE ADDRESS": t.officeAddress ?? "",
    "FIRM": t.firm ?? "",
    "LOSS REASON": t.lossReason ?? "",
    "L1 BIDDER": t.l1Bidder ?? "",
    "L1 VALUE": t.l1Value ?? "",
    "REMARKS": t.remarks ?? "",
  };
}

/** Export whatever the user is currently looking at — filters, sort and all. */
export function exportTenders(tenders: Tender[], filename = "tenders.xlsx", sheetName = "TENDERS") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, asSheet(tenders.map(tenderRow)), sheetName.slice(0, 31));
  download(wb, filename);
}

export interface WorkbookExport {
  tenders: Tender[];
  hardcopy: HardcopyDispatch[];
  materials: MaterialParty[];
  handoffs: TenderHandoff[];
}

/** Full workbook, one sheet per pipeline stage — the shape the client already knows. */
export function exportWorkbook(data: WorkbookExport, filename = "tender-analysis.xlsx") {
  const wb = XLSX.utils.book_new();
  const groups: [string, (t: Tender) => boolean][] = [
    ["SORTING", (t) => t.stage === "SORTING" && t.source === "PORTAL"],
    ["RESEARCH", (t) => t.stage === "RESEARCH"],
    ["APPLIED", (t) => ["APPLIED", "WON", "LOST"].includes(t.stage) && t.source === "PORTAL"],
    ["GEM SORTING", (t) => t.stage === "SORTING" && t.source === "GEM"],
    ["GEM APPLIED", (t) => ["APPLIED", "WON", "LOST"].includes(t.stage) && t.source === "GEM"],
  ];
  for (const [name, match] of groups) {
    const rows = data.tenders.filter(match).map(tenderRow);
    if (rows.length) XLSX.utils.book_append_sheet(wb, asSheet(rows), name);
  }

  if (data.handoffs.length) {
    XLSX.utils.book_append_sheet(
      wb,
      asSheet(
        data.handoffs.map((h) => ({
          "Client Name": h.clientName ?? "",
          "Name of Work": h.nameOfWork ?? "",
          "Location": h.location ?? "",
          "Contract Value": h.contractValue ?? "",
          "Work Order Date": h.workOrderDate ?? "",
          "Completion Period": h.completionPeriod ?? "",
          "Completion Date": h.completionDate ?? "",
          "Final Bill Value": h.finalBillValue ?? "",
          "Status": h.status === "COMPLETED" ? "COMPLETED" : "IN PROGRESS",
        })),
      ),
      "PROJECTS",
    );
  }

  if (data.hardcopy.length) {
    XLSX.utils.book_append_sheet(
      wb,
      asSheet(
        data.hardcopy.map((h) => ({
          "DATE": h.date ?? "",
          "TENDER ID": h.tenderId ?? "",
          "NAME OF WORK": h.nameOfWork ?? "",
          "DOCUMENT LIST": h.documentList ?? "",
          "PACKED BY & MO.": h.packedBy ?? "",
          "DISPATCH BY & MO.": h.dispatchBy ?? "",
          "POST TRACKING NO.": h.trackingNo ?? "",
          "ARRIVED/ NOT ARRIVED": h.arrived ?? "",
          "ARRIVED DATE": h.arrivedDate ?? "",
          "REMARKS": h.remarks ?? "",
        })),
      ),
      "HARDCOPY TRACKER",
    );
  }

  if (data.materials.length) {
    XLSX.utils.book_append_sheet(
      wb,
      asSheet(
        data.materials.map((m) => ({
          "PARTY DETAILS": m.party ?? "",
          "TYPE OF MANUFACTURER": m.manufacturerType ?? "",
          "MAKE": m.make ?? "",
          "LOCATION": m.location ?? "",
          "CONTACT PERSON DETAILS": m.contact ?? "",
          "EMAIL": m.email ?? "",
        })),
      ),
      "MATERIAL PARTY DETAILS",
    );
  }

  download(wb, filename);
}

/** Human summary of a parsed sheet, for the import preview. */
export function describeSheet(sheet: ParsedSheet): string {
  return `${sheet.rows.length} rows · ${sheet.headers.filter(Boolean).length} columns · header on row ${sheet.headerRow + 1}`;
}

/** Small helper the preview uses to show a couple of real values per row. */
export function previewLine(t: Tender): string {
  const bits = [t.tenderId, t.nameOfWork, t.deadline ? tdate(t.deadline) : null].filter(Boolean);
  return bits.join(" · ");
}
