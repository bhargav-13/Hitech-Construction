/**
 * Migrate a Vyapar desktop backup into this ERP.
 *
 *   node scripts/migrate-from-vyapar.mjs --file "C:/path/HITECHRAJKOT__t_....vyp"
 *   node scripts/migrate-from-vyapar.mjs --file ... --dry-run     # read + reconcile, write nothing
 *
 * A Vyapar `.vyp` backup is a plain SQLite database, so this reads the real relational data rather
 * than an Excel export. That matters: Vyapar's Excel export leaves invoice numbers blank, which is
 * why the sheet importer has to key on Amount and why two same-amount bills are ambiguous. Here
 * every record has a primary key, so the mapping is exact.
 *
 * Everything is posted through the REST API rather than written straight to Postgres, so stock
 * movements, party balances and payment links are computed by the same code the app uses. 993
 * transactions is small; correctness is worth more than speed.
 *
 * Config via env:
 *   API_BASE   default http://localhost:8080
 *   SEED_EMAIL default admin@hitech.local
 *   SEED_PASS  default Admin@123
 *
 * Run `scripts/wipe-vyapar.sql` first if you want a clean target — this script does NOT delete.
 */

import pkg from "node-sqlite3-wasm";
const { Database } = pkg;

const API = process.env.API_BASE ?? "http://localhost:8080";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const FILE = fileArg >= 0 ? args[fileArg + 1] : null;
const DRY = args.includes("--dry-run");

if (!FILE) {
  console.error("Usage: node scripts/migrate-from-vyapar.mjs --file <backup.vyp> [--dry-run]");
  process.exit(1);
}

/**
 * Vyapar's numeric transaction types.
 *
 * Every one of these was confirmed against the client's own books — each code was traced to a
 * record whose party, amount and date were then read back off the Vyapar UI. Getting 21 and 23
 * backwards would invert balances for those parties, so none of it is guessed.
 */
const TXN_TYPE = {
  1: "SALE",
  2: "PURCHASE",
  3: "PAYMENT_IN",
  4: "PAYMENT_OUT",
  7: "EXPENSE",
  21: "SALE_RETURN", // Credit Note
  23: "PURCHASE_RETURN", // Debit Note
};

/** Documents that carry line items and post to the invoice table. */
const DOC_TYPES = new Set(["SALE", "PURCHASE", "SALE_RETURN", "PURCHASE_RETURN", "EXPENSE"]);
/** Money movements that post to the payment table. */
const PAYMENT_TYPES = new Set(["PAYMENT_IN", "PAYMENT_OUT"]);

let token = "";

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${path} → ${msg}`);
  }
  return data;
}

/** Vyapar stores dates as "YYYY-MM-DD HH:MM:SS"; the API wants a plain ISO day. */
const day = (v) => (v ? String(v).slice(0, 10) : null);
const num = (v) => (v == null ? 0 : Number(v) || 0);

async function main() {
  const db = new Database(FILE, { fileMustExist: true });

  // ---- Read ---------------------------------------------------------------
  // Deleting a transaction in Vyapar removes the row from kb_transactions and archives a JSON
  // snapshot of it in recycle_bin, so everything still in kb_transactions is live. No exclusion
  // needed — and recycle_bin has no txn_id column to exclude on anyway.

  const vParties = db.all(`select name_id, full_name, phone_number, email, address, name_gstin_number,
      name_state, name_shipping_address, amount, credit_limit, credit_limit_enabled, party_billing_name,
      name_type from kb_names where full_name is not null and trim(full_name) <> ''`);

  const vItems = db.all(`select item_id, item_name, item_hsn_sac_code, item_code, category_id,
      item_description, item_sale_unit_price, item_purchase_unit_price, item_tax_id,
      item_stock_quantity, item_min_stock_quantity, item_location, item_type, base_unit_id,
      item_wholesale_price, item_min_wholesale_qty, item_is_active
      from kb_items where item_name is not null`);

  const vAccounts = db.all(`select paymentType_id, paymentType_name, paymentType_bankName,
      paymentType_accountNumber, paymentType_opening_balance, paymentType_opening_date,
      pt_bank_ifsc_code, pt_bank_account_holder_name, pt_bank_upi_id from kb_paymentTypes`);

  const vTxns = db.all(`select txn_id, txn_name_id, txn_type, txn_date, txn_due_date,
      txn_cash_amount, txn_balance_amount, txn_discount_percent, txn_discount_amount,
      txn_tax_amount, txn_ref_number_char, txn_invoice_prefix, txn_description,
      txn_place_of_supply, txn_round_off_amount, txn_billing_address, txn_display_name,
      txn_payment_reference, txn_payment_type_id, txn_status,
      txn_ac1_amount, txn_ac2_amount, txn_ac3_amount, ac1_name, ac2_name, ac3_name, txn_category_id
      from kb_transactions order by txn_date, txn_id`);

  const vLines = db.all(`select lineitem_txn_id, item_id, quantity, priceperunit, total_amount,
      lineitem_tax_amount, lineitem_tax_id, lineitem_discount_amount, lineitem_discount_percent,
      lineitem_description, lineitem_unit_id from kb_lineitems`);

  const vUnits = new Map(db.all("select unit_id, unit_name, unit_short_name from kb_item_units").map((u) => [u.unit_id, u]));
  const vTaxes = new Map(db.all("select tax_code_id, tax_rate from kb_tax_code").map((t) => [t.tax_code_id, num(t.tax_rate)]));

  db.close();

  // Name lookup for line items — a linear find() per line was O(lines × items).
  const itemNameById = new Map(vItems.map((i) => [i.item_id, i.item_name]));

  /**
   * Expense categories.
   *
   * Vyapar keeps categories in the same `kb_names` table as parties and points at them with
   * `txn_category_id` (a party row can double as a category — "RMC OLD JAGNATH" is both). Our
   * expense screen reads the category off `notes`, so that's where these land.
   */
  const categoryById = new Map(vParties.map((p) => [p.name_id, p.full_name?.trim()]));

  const linesByTxn = new Map();
  for (const l of vLines) {
    if (!linesByTxn.has(l.lineitem_txn_id)) linesByTxn.set(l.lineitem_txn_id, []);
    linesByTxn.get(l.lineitem_txn_id).push(l);
  }

  const live = vTxns.filter((t) => TXN_TYPE[t.txn_type]);
  const unknown = vTxns.filter((t) => !TXN_TYPE[t.txn_type]);

  // ---- Reconciliation figures, printed before and after --------------------
  const totalsByType = {};
  for (const t of live) {
    const k = TXN_TYPE[t.txn_type];
    totalsByType[k] = totalsByType[k] ?? { count: 0, amount: 0 };
    totalsByType[k].count += 1;
    totalsByType[k].amount += num(t.txn_cash_amount) + num(t.txn_balance_amount);
  }

  console.log(`\nSource: ${FILE}`);
  console.log(`  parties ${vParties.length} · items ${vItems.length} · accounts ${vAccounts.length}`);
  console.log(`  transactions ${vTxns.length} (importing ${live.length}, ${unknown.length} unmapped)`);
  if (unknown.length) {
    console.log(`  ⚠ ${unknown.length} rows have an unmapped txn_type: ${[...new Set(unknown.map((u) => u.txn_type))].join(", ")}`);
  }
  console.log("\nBy type:");
  for (const [k, v] of Object.entries(totalsByType)) {
    console.log(`  ${k.padEnd(16)} ${String(v.count).padStart(4)}   ₹${v.amount.toLocaleString("en-IN")}`);
  }

  if (DRY) {
    console.log("\n--dry-run: nothing was written. Compare the figures above against Vyapar's own");
    console.log("Sale / Purchase / Party Statement reports before running for real.\n");
    return;
  }

  // ---- Write --------------------------------------------------------------
  const auth = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  console.log(`\nAuthenticated as ${EMAIL}\n`);

  // Accounts first — invoices and payments reference them as the payment method.
  const accountIdByVyapar = new Map();
  for (const a of vAccounts) {
    const name = a.paymentType_name?.trim();
    if (!name) continue;
    const saved = await api("/api/v1/vyapar/bank-accounts", {
      method: "POST",
      body: {
        name,
        bankName: a.paymentType_bankName ?? null,
        accountNumber: a.paymentType_accountNumber ?? null,
        accountHolder: a.pt_bank_account_holder_name ?? null,
        ifsc: a.pt_bank_ifsc_code ?? null,
        upiId: a.pt_bank_upi_id ?? null,
        openingBalance: num(a.paymentType_opening_balance),
        openingDate: day(a.paymentType_opening_date),
      },
    });
    accountIdByVyapar.set(a.paymentType_id, saved.id);
  }
  console.log(`  accounts   ${accountIdByVyapar.size}`);

  // Parties. Vyapar's `amount` is the *running* balance — kb_names has no opening_balance column.
  // The ERP derives balance as openingBalance + sum(posted docs + payments). Some parties had an
  // opening balance set in Vyapar before any transactions; the `amount` field embeds that:
  //     amount = true_opening_balance + net_of_all_transactions
  // So:  true_opening_balance = amount - net_of_all_transactions
  //
  // We compute the net transaction effect per party from kb_transactions using the same sign
  // conventions the ERP will apply when deriving balances, then set openingBalance to the residual.
  const netByParty = new Map();
  for (const t of live) {
    const docType = TXN_TYPE[t.txn_type];
    const pid = t.txn_name_id;
    if (pid == null) continue;
    const total = num(t.txn_cash_amount) + num(t.txn_balance_amount);
    const outstanding = num(t.txn_balance_amount); // = total - paidAmount
    let delta = 0;
    if (docType === "SALE") delta = outstanding;
    else if (docType === "PURCHASE") delta = -outstanding;
    else if (docType === "SALE_RETURN") delta = -outstanding;
    else if (docType === "PURCHASE_RETURN") delta = outstanding;
    else if (docType === "PAYMENT_IN") delta = -total;
    else if (docType === "PAYMENT_OUT") delta = total;
    // EXPENSE does not affect party balances in the ERP (not in POSTED).
    netByParty.set(pid, (netByParty.get(pid) ?? 0) + delta);
  }

  const partyIdByVyapar = new Map();
  for (const p of vParties) {
    if (p.name_type != null && p.name_type !== 1) continue;
    const netTxn = netByParty.get(p.name_id) ?? 0;
    // Round to 2 dp — floating-point line-item arithmetic can leave sub-rupee residuals otherwise.
    const trueOB = Math.round((num(p.amount) - netTxn) * 100) / 100;
    const saved = await api("/api/v1/vyapar/parties", {
      method: "POST",
      body: {
        name: p.full_name.trim(),
        partyType: num(p.amount) >= 0 ? "CUSTOMER" : "SUPPLIER",
        phone: p.phone_number ?? null,
        email: p.email ?? null,
        gstin: p.name_gstin_number ?? null,
        state: p.name_state ?? null,
        billingAddress: p.address ?? null,
        shippingAddress: p.name_shipping_address ?? null,
        openingBalance: trueOB,
        creditLimit: p.credit_limit_enabled ? num(p.credit_limit) : null,
      },
    });
    partyIdByVyapar.set(p.name_id, saved.id);
    if (Math.abs(trueOB) > 0.01) {
      console.log(`    ${p.full_name.trim()}: opening balance ₹${trueOB.toLocaleString("en-IN")}`);
    }
  }
  console.log(`  parties    ${partyIdByVyapar.size}`);

  // Item stock, the same trap as the party opening balance.
  //
  // `item_stock_quantity` is Vyapar's CURRENT stock, not an opening figure. Posting it as the
  // opening quantity and then replaying every purchase through the API doubles the shelf — the
  // ERP re-derives stock from the documents we're about to send. So back the transactions out
  // and seed only what was on hand before the first one.
  //
  // Signs match VyaparService.applyStock: purchases and sale returns add, sales and purchase
  // returns remove. Expenses carry lines but never move stock.
  const netStockByItem = new Map();
  // Weighted average purchase cost, net of line discounts.
  //
  // The ERP values a shelf as stockQty × purchasePrice, but Vyapar's master purchase price is
  // just the default rate for a new bill and can be wildly off what was actually paid — "Metal"
  // carries ₹6,100 against a real cost of ₹0.45, which alone inflated the books by ₹484 crore.
  // Valuing at what the item actually cost reproduces Vyapar's own Stock Summary to ~0.5%.
  const buyQtyByItem = new Map();
  const buyValByItem = new Map();

  for (const t of live) {
    const docType = TXN_TYPE[t.txn_type];
    for (const l of linesByTxn.get(t.txn_id) ?? []) {
      if (l.item_id == null) continue;
      const qty = num(l.quantity);
      if (qty === 0) continue;

      let delta = 0;
      if (docType === "PURCHASE") delta = qty;
      else if (docType === "SALE") delta = -qty;
      else if (docType === "SALE_RETURN") delta = qty;
      else if (docType === "PURCHASE_RETURN") delta = -qty;
      if (delta !== 0) netStockByItem.set(l.item_id, (netStockByItem.get(l.item_id) ?? 0) + delta);

      if (docType === "PURCHASE") {
        const gross = qty * num(l.priceperunit);
        const dPct = num(l.lineitem_discount_percent);
        const disc = dPct > 0 ? (gross * dPct) / 100 : num(l.lineitem_discount_amount);
        buyQtyByItem.set(l.item_id, (buyQtyByItem.get(l.item_id) ?? 0) + qty);
        buyValByItem.set(l.item_id, (buyValByItem.get(l.item_id) ?? 0) + (gross - disc));
      }
    }
  }

  const itemIdByVyapar = new Map();
  let repriced = 0;
  for (const it of vItems) {
    const openingStock = num(it.item_stock_quantity) - (netStockByItem.get(it.item_id) ?? 0);

    // Fall back to the master price for anything never purchased — there's nothing better to use.
    const boughtQty = buyQtyByItem.get(it.item_id) ?? 0;
    const avgCost = boughtQty > 0 ? buyValByItem.get(it.item_id) / boughtQty : null;
    const purchasePrice = avgCost ?? num(it.item_purchase_unit_price);
    if (avgCost != null && Math.abs(avgCost - num(it.item_purchase_unit_price)) > 0.01) repriced += 1;

    const saved = await api("/api/v1/vyapar/items", {
      method: "POST",
      body: {
        name: it.item_name.trim(),
        hsn: it.item_hsn_sac_code ?? null,
        itemCode: it.item_code ?? null,
        description: it.item_description ?? null,
        unit: vUnits.get(it.base_unit_id)?.unit_short_name ?? "NONE",
        salePrice: num(it.item_sale_unit_price),
        purchasePrice,
        taxPercent: vTaxes.get(it.item_tax_id) ?? 0,
        stockQty: openingStock,
        lowStockAlert: num(it.item_min_stock_quantity),
        location: it.item_location ?? null,
        wholesalePrice: num(it.item_wholesale_price) || null,
        wholesaleMinQty: num(it.item_min_wholesale_qty) || null,
        isActive: it.item_is_active !== 0,
        isService: it.item_type === 2,
      },
    });
    itemIdByVyapar.set(it.item_id, saved.id);
  }
  console.log(`  items      ${itemIdByVyapar.size} (${repriced} valued at actual cost)`);

  // Documents, oldest first so balances build in the order they really happened.
  const invoiceIdByVyapar = new Map();
  let docs = 0;
  let payments = 0;
  const failures = [];

  for (const t of live) {
    const docType = TXN_TYPE[t.txn_type];
    const partyId = partyIdByVyapar.get(t.txn_name_id) ?? null;
    const total = num(t.txn_cash_amount) + num(t.txn_balance_amount);

    try {
      if (DOC_TYPES.has(docType)) {
        // `priceperunit` is the tax-exclusive rate and `lineitem_tax_id` names the slab; the line's
        // stored `total_amount` already includes that tax. Our API re-applies tax from the
        // percentage, so the rate goes in as-is and the slab comes from the tax table.
        const lines = (linesByTxn.get(t.txn_id) ?? []).map((l) => ({
          itemId: itemIdByVyapar.get(l.item_id) ?? null,
          itemName: itemNameById.get(l.item_id) ?? "Item",
          description: l.lineitem_description ?? null,
          unit: vUnits.get(l.lineitem_unit_id)?.unit_short_name ?? null,
          quantity: num(l.quantity) || 1,
          rate: num(l.priceperunit),
          discountPercent: num(l.lineitem_discount_percent),
          discountAmount: num(l.lineitem_discount_percent) > 0 ? 0 : num(l.lineitem_discount_amount),
          taxPercent: vTaxes.get(l.lineitem_tax_id) ?? 0,
        }));

        // Vyapar carries up to three named additional charges on the header (shipping, packaging,
        // adjustment). We have no Additional Charges concept yet — see C17 in docs/vyapar-parity.md
        // — so they come across as plain lines. Without this the header total and the sum of the
        // lines disagree, which is most of the purchase and expense gap.
        for (const [amt, name] of [
          [t.txn_ac1_amount, t.ac1_name],
          [t.txn_ac2_amount, t.ac2_name],
          [t.txn_ac3_amount, t.ac3_name],
        ]) {
          if (num(amt) === 0) continue;
          lines.push({
            itemId: null,
            itemName: name?.trim() || "Additional Charge",
            description: null,
            unit: null,
            quantity: 1,
            rate: num(amt),
            discountPercent: 0,
            taxPercent: 0,
          });
        }

        // A document with no lines still has to carry its value, or the books won't tie out.
        if (lines.length === 0) {
          lines.push({
            itemId: null,
            itemName: t.txn_description?.trim() || docType,
            description: null,
            unit: null,
            quantity: 1,
            rate: total,
            discountPercent: 0,
            taxPercent: 0,
          });
        }
        // Replicate ERP's line-item computation to find rounding drift, then absorb
        // it into roundOff so the stored total matches Vyapar's exactly.
        // The ERP calls money(rate) which rounds to 2dp — we must match that.
        let erpSub = 0, erpTax = 0;
        for (const ln of lines) {
          const erpRate = Math.round(ln.rate * 100) / 100;
          const gross = (ln.quantity || 1) * erpRate;
          const lineDisc = ln.discountPercent > 0
            ? Math.round(gross * ln.discountPercent) / 100
            : Math.round((ln.discountAmount ?? 0) * 100) / 100;
          const taxable = gross - lineDisc;
          const lineTax = Math.round(taxable * (ln.taxPercent ?? 0)) / 100;
          erpSub += taxable;
          erpTax += lineTax;
        }
        const headerDisc = num(t.txn_discount_amount);
        const origRoundOff = num(t.txn_round_off_amount);
        const erpTotal = erpSub + erpTax - headerDisc + origRoundOff;
        const adjustedRoundOff = origRoundOff + (total - erpTotal);

        const saved = await api("/api/v1/vyapar/invoices", {
          method: "POST",
          body: {
            docType,
            invoiceNo: t.txn_ref_number_char?.trim() || undefined,
            invoicePrefix: t.txn_invoice_prefix ?? null,
            partyId,
            invoiceDate: day(t.txn_date),
            dueDate: day(t.txn_due_date),
            discount: headerDisc,
            // Vyapar computes discount% on the tax-inclusive subtotal; the ERP computes it on the
            // pre-tax subtotal. Sending the percentage would make the ERP re-derive a different
            // discount amount, so we send the flat amount only and zero the percentage.
            discountPercent: 0,
            roundOff: adjustedRoundOff,
            paidAmount: num(t.txn_cash_amount),
            isCash: num(t.txn_balance_amount) === 0,
            paymentType: accountIdByVyapar.has(t.txn_payment_type_id) ? "Bank" : "Cash",
            paymentReference: t.txn_payment_reference ?? null,
            billingName: partyId ? null : (t.txn_display_name ?? null),
            billingAddress: t.txn_billing_address ?? null,
            stateOfSupply: t.txn_place_of_supply ?? null,
            // On an expense `notes` carries the category, which is what the Expenses screen groups
            // by; on every other document it's the free-text description.
            notes:
              docType === "EXPENSE"
                ? (categoryById.get(t.txn_category_id) ?? "Uncategorised")
                : (t.txn_description ?? null),
            bankAccountId: accountIdByVyapar.get(t.txn_payment_type_id) ?? null,
            lines,
          },
        });
        invoiceIdByVyapar.set(t.txn_id, saved.id);
        docs += 1;
      } else if (PAYMENT_TYPES.has(docType) && partyId) {
        await api("/api/v1/vyapar/payments", {
          method: "POST",
          body: {
            direction: docType === "PAYMENT_IN" ? "IN" : "OUT",
            partyId,
            amount: total,
            mode: accountIdByVyapar.has(t.txn_payment_type_id) ? "Bank" : "Cash",
            reference: t.txn_ref_number_char ?? null,
            notes: t.txn_description ?? null,
            paymentDate: day(t.txn_date),
            bankAccountId: accountIdByVyapar.get(t.txn_payment_type_id) ?? null,
          },
        });
        payments += 1;
      }
    } catch (err) {
      failures.push({ txn_id: t.txn_id, docType, date: day(t.txn_date), total, error: String(err.message ?? err) });
    }
  }

  console.log(`  documents  ${docs}`);
  console.log(`  payments   ${payments}`);

  if (failures.length) {
    console.log(`\n⚠ ${failures.length} rows failed:`);
    for (const f of failures.slice(0, 20)) {
      console.log(`   txn ${f.txn_id} ${f.docType} ${f.date} ₹${f.total} — ${f.error}`);
    }
    if (failures.length > 20) console.log(`   … and ${failures.length - 20} more`);
  }

  console.log("\nNow reconcile: open /vyapar/reports and compare Sale, Purchase and Party");
  console.log("Statement totals against the same reports in Vyapar. They must match exactly.\n");
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message ?? err);
  process.exit(1);
});
