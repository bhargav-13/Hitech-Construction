/**
 * Sample data for white-label demo installs: a believable construction company (projects, staff
 * with attendance and a payroll run, parties, bills, payments, an RFQ with quotes, tenders, tasks)
 * plus three role logins, so a prospect lands on screens that are already working.
 *
 * Everything created is recorded in a manifest kept on the server (payroll setting DEMO_SAMPLE),
 * so "Clear sample data" removes exactly what was loaded — from any browser — and nothing the
 * prospect added themselves. Runs in the browser with the signed-in Super Admin's session.
 */

import {
  apiRequest,
  bulkEditAttendance,
  createProject,
  createRole,
  createUser,
  deactivateUser,
  deleteProject,
  deleteRole,
  deleteUserPermanently,
  generatePayrollRun,
  getHolidayPolicies,
  getLeavePolicies,
  getPermissions,
  getRoles,
  getShifts,
  getUsers,
  savePayrollProfile,
  updateProject,
  type AttendanceEditRequestBody,
  type PayrollProfileRequest,
  type ProjectResponse,
} from "./api";
import { createTask, deleteTask, setProjectMembers, type TaskPriorityApi, type TaskStatusApi } from "./tasksApi";
import {
  createBankAccount,
  createInvoice,
  createItem,
  createParty,
  createPayment,
  deleteBankAccount,
  deleteInvoice,
  deleteItem,
  deleteParty,
  deletePayment,
  type Item,
  type Party,
} from "./vyaparApi";
import { createRfq, deleteRfq, saveQuote } from "./procurementApi";
import { createTenderApi, deleteTenderApi } from "./tenderApi";

// ---- Manifest ----

const MANIFEST_KEY = "DEMO_SAMPLE";

export interface DemoManifest {
  loadedAt: string;
  roles: number[];
  users: number[];
  projects: number[];
  parties: number[];
  items: number[];
  bankAccounts: number[];
  invoices: number[];
  payments: number[];
  rfqs: number[];
  tenders: string[];
  tasks: number[];
  payrollMonth: string | null;
}

/** The three role logins the seed creates — shown to the presenter after loading. */
export const DEMO_PASSWORD = "Demo@1234";
export const DEMO_LOGINS = [
  { role: "Project Manager", name: "Rohan Mehta", email: "pm@demo.erp" },
  { role: "Site Engineer", name: "Vikas Patel", email: "site@demo.erp" },
  { role: "Accountant", name: "Neha Shah", email: "accounts@demo.erp" },
] as const;

export async function getDemoManifest(): Promise<DemoManifest | null> {
  try {
    const r = await apiRequest<{ key: string; value: string | null }>(`/api/v1/payroll/settings/${MANIFEST_KEY}`);
    return r.value ? (JSON.parse(r.value) as DemoManifest) : null;
  } catch {
    return null;
  }
}

async function saveManifest(m: DemoManifest | null) {
  await apiRequest(`/api/v1/payroll/settings/${MANIFEST_KEY}`, {
    method: "PUT",
    body: { value: m ? JSON.stringify(m) : null },
  });
}

// ---- Date helpers (local = IST for this app's users) ----

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

// ---- Load ----

export type Progress = (step: string) => void;

export async function loadSampleData(onStep: Progress = () => {}): Promise<DemoManifest> {
  const existing = await getDemoManifest();
  if (existing) throw new Error("Sample data is already loaded. Clear it first to load it again.");

  const m: DemoManifest = {
    loadedAt: new Date().toISOString(),
    roles: [],
    users: [],
    projects: [],
    parties: [],
    items: [],
    bankAccounts: [],
    invoices: [],
    payments: [],
    rfqs: [],
    tenders: [],
    tasks: [],
    payrollMonth: null,
  };
  // Saved after every step, so a failure half-way still leaves everything created so far clearable.
  const checkpoint = () => saveManifest(m);

  try {
    // 1. Roles
    onStep("Creating roles");
    const [roles, perms] = await Promise.all([getRoles(), getPermissions()]);
    const superAdmin = roles.find((r) => r.isSystem) ?? roles[0];
    const pick = (prefixes: string[], actions: string[] = ["VIEW", "CREATE", "EDIT", "APPROVE"]) =>
      perms
        .filter((p) => prefixes.some((x) => p.moduleCode === x || p.moduleCode.startsWith(`${x}_`)) && actions.includes(p.action))
        .map((p) => p.id);
    const roleId = async (name: string, description: string, reportsTo: number | null, permissionIds: number[]) => {
      const found = roles.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;
      const r = await createRole({ name, description, reportsToRoleId: reportsTo, permissionIds });
      m.roles.push(r.id);
      return r.id;
    };
    const pmRole = await roleId(
      "Project Manager",
      "Runs projects, purchase and the site team",
      superAdmin?.id ?? null,
      pick(["DASHBOARD", "REPORT", "PROJECT", "TASKOPAD", "PROCUREMENT", "WAREHOUSE", "TENDER", "APPROVAL", "PAYROLL"]),
    );
    const siteRole = await roleId(
      "Site Engineer",
      "Site progress, labour, material requests",
      pmRole,
      pick(["DASHBOARD", "PROJECT", "TASKOPAD", "WAREHOUSE", "PAYROLL"], ["VIEW", "CREATE", "EDIT"]),
    );
    const accRole = await roleId(
      "Accountant",
      "Billing, payments, bank and salary",
      superAdmin?.id ?? null,
      pick(["DASHBOARD", "REPORT", "VYAPAR", "PROCUREMENT", "PAYROLL"]),
    );
    await checkpoint();

    // 2. People — three logins plus site staff who don't sign in
    onStep("Adding staff and logins");
    const existingEmails = new Set(
      (await getUsers(0, 500)).content.map((u) => (u.email ?? "").toLowerCase()).filter(Boolean),
    );
    const loginRole = { "Project Manager": pmRole, "Site Engineer": siteRole, Accountant: accRole } as const;
    const people: { id: number; designation: string; ctc: number; site: boolean }[] = [];
    for (const l of DEMO_LOGINS) {
      if (existingEmails.has(l.email)) continue;
      const u = await createUser({
        email: l.email,
        password: DEMO_PASSWORD,
        fullName: l.name,
        roleId: loginRole[l.role],
        staffType: l.role === "Accountant" ? "OFFICE" : "SITE",
        onPayroll: true,
        phoneNumber: l.role === "Project Manager" ? "9825011223" : l.role === "Site Engineer" ? "9825044556" : "9825077889",
      });
      m.users.push(u.id);
      people.push({ id: u.id, designation: l.role, ctc: l.role === "Project Manager" ? 65000 : l.role === "Site Engineer" ? 42000 : 38000, site: l.role !== "Accountant" });
    }
    const crew: [string, string, number][] = [
      ["Ramesh Solanki", "Site Supervisor", 28000],
      ["Mahesh Rathod", "Mason", 18000],
      ["Suresh Vaghela", "Mason", 18000],
      ["Dinesh Parmar", "Steel Fixer", 17000],
      ["Kishan Chauhan", "Electrician", 20000],
      ["Bharat Makwana", "Helper", 13000],
      ["Jayesh Thakor", "Helper", 13000],
      ["Pooja Desai", "Store Keeper", 22000],
    ];
    for (const [name, designation, ctc] of crew) {
      const u = await createUser({
        isLoginUser: false,
        fullName: name,
        roleId: siteRole,
        staffType: designation === "Store Keeper" ? "OFFICE" : "SITE",
        onPayroll: true,
      });
      m.users.push(u.id);
      people.push({ id: u.id, designation, ctc, site: designation !== "Store Keeper" });
    }
    await checkpoint();

    // 3. Projects
    onStep("Creating projects");
    const projectSpecs: (Partial<ProjectResponse> & { name: string })[] = [
      { name: "Sunrise Residency (G+7)", category: "Residential", customerName: "Sunrise Developers", city: "Ahmedabad", address: "SG Highway, Ahmedabad", status: "ONGOING", health: "HEALTHY", stage: "Structure", progress: 46, projectValue: 48500000, startDate: daysFromToday(-150), endDate: daysFromToday(240) },
      { name: "Ring Road Drainage Line – Phase 2", category: "Water & Drainage", customerName: "Municipal Corporation", city: "Rajkot", address: "150 ft Ring Road, Rajkot", status: "ONGOING", health: "AT_RISK", stage: "Execution", progress: 68, projectValue: 32000000, startDate: daysFromToday(-220), endDate: daysFromToday(40) },
      { name: "Shreeji Commercial Complex", category: "Commercial", customerName: "Shreeji Infra LLP", city: "Vadodara", address: "Alkapuri, Vadodara", status: "ONGOING", health: "HEALTHY", stage: "Foundation", progress: 18, projectValue: 61000000, startDate: daysFromToday(-60), endDate: daysFromToday(420) },
      { name: "Factory Shed – GIDC Sanand", category: "Industrial", customerName: "Apex Polymers Pvt Ltd", city: "Sanand", address: "GIDC Phase 2, Sanand", status: "COMPLETED", health: "HEALTHY", stage: "Handover", progress: 100, projectValue: 14500000, startDate: daysFromToday(-330), endDate: daysFromToday(-35) },
    ];
    const projects: ProjectResponse[] = [];
    for (const spec of projectSpecs) {
      const p = await createProject({ name: spec.name, address: spec.address ?? undefined, city: spec.city ?? undefined });
      m.projects.push(p.id);
      const { name: _name, ...rest } = spec;
      projects.push(await updateProject(p.id, rest).catch(() => p));
    }
    await checkpoint();
    const [pSunrise, pDrain, pShreeji] = projects;
    const pm = people[0]?.id;
    const site = people[1]?.id;
    const acc = people[2]?.id;
    const crewIds = people.slice(3).map((p) => p.id);
    // Project teams: the PM sees all running projects, the site engineer two of them.
    for (const [i, p] of projects.slice(0, 3).entries()) {
      const members = [pm, i < 2 ? site : undefined, ...crewIds.filter((_, j) => j % 3 === i)].filter((x): x is number => !!x);
      await setProjectMembers(p.id, members).catch(() => undefined);
    }

    // 4. Payroll — profiles, two months of attendance, last month's run
    onStep("Setting up payroll and attendance");
    const [shifts, holidays, leaves] = await Promise.all([getShifts(), getHolidayPolicies(), getLeavePolicies()]);
    for (const [i, p] of people.entries()) {
      const basic = Math.round(p.ctc * 0.5);
      const hra = Math.round(p.ctc * 0.2);
      const profile: PayrollProfileRequest = {
        userId: p.id,
        category: "REGULAR",
        designation: p.designation,
        joiningDate: daysFromToday(-400 + i * 25),
        salary: { monthlyCtc: p.ctc, basic, hra, otherAllowances: p.ctc - basic - hra, workType: null, workRate: 0, salaryBasis: "SHIFT", pf: p.ctc >= 20000, esic: p.ctc < 21000, pt: true },
        bankAccount: null,
        ifsc: null,
        bankName: null,
        pan: null,
        documents: null,
        components: null,
        shiftId: shifts[0]?.id ?? null,
        holidayPolicyId: holidays[0]?.id ?? null,
        leavePolicyId: leaves[0]?.id ?? null,
        homeProjectId: p.site ? (projects[i % 3]?.id ?? null) : null,
      };
      await savePayrollProfile(profile).catch(() => undefined);
    }
    const now = new Date();
    const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const rows: AttendanceEditRequestBody[] = [];
    for (let d = new Date(firstPrev); d < now; d.setDate(d.getDate() + 1)) {
      const date = iso(d);
      const sunday = d.getDay() === 0;
      for (const [i, p] of people.entries()) {
        // Deterministic, believable mix: mostly present, the odd absence, half day or leave.
        const k = (d.getDate() * 7 + i * 13) % 29;
        const code = sunday ? "WO" : k === 0 ? "A" : k === 1 ? "HD" : k === 2 ? "PL" : "P";
        rows.push({
          userId: p.id,
          date,
          code,
          inTime: code === "P" || code === "HD" ? "09:0" + (k % 10) : null,
          outTime: code === "P" ? "18:" + String(10 + (k % 40)).padStart(2, "0") : code === "HD" ? "13:30" : null,
          projectId: p.site && code !== "WO" ? (projects[i % 3]?.id ?? null) : null,
        });
      }
    }
    for (let i = 0; i < rows.length; i += 150) await bulkEditAttendance(rows.slice(i, i + 150));
    const runMonth = `${firstPrev.getFullYear()}-${String(firstPrev.getMonth() + 1).padStart(2, "0")}`;
    await generatePayrollRun(runMonth).then(() => (m.payrollMonth = runMonth)).catch(() => undefined);
    await checkpoint();

    // 5. Parties, items, bank
    onStep("Adding customers, suppliers and items");
    const partySpecs: Partial<Party>[] = [
      { name: "Sunrise Developers", partyType: "CUSTOMER", phone: "9824012345", gstin: "24AAKCS1234F1Z5", gstType: "Registered Business - Regular", state: "Gujarat", billingAddress: "SG Highway, Ahmedabad" },
      { name: "Municipal Corporation", partyType: "CUSTOMER", phone: "2812450000", state: "Gujarat", billingAddress: "Dhebar Road, Rajkot" },
      { name: "Shreeji Infra LLP", partyType: "CUSTOMER", phone: "9824098765", gstin: "24AAJFS5678K1Z2", gstType: "Registered Business - Regular", state: "Gujarat", billingAddress: "Alkapuri, Vadodara" },
      { name: "Ambuja Cement Distributors", partyType: "SUPPLIER", phone: "9898011122", gstin: "24AABCA4321M1Z9", gstType: "Registered Business - Regular", state: "Gujarat" },
      { name: "Shree Steel Traders", partyType: "SUPPLIER", phone: "9898033344", gstin: "24AAECS8765N1Z1", gstType: "Registered Business - Regular", state: "Gujarat" },
      { name: "Patel Sand & Aggregates", partyType: "SUPPLIER", phone: "9898055566", state: "Gujarat" },
      { name: "Om Electricals", partyType: "SUPPLIER", phone: "9898077788", state: "Gujarat" },
    ];
    const parties: Party[] = [];
    for (const spec of partySpecs) {
      const p = await createParty({ openingBalance: 0, isActive: true, ...spec });
      m.parties.push(p.id);
      parties.push(p);
    }
    const [cSunrise, cMunicipal, cShreeji, sCement, sSteel, sSand] = parties;
    const itemSpecs = [
      { name: "OPC 53 Grade Cement", unit: "Bags", purchasePrice: 365, salePrice: 410, taxPercent: 28, hsn: "2523", category: "Cement" },
      { name: "TMT Bar Fe 500D 12mm", unit: "Kg", purchasePrice: 58, salePrice: 64, taxPercent: 18, hsn: "7214", category: "Steel" },
      { name: "River Sand", unit: "Brass", purchasePrice: 5200, salePrice: 5800, taxPercent: 5, hsn: "2505", category: "Aggregates" },
      { name: "20mm Aggregate", unit: "Brass", purchasePrice: 4300, salePrice: 4800, taxPercent: 5, hsn: "2517", category: "Aggregates" },
      { name: "Fly Ash Bricks", unit: "Nos", purchasePrice: 6, salePrice: 7.5, taxPercent: 5, hsn: "6815", category: "Masonry" },
      { name: "RA Bill – Civil Works", unit: "LS", purchasePrice: 0, salePrice: 0, taxPercent: 18, hsn: "9954", category: "Services", isService: true },
    ];
    const items: Item[] = [];
    for (const spec of itemSpecs) {
      const it = await createItem({ stockQty: 0, lowStockAlert: 0, ...spec });
      m.items.push(it.id);
      items.push(it);
    }
    const bank = await createBankAccount({ name: "HDFC Bank – Current A/c", openingBalance: 2500000 } as Parameters<typeof createBankAccount>[0]).catch(() => null);
    if (bank) m.bankAccounts.push(bank.id);
    await checkpoint();

    // 6. Bills and payments
    onStep("Creating bills and payments");
    const [cement, steel, sand, aggregate, bricks, raBill] = items;
    const line = (it: (typeof items)[number], quantity: number, rate: number) => ({
      itemId: it.id,
      itemName: it.name,
      unit: it.unit,
      quantity,
      rate,
      taxPercent: it.taxPercent,
    });
    const doc = async (body: Parameters<typeof createInvoice>[0]) => {
      const inv = await createInvoice(body);
      m.invoices.push(inv.id);
      return inv;
    };
    const sale1 = await doc({ docType: "SALE", partyId: cSunrise.id, projectId: pSunrise.id, invoiceDate: daysFromToday(-40), stateOfSupply: "Gujarat", lines: [{ ...line(raBill, 1, 4250000), description: "RA Bill 3 – slab casting up to 5th floor" }] });
    const sale2 = await doc({ docType: "SALE", partyId: cMunicipal.id, projectId: pDrain.id, invoiceDate: daysFromToday(-22), stateOfSupply: "Gujarat", lines: [{ ...line(raBill, 1, 3180000), description: "RA Bill 5 – 1.2 km pipeline laid & tested" }] });
    await doc({ docType: "SALE", partyId: cShreeji.id, projectId: pShreeji.id, invoiceDate: daysFromToday(-6), stateOfSupply: "Gujarat", lines: [{ ...line(raBill, 1, 1650000), description: "RA Bill 1 – excavation & PCC" }] });
    const pur1 = await doc({ docType: "PURCHASE", partyId: sCement.id, projectId: pSunrise.id, invoiceDate: daysFromToday(-30), invoiceNo: "AC/2611/0412", stateOfSupply: "Gujarat", lines: [line(cement, 800, 365)] });
    await doc({ docType: "PURCHASE", partyId: sSteel.id, projectId: pSunrise.id, invoiceDate: daysFromToday(-18), invoiceNo: "SST/1187", stateOfSupply: "Gujarat", lines: [line(steel, 12500, 58)] });
    await doc({ docType: "PURCHASE", partyId: sSand.id, projectId: pShreeji.id, invoiceDate: daysFromToday(-9), invoiceNo: "PSA-221", stateOfSupply: "Gujarat", lines: [line(sand, 14, 5200), line(aggregate, 10, 4300), line(bricks, 18000, 6)] });
    const pay = async (body: Parameters<typeof createPayment>[0]) => {
      const p = await createPayment({ bankAccountId: bank?.id ?? null, mode: "Bank", ...body });
      m.payments.push(p.id);
    };
    await pay({ direction: "IN", partyId: cSunrise.id, projectId: pSunrise.id, paymentDate: daysFromToday(-25), amount: 4000000, links: [{ invoiceId: sale1.id, amount: 4000000 }] });
    await pay({ direction: "IN", partyId: cMunicipal.id, projectId: pDrain.id, paymentDate: daysFromToday(-4), amount: 2500000, links: [{ invoiceId: sale2.id, amount: 2500000 }] });
    await pay({ direction: "OUT", partyId: sCement.id, projectId: pSunrise.id, paymentDate: daysFromToday(-14), amount: 300000, links: [{ invoiceId: pur1.id, amount: 300000 }] });
    await checkpoint();

    // 7. RFQ with three quotes — what AI quotation analysis compares
    onStep("Creating a quotation comparison");
    const rfq = await createRfq({
      title: "Cement & steel for 6th–7th floor slabs",
      projectId: pSunrise.id,
      rfqDate: daysFromToday(-3),
      dueBy: daysFromToday(4),
      lines: [
        { itemId: cement.id, itemName: cement.name, unit: cement.unit, quantity: 1200, budgetRate: 370 },
        { itemId: steel.id, itemName: steel.name, unit: steel.unit, quantity: 18000, budgetRate: 59 },
      ],
      supplierPartyIds: [sCement.id, sSteel.id, sSand.id],
    });
    m.rfqs.push(rfq.id);
    const [lCement, lSteel] = rfq.lines;
    const quotes: [Party, number, number, number][] = [
      [sCement, 362, 60.5, 3],
      [sSteel, 371, 57.2, 5],
      [sSand, 368, 58.8, 7],
    ];
    for (const [vendor, cRate, sRate, days] of quotes) {
      await saveQuote(rfq.id, {
        vendorPartyId: vendor.id,
        receivedOn: daysFromToday(-1),
        deliveryDays: days,
        taxPercent: 0,
        lines: [
          { rfqLineId: lCement.id, rate: cRate },
          { rfqLineId: lSteel.id, rate: sRate },
        ],
      }).catch(() => undefined);
    }
    await checkpoint();

    // 8. Tenders
    onStep("Adding tenders");
    const tenderSpecs = [
      { stage: "SORTING", tenderId: "2026_RMC_48211_1", department: "Municipal Corporation", nameOfWork: "Construction of community hall at Ward 12", location: "Rajkot", estimatedCost: 18500000, dueDate: daysFromToday(9) },
      { stage: "RESEARCH", tenderId: "2026_RB_51902_1", department: "Roads & Buildings Dept.", nameOfWork: "Widening of SH-17 (km 12/0 to 18/4)", location: "Morbi", estimatedCost: 92000000, dueDate: daysFromToday(16) },
      { stage: "APPLIED", status: "TECH_OPENED", tenderId: "2026_GWSSB_39870_2", department: "Water Supply Board", nameOfWork: "Rising main and ESR at Gondal", location: "Gondal", estimatedCost: 54000000, submissionDate: daysFromToday(-12) },
      { stage: "WON", status: "WON", tenderId: "2026_AUDA_31420_1", department: "Urban Development Authority", nameOfWork: "Storm water drainage – Zone 4", location: "Ahmedabad", estimatedCost: 38000000, contractValue: 36400000 },
    ] as const;
    for (const t of tenderSpecs) {
      const created = await createTenderApi({ source: "PORTAL", ...t }).catch(() => null);
      if (created) m.tenders.push(created.id);
    }
    await checkpoint();

    // 9. Tasks
    onStep("Assigning tasks");
    const taskSpecs: [string, number | undefined, number | undefined, TaskStatusApi, TaskPriorityApi, number][] = [
      ["Shuttering check before 6th floor slab", pSunrise.id, site, "IN_PROGRESS", "HIGH", 1],
      ["Cube test results – 5th floor slab", pSunrise.id, site, "PENDING", "MEDIUM", 3],
      ["Hydro test of 400 mm line, chainage 1.2–1.6 km", pDrain.id, site, "STUCK", "HIGH", -2],
      ["Submit RA Bill 6 to Municipal Corporation", pDrain.id, pm, "PENDING", "HIGH", 5],
      ["Finalise cement & steel vendor", pSunrise.id, pm, "IN_PROGRESS", "MEDIUM", 2],
      ["Reconcile Shree Steel Traders ledger", pSunrise.id, acc, "PENDING", "LOW", 7],
      ["Excavation for footing F1–F12", pShreeji.id, site, "COMPLETED", "MEDIUM", -6],
    ];
    for (const [title, projectId, assignee, status, priority, due] of taskSpecs) {
      if (!assignee) continue;
      const t = await createTask({ title, projectId, assigneeId: assignee, status, priority, dueDate: daysFromToday(due) }).catch(() => null);
      if (t) m.tasks.push(t.id);
    }
    await checkpoint();
    onStep("Done");
    return m;
  } catch (e) {
    await checkpoint().catch(() => undefined);
    throw e;
  }
}

// ---- Clear ----

/**
 * Removes everything the manifest lists, newest first. Each delete is best-effort: something the
 * prospect has since linked to a sample record (a payment against a sample bill, say) can block
 * one delete without stopping the rest. Users that can't be hard-deleted are deactivated.
 */
export async function clearSampleData(onStep: Progress = () => {}): Promise<{ failed: string[] }> {
  const m = await getDemoManifest();
  if (!m) return { failed: [] };
  const failed: string[] = [];
  const each = async <T>(label: string, ids: T[], fn: (id: T) => Promise<unknown>) => {
    onStep(`Removing ${label}`);
    for (const id of [...ids].reverse()) {
      try {
        await fn(id);
      } catch {
        failed.push(`${label} #${id}`);
      }
    }
  };
  await each("tasks", m.tasks, deleteTask);
  await each("quotation requests", m.rfqs, deleteRfq);
  await each("payments", m.payments, deletePayment);
  await each("bills", m.invoices, deleteInvoice);
  await each("bank accounts", m.bankAccounts, deleteBankAccount);
  await each("items", m.items, deleteItem);
  await each("parties", m.parties, deleteParty);
  await each("tenders", m.tenders, deleteTenderApi);
  onStep("Removing staff");
  for (const id of [...m.users].reverse()) {
    try {
      await deleteUserPermanently(id);
    } catch {
      try {
        await deactivateUser(id);
      } catch {
        failed.push(`user #${id}`);
      }
    }
  }
  await each("projects", m.projects, deleteProject);
  await each("roles", m.roles, (id) => deleteRole(id));
  await saveManifest(null);
  onStep("Done");
  return { failed };
}
