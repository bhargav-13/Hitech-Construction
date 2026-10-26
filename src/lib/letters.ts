/**
 * HR letters — offer, appointment, increment, experience, relieving and the rest.
 *
 * Each letter is a Template (Templates → Payroll): its heading, subject and wording are edited
 * there, with `{{placeholders}}` that fill from the employee's payroll profile when the letter is
 * generated (Payroll → Others → Employment Letters). Anything the profile can't answer — an
 * effective date, a new designation — is asked for on the generate screen.
 */

export type LetterKind =
  | "LETTER_OFFER"
  | "LETTER_APPOINTMENT"
  | "LETTER_CONFIRMATION"
  | "LETTER_INCREMENT"
  | "LETTER_PROMOTION"
  | "LETTER_TRANSFER"
  | "LETTER_WARNING"
  | "LETTER_SALARY_CERTIFICATE"
  | "LETTER_EXPERIENCE"
  | "LETTER_RELIEVING"
  | "LETTER_TERMINATION"
  | "LETTER_NOC";

export interface LetterDef {
  kind: LetterKind;
  label: string;
  hint: string;
  /** Printed heading, e.g. "APPOINTMENT LETTER". */
  title: string;
  subject: string;
  body: string;
  /** Printed with a "To" block for the employee; certificates are addressed to whom it may concern. */
  addressed?: boolean;
  /** Offer / appointment: a line for the employee to sign in acceptance. */
  acceptance?: boolean;
}

/** Every placeholder a letter can use, with where its value comes from. */
export const LETTER_FIELDS: { key: string; label: string; auto: boolean; type?: "date" | "money" }[] = [
  { key: "name", label: "Employee name", auto: true },
  { key: "firstName", label: "First name", auto: true },
  { key: "designation", label: "Designation", auto: true },
  { key: "department", label: "Department", auto: true },
  { key: "staffId", label: "Staff ID", auto: true },
  { key: "joiningDate", label: "Date of joining", auto: true, type: "date" },
  { key: "address", label: "Address", auto: true },
  { key: "fatherName", label: "Father's name", auto: true },
  { key: "monthlyCtc", label: "Monthly CTC", auto: true, type: "money" },
  { key: "annualCtc", label: "Annual CTC", auto: true, type: "money" },
  { key: "basic", label: "Basic (monthly)", auto: true, type: "money" },
  { key: "pan", label: "PAN", auto: true },
  { key: "uan", label: "UAN", auto: true },
  { key: "company", label: "Company name", auto: true },
  { key: "date", label: "Letter date", auto: true, type: "date" },
  { key: "refNo", label: "Reference no.", auto: false },
  { key: "effectiveDate", label: "Effective date", auto: false, type: "date" },
  { key: "lastWorkingDate", label: "Last working date", auto: false, type: "date" },
  { key: "offerValidTill", label: "Accept offer by", auto: false, type: "date" },
  { key: "newDesignation", label: "New designation", auto: false },
  { key: "newSalary", label: "New monthly CTC", auto: false, type: "money" },
  { key: "newLocation", label: "New location / site", auto: false },
  { key: "reportingTo", label: "Reports to", auto: false },
  { key: "probationMonths", label: "Probation (months)", auto: false },
  { key: "reason", label: "Reason / incident", auto: false },
  { key: "purpose", label: "Purpose (for NOC)", auto: false },
];

export const LETTER_DEFS: LetterDef[] = [
  {
    kind: "LETTER_OFFER",
    addressed: true,
    acceptance: true,
    label: "Offer Letter",
    hint: "Job offer before joining",
    title: "OFFER LETTER",
    subject: "Offer of employment — {{designation}}",
    body: `Dear {{firstName}},

We are pleased to offer you the position of {{designation}} in our {{department}} department at {{company}}.

Your monthly cost to company will be {{monthlyCtc}} ({{annualCtc}} per annum). You are expected to join on or before {{effectiveDate}} and will report to {{reportingTo}}.

You will be on probation for {{probationMonths}} months from the date of joining. The detailed terms of your employment will be set out in your appointment letter.

Please sign and return a copy of this letter by {{offerValidTill}} as a token of your acceptance.

We look forward to having you on our team.`,
  },
  {
    kind: "LETTER_APPOINTMENT",
    addressed: true,
    acceptance: true,
    label: "Appointment Letter",
    hint: "Terms of employment on joining",
    title: "APPOINTMENT LETTER",
    subject: "Appointment as {{designation}}",
    body: `Dear {{firstName}},

With reference to your application and the subsequent discussions, we are pleased to appoint you as {{designation}} in the {{department}} department with effect from {{joiningDate}}.

1. Remuneration: Your monthly cost to company will be {{monthlyCtc}}, with a basic salary of {{basic}} per month. Statutory deductions will apply as per law.
2. Probation: You will be on probation for {{probationMonths}} months, after which your services may be confirmed in writing.
3. Working hours and place: You will follow the working hours of your office / site and may be posted to any of the company's projects as required.
4. Notice period: Either party may end this employment by giving one month's notice or salary in lieu of notice.
5. Conduct: You will abide by the rules and policies of the company as amended from time to time.

Please sign the duplicate copy of this letter in token of your acceptance.

We wish you a long and rewarding association with {{company}}.`,
  },
  {
    kind: "LETTER_CONFIRMATION",
    addressed: true,
    label: "Confirmation Letter",
    hint: "Confirmed after probation",
    title: "CONFIRMATION LETTER",
    subject: "Confirmation of employment",
    body: `Dear {{firstName}},

We are pleased to inform you that, on successful completion of your probation period, your services as {{designation}} are confirmed with effect from {{effectiveDate}}.

All other terms and conditions of your appointment remain unchanged.

We appreciate your contribution and look forward to your continued good work.`,
  },
  {
    kind: "LETTER_INCREMENT",
    addressed: true,
    label: "Increment Letter",
    hint: "Salary revision",
    title: "SALARY REVISION LETTER",
    subject: "Revision of salary",
    body: `Dear {{firstName}},

In recognition of your performance and contribution, the management is pleased to revise your monthly cost to company from {{monthlyCtc}} to {{newSalary}} with effect from {{effectiveDate}}.

All other terms and conditions of your employment remain unchanged.

We thank you for your efforts and look forward to your continued commitment.`,
  },
  {
    kind: "LETTER_PROMOTION",
    addressed: true,
    label: "Promotion Letter",
    hint: "New designation",
    title: "PROMOTION LETTER",
    subject: "Promotion to {{newDesignation}}",
    body: `Dear {{firstName}},

We are pleased to inform you that you have been promoted from {{designation}} to {{newDesignation}} with effect from {{effectiveDate}}.

Your revised monthly cost to company will be {{newSalary}}. You will report to {{reportingTo}}.

Congratulations on this well-deserved promotion. We wish you continued success.`,
  },
  {
    kind: "LETTER_TRANSFER",
    addressed: true,
    label: "Transfer Letter",
    hint: "Move to another site / office",
    title: "TRANSFER LETTER",
    subject: "Transfer to {{newLocation}}",
    body: `Dear {{firstName}},

In the interest of work, you are hereby transferred from your present posting to {{newLocation}} with effect from {{effectiveDate}}. You will report to {{reportingTo}} at the new location.

Your designation, salary and other terms of employment remain unchanged.

Please hand over your current responsibilities before relieving and report at the new location on the date mentioned.`,
  },
  {
    kind: "LETTER_WARNING",
    addressed: true,
    label: "Warning Letter",
    hint: "Disciplinary warning",
    title: "WARNING LETTER",
    subject: "Warning regarding conduct",
    body: `Dear {{firstName}},

It has been brought to the management's notice that: {{reason}}

Such behaviour is not acceptable and is against the rules of the company. You are hereby warned to be careful in future. Any repetition will invite strict disciplinary action, which may include termination of your services.

Please acknowledge receipt of this letter.`,
  },
  {
    kind: "LETTER_SALARY_CERTIFICATE",
    label: "Salary Certificate",
    hint: "For bank / visa / loan",
    title: "SALARY CERTIFICATE",
    subject: "To whom it may concern",
    body: `This is to certify that {{name}}, {{designation}} (Staff ID {{staffId}}), has been working with {{company}} since {{joiningDate}}.

Their present monthly cost to company is {{monthlyCtc}} ({{annualCtc}} per annum).

This certificate is issued at the request of the employee for {{purpose}}.`,
  },
  {
    kind: "LETTER_EXPERIENCE",
    label: "Experience Letter",
    hint: "Service certificate on exit",
    title: "EXPERIENCE CERTIFICATE",
    subject: "To whom it may concern",
    body: `This is to certify that {{name}} was employed with {{company}} as {{designation}} in the {{department}} department from {{joiningDate}} to {{lastWorkingDate}}.

During this period we found their conduct and performance to be satisfactory.

We wish them every success in their future endeavours.`,
  },
  {
    kind: "LETTER_RELIEVING",
    addressed: true,
    label: "Relieving Letter",
    hint: "Released from duties",
    title: "RELIEVING LETTER",
    subject: "Relieving from services",
    body: `Dear {{firstName}},

This is with reference to your resignation. We hereby accept it and relieve you from the services of {{company}} at the close of working hours on {{lastWorkingDate}}.

We confirm that you have handed over your responsibilities and that there are no dues pending from your side, subject to full and final settlement.

We thank you for your services and wish you the very best for the future.`,
  },
  {
    kind: "LETTER_TERMINATION",
    addressed: true,
    label: "Termination Letter",
    hint: "End of employment",
    title: "TERMINATION LETTER",
    subject: "Termination of employment",
    body: `Dear {{firstName}},

This is to inform you that your employment with {{company}} as {{designation}} is terminated with effect from {{lastWorkingDate}} for the following reason: {{reason}}

Your full and final settlement will be processed as per company policy. Please return all company property in your possession and complete the handover formalities.`,
  },
  {
    kind: "LETTER_NOC",
    label: "No Objection Certificate",
    hint: "NOC for the employee",
    title: "NO OBJECTION CERTIFICATE",
    subject: "No objection certificate",
    body: `This is to certify that {{name}}, {{designation}} with {{company}} since {{joiningDate}}, is a bonafide employee of the company.

The company has no objection to {{firstName}} {{purpose}}.

This certificate is issued on the employee's request.`,
  },
];

export const LETTER_KINDS = LETTER_DEFS.map((d) => d.kind);
export const isLetterKind = (k: string): k is LetterKind => (LETTER_KINDS as string[]).includes(k);
export const letterDef = (k: LetterKind) => LETTER_DEFS.find((d) => d.kind === k)!;

/** The `{{keys}}` a piece of wording uses, in order of first appearance. */
export function placeholdersIn(...texts: string[]): string[] {
  const seen: string[] = [];
  for (const t of texts) for (const m of t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Replace `{{key}}` with its value; a key with no value is left visible as "[Key label]". */
export function fillLetter(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = values[k];
    if (v != null && String(v).trim() !== "") return String(v);
    return `[${LETTER_FIELDS.find((f) => f.key === k)?.label ?? k}]`;
  });
}

/** "26 October 2026" — the long date letters are written with. */
export function letterDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Sample employee for previewing a design. */
export const SAMPLE_LETTER_VALUES: Record<string, string> = {
  name: "Aniket Rami",
  firstName: "Aniket",
  designation: "Site Engineer",
  department: "Civil",
  staffId: "HT-0142",
  joiningDate: "1 June 2024",
  address: "12, Shanti Nagar, Rajkot, Gujarat 360005",
  fatherName: "Ramesh Rami",
  monthlyCtc: "Rs. 45,000",
  annualCtc: "Rs. 5,40,000",
  basic: "Rs. 22,500",
  pan: "ABCDE1234F",
  uan: "100912345678",
  company: "Hi-Tech Construction",
  date: "26 October 2026",
  refNo: "HTC/HR/2026/118",
  effectiveDate: "1 November 2026",
  lastWorkingDate: "31 October 2026",
  offerValidTill: "5 November 2026",
  newDesignation: "Senior Site Engineer",
  newSalary: "Rs. 52,000",
  newLocation: "Sewerage Network Zone 8 & 9, Ujjain",
  reportingTo: "Project Manager",
  probationMonths: "6",
  reason: "repeated late reporting at site without intimation during October 2026.",
  purpose: "applying for a home loan",
};
