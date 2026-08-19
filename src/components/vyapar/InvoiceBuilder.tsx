"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { TypeaheadPicker } from "@/components/vyapar/TypeaheadPicker";
import { ItemDialog } from "@/components/vyapar/ItemDialog";
import { PartyDialog } from "@/components/vyapar/PartyDialog";
import { LinkPaymentDialog } from "@/components/vyapar/LinkPaymentDialog";
// Aliased: `calc` below uses a local `qty` accumulator, and shadowing the formatter would be a trap.
import { inr, qty as formatQty } from "@/lib/format";
import { usePaymentTypeOptions } from "@/lib/bankScope";
import { GST_RATE_OPTIONS, ITC_ELIGIBILITY, ITC_DEFAULT, gstCodeForPercent, gstPercent } from "@/lib/gstRates";
import { downloadInvoicePdf } from "@/lib/vyaparExport";
import { shareInvoice } from "@/components/vyapar/TxnRowActions";
import { useVyaparSettings } from "@/lib/useVyaparSettings";
import type { PoDraft } from "@/lib/poHandoff";
import { useVyaparProjectId } from "@/lib/projectScope";
import { useProjects } from "@/lib/useProjects";
import * as vyapar from "@/lib/vyaparApi";
import { STATES_OF_SUPPLY } from "@/lib/vyaparApi";
import type { DocType, Invoice, Item, Party } from "@/lib/vyaparApi";
import {
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  ImageIcon,
  Link2,
  Plus,
  Printer,
  Share2,
  Trash2,
  X,
} from "lucide-react";

const UNITS = ["NONE", "PCS", "NOS", "KG", "TON", "MTR", "SQM", "CUM", "BAG", "BOX", "LTR", "HOUR"];

/** Downscale an image in the browser and hand back a data URL — same helper shape as ItemDialog. */
function readImageAsDataUrl(file: File, maxPx = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** A supporting file (supplier's PDF, signed challan) read straight through as a data URL. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Attachments live inside the row the API sends, so keep them small enough to post. */
const MAX_DOC_BYTES = 4 * 1024 * 1024;

/** The heading printed above the terms block — Vyapar's "Title" dropdown. */
const TERMS_TITLES = ["Terms and Conditions", "Sale Invoice", "Purchase Bill", "Note", "Declaration"];

/**
 * The prefixes configured for one document type in Settings → Transaction.
 *
 * Kept out of the component so the parse (and its guard against a malformed blob) doesn't sit
 * inside a `useMemo` body, which the React compiler can't memoize through a try/catch.
 */
function configuredPrefixes(json: string | null, docType: DocType): string[] {
  if (!json) return [];
  try {
    const byType = JSON.parse(json) as Record<string, string>;
    const raw = byType[docType];
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

type LineDraft = {
  itemId: number | null;
  itemName: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  /** The GST code from the Tax picker; the rate is derived from it, never typed. */
  taxCode: string;
  /** Purchase lines only. */
  itcEligibility: string;
};

const emptyLine = (isPurchase: boolean): LineDraft => ({
  itemId: null,
  itemName: "",
  description: "",
  unit: "NONE",
  quantity: 1,
  rate: 0,
  discountPercent: 0,
  taxCode: "NONE",
  itcEligibility: isPurchase ? ITC_DEFAULT : "",
});

/**
 * Invoice builder modelled on Vyapar's own Sale/Purchase form: Credit↔Cash toggle, prefixed
 * invoice number, place of supply, a spreadsheet-style line grid with per-line discount and tax,
 * a totals row, terms & conditions, whole-document discount and round-off.
 */
export function InvoiceBuilder({
  docType,
  existing,
  parties,
  items,
  onClose,
  onSaved,
  onItemCreated,
  onPartyCreated,
  projectId: projectOverride,
  initialAttachment,
  prefill,
}: {
  docType: DocType;
  existing?: Invoice;
  parties: Party[];
  items: Item[];
  onClose: () => void;
  /** `again` is true when the user chose Save & New, so the form should stay open. */
  onSaved: (again?: boolean) => void;
  /** Lets the parent fold an inline-created master into its own list without a full reload. */
  onItemCreated?: (item: Item) => void;
  onPartyCreated?: (party: Party) => void;
  /** Pre-selects (and effectively fixes) the project when opened inside a project workspace. */
  projectId?: number;
  /**
   * A bill picked in Upload Bill, pre-attached to this document. Only meaningful on a new
   * document — an existing one already carries whatever was filed against it.
   */
  initialAttachment?: { imageDataUrl: string | null; documentName: string | null; documentDataUrl: string | null };
  /**
   * A document started elsewhere — today, a purchase order carried over from an awarded RFQ.
   * Only meaningful on a new document: an `existing` one already has its own values, and they win.
   */
  prefill?: PoDraft;
}) {
  const projectId = useVyaparProjectId(projectOverride);
  const { projects } = useProjects();
  const paymentTypeOptions = usePaymentTypeOptions();
  // The form's shape follows Settings, as it does in Vyapar: due dates, round-off behaviour and
  // which grid columns exist are all switches, not hardcoded decisions.
  const { settings } = useVyaparSettings();
  const isPurchase = docType === "PURCHASE";
  // Estimates, proformas, sale orders and delivery challans are planning docs: they don't move stock
  // or party balance (see vyapar-service POSTED). So: no cash/credit toggle, no received amount.
  const isQuote = docType === "ESTIMATE" || docType === "PROFORMA";
  const isOrder = docType === "SALE_ORDER" || docType === "PURCHASE_ORDER";
  const isChallan = docType === "DELIVERY_CHALLAN";
  // Returns (credit/debit notes) DO move the balance, but Vyapar shows no cash/credit toggle on them.
  const isReturn = docType === "SALE_RETURN" || docType === "PURCHASE_RETURN";
  // Purchase-family docs pick suppliers, not customers.
  const isSupplierSide = docType === "PURCHASE" || docType === "PURCHASE_ORDER" || docType === "PURCHASE_RETURN";
  const noPayment = isQuote || isOrder || isChallan;
  // Vyapar drives purchase paid/unpaid from a "Paid" amount, not a cash/credit toggle.
  const noToggle = noPayment || isReturn || isPurchase;
  const partyRequired = noPayment || isReturn || isPurchase;
  const singleNumber = noPayment || isReturn || isPurchase; // Bill/Ref/Order/Challan/Return No. — no prefix
  // Vyapar hides Due Date behind Settings → Transaction → "Due Dates and Payment Terms"; orders
  // and challans carry their own delivery date regardless.
  const showDueDate = (docType === "SALE" && settings.dueDatesEnabled) || isOrder || isChallan;
  const moneyLabel = isPurchase ? "Paid" : "Received"; // money out vs money in
  const numberLabel = isPurchase
    ? "Bill Number"
    : isOrder
      ? "Order No."
      : isChallan
        ? "Challan No."
        : isReturn
          ? "Return No."
          : isQuote
            ? "Ref No."
            : "Invoice Number";
  const dateLabel = isPurchase ? "Bill Date" : isOrder ? "Order Date" : isReturn ? "Date" : "Invoice Date";
  const docHeading =
    docType === "ESTIMATE"
      ? "Estimate / Quotation"
      : docType === "PROFORMA"
        ? "Proforma Invoice"
        : docType === "SALE_ORDER"
          ? "Sale Order"
          : docType === "PURCHASE_ORDER"
            ? "Purchase Order"
            : docType === "DELIVERY_CHALLAN"
              ? "Delivery Challan"
            : docType === "SALE_RETURN"
              ? "Credit Note"
              : docType === "PURCHASE_RETURN"
                ? "Debit Note"
                : isPurchase
                  ? "Purchase"
                  : "Sale";

  // Sales default to cash (fully received); purchases default to unpaid until a Paid amount is entered.
  const [isCash, setIsCash] = useState(existing?.isCash ?? docType !== "PURCHASE");
  const [partyId, setPartyId] = useState(
    existing?.partyId ? String(existing.partyId) : prefill?.partyId ? String(prefill.partyId) : ""
  );
  /** What's typed in the party box — kept apart from `partyId` so free text can be searched. */
  const [partyText, setPartyText] = useState(existing?.partyName ?? prefill?.partyName ?? "");
  // Inline creation, so an unknown item or party doesn't force the document to be abandoned.
  const [creatingItem, setCreatingItem] = useState<{ idx: number; name: string } | null>(null);
  const [creatingParty, setCreatingParty] = useState<string | null>(null);
  // Other open bills this document's receipt also settles.
  const [linkingPayment, setLinkingPayment] = useState(false);
  const [paymentLinks, setPaymentLinks] = useState<{ invoiceId: number; amount: number }[]>([]);
  // Which construction project this document belongs to — defaults to the header scope, editable.
  const [selectedProjectId, setSelectedProjectId] = useState(
    existing?.projectId != null
      ? String(existing.projectId)
      : prefill?.projectId != null
        ? String(prefill.projectId)
        : projectId != null
          ? String(projectId)
          : ""
  );
  const [phone, setPhone] = useState("");
  /** Walk-in billing address, used when a cash bill isn't tied to a saved party. */
  const [billingAddress, setBillingAddress] = useState(existing?.billingAddress ?? "");
  const [invoicePrefix, setInvoicePrefix] = useState(existing?.invoicePrefix ?? "");
  const [invoiceNo, setInvoiceNo] = useState(existing?.invoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    existing?.invoiceDate ?? prefill?.orderDate ?? new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? prefill?.deliveryDate ?? "");
  const [stateOfSupply, setStateOfSupply] = useState(existing?.stateOfSupply ?? "");
  const [terms, setTerms] = useState(
    existing?.terms ?? prefill?.terms ?? "Thank you for doing business with us."
  );
  const [termsTitle, setTermsTitle] = useState(isPurchase ? "Purchase Bill" : "Sale Invoice");
  /** Vyapar lets the round-off figure itself be nudged by hand. */
  const [roundOffOverride, setRoundOffOverride] = useState<number | null>(null);
  const [notes, setNotes] = useState(existing?.notes ?? prefill?.notes ?? "");
  const [discountPercent, setDiscountPercent] = useState(existing?.discountPercent ?? 0);
  const [discountAmount, setDiscountAmount] = useState(existing?.discount ?? prefill?.discountAmount ?? 0);
  const [roundOffOn, setRoundOffOn] = useState(true);
  // Vyapar's Price/Unit column can be entered tax-inclusive or exclusive; the toggle applies to every row.
  const [priceHasTax, setPriceHasTax] = useState(false);
  // Received amount, so a sale can be saved fully/partly paid — mirrors Vyapar's Received / Balance.
  const [received, setReceived] = useState(existing?.paidAmount ?? 0);
  const [receivedTouched, setReceivedTouched] = useState(existing != null);
  /** Vyapar's ☑ next to Received — off books the document as fully outstanding. */
  const [receiveOn, setReceiveOn] = useState(existing ? (existing.paidAmount ?? 0) > 0 : true);
  /** Cheque/NEFT number for the received portion. */
  const [paymentReference, setPaymentReference] = useState(existing?.paymentReference ?? "");
  // Payment mode for the received portion — Vyapar's "Payment Type" picker on a paid invoice.
  const [paymentMode, setPaymentMode] = useState(
    existing?.paymentType && existing.paymentType !== "Credit" ? existing.paymentType : "Cash"
  );
  /**
   * Vyapar's "+ Add Payment type": the money can arrive split across accounts (part cash, part
   * bank). The first line stays on the document itself as its `paidAmount`; each extra line is
   * posted as a real payment linked to this document, which is the same machinery the Link Payment
   * path already uses — so the server, not the form, recomputes what the document is left owing.
   */
  const [extraPayments, setExtraPayments] = useState<{ mode: string; reference: string; amount: number }[]>([]);
  const [lines, setLines] = useState<LineDraft[]>(
    existing?.lines.length
      ? existing.lines.map((l) => ({
          itemId: l.itemId,
          itemName: l.itemName,
          description: l.description ?? "",
          unit: l.unit ?? "NONE",
          quantity: l.quantity,
          rate: l.rate,
          discountPercent: l.discountPercent,
          // Rows saved before the Tax column became a code carry only a percent; read it as
          // intra-state GST, which is what the old picker meant.
          taxCode: l.taxCode ?? gstCodeForPercent(l.taxPercent),
          itcEligibility: l.itcEligibility ?? (isPurchase ? ITC_DEFAULT : ""),
        }))
      : prefill?.lines.length
        ? prefill.lines.map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            rate: l.rate,
            discountPercent: 0,
            taxCode: l.taxCode,
            itcEligibility: isPurchase ? ITC_DEFAULT : "",
          }))
        : [emptyLine(isPurchase), emptyLine(isPurchase)]
  );
  /** Vyapar's ADD DESCRIPTION / ADD IMAGE / ADD DOCUMENT, carried with the document. */
  const [description, setDescription] = useState(existing?.description ?? "");
  const [showDescription, setShowDescription] = useState(!!existing?.description);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(
    existing?.imageDataUrl ?? initialAttachment?.imageDataUrl ?? null
  );
  const [documentName, setDocumentName] = useState<string | null>(
    existing?.documentName ?? initialAttachment?.documentName ?? null
  );
  const [documentDataUrl, setDocumentDataUrl] = useState<string | null>(
    existing?.documentDataUrl ?? initialAttachment?.documentDataUrl ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /**
   * A signature of everything the user can edit. Comparing it against the value captured on mount
   * tells us whether closing would throw work away — which is what Vyapar's "Current changes will
   * be discarded" prompt guards. Comparing a snapshot rather than setting a flag in every setter
   * means an edit that's typed and then undone correctly reads as clean.
   */
  const signature = JSON.stringify({
    partyId, selectedProjectId, invoicePrefix, invoiceNo, invoiceDate, dueDate, stateOfSupply,
    terms, notes, discountPercent, discountAmount, roundOffOn, priceHasTax, received, isCash,
    paymentMode, paymentReference, receiveOn, partyText, lines,
    description, imageDataUrl, documentName, documentDataUrl,
  });
  // Captured on the first render only — state, not a ref, so nothing is read during render.
  // A prefilled form starts dirty: it holds real work the moment it opens, the draft behind it has
  // already been consumed, and losing an awarded PO to a stray click on the backdrop is exactly
  // what this guard is for.
  const [initialSignature] = useState(prefill ? "" : signature);
  const dirty = signature !== initialSignature;

  /** Mirrors the server's maths exactly so the on-screen preview always matches what gets saved. */
  const calc = useMemo(() => {
    let qty = 0;
    let discTotal = 0;
    let taxTotal = 0;
    let net = 0;
    const rows = lines.map((l) => {
      const taxPct = gstPercent(l.taxCode);
      const rawRate = Number(l.rate) || 0;
      // When the price is entered "with tax", strip the tax back out to get the taxable base.
      const baseRate = priceHasTax ? rawRate / (1 + taxPct / 100) : rawRate;
      const gross = (Number(l.quantity) || 0) * baseRate;
      const disc = (gross * (Number(l.discountPercent) || 0)) / 100;
      const taxable = gross - disc;
      const tax = (taxable * taxPct) / 100;
      qty += Number(l.quantity) || 0;
      discTotal += disc;
      taxTotal += tax;
      net += taxable;
      return { disc, tax, amount: taxable + tax, baseRate };
    });
    const headerDisc = discountPercent > 0 ? (net * discountPercent) / 100 : Number(discountAmount) || 0;
    const beforeRound = net + taxTotal - headerDisc;
    // Round-off follows Settings → Transaction: Nearest/Up/Down, to 1, 10 or 100. We used to
    // hardcode "nearest rupee", which is only one of nine combinations Vyapar offers.
    const step = settings.roundOffTo > 0 ? settings.roundOffTo : 1;
    const rounded =
      settings.roundOffMode === "UP"
        ? Math.ceil(beforeRound / step) * step
        : settings.roundOffMode === "DOWN"
          ? Math.floor(beforeRound / step) * step
          : Math.round(beforeRound / step) * step;
    // A hand-typed round-off wins over the computed one, until the checkbox is cleared.
    const roundOff = !roundOffOn ? 0 : (roundOffOverride ?? rounded - beforeRound);
    return { rows, qty, discTotal, taxTotal, net, headerDisc, roundOff, total: beforeRound + roundOff };
  }, [
    lines, discountPercent, discountAmount, roundOffOn, priceHasTax, roundOffOverride,
    settings.roundOffMode, settings.roundOffTo,
  ]);

  // Received defaults to the full total on a cash bill and nothing on credit, until the user edits it.
  const displayReceived = !receiveOn ? 0 : receivedTouched ? received : isCash ? calc.total : 0;
  const balanceDue = Math.max(0, calc.total - displayReceived);
  const selectedParty = parties.find((p) => String(p.id) === partyId) ?? null;

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  /** Reorder a line. Vyapar lets rows be dragged; up/down covers the same need without a DnD lib. */
  function moveLine(idx: number, delta: number) {
    setLines((prev) => {
      const to = idx + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  /** Picking a party pulls in its phone and, for a sale, its state as the place of supply. */
  function pickParty(p: Party) {
    setPartyId(String(p.id));
    setPartyText(p.name);
    setPhone(p.phone ?? "");
    if (p.state && STATES_OF_SUPPLY.includes(p.state)) setStateOfSupply(p.state);
  }

  /** Choosing a catalogue item fills in its rate, unit and tax — the usual billing shortcut. */
  function applyItem(idx: number, item: Item) {
    setLine(idx, {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit || "NONE",
      rate: isPurchase ? item.purchasePrice : item.salePrice,
      // The catalogue stores a bare rate, so read it as intra-state GST — the picker can be
      // switched to the IGST twin on the line if this supply crosses a state border.
      taxCode: gstCodeForPercent(item.taxPercent),
    });
  }

  /** Returns the saved document so the Print / Share actions can act on it, or null if it failed. */
  async function save(again = false): Promise<Invoice | null> {
    const clean = lines.filter((l) => l.itemName.trim());
    if (clean.length === 0) {
      setError("Add at least one item.");
      return null;
    }
    // A credit bill must be tied to a party so the outstanding balance has an owner.
    if (!isCash && !partyId && !noToggle) {
      setError(`Select a ${isPurchase ? "supplier" : "customer"} for a credit bill.`);
      return null;
    }
    // Planning docs and returns always need a party.
    if (partyRequired && !partyId) {
      setError("Select a party.");
      return null;
    }
    // Every document must be booked against a project.
    if (!selectedProjectId) {
      setError("Select a project.");
      return null;
    }
    setSaving(true);
    setError("");
    try {
      const body: vyapar.InvoiceInput = {
        docType,
        projectId: selectedProjectId ? Number(selectedProjectId) : null,
        invoiceNo: invoiceNo || undefined,
        invoicePrefix: invoicePrefix || null,
        partyId: partyId ? Number(partyId) : null,
        invoiceDate,
        dueDate: dueDate || null,
        discount: discountPercent > 0 ? 0 : Number(discountAmount) || 0,
        discountPercent: Number(discountPercent) || 0,
        roundOff: calc.roundOff,
        paidAmount: noPayment ? 0 : Math.min(displayReceived, calc.total),
        isCash: noPayment ? false : isCash,
        paymentType: noPayment ? "Credit" : displayReceived > 0 ? paymentMode : "Credit",
        paymentReference: displayReceived > 0 ? paymentReference || null : null,
        // Only meaningful on a cash bill with no party — otherwise the party carries the address.
        billingName: !partyId && partyText.trim() ? partyText.trim() : null,
        billingAddress: !partyId && billingAddress.trim() ? billingAddress.trim() : null,
        stateOfSupply: stateOfSupply || null,
        terms: terms || null,
        notes: notes || null,
        description: description.trim() || null,
        imageDataUrl,
        documentName,
        documentDataUrl,
        lines: clean.map((l) => {
          const taxPct = gstPercent(l.taxCode);
          const rawRate = Number(l.rate) || 0;
          // Persist the tax-exclusive base rate; the server re-applies tax on top.
          const rate = priceHasTax ? Number((rawRate / (1 + taxPct / 100)).toFixed(2)) : rawRate;
          return {
            itemId: l.itemId,
            itemName: l.itemName.trim(),
            description: l.description || null,
            unit: l.unit === "NONE" ? null : l.unit,
            quantity: Number(l.quantity) || 1,
            rate,
            discountPercent: Number(l.discountPercent) || 0,
            taxPercent: taxPct,
            taxCode: l.taxCode,
            // ITC is a claim on what you buy — a sale line has no such concept.
            itcEligibility: isPurchase ? l.itcEligibility || null : null,
          };
        }),
      };
      // When the receipt also settles other bills, the money can't live on this document's
      // paidAmount alone — it becomes a real payment whose links the server uses to recompute
      // every touched document's paid amount (including this one).
      const spreading = !noPayment && paymentLinks.length > 0 && displayReceived > 0;
      if (spreading) body.paidAmount = 0;

      const saved = existing
        ? await vyapar.updateInvoice(existing.id, body)
        : await vyapar.createInvoice(body);

      if (spreading) {
        const spentElsewhere = paymentLinks.reduce((s, l) => s + l.amount, 0);
        const onThisDoc = Math.max(0, Math.min(displayReceived - spentElsewhere, calc.total));
        await vyapar.createPayment({
          direction: isPurchase ? "OUT" : "IN",
          partyId: Number(partyId),
          amount: displayReceived,
          mode: paymentMode,
          reference: paymentReference || null,
          paymentDate: invoiceDate,
          projectId: selectedProjectId ? Number(selectedProjectId) : null,
          links: [
            ...(onThisDoc > 0 ? [{ invoiceId: saved.id, amount: onThisDoc }] : []),
            ...paymentLinks,
          ],
        });
      }

      // Split payment: each extra "Payment type" line is its own receipt against this document.
      // Posting them rather than folding them into paidAmount keeps the account each portion
      // landed in visible — which is the whole point of splitting it.
      for (const p of extraPayments) {
        if (p.amount <= 0 || !partyId) continue;
        await vyapar.createPayment({
          direction: isPurchase ? "OUT" : "IN",
          partyId: Number(partyId),
          amount: p.amount,
          mode: p.mode,
          reference: p.reference || null,
          paymentDate: invoiceDate,
          projectId: selectedProjectId ? Number(selectedProjectId) : null,
          links: [{ invoiceId: saved.id, amount: p.amount }],
        });
      }
      if (again) {
        // Vyapar's "Save & New": keep the form open with a clean slate and the party retained, so
        // a run of documents for the same customer can be entered without reopening the form.
        setInvoiceNo("");
        setLines([emptyLine(isPurchase), emptyLine(isPurchase)]);
        setDescription("");
        setShowDescription(false);
        setImageDataUrl(null);
        setDocumentName(null);
        setDocumentDataUrl(null);
        setReceived(0);
        setReceivedTouched(false);
        setNotes("");
        setDiscountPercent(0);
        setDiscountAmount(0);
        setSaving(false);
      }
      onSaved(again);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this document.");
      setSaving(false);
      return null;
    }
  }

  /**
   * Vyapar's Print / Share act on a real document, so an unsaved form is saved first — the same
   * order Vyapar uses. The drawer stays open afterwards so the user can keep editing.
   */
  async function saveThen(action: "print" | "share") {
    const saved = await save(false);
    if (!saved) return;
    if (action === "print") await downloadInvoicePdf(saved, selectedParty, items);
    else shareInvoice(saved, parties);
  }

  /**
   * Every party is selectable on every document.
   *
   * Vyapar has no customer/supplier field at all — the direction is derived from the transactions
   * a party appears in, so the same firm can both buy from you and sell to you. We keep the
   * `partyType` column (it drives grouping and reporting elsewhere) but no longer filter by it:
   * hiding a supplier from a sale was the concrete bug that behaviour caused. The likely side is
   * sorted first so the common case is still one keystroke away.
   */
  /**
   * Prefixes offered for this document type, plus whatever the document already carries (so
   * editing an old bill never silently rewrites its number) and a "None" escape.
   */
  const existingPrefix = existing?.invoicePrefix ?? "";
  const configuredPrefixList = settings.prefixes;
  const prefixOptions = useMemo(() => {
    const all = [
      ...new Set([...configuredPrefixes(configuredPrefixList, docType), ...(existingPrefix ? [existingPrefix] : [])]),
    ];
    return [{ value: "", label: "None" }, ...all.map((p) => ({ value: p, label: p }))];
  }, [configuredPrefixList, docType, existingPrefix]);

  const partyOptions = useMemo(() => {
    const wanted = isSupplierSide ? "SUPPLIER" : "CUSTOMER";
    return [...parties].sort((a, b) => {
      const rank = (p: Party) => (p.partyType === wanted ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  }, [parties, isSupplierSide]);

  return (
    <Drawer
      title={existing ? existing.invoiceNo : docHeading}
      onClose={onClose}
      onSave={() => save(false)}
      // Only offered when creating — "Save & New" on an edit would be a confusing no-op.
      onSaveAndNew={existing ? undefined : () => save(true)}
      saveLabel={saving ? "Saving…" : "Save"}
      dirty={dirty}
      width="max-w-6xl"
      footer={
        <>
          {/* Vyapar keeps LINK PAYMENT permanently in the bottom-left of a document form: the
              money received with this bill can settle *other* open bills for the same party.
              We used to hide it until an amount had been typed, so it looked missing. */}
          <button
            type="button"
            disabled={noPayment || !partyId}
            title={
              noPayment
                ? "This document type doesn't carry a payment."
                : !partyId
                  ? "Pick a party first — a receipt has to belong to someone."
                  : "Settle other open bills for this party with this receipt"
            }
            onClick={() => setLinkingPayment(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold tracking-wide text-white uppercase transition-all duration-150 hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            <Link2 size={14} /> Link Payment
            {paymentLinks.length > 0 && (
              <span className="rounded bg-white/25 px-1.5 text-xs">{paymentLinks.length}</span>
            )}
          </button>
          <SaveMenu
            onPrint={() => saveThen("print")}
            onShare={() => saveThen("share")}
            onSaveAndNew={existing ? undefined : () => save(true)}
            busy={saving}
          />
        </>
      }
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* Credit ↔ Cash toggle, exactly like Vyapar's form header (payment docs only) */}
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-800">{docHeading}</span>
          {!noToggle && (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${!isCash ? "font-medium text-brand-accent" : "text-gray-400"}`}>Credit</span>
              <button
                type="button"
                role="switch"
                aria-checked={isCash}
                onClick={() => setIsCash((c) => !c)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isCash ? "bg-brand-accent" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${isCash ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span className={`text-sm ${isCash ? "font-medium text-brand-accent" : "text-gray-400"}`}>Cash</span>
            </div>
          )}
        </div>

        {/* Party on the left, document meta on the right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Project *">
              <Select
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                placeholder="Select project"
                options={[{ value: "", label: "Select project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <div>
              <Field label={isCash && !partyRequired ? "Billing Name (Optional)" : partyRequired ? "Party *" : isPurchase ? "Supplier *" : "Customer *"}>
                <TypeaheadPicker<Party>
                  value={partyText}
                  onChange={(text) => {
                    setPartyText(text);
                    // Editing the text clears the selection until another party is picked.
                    setPartyId("");
                  }}
                  rows={partyOptions}
                  getKey={(p) => p.id}
                  getLabel={(p) => p.name}
                  columns={[
                    {
                      label: "Balance",
                      get: (p) => inr(Math.abs(p.balance)),
                      className: (p) => (p.balance >= 0 ? "text-emerald-600" : "text-rose-600"),
                    },
                  ]}
                  onPick={pickParty}
                  onCreate={(typed) => setCreatingParty(typed)}
                  createLabel="Add Party"
                  placeholder="Search by Name/Phone"
                />
              </Field>
              {selectedParty && (
                <div className={`mt-1 text-xs font-medium ${selectedParty.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  Bal: {inr(Math.abs(selectedParty.balance))} {selectedParty.balance >= 0 ? "to receive" : "to pay"}
                </div>
              )}
            </div>
            <Field label="Phone No.">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="Phone No." />
            </Field>

            {/* Cash mode: Vyapar drops the party requirement and takes a walk-in's name and
                address instead, with the saved-party list tucked behind SHOW PARTIES. */}
            {isCash && !partyRequired && (
              <Field label="Billing Address">
                <textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder="Billing Address"
                />
              </Field>
            )}
          </div>

          <div className="space-y-3">
            {singleNumber ? (
              <Field label={numberLabel}>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Auto"
                  className="input"
                />
              </Field>
            ) : (
              <Field label={numberLabel}>
                <div className="flex gap-2">
                  {/* Vyapar picks the prefix from the ones configured per document type in
                      Settings → Transaction, rather than letting each bill invent its own. */}
                  <Select
                    value={invoicePrefix}
                    onChange={setInvoicePrefix}
                    size="sm"
                    className="w-36"
                    options={prefixOptions}
                  />
                  <input
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="Auto"
                    className="input flex-1"
                  />
                </div>
              </Field>
            )}
            <div className={showDueDate ? "grid grid-cols-2 gap-3" : ""}>
              <Field label={dateLabel}>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} placeholder={dateLabel.toLowerCase()} />
              </Field>
              {showDueDate && (
                <Field label="Due Date">
                  <DatePicker value={dueDate} onChange={setDueDate} min={invoiceDate || undefined} placeholder="Due date" />
                </Field>
              )}
            </div>
            <Field label="State of supply">
              <Select
                value={stateOfSupply}
                onChange={setStateOfSupply}
                placeholder="Select"
                options={[{ value: "", label: "Select" }, ...STATES_OF_SUPPLY.map((s) => ({ value: s, label: s }))]}
              />
            </Field>
          </div>
        </div>

        {/* Line grid */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className={`w-full ${isPurchase ? "min-w-[1120px]" : "min-w-[1000px]"} border-collapse text-sm`}>
            <thead>
              {/* Vyapar groups the grid header: DISCOUNT and TAX each span a % and an Amount
                  column, so the two pairs read as one concept rather than four loose columns. */}
              <tr className="border-b border-gray-100 bg-gray-50 text-center text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th colSpan={6} className="px-2 pt-2" />
                <th colSpan={2} className="border-l border-gray-200 px-2 pt-2">Discount</th>
                <th colSpan={2} className="border-l border-gray-200 px-2 pt-2">Tax</th>
                <th colSpan={2} className="px-2 pt-2" />
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Description</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-24 px-2 py-2">Unit</th>
                <th className="w-32 px-2 py-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span>Price/Unit</span>
                    <select
                      value={priceHasTax ? "with" : "without"}
                      onChange={(e) => setPriceHasTax(e.target.value === "with")}
                      className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-normal normal-case text-gray-600 outline-none focus:border-cyan-500"
                    >
                      <option value="without">Without Tax</option>
                      <option value="with">With Tax</option>
                    </select>
                  </div>
                </th>
                <th className="w-20 px-2 py-1 text-right">%</th>
                <th className="w-24 px-2 py-1 text-right">Amount</th>
                {/* Wide enough for "Ineligible as Per Section 17(5)" — the longest ITC label. */}
                <th className={`${isPurchase ? "w-56" : "w-32"} px-2 py-1 text-right`}>%</th>
                <th className="w-24 px-2 py-1 text-right">Amount</th>
                <th className="w-28 px-2 py-2 text-right">Amount</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} className="group/row border-b border-gray-50 align-top last:border-b-0 hover:bg-cyan-50/20">
                  {/* Vyapar reveals a move handle and a delete on hover at the row start. */}
                  <td className="group/num px-1 py-1.5 text-center text-xs text-gray-400">
                    <span className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        title="Move row up"
                        aria-label={`Move row ${idx + 1} up`}
                        disabled={idx === 0}
                        onClick={() => moveLine(idx, -1)}
                        className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 hover:text-brand-accent disabled:!opacity-0"
                      >
                        <GripVertical size={12} />
                      </button>
                      <span>{idx + 1}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <TypeaheadPicker<Item>
                      value={l.itemName}
                      // Typing over a picked item detaches it — the line becomes a free-text entry,
                      // which Vyapar allows for one-off charges that aren't in the catalogue.
                      onChange={(text) => setLine(idx, { itemName: text, itemId: null })}
                      rows={items}
                      getKey={(i) => i.id}
                      getLabel={(i) => i.name}
                      columns={[
                        { label: "Sale Price", get: (i) => inr(i.salePrice) },
                        { label: "Purchase Price", get: (i) => inr(i.purchasePrice) },
                        {
                          label: "Stock",
                          get: (i) => formatQty(i.stockQty),
                          className: (i) => (i.lowStock ? "text-rose-600" : "text-emerald-600"),
                        },
                      ]}
                      onPick={(item) => applyItem(idx, item)}
                      onCreate={(typed) => setCreatingItem({ idx, name: typed })}
                      createLabel="Add Item"
                      placeholder="Item name"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.description}
                      onChange={(e) => setLine(idx, { description: e.target.value })}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <Num value={l.quantity} onChange={(v) => setLine(idx, { quantity: v })} />
                  <td className="px-2 py-1.5">
                    <Select value={l.unit} onChange={(v) => setLine(idx, { unit: v })} size="sm" options={UNITS.map((u) => ({ value: u, label: u }))} />
                  </td>
                  <Num value={l.rate} onChange={(v) => setLine(idx, { rate: v })} />
                  <Num value={l.discountPercent} onChange={(v) => setLine(idx, { discountPercent: v })} />
                  {/* Discount ₹ is editable in Vyapar and back-solves the percentage. */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={calc.rows[idx] ? Number(calc.rows[idx].disc.toFixed(2)) : 0}
                      onChange={(e) => {
                        const amount = Number(e.target.value) || 0;
                        const gross = (Number(l.quantity) || 0) * (calc.rows[idx]?.baseRate ?? 0);
                        setLine(idx, { discountPercent: gross > 0 ? (amount / gross) * 100 : 0 });
                      }}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  {/* Vyapar's Tax cell: the GST code, plus (on a purchase) the ITC claim beneath
                      it. Both are pickers — an arbitrary typed rate is how you end up with a 17%
                      line that no return will accept. */}
                  <td className="px-2 py-1.5 align-top">
                    <Select
                      value={l.taxCode}
                      onChange={(v) => setLine(idx, { taxCode: v })}
                      size="sm"
                      placeholder="Select"
                      options={GST_RATE_OPTIONS}
                    />
                    {isPurchase && (
                      <div className="mt-1">
                        <Select
                          value={l.itcEligibility}
                          onChange={(v) => setLine(idx, { itcEligibility: v })}
                          size="sm"
                          placeholder="ITC eligibility"
                          title="Input tax credit eligibility"
                          options={ITC_ELIGIBILITY.map((o) => ({ value: o, label: o }))}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{calc.rows[idx] ? inr(calc.rows[idx].tax) : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-gray-800">{calc.rows[idx] ? inr(calc.rows[idx].amount) : "—"}</td>
                  <td className="px-1 py-1.5">
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {/* Totals row, as in Vyapar's grid footer */}
              <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
                <td className="px-2 py-2" />
                <td className="px-2 py-2">
                  <button
                    onClick={() => setLines((p) => [...p, emptyLine(isPurchase)])}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </td>
                <td className="px-2 py-2 text-right text-xs text-gray-500">TOTAL</td>
                <td className="px-2 py-2 text-right">{calc.qty}</td>
                <td />
                <td />
                <td />
                <td className="px-2 py-2 text-right">{inr(calc.discTotal)}</td>
                <td />
                <td className="px-2 py-2 text-right">{inr(calc.taxTotal)}</td>
                <td className="px-2 py-2 text-right">{inr(calc.net + calc.taxTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Vyapar's three columns under the grid: terms, then payment + attachments, then totals. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-2 text-sm font-semibold text-gray-700">Terms &amp; Conditions</div>
            {/* Vyapar titles the block, and the title prints on the document. */}
            <div className="mb-2">
              <Field label="Title">
                <Select
                  value={termsTitle}
                  onChange={setTermsTitle}
                  size="sm"
                  options={TERMS_TITLES.map((t) => ({ value: t, label: t }))}
                />
              </Field>
            </div>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              className="input resize-none"
            />
            <div className="mt-3">
              <Field label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
              </Field>
            </div>
          </div>

          {/* Middle column — Payment Type / Reference No. / + Add Payment type, then the three
              attachment buttons. Vyapar shows all of this whether or not money has been received;
              hiding it until a Received amount was typed was our own invention. */}
          <div className="space-y-3 rounded-xl border border-gray-200 p-4">
            {!noPayment && (
              <>
                <Field label="Payment Type">
                  <Select value={paymentMode} onChange={setPaymentMode} options={paymentTypeOptions} />
                </Field>
                <Field label="Reference No.">
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="NEFT / cheque no"
                    className="input"
                  />
                </Field>

                {extraPayments.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-dashed border-gray-200 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">
                        Payment Type {i + 2}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExtraPayments((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-0.5 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove payment type ${i + 2}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <Select
                      value={p.mode}
                      onChange={(v) =>
                        setExtraPayments((prev) => prev.map((x, j) => (j === i ? { ...x, mode: v } : x)))
                      }
                      size="sm"
                      options={paymentTypeOptions}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        value={p.reference}
                        onChange={(e) =>
                          setExtraPayments((prev) => prev.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))
                        }
                        placeholder="Reference"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                      />
                      <input
                        type="number"
                        value={p.amount}
                        onChange={(e) =>
                          setExtraPayments((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x))
                          )
                        }
                        placeholder="Amount"
                        className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setExtraPayments((prev) => [...prev, { mode: "Cash", reference: "", amount: 0 }])}
                  className="flex items-center gap-1 text-sm font-medium text-brand-accent transition-opacity duration-150 hover:opacity-80"
                >
                  <Plus size={13} /> Add Payment type
                </button>
              </>
            )}

            {/* ADD DESCRIPTION / ADD IMAGE / ADD DOCUMENT */}
            <div className={`space-y-2 ${!noPayment ? "border-t border-gray-100 pt-3" : ""}`}>
              {showDescription ? (
                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    autoFocus
                    className="input resize-none"
                    placeholder="Description"
                  />
                </Field>
              ) : (
                <AttachButton icon={FileText} label="Add Description" onClick={() => setShowDescription(true)} />
              )}

              {imageDataUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                  {/* Data-URL preview — a plain img is correct (next/image can't optimize these). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageDataUrl} alt="Attached" className="h-12 w-12 rounded object-cover" />
                  <span className="flex-1 truncate text-xs text-gray-500">Image attached</span>
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(null)}
                    className="rounded p-1 text-gray-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <AttachButton icon={ImageIcon} label="Add Image" accept="image/*" onFile={async (file) => {
                  try {
                    setImageDataUrl(await readImageAsDataUrl(file));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't attach that image.");
                  }
                }} />
              )}

              {documentDataUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
                  <FileText size={16} className="shrink-0 text-emerald-600" />
                  <span className="flex-1 truncate text-xs text-emerald-700">{documentName ?? "Document"} added</span>
                  <a
                    href={documentDataUrl}
                    download={documentName ?? "document"}
                    className="rounded p-1 text-emerald-600 transition-colors duration-150 hover:bg-emerald-100"
                    aria-label="Download attached document"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setDocumentDataUrl(null);
                      setDocumentName(null);
                    }}
                    className="rounded p-1 text-gray-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove document"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <AttachButton
                  icon={FileText}
                  label="Add Document"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                  onFile={async (file) => {
                    if (file.size > MAX_DOC_BYTES) {
                      setError(`"${file.name}" is larger than 4 MB. Attach a smaller file.`);
                      return;
                    }
                    try {
                      setDocumentDataUrl(await readFileAsDataUrl(file));
                      setDocumentName(file.name);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Couldn't attach that file.");
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
            <Row label="Sub Total" value={inr(calc.net)} />
            <Row label="Tax" value={inr(calc.taxTotal)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">Discount</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => {
                    setDiscountPercent(Number(e.target.value));
                    if (Number(e.target.value) > 0) setDiscountAmount(0);
                  }}
                  className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                />
                <span className="text-xs text-gray-400">%</span>
                <span className="text-gray-300">–</span>
                <input
                  type="number"
                  value={discountPercent > 0 ? Math.round(calc.headerDisc) : discountAmount}
                  disabled={discountPercent > 0}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="text-xs text-gray-400">₹</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-gray-500">
                <input
                  type="checkbox"
                  checked={roundOffOn}
                  onChange={(e) => {
                    setRoundOffOn(e.target.checked);
                    setRoundOffOverride(null);
                  }}
                  className="h-4 w-4 accent-cyan-600"
                />
                Round Off
              </label>
              <input
                type="number"
                step="0.01"
                value={Number(calc.roundOff.toFixed(2))}
                disabled={!roundOffOn}
                onChange={(e) => setRoundOffOverride(Number(e.target.value) || 0)}
                className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="text-xl font-semibold text-gray-900">{inr(calc.total)}</span>
            </div>
            {/* Vyapar gates the received amount behind a checkbox — unticking it books the whole
                document as outstanding without having to zero the number by hand. */}
            {!noPayment && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-gray-500">
                  <input
                    type="checkbox"
                    checked={receiveOn}
                    onChange={(e) => {
                      setReceiveOn(e.target.checked);
                      setReceived(e.target.checked ? calc.total : 0);
                      setReceivedTouched(true);
                    }}
                    className="h-4 w-4 accent-cyan-600"
                  />
                  {moneyLabel}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">₹</span>
                  <input
                    type="number"
                    value={displayReceived}
                    disabled={!receiveOn}
                    onChange={(e) => { setReceived(Number(e.target.value)); setReceivedTouched(true); }}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}
            {!noPayment && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Balance Due</span>
                <span className={`font-medium ${balanceDue > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inr(balanceDue)}</span>
              </div>
            )}
            {!noPayment && (
              <p className="pt-1 text-[11px] text-gray-400">
                {balanceDue <= 0 ? "Fully paid on save." : `${inr(balanceDue)} will stay outstanding.`}
              </p>
            )}
          </div>
        </div>

        {paymentLinks.length > 0 && (
          <p className="text-xs text-gray-500">
            This receipt also settles {paymentLinks.length} other transaction
            {paymentLinks.length > 1 ? "s" : ""}.
          </p>
        )}
      </div>

      {linkingPayment && partyId && (
        <LinkPaymentDialog
          partyId={Number(partyId)}
          partyName={selectedParty?.name ?? "—"}
          received={displayReceived}
          onClose={() => setLinkingPayment(false)}
          onDone={(links, amount) => {
            setPaymentLinks(links);
            setReceived(amount);
            setReceivedTouched(true);
            setLinkingPayment(false);
          }}
        />
      )}

      {/* Inline masters — Vyapar's ⊕ Add Item / ⊕ Add Party rows open the real form, and the new
          record drops straight back into the line or field that asked for it. */}
      {creatingItem && (
        <ItemDialog
          initialName={creatingItem.name}
          onClose={() => setCreatingItem(null)}
          onSaved={(saved) => {
            onItemCreated?.(saved);
            applyItem(creatingItem.idx, saved);
            setCreatingItem(null);
          }}
        />
      )}

      {creatingParty !== null && (
        <PartyDialog
          initialName={creatingParty}
          onClose={() => setCreatingParty(null)}
          onSaved={(saved) => {
            onPartyCreated?.(saved);
            pickParty(saved);
            setCreatingParty(null);
          }}
        />
      )}
    </Drawer>
  );
}

/**
 * Vyapar's `Print ▾` split button at the bottom-right of a document form. The caret menu carries
 * Share, Print and Save & New — the same set the desktop app offers, minus Generate e-Invoice,
 * which needs an IRP connection we don't have.
 */
function SaveMenu({
  onPrint,
  onShare,
  onSaveAndNew,
  busy,
}: {
  onPrint: () => void;
  onShare: () => void;
  onSaveAndNew?: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        disabled={busy}
        onClick={onPrint}
        className="flex items-center gap-1.5 rounded-l-lg border border-r-0 border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent disabled:opacity-60"
      >
        <Printer size={14} /> Print
      </button>
      <button
        type="button"
        aria-label="More save actions"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-r-lg border border-gray-300 bg-white px-2 py-2 text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
      >
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          {/* Click-away catcher — the menu opens upward, out of the drawer's scroll area. */}
          <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="animate-fade-in-scale absolute right-0 bottom-full z-50 mb-1 w-48 origin-bottom-right rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <MenuItem
              icon={Share2}
              label="Share"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
            />
            <MenuItem
              icon={Printer}
              label="Print"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
            />
            {onSaveAndNew && (
              <MenuItem
                icon={Plus}
                label="Save & New"
                onClick={() => {
                  setOpen(false);
                  onSaveAndNew();
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
    >
      <Icon size={14} className="text-gray-400" />
      {label}
    </button>
  );
}

/**
 * One of Vyapar's three attachment buttons. With `onFile` it opens a hidden file input; without,
 * it's a plain button (Add Description just reveals a textarea — there's nothing to pick).
 */
function AttachButton({
  icon: Icon,
  label,
  accept,
  onClick,
  onFile,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  accept?: string;
  onClick?: () => void;
  onFile?: (file: File) => void;
}) {
  const body = (
    <span className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-medium tracking-wide text-gray-500 uppercase transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent">
      <Icon size={14} />
      {label}
    </span>
  );
  if (!onFile) {
    return (
      <button type="button" onClick={onClick} className="block w-full cursor-pointer">
        {body}
      </button>
    );
  }
  return (
    <label className="block w-full cursor-pointer">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the input so re-picking the same file still fires a change event.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {body}
    </label>
  );
}

/** Numeric grid cell. */
function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-2 py-1.5">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
      />
    </td>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
