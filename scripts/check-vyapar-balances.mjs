import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
const db = new Database("C:\\Users\\bharg\\AppData\\Roaming\\Vyaparapp\\BusinessNames\\HITECHRAJKOT__t_2025_01_16_10_42_02_zzgo.vyp", { fileMustExist: true });

const cols = db.all("PRAGMA table_info(kb_names)");
console.log("kb_names columns:");
cols.forEach(c => console.log("  " + c.name + " (" + c.type + ")"));

console.log("\n--- Key parties: amount vs opening_balance ---");
const parties = db.all(`SELECT name_id, full_name, amount, opening_balance, name_type
    FROM kb_names
    WHERE name_type = 1 AND full_name IS NOT NULL AND TRIM(full_name) <> ''
    ORDER BY ABS(amount) DESC`);
parties.forEach(p => console.log(`  ${(p.full_name || '').padEnd(35)} amount=${String(p.amount).padStart(15)}  opening_balance=${String(p.opening_balance).padStart(15)}`));

console.log("\n--- Reconciliation: amount = opening_balance + net_transactions? ---");
for (const p of parties.filter(p => p.amount != 0 || p.opening_balance != 0)) {
    const netTxns = db.all(`SELECT
        SUM(CASE WHEN txn_type IN (1) THEN (txn_cash_amount + txn_balance_amount)
             WHEN txn_type IN (21) THEN -(txn_cash_amount + txn_balance_amount)
             WHEN txn_type IN (2,7) THEN -(txn_cash_amount + txn_balance_amount)
             WHEN txn_type IN (23) THEN (txn_cash_amount + txn_balance_amount)
             WHEN txn_type = 3 THEN -(txn_cash_amount + txn_balance_amount)
             WHEN txn_type = 4 THEN (txn_cash_amount + txn_balance_amount)
             ELSE 0 END
        ) as net FROM kb_transactions WHERE txn_name_id = ?`, [p.name_id]);
    const net = netTxns[0]?.net ?? 0;
    const ob = p.opening_balance ?? 0;
    const computed = ob + net;
    const match = Math.abs(computed - (p.amount ?? 0)) < 0.01;
    console.log(`  ${(p.full_name || '').padEnd(35)} ob=${String(ob).padStart(12)} + net_txn=${String(net).padStart(12)} = ${String(computed).padStart(12)}  actual_amount=${String(p.amount).padStart(12)}  ${match ? 'OK' : 'MISMATCH'}`);
}

db.close();
