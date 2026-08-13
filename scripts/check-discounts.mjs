import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
const db = new Database("C:\\Users\\bharg\\AppData\\Roaming\\Vyaparapp\\BusinessNames\\HITECHRAJKOT__t_2025_01_16_10_42_02_zzgo.vyp", { fileMustExist: true });

const vTaxes = new Map(db.all("SELECT tax_code_id, tax_rate FROM kb_tax_code").map(t => [t.tax_code_id, Number(t.tax_rate) || 0]));
const vUnits = new Map(db.all("SELECT unit_id, unit_short_name FROM kb_item_units").map(u => [u.unit_id, u.unit_short_name]));

// Check Flolex pipe's first purchase (txn_id 952 based on earlier output)
const flolex = db.all(`SELECT name_id FROM kb_names WHERE full_name LIKE '%Flolex%' AND name_type = 1`);
if (!flolex.length) { console.log("Flolex not found"); process.exit(1); }

const txns = db.all(`SELECT txn_id, txn_type, txn_cash_amount, txn_balance_amount,
    txn_discount_amount, txn_discount_percent, txn_tax_amount, txn_round_off_amount,
    txn_ac1_amount, ac1_name, txn_ac2_amount, ac2_name, txn_ac3_amount, ac3_name
    FROM kb_transactions WHERE txn_name_id = ? AND txn_type = 2 ORDER BY txn_date`, [flolex[0].name_id]);

for (const t of txns) {
    const total = (t.txn_cash_amount || 0) + (t.txn_balance_amount || 0);
    const lines = db.all(`SELECT item_id, quantity, priceperunit, total_amount,
        lineitem_tax_amount, lineitem_tax_id, lineitem_discount_amount, lineitem_discount_percent
        FROM kb_lineitems WHERE lineitem_txn_id = ?`, [t.txn_id]);

    const lineSum = lines.reduce((s, l) => s + (l.total_amount || 0), 0);

    console.log(`\nPurchase txn ${t.txn_id}: header_total=${total}`);
    console.log(`  discount_amount=${t.txn_discount_amount}, discount_percent=${t.txn_discount_percent}`);
    console.log(`  tax_amount=${t.txn_tax_amount}, round_off=${t.txn_round_off_amount}`);
    console.log(`  ac1=${t.txn_ac1_amount} (${t.ac1_name}), ac2=${t.txn_ac2_amount} (${t.ac2_name}), ac3=${t.txn_ac3_amount} (${t.ac3_name})`);
    console.log(`  line_items (${lines.length}):`);

    let myLineNet = 0, myLineTax = 0;
    for (const l of lines) {
        const gross = (l.quantity || 0) * (l.priceperunit || 0);
        const discPct = l.lineitem_discount_percent || 0;
        const discAmt = discPct > 0 ? gross * discPct / 100 : (l.lineitem_discount_amount || 0);
        const net = gross - discAmt;
        const taxPct = vTaxes.get(l.lineitem_tax_id) || 0;
        const lineTax = net * taxPct / 100;
        myLineNet += net;
        myLineTax += lineTax;
        console.log(`    qty=${l.quantity} rate=${l.priceperunit} gross=${gross.toFixed(2)} disc=${discAmt.toFixed(2)}(${discPct}%) net=${net.toFixed(2)} tax=${lineTax.toFixed(2)}(${taxPct}%) stored_total=${l.total_amount}`);
    }
    const headerDisc = t.txn_discount_percent > 0 ? myLineNet * t.txn_discount_percent / 100 : (t.txn_discount_amount || 0);
    const computed = myLineNet + myLineTax - headerDisc + (t.txn_round_off_amount || 0) + (t.txn_ac1_amount || 0) + (t.txn_ac2_amount || 0) + (t.txn_ac3_amount || 0);
    console.log(`  ERP would compute: lineNet=${myLineNet.toFixed(2)} + lineTax=${myLineTax.toFixed(2)} - headerDisc=${headerDisc.toFixed(2)} + roundOff=${t.txn_round_off_amount} + charges=${(t.txn_ac1_amount||0)+(t.txn_ac2_amount||0)+(t.txn_ac3_amount||0)}`);
    console.log(`  = ${computed.toFixed(2)} vs header_total=${total}`);
    console.log(`  Diff = ${(computed - total).toFixed(2)}`);
}

db.close();
