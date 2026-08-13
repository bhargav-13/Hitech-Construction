import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
const db = new Database("C:\\Users\\bharg\\AppData\\Roaming\\Vyaparapp\\BusinessNames\\HITECHRAJKOT__t_2025_01_16_10_42_02_zzgo.vyp", { fileMustExist: true });

const TXN_TYPE = { 1: "SALE", 2: "PURCHASE", 3: "PAYMENT_IN", 4: "PAYMENT_OUT", 7: "EXPENSE", 21: "SALE_RETURN", 23: "PURCHASE_RETURN" };

const targets = ["Flolex", "Hirenbhai", "Jeru", "Kanabhai", "Prakashbhai (navagam)", "Prakashbhai bhojani", "K M METAL"];

for (const target of targets) {
    const p = db.all(`SELECT name_id, full_name, amount FROM kb_names
        WHERE name_type = 1 AND full_name LIKE '%${target}%'`)[0];
    if (!p) { console.log(`\n${target}: NOT FOUND`); continue; }

    const txns = db.all(`SELECT txn_id, txn_type, txn_cash_amount, txn_balance_amount, txn_date
        FROM kb_transactions WHERE txn_name_id = ? ORDER BY txn_date`, [p.name_id]);

    console.log(`\n${p.full_name} (Vyapar amount=${p.amount}):`);
    console.log(`  ${txns.length} transactions:`);

    let totalInvoiceTotal = 0, totalInvoiceBalance = 0, totalPayments = 0;

    for (const t of txns) {
        const type = TXN_TYPE[t.txn_type] || `type_${t.txn_type}`;
        const total = (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
        const paid = t.txn_cash_amount || 0;
        const balance = t.txn_balance_amount || 0;
        console.log(`    ${t.txn_date?.slice(0,10)} ${type.padEnd(16)} total=${total.toFixed(2).padStart(12)} paid=${paid.toFixed(2).padStart(12)} balance=${balance.toFixed(2).padStart(12)}`);

        if (["PURCHASE", "SALE", "SALE_RETURN", "PURCHASE_RETURN", "EXPENSE"].includes(type)) {
            totalInvoiceTotal += total;
            totalInvoiceBalance += balance;
        } else {
            totalPayments += total;
        }
    }

    // Check line items for purchase transactions to see if ERP re-computation matches
    const purchaseTxns = txns.filter(t => TXN_TYPE[t.txn_type] === "PURCHASE");
    for (const pt of purchaseTxns) {
        const lines = db.all(`SELECT lineitem_txn_id, item_id, quantity, priceperunit, total_amount,
            lineitem_tax_amount, lineitem_tax_id, lineitem_discount_amount, lineitem_discount_percent
            FROM kb_lineitems WHERE lineitem_txn_id = ?`, [pt.txn_id]);
        const total = (pt.txn_cash_amount || 0) + (pt.txn_balance_amount || 0);
        const lineSum = lines.reduce((s, l) => s + (l.total_amount || 0), 0);
        if (Math.abs(total - lineSum) > 0.01) {
            console.log(`    ⚠ Purchase txn ${pt.txn_id}: header total=${total}, line_items_sum=${lineSum}, diff=${total - lineSum}`);
        }
    }
}

db.close();
