# Payroll & Attendance Module — End-to-End Documentation

> **Status:** UI-first preview. Fully working in one browser (client-side), flagged **"Coming Soon"** to the client. Not yet backed by server persistence — see [Limitations](#12-known-limitations--what-is-not-done-yet).
>
> **What it is:** a mixture of **Onsite Teams** (per-project attendance) + **PagarBook** (staff, salary, payslips) so the client runs one system instead of two. Staff punch in/out from inside the ERP with **GPS geofencing + face verification**, and the same punch shows in both the Payroll muster and the Project's Attendance tab.

---

## Table of Contents
1. [Architecture & where it lives](#1-architecture--where-it-lives)
2. [Access model — admin vs self-service](#2-access-model--admin-vs-self-service)
3. [Navigation](#3-navigation)
4. [Data model](#4-data-model)
5. [Staff management](#5-staff-management)
6. [Work locations (geofences)](#6-work-locations-geofences)
7. [Face enrollment & verification](#7-face-enrollment--verification)
8. [Attendance — the full punch loop](#8-attendance--the-full-punch-loop)
9. [Payroll run & payslips](#9-payroll-run--payslips)
10. [Payments, reimbursements, loans](#10-payments-reimbursements-loans)
11. [Dashboard, global search, reports, others](#11-dashboard-global-search-reports-others)
12. [Known limitations & what is not done yet](#12-known-limitations--what-is-not-done-yet)
13. [End-to-end walkthroughs](#13-end-to-end-walkthroughs)
14. [File reference](#14-file-reference)
15. [Test credentials](#15-test-credentials)

---

## 1. Architecture & where it lives

| Concern | Detail |
|---|---|
| **Routes** | Everything under `/payroll/*`, plus the staff-facing `/punch` page (sidebar quick-action). |
| **Frontend location** | Main checkout `D:\Hitech Construction`, branch `master` (NOT the worktree). |
| **State** | A **client-side Zustand store** (`usePayrollStore`) persisted to **`localStorage`** under key **`hitech.payroll.v3`**. Seeded with 12 construction employees + demo loans/reimbursements/payments/tax profiles. |
| **Theme** | The ERP's cyan/navy theme (`--brand-accent: #0891b2`), same shell pattern as the Vyapar module. |
| **Backend** | **Only RBAC exists** (`V20__add_payroll_module.sql` — the PAYROLL module + 5 permissions, wired to Super Admin). Staff, attendance, punches, locations, payroll runs are all **client-side only** for now. |
| **Coming-Soon flag** | Amber banner in `PayrollShell` on every payroll page + a "Soon" badge on the sidebar Payroll item. |

**Key libraries in play:**
- **Zustand + persist** — the store.
- **Leaflet + OpenStreetMap** — the rectangle geofence map picker (vanilla, dynamic import, client-only).
- **`@vladmandic/face-api`** — client-side face recognition; models bundled in `public/models/` (~7 MB, they ship).

### The seed roster
`seedEmployees()` creates 12 staff (`emp-1`…`emp-12`, staff IDs `HC0001`…`HC0012`) across the three categories. **The first two deliberately match real ERP logins** — "Rakesh Shah" → `rakesh@hitech.local`, "Vishwas Bhai Ujjain" → `vishwas@hitech.local` — so those users can sign in and see their own self-service payroll.

---

## 2. Access model — admin vs self-service

Access is **fully dynamic from permissions** — no hardcoded role→grant mapping.

`usePayrollAccess()` (in `payrollApi.ts`):

| Holds | Result | Sees |
|---|---|---|
| Any of `PAYROLL:CREATE / EDIT / DELETE / APPROVE` | **Admin** | Full module: all staff, payroll runs, approvals, everyone's salary, locations, muster. |
| `PAYROLL:VIEW` only | **Self-service** | Only their own records, under `/payroll/me/*`. |
| Nothing | No Payroll nav item at all | — |

- **Nav gating:** `NAV_MODULE["/payroll"]="PAYROLL"` hides the sidebar item unless the user has `PAYROLL:VIEW`.
- **Page gating:** `PayrollShell` takes a `requireAdmin` prop; self-service users are redirected off admin pages. The redirect waits for `useAuthStore(s => s.hydrated)` to avoid bouncing an admin off their own page on a hard reload.
- **Linking a user to a staff record:** `useMyEmployee()` resolves the signed-in user → their `Employee` **by `userId` first, then by matching email**. Returns `null` if the account isn't tied to any staff (shows a "contact HR" hint).
- **Assigning permissions:** admins grant PAYROLL (and VYAPAR) permissions per-role in **Settings → Roles & Access → Manage Role**. Current dev grants: PM / Team Member / Site Supervisor have `PAYROLL:VIEW`.

---

## 3. Navigation

**Admin rail** (`PAYROLL_NAV`):
```
Dashboard            /payroll
Staff                (group)
  Staff List         /payroll/staff
  Add Staff          /payroll/staff/add
  Bulk Add Staff     /payroll/staff/bulk
Attendance           (group)
  Daily Attendance   /payroll/attendance
  Muster Roll        /payroll/attendance/muster
  Attendance Settings/payroll/attendance/settings
Locations            /payroll/locations
Tasks                /taskopad          (links out to the Taskopad module)
Payroll              (group)
  Payroll Overview   /payroll/run
  Approvals          /payroll/run/approvals
  Tax Profiles       /payroll/run/tax-profiles
Payments             /payroll/payments
Reimbursements       /payroll/reimbursements
Loans                /payroll/loans
Reports              /payroll/reports
Others               /payroll/others
```

**Self-service rail** (`PAYROLL_SELF_NAV`):
```
My Dashboard         /payroll
My Attendance        /payroll/me/attendance
My Payslips          /payroll/me/payslips
My Loans             /payroll/me/loans
My Reimbursements    /payroll/me/reimbursements
My Profile           /payroll/me/profile
```

Plus the **`/punch`** page — a staff self-service GPS+face punch screen, reachable from the sidebar quick-action (visible to **all signed-in users**, not just admins).

---

## 4. Data model

All types live in `src/lib/payrollApi.ts`.

### Employee
```ts
interface Employee {
  id: string;                 // "emp-1"
  name: string;
  staffId: string;            // "HC0001"
  category: "REGULAR" | "CONTRACTOR" | "WORK_BASIS";
  department: string;
  designation: string;
  phone: string;
  email: string | null;
  joiningDate: string;        // YYYY-MM-DD
  active: boolean;
  salary: SalaryStructure;    // ctc, basic, hra, allowances, workType/workRate, pf/esic/pt flags
  bankAccount / ifsc / bankName / pan: string | null;
  userId: number | null;      // linked ERP login (null = no login yet)
  associatedProjects: string[];  // projects this person is posted to (Onsite "Associated Projects")
  assignedLocations: string[];   // geofences they may punch from (independent of projects)
  faceDescriptor: number[] | null;  // enrolled 128-float faceprint (null = not enrolled)
  facePhoto: string | null;         // enrolled reference selfie (JPEG data URL)
}
```

### WorkLocation (a rectangle geofence)
```ts
interface WorkLocation {
  id: string;
  name: string;
  swLat, swLng, neLat, neLng: number;  // rectangle corners
}
```

### AttendanceEntry
```ts
interface AttendanceEntry {
  code: "P" | "A" | "HD" | "PL" | "NM" | "WO";
  inTime: string | null;      // "HH:mm"
  outTime: string | null;
  overtimeHours: number;
  fineHours: number;
  projectId: string | null;   // ties a punch to a project
  punchLocation?: string | null;   // "lat,lng" GPS at punch
  punchInPhoto?: string | null;    // face-verified selfies
  punchOutPhoto?: string | null;
  faceScore?: number | null;       // face-match distance (lower = closer)
}
```

### Other stored collections
`Loan`, `Reimbursement`, `Payment`, `TaxProfile`, plus `payrollFlags: Record<empId, "LOCKED"|"HOLD"|"STOP"|"PROCESSED">`.

### Attendance codes
`P` Present · `A` Absent · `HD` Half Day · `PL` Paid Leave · `NM` Not Marked · `WO` Week Off.

### How attendance is keyed & generated
- **Key:** `attendanceOverrides["${emp.id}|${date}"]`, where `date` is the **LOCAL** calendar date (`YYYY-MM-DD`), **not UTC**. *(This matters: in IST a UTC date would file an early-morning punch under the previous day. All attendance screens use the local date so keys line up.)*
- **`genAttendance(staffId, date)`** deterministically **fabricates demo attendance** (present ~78% on weekdays, week-off on Sundays) so the muster looks populated in the preview. It is **demo only**.
- **`getAttendance(overrides, emp, date)`** returns the real override if present, **else** falls back to `genAttendance`. → The **`/punch` page never uses this fallback**; it reads the raw override so a real staff isn't shown as "already punched" from fabricated data.

---

## 5. Staff management

### Three categories (`STAFF_CATEGORIES`)
| Category | Pay basis | For | Salary fields shown |
|---|---|---|---|
| **Regular Employee** | Monthly | Full-time / permanent | Full structure + PF/ESIC/PT |
| **Contractor** | Contract | Temp / project-based | Simplified structure |
| **Work Basis** | Daily / Hourly / Piece | Daily-wage / casual labour | Work rate only |

### Screens
- **Staff List** `/payroll/staff` — roster, per-row actions.
- **Add Staff** `/payroll/staff/add` — category-driven form; salary fields change by `payBasis`.
- **Bulk Add Staff** `/payroll/staff/bulk` — grid to add several at once; blank rows skipped on save.

### Staff ↔ Users (both directions)
1. **Staff → create login:** Add-Staff has a "Create Login Account" toggle (and a per-row `StaffLoginDialog`) that creates a **real ERP user** via `api.createUser` (roles from `api.getRoles`) and stores the returned id on the client `Employee.userId`.
2. **User → link as staff:** the staff list has a **"From User"** button → `UserPickerDialog` lists unlinked ERP accounts → pre-fills + links via a transient `useStaffDraft` store → routes to Add-Staff in "linking existing login" mode (skips create-login).

*Gotcha (fixed): the picker's selector must select the stable `employees` array then derive in a `useMemo` — deriving inside the Zustand selector returns a fresh array each render and trips `useSyncExternalStore`'s infinite-loop guard.*

---

## 6. Work locations (geofences)

**Design decision (client requirement):** geofenced work locations are set **in Payroll only, NOT per project**. A staff can be assigned several locations. Projects connect to staff *only* via Attendance → Add Site Staff.

- Screen: **`/payroll/locations`** — list of `WorkLocation` cards; each shows its centre and assigned staff.
- **Add/Edit** opens `MapRectanglePicker` (`src/components/payroll/MapRectanglePicker.tsx`) — vanilla **Leaflet + OSM tiles**. Admin **draws the rectangle by clicking two opposite corners** on the map; a "use my location" button recentres. Save writes a `WorkLocation` to `usePayrollStore.locations`.
- **Assign staff** from a location card → sets each `Employee.assignedLocations`.

**Geofence helpers** (`payrollApi.ts`):
- `isInsideLocation(lat, lng, loc)` — point-in-rectangle.
- `detectLocation(lat, lng, assignedIds, locations)` — which assigned rectangle the staff is currently inside (nearest centre wins).
- `locationCenter(loc)` / `gpsDistance(...)` — centre + haversine distance (used for the "you're ~Nm away" message).

> The **old per-project geofence** (`projectLocations` / `setProjectLocation` in Project Settings) was **removed**. Project Settings now only points to Payroll → Locations.

---

## 7. Face enrollment & verification

Layered on top of GPS so every punch is **"inside the geofence AND the right person."**

- **Library:** `@vladmandic/face-api` (v1.7.15). Models in `public/models/` (tinyFaceDetector + faceLandmark68 + faceRecognition). Loaded **lazily** only on the punch page.
- **Backend selection:** tries **WebGL → CPU fallback** (`window.__faceBackend` can force one) so it still works on cheap site phones with flaky GPU drivers.
- **Wrapper** `src/lib/faceApi.ts`:
  - `loadFaceModels()` — idempotent model load + backend init.
  - `getFaceDescriptor(video|img|canvas)` — detect single face → 128-float descriptor (or `null` = no face).
  - `descriptorDistance(a,b)` / `isSameFace(a,b)` — Euclidean distance; **match if ≤ `FACE_MATCH_THRESHOLD = 0.55`**.
- **Camera component** `src/components/payroll/FaceCapture.tsx` — a modal that opens the camera, shows a live mirror preview, captures a frame, computes the descriptor, and stores a **small JPEG** (~320px, ~15 KB). Handles model-load, permission-denied, no-camera, and "no face detected."

**Enrollment (once):** on `/punch`, staff tap **"Register My Face"** → capture → `setFaceEnrollment(empId, descriptor, photo)` stores `faceDescriptor` + `facePhoto`.

**Verification (every punch):** the captured descriptor is compared to the enrolled one. `distance ≤ 0.55` → verified; otherwise **"Face didn't match (score X)"** and the punch is refused.

---

## 8. Attendance — the full punch loop

### 8a. Staff punch — `/punch`
1. Resolve the signed-in user → staff via `useMyEmployee()`. (Not linked → "No payroll record linked.")
2. **Gate:** if not face-enrolled, show the amber "Register your face" card; Punch buttons are disabled until enrolled.
3. Tap **Punch In** → `beginPunch("in")`:
   - Get GPS. `detectLocation(...)` against the staff's `assignedLocations`.
   - **Outside** any geofence → reject with "**you're ~Nm from `<site>`**" (camera never opens).
   - **Inside** → open `FaceCapture` (verify mode).
4. Capture selfie → `isSameFace(enrolled, captured)`:
   - **Match** → `setAttendance(empId, today, { code:"P", inTime, punchLocation, punchInPhoto, faceScore })`. "Punched in at `<site>` — face verified."
   - **No match** → "Face didn't match", nothing recorded.
5. **Punch Out** is the same flow, writing `outTime` + `punchOutPhoto`.
6. The card shows today's status (Working / Day Complete), in/out times, hours, GPS, and the punch selfies.

> `today` uses the **local** date. Today's status reads the **raw override only** (never `genAttendance`).

### 8b. Admin daily attendance — `/payroll/attendance`
Per-day register for all active staff: mark P/A/HD/PL, edit in/out, OT, fine. Reads `getAttendance` (override wins over demo). Punched staff show their real in/out times.

### 8c. Muster roll — `/payroll/attendance/muster`
Monthly grid (per-day cells + monthly totals) via `daysInMonth(year, month)` + `monthlySummary(...)`. Rolls each day's code into present / absent / half-day / paid-leave / unmarked / week-off / overtime / fine / **payable days**. CSV + PDF export.

### 8d. Project attendance — Project detail → **Attendance** tab
`src/components/project/ProjectAttendance.tsx`. Shows only staff **posted to that project** (`staffForProject` = `associatedProjects` includes the project id):
- Filter chips (All / Site Staff / Labour Contractor), date nav, present/absent/leave summary.
- Per row: enrolled **face avatar**, name, ₹ **daily rate** (`dailyRate`), **punch time**, **GPS pin**, **punch-in & punch-out selfies**, and P/HD/PL/A status buttons.
- **"Add Site Staff"** drawer pulls from the Payroll roster and sets `associatedProjects` — this is the *only* way staff attach to a project.

Because punch, muster, daily, and project views all read the **same store keyed by local date**, one punch appears everywhere at once.

---

## 9. Payroll run & payslips

- **Overview** `/payroll/run`, **Approvals** `/payroll/run/approvals`, **Tax Profiles** `/payroll/run/tax-profiles`.
- **`computePayslip(emp, overrides, loans, dates)`** — shared by the admin run and the self-service payslip:

```
WORK_BASIS: gross = workRate × (present + halfDay×0.5) + workRate × (overtime / 8)
else:       gross = monthlyCtc × payableDays / totalDays

pf   = pf   ? min(basic, 15000) × 12% × (payableDays/totalDays) : 0
esic = esic ? gross × 0.75%                                     : 0
pt   = pt && gross > 15000 ? ₹200                               : 0
loanEmi = Σ EMI of this employee's loans with outstanding > 0
net  = max(0, gross − pf − esic − pt − loanEmi)
```

- `payrollFlags` can LOCK / HOLD / STOP / mark PROCESSED an employee for the cycle.

---

## 10. Payments, reimbursements, loans

- **Payments** `/payroll/payments` — salary/advance payouts.
- **Reimbursements** `/payroll/reimbursements` (admin) + `/payroll/me/reimbursements` (self) — claim type, amount, status PENDING→APPROVED, settlement date.
- **Loans** `/payroll/loans` (admin) + `/payroll/me/loans` (self) — `computeEmi(principal, annualRate, tenure, type)` supports **FLAT / SIMPLE / COMPOUND**; outstanding EMIs feed `computePayslip`.

---

## 11. Dashboard, global search, reports, others

- **Company dashboard** (`/`) — the "Last 7 Days Attendance" chart is **live from the payroll store** (present count per local day, "X present today · N staff").
- **Global search** (`GlobalSearch.tsx`) — has a **Staff** group searching payroll employees (name, staffId, designation, department, phone) → links to `/payroll/staff`.
- **Reports** `/payroll/reports` — catalogue of 5 groups (Attendance & Leave, Payroll & Finance, Statutory & Compliance, Performance/Goals/Assets, HR & Misc). *Catalogue UI; individual reports not all wired.*
- **Others** `/payroll/others` — hub tiles (Employment Letters, Active Sessions, Asset Management, Cashbook, Goals, Performance Templates, Scorecard, Job Posts, Celebrations). *Tiles/placeholders.*

---

## 12. Known limitations & what is NOT done yet

1. **No server persistence.** Everything (staff, attendance, punches, locations, face enrollment, loans, payments) is **client-side `localStorage`**. It works across pages **in one browser** but **NOT across devices or users**. True multi-user needs a payroll backend (staff / punches / locations / associations tables + endpoints). **This is the biggest gap before production.**
2. **Demo attendance is fabricated.** `genAttendance` invents present/absent history so the muster looks full. Real deployment must stop fabricating and show only real punches.
3. **Face accuracy needs a real device.** The recognition pipeline is verified (enroll → match 0.16 → reject wrong face 5.88 → no-face blocked), but true accept/reject accuracy in real lighting must be validated on the client's actual webcam/phone.
4. **Reports & Others are mostly catalogue UI** — not all individual reports/tiles are functional.
5. **Coming-Soon banner** is still on every payroll page + the sidebar badge; remove when the module is signed off.
6. **`/punch` requires HTTPS or localhost** for camera + geolocation in production.

---

## 13. End-to-end walkthroughs

### A) Admin sets up a site and staff
1. **Payroll → Locations → Add Location** → draw the rectangle on the map (two corners) → name it → Save.
2. On the location card → **Assign staff** → tick the workers → Save. (sets `assignedLocations`)
3. **Project → (a project) → Attendance → Add Site Staff** → pick the workers → Add. (sets `associatedProjects`)
4. (Optional) **Staff → per-row → Create/Link login** so the worker can sign in.

### B) Staff punches in
1. Sign in → sidebar **Punch**.
2. **Register My Face** (once) → allow camera → capture.
3. **Punch In** → allow location → if inside the geofence, capture selfie → face verified → recorded.
4. **Punch Out** later → same. Card shows Day Complete + selfies + GPS.

### C) Admin reviews & runs payroll
1. **Payroll → Attendance / Muster Roll** — see the punches; adjust marks if needed.
2. **Project → Attendance** — per-project view with selfies + GPS.
3. **Payroll → Payroll Overview** — `computePayslip` rolls attendance + loans into net pay; approve; export.

---

## 14. File reference

| File | Role |
|---|---|
| `src/lib/payrollConfig.ts` | Nav trees, staff categories, attendance codes, report/others catalogue, departments/designations. |
| `src/lib/payrollApi.ts` | **Types + Zustand store** (`usePayrollStore`, key `hitech.payroll.v3`) + all helpers (`genAttendance`, `getAttendance`, `daysInMonth`, `monthlySummary`, `computePayslip`, `computeEmi`, `dailyRate`, `staffForProject`, geofence helpers, `usePayrollAccess`, `useMyEmployee`, `setFaceEnrollment`). |
| `src/lib/faceApi.ts` | Face recognition wrapper (lazy models, descriptor, distance, threshold). |
| `src/lib/payrollUsers.ts` / `src/lib/staffDraft.ts` | Staff↔user linking helpers + transient user→staff draft store. |
| `src/components/payroll/PayrollShell.tsx` | Left-rail shell, admin vs self nav, `requireAdmin` gate, Coming-Soon banner. |
| `src/components/payroll/MapRectanglePicker.tsx` | Leaflet rectangle geofence picker. |
| `src/components/payroll/FaceCapture.tsx` | Camera modal for enroll + verify. |
| `src/components/project/ProjectAttendance.tsx` | Project detail Attendance tab. |
| `src/app/punch/page.tsx` | Staff GPS + face punch screen. |
| `src/app/payroll/**/page.tsx` | All admin + self-service payroll pages (see [Navigation](#3-navigation)). |
| `public/models/*` | Bundled face-api model weights (~7 MB — ship these). |
| `V20__add_payroll_module.sql` | Backend: PAYROLL module + permissions (RBAC only). |

---

## 15. Test credentials (dev)

| Role | Email | Password | Payroll view |
|---|---|---|---|
| Super Admin | `admin@hitech.local` | `Admin@123` | Full admin module |
| Project Manager | `rakesh@hitech.local` | `Test@1234` | Self-service (linked to HC0001) |
| Team Member | `vishwas@hitech.local` | `Test@1234` | Self-service (linked to HC0002) |

Local dev: frontend `http://localhost:3000`, backend `http://localhost:8080` (Spring Boot), Postgres in Docker (`hitech-erp-postgres`).

---

*Generated 2026-07-28. Reflects the current `master` working tree (uncommitted). Give me your changes and I'll update the module + this doc.*
