/**
 * Seed the Vyapar module with test data via the running backend's REST API.
 *
 *   node scripts/seed-vyapar.mjs
 *
 * Idempotent-ish and re-runnable: parties and items are matched by name and reused, and the
 * transaction set (invoices + payments) is only seeded when the books are currently empty, so
 * running it twice won't pile up duplicate invoices. To reseed transactions, delete the existing
 * ones first (or wipe the vyapar tables).
 *
 * Config via env:
 *   API_BASE   default http://localhost:8080
 *   SEED_EMAIL default admin@hitech.local
 *   SEED_PASS  default Admin@123
 */

const API = process.env.API_BASE ?? "http://localhost:8080";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";

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

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// ---- Data ----------------------------------------------------------------

const PARTIES = [
  { name: "Reliable Builders Pvt Ltd", partyType: "CUSTOMER", partyGroup: "Wholesale", state: "Maharashtra", phone: "9820011122", gstin: "27AABCR1234M1Z5", gstType: "Registered Business - Regular", billingAddress: "Plot 14, MIDC, Pune", creditLimit: 500000 },
  { name: "Sunrise Interiors", partyType: "CUSTOMER", partyGroup: "Retail", state: "Maharashtra", phone: "9822033344", gstin: "27AAFCS5678N1Z2", gstType: "Registered Business - Regular" },
  { name: "Metro Contractors", partyType: "CUSTOMER", partyGroup: "Wholesale", state: "Gujarat", phone: "9898022211", openingBalance: 25000 },
  { name: "Green Valley Homes", partyType: "CUSTOMER", partyGroup: "Retail", state: "Karnataka", phone: "9741002233" },
  { name: "Anil Hardware Supplies", partyType: "SUPPLIER", partyGroup: "Suppliers", state: "Maharashtra", phone: "9800112233", gstin: "27AAECA9012P1Z9", gstType: "Registered Business - Regular" },
  { name: "Deccan Cement Traders", partyType: "SUPPLIER", partyGroup: "Suppliers", state: "Maharashtra", phone: "9811223344" },
  { name: "Kumar Electricals", partyType: "SUPPLIER", partyGroup: "Suppliers", state: "Telangana", phone: "9700334455" },
];

const ITEMS = [
  { name: "OPC 53 Cement Bag", category: "Cement", unit: "Bags", salePrice: 420, purchasePrice: 360, taxPercent: 28, stockQty: 500, lowStockAlert: 50, hsn: "2523" },
  { name: "TMT Steel Bar 12mm", category: "Steel", unit: "Nos", salePrice: 68, purchasePrice: 58, taxPercent: 18, stockQty: 2000, lowStockAlert: 200, hsn: "7214" },
  { name: "Red Bricks (Class A)", category: "Masonry", unit: "Nos", salePrice: 9, purchasePrice: 7, taxPercent: 5, stockQty: 10000, lowStockAlert: 1000, hsn: "6904" },
  { name: "Wall Putty 20kg", category: "Finishing", unit: "Bags", salePrice: 650, purchasePrice: 520, taxPercent: 18, stockQty: 120, lowStockAlert: 20, hsn: "3214" },
  { name: "Emulsion Paint 20L", category: "Finishing", unit: "Bucket", salePrice: 3200, purchasePrice: 2600, taxPercent: 18, stockQty: 40, lowStockAlert: 10, hsn: "3209" },
  { name: "Site Supervision", category: "Services", unit: "Nos", salePrice: 15000, purchasePrice: 0, taxPercent: 18, isService: true },
  { name: "Electrical Wiring Work", category: "Services", unit: "Nos", salePrice: 25000, purchasePrice: 0, taxPercent: 18, isService: true },
];

// ---- Ensure masters (match by name, create missing) ----------------------

async function ensureParties() {
  const existing = await api(`/api/v1/vyapar/parties`);
  const byName = new Map(existing.map((p) => [p.name, p]));
  const out = {};
  for (const p of PARTIES) {
    if (byName.has(p.name)) {
      out[p.name] = byName.get(p.name);
      continue;
    }
    out[p.name] = await api(`/api/v1/vyapar/parties`, { method: "POST", body: { isActive: true, ...p } });
    console.log(`  + party  ${p.name}`);
  }
  return out;
}

async function ensureItems() {
  const existing = await api(`/api/v1/vyapar/items`);
  const byName = new Map(existing.map((i) => [i.name, i]));
  const out = {};
  for (const it of ITEMS) {
    if (byName.has(it.name)) {
      out[it.name] = byName.get(it.name);
      continue;
    }
    out[it.name] = await api(`/api/v1/vyapar/items`, {
      method: "POST",
      body: { isActive: true, isService: false, ...it },
    });
    console.log(`  + item   ${it.name}`);
  }
  return out;
}

// ---- Transactions --------------------------------------------------------

function line(item, quantity, rateOverride) {
  return {
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    quantity,
    rate: rateOverride ?? Number(item.salePrice),
    discountPercent: 0,
    taxPercent: Number(item.taxPercent) || 0,
  };
}

async function invoice(docType, party, lines, opts = {}) {
  const body = {
    docType,
    partyId: party?.id ?? null,
    invoiceDate: opts.date ?? today(),
    paymentType: opts.paymentType ?? "Credit",
    paidAmount: opts.paidAmount ?? 0,
    isCash: opts.isCash ?? false,
    notes: opts.notes ?? null,
    lines,
  };
  const inv = await api(`/api/v1/vyapar/invoices`, { method: "POST", body });
  console.log(`  + ${docType.padEnd(16)} ${inv.invoiceNo} · ${party?.name ?? "—"}`);
  return inv;
}

async function payment(direction, party, amount, opts = {}) {
  const body = {
    direction,
    partyId: party.id,
    invoiceId: null, // party-level — matches how the UI records standalone payments
    amount,
    mode: opts.mode ?? "Cash",
    reference: opts.reference ?? null,
    paymentDate: opts.date ?? today(),
  };
  const pay = await api(`/api/v1/vyapar/payments`, { method: "POST", body });
  console.log(`  + PAYMENT_${direction.padEnd(9)} ${amount} · ${party.name}`);
  return pay;
}

async function seedTransactions(P, I) {
  const cust = (n) => P[n];
  const supp = (n) => P[n];

  // --- Sales & customer-side docs ---
  await invoice("SALE", cust("Reliable Builders Pvt Ltd"),
    [line(I["OPC 53 Cement Bag"], 100), line(I["TMT Steel Bar 12mm"], 300)],
    { date: daysAgo(20), paidAmount: 30000, paymentType: "Credit" });

  await invoice("SALE", cust("Sunrise Interiors"),
    [line(I["Wall Putty 20kg"], 20), line(I["Emulsion Paint 20L"], 6)],
    { date: daysAgo(12), paidAmount: 0 });

  await invoice("SALE", cust("Green Valley Homes"),
    [line(I["Red Bricks (Class A)"], 4000), line(I["Site Supervision"], 1)],
    { date: daysAgo(6), paidAmount: 61000, isCash: true, paymentType: "Cash" });

  await invoice("SALE_RETURN", cust("Reliable Builders Pvt Ltd"),
    [line(I["OPC 53 Cement Bag"], 5)], { date: daysAgo(4) });

  await invoice("ESTIMATE", cust("Metro Contractors"),
    [line(I["TMT Steel Bar 12mm"], 500), line(I["OPC 53 Cement Bag"], 150)], { date: daysAgo(10) });

  await invoice("SALE_ORDER", cust("Metro Contractors"),
    [line(I["Red Bricks (Class A)"], 8000)], { date: daysAgo(8) });

  await invoice("PROFORMA", cust("Sunrise Interiors"),
    [line(I["Electrical Wiring Work"], 1)], { date: daysAgo(9) });

  await invoice("DELIVERY_CHALLAN", cust("Green Valley Homes"),
    [line(I["Wall Putty 20kg"], 10)], { date: daysAgo(3) });

  // --- Purchases & supplier-side docs (buy at purchase price) ---
  await invoice("PURCHASE", supp("Deccan Cement Traders"),
    [line(I["OPC 53 Cement Bag"], 300, Number(I["OPC 53 Cement Bag"].purchasePrice))],
    { date: daysAgo(22), paidAmount: 50000 });

  await invoice("PURCHASE", supp("Anil Hardware Supplies"),
    [line(I["TMT Steel Bar 12mm"], 800, Number(I["TMT Steel Bar 12mm"].purchasePrice)),
     line(I["Wall Putty 20kg"], 60, Number(I["Wall Putty 20kg"].purchasePrice))],
    { date: daysAgo(15), paidAmount: 0 });

  await invoice("PURCHASE_RETURN", supp("Anil Hardware Supplies"),
    [line(I["Wall Putty 20kg"], 4, Number(I["Wall Putty 20kg"].purchasePrice))], { date: daysAgo(5) });

  await invoice("PURCHASE_ORDER", supp("Kumar Electricals"),
    [line(I["Emulsion Paint 20L"], 20, Number(I["Emulsion Paint 20L"].purchasePrice))], { date: daysAgo(7) });

  // --- Expenses (category rides in notes, matching the UI) ---
  await invoice("EXPENSE", null, [{ itemId: null, itemName: "Diesel for site vehicle", quantity: 1, rate: 8500, taxPercent: 0, discountPercent: 0 }],
    { date: daysAgo(11), notes: "Fuel", isCash: true, paidAmount: 8500, paymentType: "Cash" });
  await invoice("EXPENSE", null, [{ itemId: null, itemName: "Site office rent", quantity: 1, rate: 18000, taxPercent: 0, discountPercent: 0 }],
    { date: daysAgo(2), notes: "Rent", isCash: true, paidAmount: 18000, paymentType: "Cash" });
  await invoice("EXPENSE", null, [{ itemId: null, itemName: "Labour wages", quantity: 1, rate: 42000, taxPercent: 0, discountPercent: 0 }],
    { date: daysAgo(1), notes: "Wages" });

  // --- Standalone payments ---
  await payment("IN", cust("Reliable Builders Pvt Ltd"), 40000, { date: daysAgo(3), mode: "Bank", reference: "NEFT-88213" });
  await payment("IN", cust("Sunrise Interiors"), 15000, { date: daysAgo(1), mode: "UPI", reference: "UPI-4521" });
  await payment("OUT", supp("Deccan Cement Traders"), 30000, { date: daysAgo(2), mode: "Bank", reference: "NEFT-77120" });
  await payment("OUT", supp("Anil Hardware Supplies"), 20000, { date: today(), mode: "Cheque", reference: "CHQ-004512" });
}

// ---- Main ----------------------------------------------------------------

async function main() {
  console.log(`Vyapar seed → ${API}`);
  const auth = await api(`/api/v1/auth/login`, { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  console.log(`Logged in as ${auth.user?.email ?? EMAIL}\n`);

  console.log("Parties:");
  const P = await ensureParties();
  console.log("Items:");
  const I = await ensureItems();

  const existingInvoices = await api(`/api/v1/vyapar/invoices`);
  const existingPayments = await api(`/api/v1/vyapar/payments`);
  if (existingInvoices.length > 0 || existingPayments.length > 0) {
    console.log(`\nBooks already have ${existingInvoices.length} invoices / ${existingPayments.length} payments — skipping transaction seed.`);
    console.log("Delete existing transactions first if you want a fresh set.");
  } else {
    console.log("\nTransactions:");
    await seedTransactions(P, I);
  }

  console.log("\n✓ Done.");
}

main().catch((err) => {
  console.error(`\n✗ Seed failed: ${err.message}`);
  process.exit(1);
});
