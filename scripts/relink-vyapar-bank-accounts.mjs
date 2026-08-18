/**
 * Repair the bank account on every migrated document and receipt.
 *
 *   node scripts/relink-vyapar-bank-accounts.mjs --file "<backup.vyp>"           # report only
 *   node scripts/relink-vyapar-bank-accounts.mjs --file "<backup.vyp>" --write   # apply
 *
 * ## What went wrong
 *
 * `migrate-from-vyapar.mjs` read the account off `kb_transactions.txn_payment_type_id`. That column
 * is NULL on all 993 rows in the client's book — Vyapar keeps the account in a separate
 * `txn_payment_mapping` table, because one transaction can be split across several payment types.
 * So every payment landed with `bank_account_id = NULL` and `mode = 'Cash'`, and the Banks screen
 * showed ₹0.000 against accounts holding crores.
 *
 * ## How rows are matched
 *
 * The migration didn't keep Vyapar's `txn_id`, so the link has to be re-derived. The key is
 * (document type, date, party name, amount) — the same tuple the migration reconciled against.
 * Where several rows share that tuple they're paired off in id order, and anything that can't be
 * matched one-to-one is reported and left alone rather than guessed at.
 *
 * Reads the .vyp read-only. Writes only `bank_account_id` and `mode`/`payment_type`; no amount,
 * date, party or line is touched.
 */

import pkg from "node-sqlite3-wasm";
import { execFileSync } from "node:child_process";

const { Database } = pkg;

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const FILE = fileArg >= 0 ? args[fileArg + 1] : null;
const WRITE = args.includes("--write");
/**
 * How to reach Postgres. Defaults to the local Docker container; override for any other
 * environment, e.g. on UAT:
 *
 *   PSQL_CMD='psql postgres://user:pass@uat-db-host:5432/hitech_erp' \
 *     node scripts/relink-vyapar-bank-accounts.mjs --file backup.vyp --write
 *
 * IMPORTANT: this must point at the database being repaired. Row ids differ between environments,
 * so the matching has to be re-run against each one — never carry the generated updates across.
 */
const PSQL_CMD =
  process.env.PSQL_CMD ??
  `docker exec -i ${process.env.PG_CONTAINER ?? "hitech-erp-postgres"} psql -U ${process.env.PGUSER ?? "hitech"} -d ${process.env.PGDB ?? "hitech_erp"}`;

if (!FILE) {
  console.error("Usage: node scripts/relink-vyapar-bank-accounts.mjs --file <backup.vyp> [--write]");
  process.exit(1);
}

/** Vyapar's numeric transaction types, as confirmed in migrate-from-vyapar.mjs. */
const DOC_TYPE = { 1: "SALE", 2: "PURCHASE", 7: "EXPENSE", 21: "SALE_RETURN", 23: "PURCHASE_RETURN" };
const PAY_TYPE = { 3: "IN", 4: "OUT" };

/** Run SQL against the configured database and hand back rows as arrays of strings. */
function psql(sql) {
  // Split the configured invocation into program + args; everything after is appended.
  const [cmd, ...base] = PSQL_CMD.split(/\s+/);
  const out = execFileSync(cmd, [...base, "-At", "-F", "", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean).map((line) => line.split(""));
}

/** Money compared at paise precision — floats from two different engines won't be bit-identical. */
const money = (v) => Math.round((Number(v) || 0) * 100);
const day = (s) => (s ? String(s).slice(0, 10) : "");
const norm = (s) => (s ?? "").trim().toLowerCase();
const key = (...parts) => parts.map((p) => String(p)).join("|");

function main() {
  const db = new Database(FILE);

  // ---- Vyapar side: every transaction with the account it actually used ----
  const vyaparRows = db.all(`
    SELECT t.txn_id, t.txn_type, t.txn_date, t.txn_cash_amount, t.txn_balance_amount,
           n.full_name AS party, p.paymentType_name AS account
    FROM kb_transactions t
    LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
    LEFT JOIN txn_payment_mapping m ON m.txn_id = t.txn_id
    LEFT JOIN kb_paymentTypes p ON p.paymentType_id = m.payment_id
    ORDER BY t.txn_id
  `);
  db.close();

  // ---- Our side ----
  const accounts = new Map(psql("SELECT id, name FROM vyapar_bank_accounts").map(([id, name]) => [norm(name), Number(id)]));
  const invoices = psql(`
    SELECT i.id, i.doc_type, i.invoice_date, i.total, COALESCE(p.name, i.billing_name, '')
    FROM vyapar_invoices i LEFT JOIN vyapar_parties p ON p.id = i.party_id
    ORDER BY i.id`);
  const payments = psql(`
    SELECT y.id, y.direction, y.payment_date, y.amount, COALESCE(p.name, '')
    FROM vyapar_payments y LEFT JOIN vyapar_parties p ON p.id = y.party_id
    ORDER BY y.id`);

  // Bucket our rows by the match key; several rows can share one, so each bucket is a queue.
  const buckets = new Map();
  const push = (k, entry) => {
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(entry);
  };
  for (const [id, docType, date, total, party] of invoices) {
    push(key("DOC", docType, day(date), money(total), norm(party)), { table: "invoice", id: Number(id) });
  }
  for (const [id, direction, date, amount, party] of payments) {
    push(key("PAY", direction, day(date), money(amount), norm(party)), { table: "payment", id: Number(id) });
  }

  const updates = { invoice: [], payment: [] };
  const unmatched = [];
  let noAccount = 0;
  let unknownAccount = 0;

  for (const t of vyaparRows) {
    const docType = DOC_TYPE[t.txn_type];
    const payDir = PAY_TYPE[t.txn_type];
    if (!docType && !payDir) continue; // a type we don't migrate at all

    if (!t.account) {
      noAccount += 1;
      continue;
    }
    const accountId = accounts.get(norm(t.account));
    if (!accountId) {
      unknownAccount += 1;
      continue;
    }

    const k = docType
      ? key("DOC", docType, day(t.txn_date), money(Number(t.txn_cash_amount) + Number(t.txn_balance_amount)), norm(t.party))
      : key("PAY", payDir, day(t.txn_date), money(t.txn_cash_amount), norm(t.party));

    const queue = buckets.get(k);
    const hit = queue?.shift(); // pair off in id order when a tuple repeats
    if (!hit) {
      unmatched.push({ txn_id: t.txn_id, type: docType ?? `PAYMENT_${payDir}`, date: day(t.txn_date), party: t.party, account: t.account });
      continue;
    }
    updates[hit.table].push({ id: hit.id, accountId, account: t.account });
  }

  // ---- Report ----
  const byAccount = new Map();
  for (const u of [...updates.invoice, ...updates.payment]) {
    byAccount.set(u.account, (byAccount.get(u.account) ?? 0) + 1);
  }
  console.log(`\nVyapar transactions read : ${vyaparRows.length}`);
  console.log(`Matched documents        : ${updates.invoice.length}`);
  console.log(`Matched payments         : ${updates.payment.length}`);
  console.log(`No account in Vyapar     : ${noAccount}`);
  console.log(`Account name not in ERP  : ${unknownAccount}`);
  console.log(`Could not be matched     : ${unmatched.length}`);
  console.log("\nPer account:");
  for (const [name, n] of [...byAccount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${name}`);
  }
  if (unmatched.length) {
    console.log("\nUnmatched (left untouched):");
    for (const u of unmatched.slice(0, 15)) {
      console.log(`  txn ${u.txn_id} ${u.type} ${u.date} ${u.party ?? "—"} → ${u.account}`);
    }
    if (unmatched.length > 15) console.log(`  … and ${unmatched.length - 15} more`);
  }

  if (!WRITE) {
    console.log("\nReport only — nothing written. Re-run with --write to apply.");
    return;
  }

  // ---- Apply ----
  // `mode` / `payment_type` carries the account name because that is what Vyapar's own Payment Type
  // column shows; "Cash" told the user nothing about which of eleven accounts the money went to.
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const esc = (s) => s.replace(/'/g, "''");

  for (const part of chunk(updates.payment, 200)) {
    const values = part.map((u) => `(${u.id}, ${u.accountId}, '${esc(u.account)}')`).join(",");
    psql(`UPDATE vyapar_payments y SET bank_account_id = v.acct, mode = v.name
          FROM (VALUES ${values}) AS v(id, acct, name) WHERE y.id = v.id`);
  }
  for (const part of chunk(updates.invoice, 200)) {
    const values = part.map((u) => `(${u.id}, ${u.accountId}, '${esc(u.account)}')`).join(",");
    // Only a document that actually took money names an account; an unpaid credit bill stays "Credit".
    psql(`UPDATE vyapar_invoices i SET bank_account_id = v.acct,
                 payment_type = CASE WHEN i.paid_amount > 0 THEN v.name ELSE i.payment_type END
          FROM (VALUES ${values}) AS v(id, acct, name) WHERE i.id = v.id`);
  }
  console.log(`\nWritten: ${updates.payment.length} payments, ${updates.invoice.length} documents.`);
}

main();
