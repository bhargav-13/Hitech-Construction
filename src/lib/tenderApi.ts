// Typed client for the Tender API (tender-service, com.hitech.erp.tender).
// Shares the auth/refresh plumbing in lib/api.ts via the exported `apiRequest`.
//
// The backend stores dynamic/nested bits (custom fields, milestone steps, document pairs, RA bills)
// as opaque JSON strings, so the mappers here parse them back into the rich frontend shapes and
// re-serialise on the way out. Enum-like fields already share the same string values on both sides.
import { apiRequest } from "./api";
import type {
  DocPair,
  HardcopyDispatch,
  MaterialParty,
  Tender,
  TenderCustomField,
  TenderDocuments,
  TenderMilestones,
} from "./tenderTypes";

/* ============================ Tenders ============================ */

/** Backend TenderResponse — flat, ids as numbers, customFields as a JSON string. */
interface TenderApiResponse extends Record<string, unknown> {
  id: number;
  customFields?: string | null;
  projectId?: number | null;
}

interface TenderPage {
  content: TenderApiResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface TenderSummary {
  total: number;
  byStage: { stage: string; count: number }[];
  emdBlocked: number;
  emdRecoverable: number;
}

/** Fields the frontend keeps that the backend does not model — stripped before sending. */
const LOCAL_ONLY: (keyof Tender)[] = ["attachments"];

function tenderToApi(t: Partial<Tender>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...t };
  delete body.id;
  for (const k of LOCAL_ONLY) delete body[k];
  // Custom fields ride as a JSON string on the wire.
  body.customFields = JSON.stringify(t.customFields ?? []);
  return body;
}

function tenderFromApi(dto: TenderApiResponse): Tender {
  const { id, customFields, ...rest } = dto;
  let parsed: TenderCustomField[] = [];
  if (customFields) {
    try {
      parsed = JSON.parse(customFields) as TenderCustomField[];
    } catch {
      parsed = [];
    }
  }
  return { ...(rest as unknown as Tender), id: String(id), customFields: parsed };
}

/** Numeric backend id from a frontend string id (backend ids are stringified numbers). */
function numId(id: string): number {
  return Number(id);
}

export async function listTenders(params: { page?: number; size?: number; stage?: string; source?: string; q?: string } = {}): Promise<Tender[]> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 0));
  qs.set("size", String(params.size ?? 500));
  if (params.stage) qs.set("stage", params.stage);
  if (params.source) qs.set("source", params.source);
  if (params.q) qs.set("q", params.q);
  const page = await apiRequest<TenderPage>(`/api/v1/tenders?${qs.toString()}`);
  return page.content.map(tenderFromApi);
}

export async function createTenderApi(t: Partial<Tender>): Promise<Tender> {
  const dto = await apiRequest<TenderApiResponse>(`/api/v1/tenders`, { method: "POST", body: tenderToApi(t) });
  return tenderFromApi(dto);
}

export async function updateTenderApi(id: string, patch: Partial<Tender>): Promise<Tender> {
  const dto = await apiRequest<TenderApiResponse>(`/api/v1/tenders/${numId(id)}`, { method: "PUT", body: tenderToApi(patch) });
  return tenderFromApi(dto);
}

export async function changeTenderStageApi(id: string, stage: string, status?: string | null): Promise<Tender> {
  const dto = await apiRequest<TenderApiResponse>(`/api/v1/tenders/${numId(id)}/stage`, {
    method: "PATCH",
    body: { stage, status: status ?? null },
  });
  return tenderFromApi(dto);
}

export async function deleteTenderApi(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/tenders/${numId(id)}`, { method: "DELETE" });
}

export async function tenderSummary(): Promise<TenderSummary> {
  return apiRequest<TenderSummary>(`/api/v1/tenders/summary`);
}

/* ============================ Milestones ============================ */

const MILESTONE_BASE = new Set(["id", "tenderId", "nameOfWork", "workStartDate", "progress"]);

interface MilestoneApi {
  id: number;
  tenderRef?: string | null;
  nameOfWork?: string | null;
  workStartDate?: string | null;
  progress?: string | null;
  stepsJson?: string | null;
}

function milestoneFromApi(d: MilestoneApi): TenderMilestones {
  let steps: Record<string, unknown> = {};
  if (d.stepsJson) {
    try {
      steps = JSON.parse(d.stepsJson) as Record<string, unknown>;
    } catch {
      steps = {};
    }
  }
  return {
    id: String(d.id),
    tenderId: d.tenderRef ?? "",
    nameOfWork: d.nameOfWork ?? null,
    workStartDate: d.workStartDate ?? null,
    progress: d.progress ?? null,
    ...steps,
  };
}

function milestoneToApi(m: Partial<TenderMilestones>): Record<string, unknown> {
  const steps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (!MILESTONE_BASE.has(k)) steps[k] = v;
  return {
    tenderRef: m.tenderId ?? null,
    nameOfWork: m.nameOfWork ?? null,
    workStartDate: m.workStartDate ?? null,
    progress: m.progress ?? null,
    stepsJson: JSON.stringify(steps),
  };
}

export async function listMilestonesApi(): Promise<TenderMilestones[]> {
  return (await apiRequest<MilestoneApi[]>(`/api/v1/tenders/milestones`)).map(milestoneFromApi);
}
export async function createMilestoneApi(m: Partial<TenderMilestones>): Promise<TenderMilestones> {
  return milestoneFromApi(await apiRequest<MilestoneApi>(`/api/v1/tenders/milestones`, { method: "POST", body: milestoneToApi(m) }));
}
export async function updateMilestoneApi(id: string, m: Partial<TenderMilestones>): Promise<TenderMilestones> {
  return milestoneFromApi(await apiRequest<MilestoneApi>(`/api/v1/tenders/milestones/${numId(id)}`, { method: "PUT", body: milestoneToApi(m) }));
}
export async function deleteMilestoneApi(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/tenders/milestones/${numId(id)}`, { method: "DELETE" });
}

/* ============================ Documents ============================ */

const DOCUMENT_BASE = new Set(["id", "tenderId", "nameOfWork", "progress", "viewDocuments", "raBills"]);

interface DocumentApi {
  id: number;
  tenderRef?: string | null;
  nameOfWork?: string | null;
  progress?: string | null;
  viewDocuments?: string | null;
  pairsJson?: string | null;
  raBillsJson?: string | null;
}

function documentFromApi(d: DocumentApi): TenderDocuments {
  let pairs: Record<string, unknown> = {};
  let raBills: DocPair[] = [];
  if (d.pairsJson) {
    try {
      pairs = JSON.parse(d.pairsJson) as Record<string, unknown>;
    } catch {
      pairs = {};
    }
  }
  if (d.raBillsJson) {
    try {
      raBills = JSON.parse(d.raBillsJson) as DocPair[];
    } catch {
      raBills = [];
    }
  }
  return {
    id: String(d.id),
    tenderId: d.tenderRef ?? "",
    nameOfWork: d.nameOfWork ?? null,
    progress: d.progress ?? null,
    viewDocuments: d.viewDocuments ?? null,
    raBills,
    ...pairs,
  };
}

function documentToApi(doc: Partial<TenderDocuments>): Record<string, unknown> {
  const pairs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) if (!DOCUMENT_BASE.has(k)) pairs[k] = v;
  return {
    tenderRef: doc.tenderId ?? null,
    nameOfWork: doc.nameOfWork ?? null,
    progress: doc.progress ?? null,
    viewDocuments: doc.viewDocuments ?? null,
    pairsJson: JSON.stringify(pairs),
    raBillsJson: JSON.stringify(doc.raBills ?? []),
  };
}

export async function listDocumentsApi(): Promise<TenderDocuments[]> {
  return (await apiRequest<DocumentApi[]>(`/api/v1/tenders/documents`)).map(documentFromApi);
}
export async function createDocumentApi(d: Partial<TenderDocuments>): Promise<TenderDocuments> {
  return documentFromApi(await apiRequest<DocumentApi>(`/api/v1/tenders/documents`, { method: "POST", body: documentToApi(d) }));
}
export async function updateDocumentApi(id: string, d: Partial<TenderDocuments>): Promise<TenderDocuments> {
  return documentFromApi(await apiRequest<DocumentApi>(`/api/v1/tenders/documents/${numId(id)}`, { method: "PUT", body: documentToApi(d) }));
}
export async function deleteDocumentApi(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/tenders/documents/${numId(id)}`, { method: "DELETE" });
}

/* ============================ Hardcopy ============================ */

interface HardcopyApi extends Omit<HardcopyDispatch, "id" | "tenderId"> {
  id: number;
  tenderRef?: string | null;
}

function hardcopyFromApi(d: HardcopyApi): HardcopyDispatch {
  const { id, tenderRef, ...rest } = d;
  return { ...rest, id: String(id), tenderId: tenderRef ?? null };
}
function hardcopyToApi(h: Partial<HardcopyDispatch>): Record<string, unknown> {
  const { id, tenderId, ...rest } = h;
  void id;
  return { ...rest, tenderRef: tenderId ?? null };
}

export async function listHardcopyApi(): Promise<HardcopyDispatch[]> {
  return (await apiRequest<HardcopyApi[]>(`/api/v1/tenders/hardcopy`)).map(hardcopyFromApi);
}
export async function createHardcopyApi(h: Partial<HardcopyDispatch>): Promise<HardcopyDispatch> {
  return hardcopyFromApi(await apiRequest<HardcopyApi>(`/api/v1/tenders/hardcopy`, { method: "POST", body: hardcopyToApi(h) }));
}
export async function updateHardcopyApi(id: string, h: Partial<HardcopyDispatch>): Promise<HardcopyDispatch> {
  return hardcopyFromApi(await apiRequest<HardcopyApi>(`/api/v1/tenders/hardcopy/${numId(id)}`, { method: "PUT", body: hardcopyToApi(h) }));
}
export async function deleteHardcopyApi(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/tenders/hardcopy/${numId(id)}`, { method: "DELETE" });
}

/* ============================ Materials ============================ */

interface MaterialApi extends Omit<MaterialParty, "id"> {
  id: number;
}

function materialFromApi(d: MaterialApi): MaterialParty {
  const { id, ...rest } = d;
  return { ...rest, id: String(id) };
}
function materialToApi(m: Partial<MaterialParty>): Record<string, unknown> {
  const { id, ...rest } = m;
  void id;
  return { ...rest };
}

export async function listMaterialsApi(): Promise<MaterialParty[]> {
  return (await apiRequest<MaterialApi[]>(`/api/v1/tenders/materials`)).map(materialFromApi);
}
export async function createMaterialApi(m: Partial<MaterialParty>): Promise<MaterialParty> {
  return materialFromApi(await apiRequest<MaterialApi>(`/api/v1/tenders/materials`, { method: "POST", body: materialToApi(m) }));
}
export async function updateMaterialApi(id: string, m: Partial<MaterialParty>): Promise<MaterialParty> {
  return materialFromApi(await apiRequest<MaterialApi>(`/api/v1/tenders/materials/${numId(id)}`, { method: "PUT", body: materialToApi(m) }));
}
export async function deleteMaterialApi(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/tenders/materials/${numId(id)}`, { method: "DELETE" });
}
