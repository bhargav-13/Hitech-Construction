# Payroll & Attendance — the flow, from the user's chair

> A design working doc. **No code here** — just the people, what they're trying to get done, the steps they actually take, where it feels clumsy today, and the big forks we should settle **before** building more. Mark it up and hand it back.

---

## The people who use this

| Who | On a construction company | What they care about |
|---|---|---|
| **Owner / HR (office)** | Runs the show from the office | "Is everyone I'm paying actually showing up on site? Pay them the right amount, on time, with no fraud." |
| **Site supervisor / PM** | Runs one project/site | "Who's on my site today? Let me add the guys working here and not chase paperwork." |
| **Worker / labour** | On the ground, pouring concrete | "Mark that I came, and that I left. Don't make it complicated. Pay me for the days I worked." |
| **Accountant** | Office | "Turn the month's attendance into correct salaries, advances, loans — and a bank file." |

The whole promise in one line: **one app instead of two** — the punch-in they used to do in PagarBook and the per-project attendance they saw in Onsite, now in the same ERP, so the office never reconciles two systems again.

---

## The daily rhythm (how a normal day moves between these people)

1. **Morning, on site** — workers arrive and punch in. The system checks *they're actually at the site* (GPS) and *they're really them* (face), then logs the time.
2. **All day** — the supervisor glances at "who's present on my site" without calling anyone.
3. **Evening** — workers punch out. Hours land automatically.
4. **Month-end** — the office turns those days into salaries: present days, half-days, overtime, fines, advances, loans → net pay → bank transfer.

Everything downstream (salary, muster, reports) is just **a read of the punches**. So the punch has to be dead-simple and trustworthy, or the whole thing falls apart.

---

## Journey 1 — the Worker punches in

*(This is the make-or-break flow. Everything else is office work; this one happens on a dusty site, on a cheap phone, in a hurry, maybe by someone who can barely read.)*

**Today, the steps are:**
1. Open the ERP → find **Punch** in the sidebar.
2. First time ever: **Register My Face** (take a selfie once).
3. Tap **Punch In** → allow location → allow camera → take a selfie → it checks GPS + face → "Punched in."
4. Evening: **Punch Out** the same way.

**Where this feels off for a real site worker:**
- 🚩 **Does every labourer even have a smartphone and an ERP login?** On most sites, daily-wage labour does not. If they don't, this entire journey is impossible for them — someone else has to mark them.
- 🚩 **"Find Punch in the sidebar"** is office-app thinking. A worker wants to open the app and see one giant **Punch In** button — nothing else.
- 🚩 **Two permission pop-ups (location + camera)** on a cheap phone in the sun is a lot of friction and a lot of "it didn't work."
- 🚩 **What happens when it legitimately fails?** GPS drifts 50 m, the camera is too dark, the face doesn't match on a bad day. Right now it just says "no" — and a worker who's actually on site is now stuck with no way to get marked. There's no fallback / "raise it to supervisor."

---

## Journey 2 — the Supervisor runs the site's attendance

**Today, the steps are:**
1. Open the **project** → **Attendance** tab.
2. **Add Site Staff** → pick workers from the payroll list → they're now "on this project."
3. See the day's roster with punch times, GPS, selfies, and P/HD/PL/A buttons to correct.

**Where this feels off:**
- 🚩 **The worker had to be created in Payroll first**, then found here. A supervisor thinks "add Ramu to my site," not "go to HR, create Ramu, come back, attach Ramu."
- 🚩 **Two separate places assign a worker:** the office assigns a **location** (geofence) in Payroll, and the supervisor assigns a **project** in the project. To a supervisor these are the same thing — "Ramu works at the Amreli site." Splitting location from project is clean for us but confusing for them (see Decision 3).
- 🚩 **If workers can't self-punch**, the supervisor is the one who should be able to **mark the whole crew present in a couple of taps** (or run a shared "kiosk" where each worker steps up, faces the camera, done). That group/kiosk flow doesn't exist yet.

---

## Journey 3 — the Owner/HR sets it up and oversees

**Today, the steps are:**
1. **Payroll → Locations** → draw a rectangle on the map around each site → assign staff who may punch there.
2. **Payroll → Staff** → add each person (or link an existing login).
3. Watch the **Dashboard** ("N present today") and **Muster Roll** for the month.

**Where this feels off:**
- 🚩 **Drawing a rectangle on a map** is a nice admin tool, but for the owner the mental model is "the Amreli site" — ideally they pick the project and the geofence comes along with it, not a separate map exercise.
- 🚩 **The muster shows fabricated demo attendance today** (so the preview looks full). The owner must be able to trust that what they see is *real* punches, or they'll never rely on it for pay.
- 🚩 **One office computer** setup — everything currently lives in one browser. The moment the supervisor on site and the owner in the office are different devices, they won't see the same data. This is the single biggest thing standing between "nice demo" and "we run our payroll on this."

---

## Journey 4 — the Accountant pays everyone

**Today, the steps are:**
1. **Payroll → Muster / Daily** — confirm the month's attendance, fix any marks.
2. **Payroll → Payroll Overview** — the system rolls attendance + overtime + fines + loans/advances into **net pay** per person.
3. Approve → export salary slips / bank file.

**Where this feels off:**
- 🚩 **Corrections have no trail.** If the accountant changes a worker's day from Absent to Present, who approved that, and why? For payroll that's a compliance question.
- 🚩 **Advances/loans/reimbursements** are separate screens; the accountant wants them to just *appear* as deductions on the payslip (they mostly do) with a clear "why this number."

---

## Where the whole flow feels off today — the short list

1. **We assumed every worker self-punches on their own phone.** For construction labour that's often wrong — and it breaks Journeys 1 & 2.
2. **"Location" and "Project" are two things** the field sees as one.
3. **No graceful failure** when a genuine worker can't punch (GPS/face/no-phone). No supervisor override, no "mark me, I'll prove it later."
4. **One-device / one-browser** — not yet real multi-user.
5. **Demo data is fabricated** — erodes trust until it's off.
6. **Corrections aren't audited** — a payroll red flag.

---

## The forks we should settle first (your calls)

These change the whole shape of the flow, so let's decide them before refactoring screens.

**Decision 1 — Who actually punches? (the big one)**
- **A. Each worker, own phone/login** (what we built). Clean, but needs every labourer to have a smartphone + login.
- **B. Supervisor marks the crew** — supervisor opens their site, taps each worker present/absent (optionally with the worker's selfie via the supervisor's phone).
- **C. Shared kiosk** — one tablet at the site gate; each worker walks up, faces the camera, it identifies them and logs in/out. No personal phones needed.
- **D. A mix** — office staff self-punch (A); site labour via supervisor/kiosk (B/C).
> *My gut for a construction client: D, defaulting to C/B for labour. But this is your client's reality — tell me.*

**Decision 2 — Onboarding a worker**
- Who enrolls a worker's face — the worker (self) or the supervisor (on the supervisor's phone)?
- Do daily-wage labourers get logins at all, or do they exist only as "staff on a site" that a supervisor manages?

**Decision 3 — Location vs Project**
- Keep them separate (a geofence can serve many projects), or **collapse them** so "add a site" = draw the geofence, and adding a worker to the site is one action?
> *Field users almost certainly want them collapsed.*

**Decision 4 — Labour contractor crews**
- A contractor brings 20 men. Do we track all 20 individually, or just the contractor + a headcount per day? Big difference in effort on site.

**Decision 5 — When a punch legitimately fails**
- Allow a **"request attendance"** the supervisor approves? Allow supervisor **manual override** with a reason (audited)? Or hard-block, no exceptions?

---

## A proposed cleaner default (only if you agree with the forks above)

A flow I'd suggest as the starting point — challenge any of it:

- **Setup is project-first.** Owner creates/opens a **project**, draws its site boundary once, and adds the workers who work there — all in one place. (Collapses Decision 3.)
- **The worker's app is one screen:** a big **Punch** button, their name, today's status. No sidebar hunting.
- **Two punch modes, per site:** *self-punch* (office/tech-comfortable staff) and *kiosk/supervisor* (site labour). The site's setup chooses which. (Decision 1 = D.)
- **Face + GPS stay** as the trust layer, but with a clear **fallback:** if it can't verify, the worker's punch becomes a *pending request* the supervisor approves in one tap — nobody is stuck, and the override is logged. (Decision 5.)
- **Every correction is stamped** with who + when + why. (Fixes the audit gap.)
- **Everything else is unchanged** — muster, payslip math, loans, reports all just read these trustworthy punches.

---

**Tell me your calls on Decisions 1–5 (or rewrite them), and I'll redraw the flow before we touch any screens.**
