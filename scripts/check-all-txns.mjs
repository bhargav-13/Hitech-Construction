import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
const db = new Database("C:\\Users\\bharg\\AppData\\Roaming\\Vyaparapp\\BusinessNames\\HITECHRAJKOT__t_2025_01_16_10_42_02_zzgo.vyp", { fileMustExist: true });

const TXN_TYPE = { 1: "SALE", 2: "PURCHASE", 3: "PAYMENT_IN", 4: "PAYMENT_OUT", 7: "EXPENSE", 21: "SALE_RETURN", 23: "PURCHASE_RETURN" };

const targets = ["Jeru majur", "Hirenbhai Vaghasiya", "Kanabhai dudkiya", "Prakashbhai (navagam)"];

for (const target of targets) {
    const p = db.all(`SELECT name_id, full_name, amount FROM kb_names
        WHERE full_name LIKE '%${target}%' AND name_type = 1`)[0];
    if (!p) continue;

    // Get ALL transactions for this party, including expenses
    const txns = db.all(`SELECT txn_type, txn_cash_amount, txn_balance_amount
        FROM kb_transactions WHERE txn_name_id = ?`, [p.name_id]);

    const byType = {};
    for (const t of txns) {
        const type = TXN_TYPE[t.txn_type] || `type_${t.txn_type}`;
        if (!byType[type]) byType[type] = { count: 0, cash: 0, balance: 0, total: 0 };
        byType[type].count += 1;
        byType[type].cash += t.txn_cash_amount || 0;
        byType[type].balance += t.txn_balance_amount || 0;
        byType[type].total += (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
    }

    console.log(`\n${p.full_name} (amount=${p.amount}):`);
    for (const [type, v] of Object.entries(byType)) {
        console.log(`  ${type.padEnd(18)} count=${v.count}  cash=${v.cash}  balance=${v.balance}  total=${v.total}`);
    }

    // Check if expense transactions for this party affect Vyapar's amount
    // Vyapar formula should include expenses: amount = +sale -purchase +PR -SR -pay_in +pay_out -expense
    let net = 0;
    for (const t of txns) {
        const type = TXN_TYPE[t.txn_type];
        const total = (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
        const bal = t.txn_balance_amount || 0;
        if (type === "SALE") net += bal;
        else if (type === "PURCHASE") net -= bal;
        else if (type === "SALE_RETURN") net -= bal;
        else if (type === "PURCHASE_RETURN") net += bal;
        else if (type === "PAYMENT_IN") net -= total;
        else if (type === "PAYMENT_OUT") net += total;
        else if (type === "EXPENSE") net -= bal;
    }
    console.log(`  Net (incl expenses): ${net}  vs amount: ${p.amount}  match: ${Math.abs(net - p.amount) < 1}`);

    // Try without expenses
    let netNoExp = 0;
    for (const t of txns) {
        const type = TXN_TYPE[t.txn_type];
        const total = (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
        const bal = t.txn_balance_amount || 0;
        if (type === "SALE") netNoExp += bal;
        else if (type === "PURCHASE") netNoExp -= bal;
        else if (type === "SALE_RETURN") netNoExp -= bal;
        else if (type === "PURCHASE_RETURN") netNoExp += bal;
        else if (type === "PAYMENT_IN") netNoExp -= total;
        else if (type === "PAYMENT_OUT") netNoExp += total;
    }
    console.log(`  Net (no expenses):   ${netNoExp}  vs amount: ${p.amount}  match: ${Math.abs(netNoExp - p.amount) < 1}`);
}

db.close();
