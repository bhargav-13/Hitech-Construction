/**
 * Repair the bank account on every migrated document and receipt.
 *
 *   node scripts/relink-vyapar-bank-accounts.mjs --file "<backup.vyp>"           # report only
 *   node scripts/relink-vyapar-bank-accounts.mjs --file "<backup.vyp>" --write   # apply here
 *   node scripts/relink-vyapar-bank-accounts.mjs --file "<backup.vyp>" --sql-out fix.sql
 *
 * `--sql-out` writes a self-contained SQL script you can paste into any psql prompt — a Dokploy
 * database terminal, for instance — with no database connection, no Node and no .vyp needed at the
 * far end. It carries the account-per-transaction facts from Vyapar and does the *matching* in SQL
 * against whatever database it is run on, so it is safe across environments: row ids are never
 * baked in. That is the whole reason it can be generated here and applied on UAT.
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
import fs from "node:fs";

const { Database } = pkg;

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const FILE = fileArg >= 0 ? args[fileArg + 1] : null;
const WRITE = args.includes("--write");
const sqlOutArg = args.indexOf("--sql-out");
const SQL_OUT = sqlOutArg >= 0 ? args[sqlOutArg + 1] : null;
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

  // ---- Portable SQL, for a psql prompt on another environment ----
  if (SQL_OUT) {
    writeSqlScript(vyaparRows);
    return;
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

/**
 * Emit a SQL script that carries Vyapar's account-per-transaction facts and does the matching
 * itself, against whatever database it is run on.
 *
 * The matching rule is identical to the JavaScript above — pair on (type, date, party, amount),
 * and where a tuple repeats, pair them off in order — expressed as ROW_NUMBER on both sides. That
 * is what makes the file safe to carry between environments: it never names a row id, so it cannot
 * mislink records whose ids differ from the machine that generated it.
 */
function writeSqlScript(vyaparRows) {
  const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const values = [];
  let seq = 0;
  let skipped = 0;

  for (const t of vyaparRows) {
    const docType = DOC_TYPE[t.txn_type];
    const payDir = PAY_TYPE[t.txn_type];
    if ((!docType && !payDir) || !t.account) {
      if (docType || payDir) skipped += 1;
      continue;
    }
    const amount = docType
      ? money(Number(t.txn_cash_amount) + Number(t.txn_balance_amount))
      : money(t.txn_cash_amount);
    values.push(
      `(${++seq}, ${q(docType ? "DOC" : "PAY")}, ${q(docType ?? payDir)}, ${q(day(t.txn_date))}, ` +
        `${amount}, ${q(norm(t.party))}, ${q(norm(t.account))})`,
    );
  }

  const sql = `-- Repair the bank account on every migrated document and receipt.
--
-- Generated from Vyapar's own backup by scripts/relink-vyapar-bank-accounts.mjs.
-- Safe to run on any environment: it matches rows by (type, date, party, amount), never by id.
--
-- Paste the whole file into a psql prompt. It ends in ROLLBACK, so the first run only prints the
-- report. Read that, then change the last line to COMMIT and run it again.
--
-- ${seq} transactions carried${skipped ? `, ${skipped} skipped (no payment account in Vyapar)` : ""}.

BEGIN;

CREATE TEMP TABLE vy_src (
  seq int, kind text, kind_type text, day text, amt bigint, party text, account text
) ON COMMIT DROP;

INSERT INTO vy_src (seq, kind, kind_type, day, amt, party, account) VALUES
${values.join(",\n")};

-- Any account name Vyapar used that this database has never heard of. Should be empty.
SELECT DISTINCT s.account AS unknown_account_in_erp
  FROM vy_src s
 WHERE NOT EXISTS (SELECT 1 FROM vyapar_bank_accounts a WHERE lower(btrim(a.name)) = s.account);

-- ---- Documents ----
WITH src AS (
  SELECT *, row_number() OVER (PARTITION BY kind_type, day, amt, party ORDER BY seq) AS rn
    FROM vy_src WHERE kind = 'DOC'
), tgt AS (
  SELECT i.id, i.doc_type, left(i.invoice_date, 10) AS day,
         round(i.total * 100)::bigint AS amt,
         lower(btrim(coalesce(p.name, i.billing_name, ''))) AS party,
         row_number() OVER (
           PARTITION BY i.doc_type, left(i.invoice_date, 10), round(i.total * 100),
                        lower(btrim(coalesce(p.name, i.billing_name, '')))
           ORDER BY i.id) AS rn
    FROM vyapar_invoices i LEFT JOIN vyapar_parties p ON p.id = i.party_id
)
UPDATE vyapar_invoices i
   SET bank_account_id = a.id,
       -- Only a document that actually took money names an account; an unpaid bill stays "Credit".
       payment_type = CASE WHEN i.paid_amount > 0 THEN a.name ELSE i.payment_type END
  FROM src s
  JOIN tgt t ON t.doc_type = s.kind_type AND t.day = s.day AND t.amt = s.amt
            AND t.party = s.party AND t.rn = s.rn
  JOIN vyapar_bank_accounts a ON lower(btrim(a.name)) = s.account
 WHERE i.id = t.id;

-- ---- Payments ----
WITH src AS (
  SELECT *, row_number() OVER (PARTITION BY kind_type, day, amt, party ORDER BY seq) AS rn
    FROM vy_src WHERE kind = 'PAY'
), tgt AS (
  SELECT y.id, y.direction, left(y.payment_date, 10) AS day,
         round(y.amount * 100)::bigint AS amt,
         lower(btrim(coalesce(p.name, ''))) AS party,
         row_number() OVER (
           PARTITION BY y.direction, left(y.payment_date, 10), round(y.amount * 100),
                        lower(btrim(coalesce(p.name, '')))
           ORDER BY y.id) AS rn
    FROM vyapar_payments y LEFT JOIN vyapar_parties p ON p.id = y.party_id
)
UPDATE vyapar_payments y
   SET bank_account_id = a.id,
       -- Vyapar's Payment Type column shows the account name; "Cash" said nothing about which one.
       mode = a.name
  FROM src s
  JOIN tgt t ON t.direction = s.kind_type AND t.day = s.day AND t.amt = s.amt
            AND t.party = s.party AND t.rn = s.rn
  JOIN vyapar_bank_accounts a ON lower(btrim(a.name)) = s.account
 WHERE y.id = t.id;

-- ---- Report: read this before committing ----
SELECT (SELECT count(*) FROM vyapar_payments WHERE bank_account_id IS NULL) AS payments_still_unlinked,
       (SELECT count(*) FROM vyapar_invoices WHERE bank_account_id IS NULL) AS documents_still_unlinked;

SELECT a.name,
       coalesce(a.opening_balance, 0)
       + coalesce((SELECT sum(CASE WHEN y.direction = 'IN' THEN y.amount ELSE -y.amount END)
                     FROM vyapar_payments y WHERE y.bank_account_id = a.id), 0)
       + coalesce((SELECT sum(CASE WHEN i.doc_type IN ('SALE','PURCHASE_RETURN')
                                   THEN i.paid_amount ELSE -i.paid_amount END)
                     FROM vyapar_invoices i
                    WHERE i.bank_account_id = a.id AND i.paid_amount > 0 AND i.cancelled = false), 0)
       AS balance
  FROM vyapar_bank_accounts a ORDER BY 2 DESC;

-- *** Change this to COMMIT; once the numbers above look right. ***
ROLLBACK;
`;

  fs.writeFileSync(SQL_OUT, sql, "utf8");
  console.log(`\nWrote ${SQL_OUT}`);
  console.log(`  ${seq} transactions carried${skipped ? `, ${skipped} skipped (no account in Vyapar)` : ""}.`);
  console.log("  Paste it into a psql prompt. It ends in ROLLBACK — read the report, then change it to COMMIT.");
}
