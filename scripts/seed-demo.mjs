/**
 * Demo data for the modules the other seed scripts do not cover: team members (+ payroll
 * profiles), Taskopad tasks, to-dos, tenders, assets and equipment.
 *
 *   node scripts/seed-demo.mjs
 *
 * Run AFTER seed-vyapar.mjs (assets/equipment use Vyapar parties as vendors/holders).
 * Re-runnable: every record is matched by name/title/tender id and skipped if it already exists.
 * Posted through the REST API so numbering and validation match the app.
 *
 * Config: API_BASE (default http://localhost:8080), SEED_EMAIL, SEED_PASS.
 */

const API = process.env.API_BASE ?? "http://localhost:8080";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";

let token = "";
let failures = 0;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return data;
}
const list = (d) => (Array.isArray(d) ? d : d?.content ?? []);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Run one create; log and carry on if it fails so one bad record doesn't stop the seed. */
async function attempt(label, fn) {
  try {
    const r = await fn();
    console.log(`  + ${label}`);
    return r;
  } catch (e) {
    failures++;
    console.log(`  ✗ ${label}: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------------------------
const TEAM = [
  { fullName: "Rajesh Patel", dept: "Civil", staffType: "SITE", designation: "Site Engineer", ctc: 45000, phone: "9824011001" },
  { fullName: "Ketan Bhatt", dept: "Civil", staffType: "SITE", designation: "Site Supervisor", ctc: 32000, phone: "9824011002" },
  { fullName: "Mehul Joshi", dept: "Plumbing", staffType: "SITE", designation: "Pipeline Foreman", ctc: 28000, phone: "9824011003" },
  { fullName: "Priya Shah", dept: "Accounts", staffType: "OFFICE", designation: "Accountant", ctc: 38000, phone: "9824011004" },
  { fullName: "Nikhil Desai", dept: "Procurement", staffType: "OFFICE", designation: "Purchase Executive", ctc: 34000, phone: "9824011005" },
  { fullName: "Sanjay Vaghela", dept: "Electrical", staffType: "SITE", designation: "Electrician", ctc: 24000, phone: "9824011006" },
  { fullName: "Hetal Mehta", dept: "Civil", staffType: "OFFICE", designation: "Tender Executive", ctc: 36000, phone: "9824011007" },
  { fullName: "Bharat Rathod", dept: "Civil", staffType: "SITE", designation: "Mason", ctc: 18000, phone: "9824011008" },
];

async function seedTeam(depts) {
  console.log("\nTeam:");
  const roles = list(await api("/api/v1/roles"));
  let role = roles.find((r) => r.name === "Site Staff");
  if (!role) role = await attempt("role Site Staff", () => api("/api/v1/roles", { method: "POST", body: { name: "Site Staff", description: "Demo staff role (no system access)", permissionIds: [] } }));
  role ??= roles[0];

  const existing = list(await api("/api/v1/users?size=200"));
  const users = {};
  for (const m of TEAM) {
    const found = existing.find((u) => u.fullName === m.fullName);
    if (found) { users[m.fullName] = found; continue; }
    const u = await attempt(`user ${m.fullName} (${m.designation})`, () =>
      api("/api/v1/users", { method: "POST", body: {
        fullName: m.fullName, phoneNumber: m.phone, roleId: role.id,
        departmentId: depts[m.dept]?.id ?? null, staffType: m.staffType, onPayroll: true, isLoginUser: false,
      } }));
    if (u) users[m.fullName] = u;
  }

  console.log("\nPayroll profiles:");
  const profiles = list(await api("/api/v1/payroll/profiles").catch(() => []));
  for (const m of TEAM) {
    const u = users[m.fullName];
    if (!u || profiles.some((p) => p.userId === u.id)) continue;
    const basic = Math.round(m.ctc * 0.5);
    await attempt(`profile ${m.fullName} ₹${m.ctc}/month`, () =>
      api("/api/v1/payroll/profiles", { method: "POST", body: {
        userId: u.id, category: "REGULAR", designation: m.designation, joiningDate: day(-400 + TEAM.indexOf(m) * 37),
        salary: { monthlyCtc: m.ctc, basic, hra: Math.round(m.ctc * 0.2), otherAllowances: m.ctc - basic - Math.round(m.ctc * 0.2), salaryBasis: "SHIFT", pf: m.ctc >= 25000, esic: m.ctc < 21000, pt: true },
        bankName: "State Bank of India", ifsc: "SBIN0060075",
      } }));
  }
  return users;
}

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------
async function seedTasks(users, projects, depts, adminId) {
  console.log("\nTasks:");
  const uid = (n) => users[n]?.id ?? adminId;
  const pid = (name) => projects.find((p) => p.name.startsWith(name))?.id ?? null;
  const PLAN = [
    { title: "Hydro test of 300mm DI line — Chainage 2+400 to 3+100", project: "RMC D.I. Pipeline - Phase 2", who: "Mehul Joshi", dept: "Plumbing", status: "In Progress", priority: "High", progress: 60, due: 3,
      subtasks: ["Fill line and purge air", "Hold 10 kg/cm² for 2 hours", "Record readings with RMC engineer"] },
    { title: "Submit RA Bill No. 4 to RMC", project: "RMC D.I. Pipeline - Phase 1", who: "Priya Shah", dept: "Accounts", status: "Pending", priority: "High", progress: 0, due: 5,
      subtasks: ["Measurement book sign-off", "Attach test reports", "Covering letter"] },
    { title: "Shuttering for slab — first floor", project: "HI-TECH OFFICE", who: "Rajesh Patel", dept: "Civil", status: "In Progress", priority: "Medium", progress: 40, due: 7 },
    { title: "Collect three quotes for 450mm sluice valves", project: "Pedak Road", who: "Nikhil Desai", dept: "Procurement", status: "Completed", priority: "Medium", progress: 100, due: -4 },
    { title: "CC road levelling — Ward 3", project: "Ishwariya", who: "Ketan Bhatt", dept: "Civil", status: "Stuck", priority: "High", progress: 25, due: -2,
      description: "Waiting on Gram Panchayat to clear encroachment near the temple chowk." },
    { title: "Panel board wiring and earthing", project: "Raydi", who: "Sanjay Vaghela", dept: "Electrical", status: "In Progress", priority: "Medium", progress: 70, due: 4 },
    { title: "Prepare technical bid — Wankaner WSS extension", project: null, who: "Hetal Mehta", dept: "Civil", status: "Pending", priority: "High", progress: 10, due: 6,
      subtasks: ["Experience certificates", "Solvency certificate", "Upload on nprocure"] },
    { title: "Brickwork — compound wall east side", project: "Lakhapadar", who: "Bharat Rathod", dept: "Civil", status: "In Progress", priority: "Low", progress: 55, due: 10 },
    { title: "Monthly site safety inspection", project: "Mayapadar", who: "Rajesh Patel", dept: "Civil", status: "On Hold", priority: "Low", progress: 0, due: 12 },
    { title: "Reconcile cement stock vs. issue register", project: "Morvada", who: "Priya Shah", dept: "Accounts", status: "Pending", priority: "Medium", progress: 0, due: 2 },
    { title: "Handover documents — Jetpur fire system", project: "Jetpur", who: "Ketan Bhatt", dept: "Civil", status: "Completed", priority: "Low", progress: 100, due: -10 },
    { title: "Order DI pipes 200mm K7 — 600 m", project: "RMC D.I. Pipeline - Phase 3", who: "Nikhil Desai", dept: "Procurement", status: "In Progress", priority: "High", progress: 30, due: 1 },
  ];
  const existing = list(await api("/api/v1/tasks?size=500"));
  for (const t of PLAN) {
    if (existing.some((e) => e.title === t.title)) continue;
    await attempt(`task [${t.status}] ${t.title}`, () =>
      api("/api/v1/tasks", { method: "POST", body: {
        title: t.title, description: t.description ?? null, projectId: t.project ? pid(t.project) : null,
        assigneeId: uid(t.who), assigneeIds: [uid(t.who)], status: t.status, priority: t.priority, progress: t.progress,
        dueDate: day(t.due), departmentId: depts[t.dept]?.id ?? null, followerIds: [adminId],
        subtasks: (t.subtasks ?? []).map((s, i) => ({ title: s, done: i < Math.floor(((t.subtasks.length) * t.progress) / 100), assigneeId: uid(t.who) })),
      } }));
  }
}

// ---------------------------------------------------------------------------------------------
// To-dos (admin's personal list)
// ---------------------------------------------------------------------------------------------
async function seedTodos() {
  console.log("\nTo-dos:");
  const PLAN = [
    { title: "Call RMC executive engineer about Phase 2 payment", priority: "HIGH", status: "TODO", due: 1 },
    { title: "Renew insurance for JCB", priority: "HIGH", status: "TODO", due: 4 },
    { title: "Review Sunrise Interiors outstanding", priority: "MEDIUM", status: "DOING", due: 2 },
    { title: "Sign salary sheet for November", priority: "MEDIUM", status: "TODO", due: 5 },
    { title: "Visit Ishwariya site", priority: "LOW", status: "DONE", due: -1 },
    { title: "Send EMD refund request — Jetpur", priority: "LOW", status: "TODO", due: 9 },
  ];
  const existing = list(await api("/api/v1/todos"));
  for (const t of PLAN) {
    if (existing.some((e) => e.title === t.title)) continue;
    await attempt(`todo [${t.status}] ${t.title}`, () => api("/api/v1/todos", { method: "POST", body: { title: t.title, status: t.status, priority: t.priority, dueDate: day(t.due) } }));
  }
}

// ---------------------------------------------------------------------------------------------
// Tenders — one per pipeline stage, plus a GeM bid
// ---------------------------------------------------------------------------------------------
async function seedTenders() {
  console.log("\nTenders:");
  const PLAN = [
    { source: "PORTAL", stage: "SORTING", tenderId: "RMC/WW/2026/118", department: "Rajkot Municipal Corporation", nameOfWork: "Laying of 400mm DI water main — Kotharia Road", location: "Rajkot", estimatedCost: 48500000, durationMonths: 12, deadline: day(14), fee: 15000, emd: 485000, emdMode: "ONLINE", emdState: "PENDING", priority: "HIGH" },
    { source: "PORTAL", stage: "SORTING", tenderId: "GWSSB/AMR/2026/44", department: "GWSSB Amreli", nameOfWork: "Village water supply — Babra taluka (6 villages)", location: "Amreli", estimatedCost: 21200000, durationMonths: 9, deadline: day(20), fee: 6000, emd: 212000, emdMode: "DD", emdState: "PENDING", priority: "MEDIUM" },
    { source: "PORTAL", stage: "RESEARCH", tenderId: "R&B/JND/2026/09", department: "R&B Division Junagadh", nameOfWork: "Widening and strengthening of Vanthali–Keshod road", location: "Junagadh", estimatedCost: 96000000, durationMonths: 18, deadline: day(9), preBidDate: day(3), fee: 25000, emd: 960000, emdMode: "BG", emdState: "PENDING", priority: "HIGH" },
    { source: "GEM", stage: "APPLIED", status: "SUBMITTED", tenderId: "GEM/2026/B/5521907", department: "Indian Railways — Rajkot Division", nameOfWork: "Supply and installation of fire hydrant system", location: "Rajkot", estimatedCost: 7400000, durationMonths: 4, deadline: day(-6), submissionDate: day(-6), emd: 148000, emdMode: "ONLINE", emdState: "PAID", emdPaidOn: day(-8), priority: "MEDIUM" },
    { source: "PORTAL", stage: "APPLIED", status: "TECH_QUALIFIED", tenderId: "RMC/WW/2026/097", department: "Rajkot Municipal Corporation", nameOfWork: "Underground sewer — Zone 8 balance work", location: "Rajkot", estimatedCost: 33800000, durationMonths: 10, deadline: day(-21), submissionDate: day(-21), emd: 338000, emdMode: "FDR", emdState: "PAID", emdPaidOn: day(-24), priority: "HIGH" },
    { source: "PORTAL", stage: "LOST", status: "LOST", tenderId: "PIU/MRB/2026/31", department: "PIU Morbi", nameOfWork: "Animal husbandry centre — Tankara", location: "Morbi", estimatedCost: 12900000, durationMonths: 8, deadline: day(-45), emd: 129000, emdMode: "DD", emdState: "RELEASED", l1Bidder: "Shree Ram Infra", l1Value: 11850000, ourRank: 3, lossReason: "PRICE_TOO_HIGH", priority: "LOW" },
  ];
  const existing = list(await api("/api/v1/tenders?size=500"));
  for (const t of PLAN) {
    if (existing.some((e) => e.tenderId === t.tenderId)) continue;
    await attempt(`tender [${t.stage}] ${t.tenderId} · ${t.nameOfWork}`, () => api("/api/v1/tenders", { method: "POST", body: { duration: `${t.durationMonths} months`, ...t } }));
  }
}

// ---------------------------------------------------------------------------------------------
// Assets (tools issued to people / subcontractors) and equipment (machines on sites)
// ---------------------------------------------------------------------------------------------
async function seedAssets(users, projects, parties) {
  console.log("\nAssets:");
  const types = list(await api("/api/v1/assets/types"));
  const typeId = async (name) => {
    let t = types.find((x) => x.name === name);
    if (!t) { t = await attempt(`asset type ${name}`, () => api("/api/v1/assets/types", { method: "POST", body: { name } })); if (t) types.push(t); }
    return t?.id ?? null;
  };
  const PLAN = [
    { name: "Dumpy Level (Sokkia)", type: "Survey Instruments", prefix: "SRV", rate: 18500, qty: 3, give: [["USER", "Rajesh Patel", "HI-TECH OFFICE", 1], ["USER", "Ketan Bhatt", "Ishwariya", 1]] },
    { name: "Total Station", type: "Survey Instruments", prefix: "SRV", rate: 295000, qty: 1, give: [["USER", "Rajesh Patel", "RMC D.I. Pipeline - Phase 2", 1]] },
    { name: "Concrete Vibrator 1.5HP", type: "Site Tools", prefix: "TL", rate: 14500, qty: 6, give: [["PARTY", "Metro Contractors", "Lakhapadar", 2], ["USER", "Bharat Rathod", "Mayapadar", 1]] },
    { name: "Safety Helmet", type: "Safety Gear", prefix: "PPE", rate: 220, qty: 80, give: [["USER", "Mehul Joshi", "RMC D.I. Pipeline - Phase 1", 25], ["USER", "Ketan Bhatt", "Ishwariya", 15]] },
    { name: "Laptop — Dell Latitude", type: "IT Equipment", prefix: "IT", rate: 62000, qty: 4, give: [["USER", "Priya Shah", "HI-TECH OFFICE", 1], ["USER", "Hetal Mehta", "HI-TECH OFFICE", 1]] },
  ];
  const existing = list(await api("/api/v1/assets"));
  const pid = (name) => projects.find((p) => p.name.startsWith(name))?.id ?? null;
  for (const a of PLAN) {
    if (existing.some((e) => e.name === a.name)) continue;
    const asset = await attempt(`asset ${a.name} × ${a.qty}`, async () =>
      api("/api/v1/assets", { method: "POST", body: { name: a.name, codePrefix: a.prefix, typeId: await typeId(a.type), unitRate: a.rate, totalQty: a.qty, active: true } }));
    if (!asset) continue;
    for (const [kind, holder, project, qty] of a.give) {
      await attempt(`    issue ${qty} → ${holder}`, () => api(`/api/v1/assets/${asset.id}/assign`, { method: "POST", body: {
        holderKind: kind, holderUserId: kind === "USER" ? users[holder]?.id : null, holderPartyId: kind === "PARTY" ? parties[holder]?.id : null,
        projectId: pid(project), qty, at: day(-20) } }));
    }
  }

  console.log("\nEquipment:");
  const EQUIP = [
    { name: "JCB 3DX Backhoe", code: "EQ-JCB-01", ownership: "OWNED", unit: "hours", fuel: "Diesel", project: "RMC D.I. Pipeline - Phase 2", usage: [8, 7.5, 9, 6] },
    { name: "Hydra Crane 12T", code: "EQ-CRN-01", ownership: "RENTED", unit: "hours", fuel: "Diesel", vendor: "Metro Contractors", rent: 1800, rentType: "HOURLY", project: "RMC D.I. Pipeline - Phase 3", usage: [5, 4] },
    { name: "Tata 1613 Tipper", code: "EQ-TRK-01", ownership: "OWNED", unit: "km", fuel: "Diesel", project: "Ishwariya", usage: [62, 48, 75] },
    { name: "Concrete Mixer 10/7", code: "EQ-MIX-01", ownership: "OWNED", unit: "hours", fuel: "Diesel", project: "HI-TECH OFFICE", usage: [6, 7] },
  ];
  const eq = list(await api("/api/v1/equipment"));
  for (const e of EQUIP) {
    if (eq.some((x) => x.name === e.name)) continue;
    const created = await attempt(`equipment ${e.name} (${e.ownership})`, () => api("/api/v1/equipment", { method: "POST", body: {
      name: e.name, code: e.code, ownership: e.ownership, unit: e.unit, fuel: e.fuel, vendorPartyId: e.vendor ? parties[e.vendor]?.id : null, active: true } }));
    if (!created) continue;
    const projectId = pid(e.project);
    await attempt(`    deployed to ${e.project}`, () => api(`/api/v1/equipment/${created.id}/deployments`, { method: "POST", body: {
      projectId, vendorPartyId: e.vendor ? parties[e.vendor]?.id : null, rentAmount: e.rent ?? null, rentType: e.rentType ?? null, startedOn: day(-15), active: true } }));
    for (const [i, v] of e.usage.entries()) {
      const km = e.unit === "km";
      await attempt(`    usage ${day(-e.usage.length + i)}: ${v} ${e.unit}`, () => api(`/api/v1/equipment/${created.id}/usage`, { method: "POST", body: {
        projectId, usedOn: day(-e.usage.length + i), usedHours: km ? null : v, distance: km ? v : null, trips: km ? 3 : 0, fuelQty: Math.round(v * (km ? 0.25 : 4)), note: null } }));
    }
  }
}

// ---------------------------------------------------------------------------------------------
async function main() {
  console.log(`Demo seed → ${API}`);
  const auth = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  const adminId = auth.user?.id ?? 1;

  const depts = Object.fromEntries(list(await api("/api/v1/departments")).map((d) => [d.name, d]));
  const projects = list(await api("/api/v1/projects?size=200"));
  const parties = Object.fromEntries(list(await api("/api/v1/vyapar/parties")).map((p) => [p.name, p]));

  const users = await seedTeam(depts);
  await seedTasks(users, projects, depts, adminId);
  await seedTodos();
  await seedTenders();
  await seedAssets(users, projects, parties);

  console.log(failures ? `\nDone with ${failures} failure(s) — see ✗ lines above.` : "\n✓ Done.");
}

main().catch((err) => { console.error(`\n✗ Seed failed: ${err.message}`); process.exit(1); });
