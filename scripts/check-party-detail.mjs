import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
const db = new Database("C:\\Users\\bharg\\AppData\\Roaming\\Vyaparapp\\BusinessNames\\HITECHRAJKOT__t_2025_01_16_10_42_02_zzgo.vyp", { fileMustExist: true });

const TXN_TYPE = { 1: "SALE", 2: "PURCHASE", 3: "PAYMENT_IN", 4: "PAYMENT_OUT", 7: "EXPENSE", 21: "SALE_RETURN", 23: "PURCHASE_RETURN" };

const parties = db.all(`SELECT name_id, full_name, amount FROM kb_names
    WHERE name_type = 1 AND full_name IS NOT NULL AND TRIM(full_name) <> ''
    AND amount <> 0 ORDER BY amount`);

console.log("=== Parties with non-zero balances ===");
for (const p of parties) {
    const txns = db.all(`SELECT txn_type, txn_cash_amount, txn_balance_amount
        FROM kb_transactions WHERE txn_name_id = ? ORDER BY txn_date`, [p.name_id]);

    let purchaseOutstanding = 0;
    let saleOutstanding = 0;
    let paymentInUnused = 0;
    let paymentOutUnused = 0;
    let saleReturnOutstanding = 0;
    let purchaseReturnOutstanding = 0;

    for (const t of txns) {
        const type = TXN_TYPE[t.txn_type];
        const total = (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
        const balance = t.txn_balance_amount || 0;

        if (type === "SALE") saleOutstanding += balance;
        else if (type === "PURCHASE") purchaseOutstanding += balance;
        else if (type === "PAYMENT_IN") paymentInUnused += total;
        else if (type === "PAYMENT_OUT") paymentOutUnused += total;
        else if (type === "SALE_RETURN") saleReturnOutstanding += balance;
        else if (type === "PURCHASE_RETURN") purchaseReturnOutstanding += balance;
    }

    // ERP formula: sale - purchase - sale_return + purchase_return - payment_in_unused + payment_out_unused
    const erpDerived = saleOutstanding - purchaseOutstanding - saleReturnOutstanding + purchaseReturnOutstanding - paymentInUnused + paymentOutUnused;

    console.log(`\n${p.full_name} (Vyapar amount=${p.amount}):`);
    console.log(`  sale_out=${saleOutstanding} purchase_out=${purchaseOutstanding} SR=${saleReturnOutstanding} PR=${purchaseReturnOutstanding}`);
    console.log(`  pay_in=${paymentInUnused} pay_out=${paymentOutUnused}`);
    console.log(`  ERP derived (all payments unused) = ${erpDerived}`);
    console.log(`  Match: ${Math.abs(erpDerived - p.amount) < 1 ? 'YES' : 'NO (diff=' + (erpDerived - p.amount) + ')'}`);
}

db.close();
