// KAN-133: Tender → Letter correspondence (tender-service, /api/v1/tenders/letters).
import { apiRequest } from "./api";

export interface TenderLetter {
  id: number;
  /** yyyy-MM-dd */
  letterDate: string | null;
  referenceNo: string | null;
  description: string | null;
  /** WhatsApp, Email, or a user-added channel. */
  receivedThrough: string | null;
  notes: string | null;
  /** Optional tender number this letter is about. */
  tenderRef: string | null;
  createdAt: string | null;
  /** KAN-138: RECEIVED (came in) or SENT (we sent it). `receivedThrough` holds "Send By" for SENT. */
  direction: "RECEIVED" | "SENT";
}

export type TenderLetterInput = Omit<TenderLetter, "id" | "createdAt">;

export interface LetterChannel {
  name: string;
  /** WhatsApp and Email — always there, can't be removed. */
  builtIn: boolean;
}

const BASE = "/api/v1/tenders/letters";

export const listLetters = () => apiRequest<TenderLetter[]>(BASE);
export const createLetter = (body: TenderLetterInput) => apiRequest<TenderLetter>(BASE, { method: "POST", body });
export const updateLetter = (id: number, body: TenderLetterInput) =>
  apiRequest<TenderLetter>(`${BASE}/${id}`, { method: "PUT", body });
export const deleteLetter = (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });

export const listLetterChannels = () => apiRequest<LetterChannel[]>(`${BASE}/channels`);
export const addLetterChannel = (name: string) =>
  apiRequest<LetterChannel[]>(`${BASE}/channels`, { method: "POST", body: { name } });
export const removeLetterChannel = (name: string) =>
  apiRequest<LetterChannel[]>(`${BASE}/channels?name=${encodeURIComponent(name)}`, { method: "DELETE" });
