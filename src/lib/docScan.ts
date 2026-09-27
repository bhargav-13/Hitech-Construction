"use client";

import { apiRequest } from "@/lib/api";

/**
 * "Scan with AI" — reads a photo or PDF of a document into a form's fields.
 *
 * The browser turns the file into page images (pdf.js renders PDF pages; photos are shrunk) and
 * posts them to the backend, which asks xAI's Grok vision model for a fixed set of fields per kind
 * of document. The key never reaches the browser.
 *
 * A scan only ever FILLS fields. Every form that uses it keeps its own Save button, and the user
 * checks the values against the document before pressing it.
 */

export type ScanKind = "BILL" | "RECEIPT" | "PAYMENT" | "CONTACT" | "TENDER" | "ITEM_LIST";

export interface ScannedParty {
  name: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
}

export interface ScannedBill {
  documentType: string | null;
  documentNo: string | null;
  documentDate: string | null;
  dueDate: string | null;
  seller: ScannedParty;
  buyer: ScannedParty;
  placeOfSupply: string | null;
  referenceNo: string | null;
  vehicleNo: string | null;
  pricesIncludeTax: boolean | null;
  lines: {
    name: string | null;
    hsn: string | null;
    quantity: number | null;
    unit: string | null;
    rate: number | null;
    discountPercent: number | null;
    taxPercent: number | null;
    amount: number | null;
  }[];
  otherCharges: { label: string | null; amount: number | null }[];
  subtotal: number | null;
  discountTotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  cess: number | null;
  roundOff: number | null;
  grandTotal: number | null;
  paymentTerms: string | null;
  notes: string | null;
  uncertainFields: string[];
}

export interface ScannedReceipt {
  merchantName: string | null;
  merchantGstin: string | null;
  merchantState: string | null;
  receiptNo: string | null;
  date: string | null;
  category: string | null;
  lines: { name: string | null; quantity: number | null; rate: number | null; taxPercent: number | null; amount: number | null }[];
  taxTotal: number | null;
  total: number | null;
  paymentMode: string | null;
  reference: string | null;
  notes: string | null;
  uncertainFields: string[];
}

export interface ScannedPayment {
  amount: number | null;
  date: string | null;
  mode: string | null;
  reference: string | null;
  chequeNo: string | null;
  chequeDate: string | null;
  bankName: string | null;
  payerName: string | null;
  payerAccountLast4: string | null;
  payeeName: string | null;
  payeeAccountLast4: string | null;
  purpose: string | null;
  uncertainFields: string[];
}

export interface ScannedContact {
  name: string | null;
  contactPerson: string | null;
  designation: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bankName: string | null;
  accountNo: string | null;
  ifsc: string | null;
  businessType: string | null;
  uncertainFields: string[];
}

export interface ScannedTender {
  source: string | null;
  department: string | null;
  tenderId: string | null;
  nameOfWork: string | null;
  location: string | null;
  officeAddress: string | null;
  classReq: string | null;
  estimatedCost: number | null;
  fee: number | null;
  emd: number | null;
  emdMode: string | null;
  deadline: string | null;
  hardcopyDue: string | null;
  preBidDate: string | null;
  techOpen: string | null;
  priceOpen: string | null;
  openingDate: string | null;
  duration: string | null;
  validity: string | null;
  dlp: string | null;
  pqCriteria: string | null;
  priceEscalation: string | null;
  gemCategory: string | null;
  msmeRelaxation: string | null;
  experienceTurnover: string | null;
  uncertainFields: string[];
}

export interface ScannedItemList {
  documentNo: string | null;
  date: string | null;
  partyName: string | null;
  site: string | null;
  vehicleNo: string | null;
  lines: { name: string | null; quantity: number | null; unit: string | null; rate: number | null; remarks: string | null }[];
  notes: string | null;
  uncertainFields: string[];
}

export interface ScanResultMap {
  BILL: ScannedBill;
  RECEIPT: ScannedReceipt;
  PAYMENT: ScannedPayment;
  CONTACT: ScannedContact;
  TENDER: ScannedTender;
  ITEM_LIST: ScannedItemList;
}

export type Progress = (message: string) => void;

/** Pages read from one document — matches the server's cap. */
export const MAX_SCAN_PAGES = 5;
/** Longest side of a page image. Enough for small print on an A4 bill; keeps uploads ~0.5 MB a page. */
const PAGE_PX = 2000;

/** Shown on a disabled scan button when the server has no key. */
export const SCAN_NOT_READY = "AI scanning isn't set up on the server yet — the administrator needs to add an AI key (GROQ_API_KEY or OPENROUTER_API_KEY — both free).";

export const SCAN_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export function isScannable(file: File): boolean {
  return isPdf(file) || /^image\/(jpeg|png|webp)$/.test(file.type);
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

// ---- server ------------------------------------------------------------------------------------

let statusCache: Promise<boolean> | null = null;

/** Whether this server has a key configured. Cached for the page's life; a failed check retries. */
export function scanAvailable(): Promise<boolean> {
  statusCache ??= apiRequest<{ available: boolean }>("/api/v1/scan/status")
    .then((r) => !!r.available)
    .catch(() => {
      statusCache = null;
      return false;
    });
  return statusCache;
}

/**
 * Read `file` as a `kind` document. `hints` is short context the model may use — our own GSTIN so
 * it can tell buyer from seller, the expense categories to choose from, and so on.
 */
export async function scanDocument<K extends ScanKind>(
  kind: K,
  file: File,
  opts: { hints?: Record<string, string | null | undefined>; onProgress?: Progress } = {},
): Promise<ScanResultMap[K]> {
  if (!isScannable(file)) throw new Error("Pick a PDF, or a JPEG / PNG photo of the document.");
  const pages = await fileToPages(file, opts.onProgress);
  if (pages.length === 0) throw new Error("That file has no pages to read.");
  opts.onProgress?.("Reading with AI…");
  const hints: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.hints ?? {})) if (v && v.trim()) hints[k] = v.trim();
  const res = await apiRequest<{ kind: string; model: string; data: ScanResultMap[K] }>("/api/v1/scan", {
    method: "POST",
    body: { kind, pages, hints },
  });
  return clean(res.data) as ScanResultMap[K];
}

/** Trim strings, turn "" into null, drop NaN — so forms can test fields with a plain `if`. */
function clean(v: unknown): unknown {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" || /^(null|n\/a|na|-)$/i.test(t) ? null : t;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = clean(x);
    if (!Array.isArray(out.uncertainFields) && "uncertainFields" in out) out.uncertainFields = [];
    return out;
  }
  return v ?? null;
}

// ---- file → page images ------------------------------------------------------------------------

export async function fileToPages(file: File, onProgress?: Progress): Promise<string[]> {
  if (isPdf(file)) return pdfToPages(file, onProgress);
  onProgress?.("Preparing photo…");
  const img = await loadImage(file);
  return [drawToJpeg(img, img.naturalWidth, img.naturalHeight)];
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't open that image. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

function drawToJpeg(src: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, PAGE_PX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images for scanning.");
  // White under transparent PNGs, or the page comes out black once flattened to JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// pdf.js is loaded from jsDelivr on first use, so it doesn't ship in the app bundle.
const PDFJS_VERSION = "3.11.174";
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDoc> };
}
declare global {
  interface Window {
    pdfjsLib?: PdfJs;
  }
}

let pdfjsLoad: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  pdfjsLoad ??= new Promise<PdfJs>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = PDFJS_URL;
    el.async = true;
    el.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) return reject(new Error("The PDF reader didn't start."));
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(lib);
    };
    el.onerror = () => reject(new Error("Couldn't load the PDF reader. Check the internet connection and try again."));
    document.head.appendChild(el);
  }).catch((e) => {
    pdfjsLoad = null;
    throw e;
  });
  return pdfjsLoad;
}

async function pdfToPages(file: File, onProgress?: Progress): Promise<string[]> {
  onProgress?.("Opening PDF…");
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const count = Math.min(doc.numPages, MAX_SCAN_PAGES);
  const pages: string[] = [];
  for (let n = 1; n <= count; n++) {
    onProgress?.(`Preparing page ${n} of ${count}…`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_PX / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(drawToJpeg(canvas, canvas.width, canvas.height));
  }
  return pages;
}

/** The scanned file as a Vyapar-style attachment, so the document stays filed with its record. */
export async function fileToAttachment(
  file: File,
  maxPdfBytes = 4 * 1024 * 1024,
): Promise<{ imageDataUrl: string | null; documentName: string | null; documentDataUrl: string | null } | null> {
  if (isPdf(file)) {
    if (file.size > maxPdfBytes) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("Couldn't read that file."));
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
    return { imageDataUrl: null, documentName: file.name, documentDataUrl: dataUrl };
  }
  const img = await loadImage(file);
  const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { imageDataUrl: canvas.toDataURL("image/jpeg", 0.82), documentName: null, documentDataUrl: null };
}

// ---- helpers the forms share -------------------------------------------------------------------

/** Lower-case letters and digits only — "M/s. Shree Cement Ltd." and "SHREE CEMENT LTD" compare equal. */
export function squash(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\b(m\/s|messrs|pvt|private|ltd|limited|llp|co|company|and|&)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The saved record that is this scanned party: same GSTIN first (unambiguous), then the same name,
 * then one name containing the other ("Shree Cement" ↔ "Shree Cement Traders").
 */
export function matchByNameOrGstin<T extends { name: string; gstin?: string | null }>(
  list: T[],
  name: string | null | undefined,
  gstin?: string | null,
): T | null {
  const g = (gstin ?? "").toUpperCase();
  if (g.length === 15) {
    const hit = list.find((p) => (p.gstin ?? "").toUpperCase() === g);
    if (hit) return hit;
  }
  const n = squash(name);
  if (n.length < 3) return null;
  const exact = list.find((p) => squash(p.name) === n);
  if (exact) return exact;
  const loose = list.filter((p) => {
    const s = squash(p.name);
    return s.length >= 4 && (s.includes(n) || n.includes(s));
  });
  return loose.length === 1 ? loose[0] : null;
}

/** "2026-04-05" when it is a real date, else null — a model can still produce "2026-02-30". */
export function isoDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDate() === +m[3] && d.getUTCMonth() === +m[2] - 1 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 10-digit Indian mobile from whatever was printed ("+91 98250 12345", "098250-12345"). */
export function mobile10(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d || null;
}

export function validGstin(v: string | null | undefined): string | null {
  const g = (v ?? "").toUpperCase().replace(/\s/g, "");
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g) ? g : null;
}

/** GST state codes (the first two digits of a GSTIN) → state name. */
const GST_STATE: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export function stateOfGstin(gstin: string | null | undefined): string | null {
  return gstin ? (GST_STATE[gstin.slice(0, 2)] ?? null) : null;
}

/** Pick the option a free-text state matches ("gujarat", "GJ" won't, "Gujarat " will). */
export function matchOption(options: readonly string[], v: string | null | undefined): string | null {
  const n = squash(v);
  if (!n) return null;
  return options.find((o) => squash(o) === n) ?? null;
}

/**
 * Our bank account a scanned payment went through: the account whose number ends in the digits
 * printed, else the only active account at the named bank. Null rather than a guess.
 */
export function matchBankAccount<T extends { accountNumber: string | null; bankName: string | null; name: string; isActive: boolean }>(
  accounts: T[],
  last4: string | null | undefined,
  bankName: string | null | undefined,
): T | null {
  const active = accounts.filter((a) => a.isActive);
  const digits = (last4 ?? "").replace(/\D/g, "").slice(-4);
  if (digits.length === 4) {
    const hits = active.filter((a) => (a.accountNumber ?? "").replace(/\D/g, "").endsWith(digits));
    if (hits.length === 1) return hits[0];
  }
  const bank = squash(bankName);
  if (bank.length >= 3) {
    const hits = active.filter((a) => {
      const n = squash(a.bankName) || squash(a.name);
      return n.includes(bank) || bank.includes(n);
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 2 || /\d/.test(t)),
  );
}

/** Word-overlap similarity, 0..1. "OPC 53 Grade Cement" vs "Cement OPC-53" ≈ 0.75. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const t of x) if (y.has(t)) common++;
  return common / Math.min(x.size, y.size);
}

/**
 * Pair each of our lines with the scanned line that names the same thing — best pairs first, each
 * scanned line used once. Lines with no convincing partner are left out rather than guessed.
 */
export function pairLines<T>(
  ours: { key: T; name: string }[],
  scanned: { name: string | null }[],
  threshold = 0.5,
): Map<T, number> {
  const pairs: { key: T; idx: number; score: number }[] = [];
  for (const o of ours) {
    scanned.forEach((s, idx) => {
      const score = nameSimilarity(o.name, s.name);
      if (score >= threshold) pairs.push({ key: o.key, idx, score });
    });
  }
  pairs.sort((a, b) => b.score - a.score);
  const out = new Map<T, number>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (out.has(p.key) || used.has(p.idx)) continue;
    out.set(p.key, p.idx);
    used.add(p.idx);
  }
  return out;
}

/** One-line postal address, adding city and PIN when the printed address left them out. */
export function contactAddress(c: Pick<ScannedContact, "address" | "city" | "pincode">): string | null {
  let a = c.address ?? "";
  if (c.city && !a.toLowerCase().includes(c.city.toLowerCase())) a = a ? `${a}, ${c.city}` : c.city;
  if (c.pincode && !a.includes(c.pincode)) a = a ? `${a} - ${c.pincode}` : c.pincode;
  return a.trim() || null;
}

/** Plain-English list: "bill no., date and 4 items". */
export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The note shown after a scan: what was filled, and the standing reminder to check before saving. */
export function filledNote(
  filled: string[],
  uncertain: string[] | undefined,
  extra = "",
): { tone: "good" | "warn"; text: string } {
  if (filled.length === 0) {
    return {
      tone: "warn",
      text: `Couldn't find anything to fill on this document. A sharp, straight-on photo in good light reads best.${extra ? ` ${extra}` : ""}`,
    };
  }
  const unsure = (uncertain ?? []).length;
  return {
    tone: unsure > 0 || extra ? "warn" : "good",
    text:
      `Filled ${listJoin(filled)} from the scan.` +
      (unsure ? ` ${unsure} value${unsure === 1 ? " was" : "s were"} hard to read (${(uncertain ?? []).slice(0, 4).join(", ")}${unsure > 4 ? "…" : ""}).` : "") +
      (extra ? ` ${extra}` : "") +
      " Check everything against the document, then Save.",
  };
}
