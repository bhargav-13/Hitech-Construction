/**
 * Party Library — one directory over every kind of party the business deals with.
 *
 * The records themselves stay where they already live (members in user-management, customers and
 * suppliers in Vyapar). This module only defines the shared shape they're projected into, and which
 * form fields each party type asks for.
 */

/** Every party type the library can hold, grouped into People vs Vendors in the UI. */
export const PARTY_TYPES = [
  "Staff",
  "Worker",
  "Client",
  "Investor",
  "Labour Contractor",
  "Material Supplier",
  "Equipment Supplier",
  "Contractor",
  "Other Vendor",
] as const;
export type LibraryPartyType = (typeof PARTY_TYPES)[number];

/** People are members of the org; vendors are outside parties we buy from or subcontract to. */
export const PARTY_TYPE_GROUPS: { label: string; types: LibraryPartyType[] }[] = [
  { label: "People", types: ["Staff", "Worker", "Client", "Investor"] },
  {
    label: "Vendors",
    types: ["Labour Contractor", "Material Supplier", "Equipment Supplier", "Contractor", "Other Vendor"],
  },
];

/** Which backing system a row came from — decides where an edit is written back to. */
export type PartySource = "member" | "vyapar";

/** A party projected into the library's shared shape, whatever system it came from. */
export interface LibraryParty {
  /** Unique across sources, e.g. "member:12" — the raw id alone collides between systems. */
  key: string;
  sourceId: number;
  source: PartySource;
  type: LibraryPartyType;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  isActive: boolean;
  /** The secondary line under the name — role+department for staff, GSTIN/city for a vendor. */
  subtitle: string | null;
  /** Signed money position: positive = they owe us, negative = we owe them. Null when N/A. */
  balance: number | null;
}

/** Colour per type so the pills read as a set rather than nine unrelated colours. */
export const PARTY_TYPE_STYLE: Record<LibraryPartyType, string> = {
  Staff: "bg-indigo-50 text-indigo-700",
  Worker: "bg-sky-50 text-sky-700",
  Client: "bg-emerald-50 text-emerald-700",
  Investor: "bg-violet-50 text-violet-700",
  "Labour Contractor": "bg-amber-50 text-amber-700",
  "Material Supplier": "bg-orange-50 text-orange-700",
  "Equipment Supplier": "bg-rose-50 text-rose-700",
  Contractor: "bg-teal-50 text-teal-700",
  "Other Vendor": "bg-gray-100 text-gray-600",
};

/**
 * Where a new party of each type gets written. Staff and Worker become members (they need a login
 * and a role); everything else becomes a Vyapar party, since that's what carries GST and a ledger.
 */
export function sourceForType(type: LibraryPartyType): PartySource {
  return type === "Staff" || type === "Worker" ? "member" : "vyapar";
}

/** Client is the only type we sell to; the rest of the Vyapar-backed types are bought from. */
export function vyaparTypeForPartyType(type: LibraryPartyType): "CUSTOMER" | "SUPPLIER" {
  return type === "Client" ? "CUSTOMER" : "SUPPLIER";
}

/**
 * The extra fields a type asks for, on top of the common ones every party has. This is what makes
 * the Add Party form change shape as you pick a type.
 */
export type PartyFieldKey =
  | "role"
  | "department"
  | "staffType"
  | "onPayroll"
  | "password"
  | "gstin"
  | "gstType"
  | "state"
  | "city"
  | "billingAddress"
  | "openingBalance"
  | "creditLimit"
  | "partyGroup";

const MEMBER_FIELDS: PartyFieldKey[] = ["role", "department", "staffType", "onPayroll", "password"];
const VENDOR_FIELDS: PartyFieldKey[] = [
  "gstin",
  "gstType",
  "state",
  "city",
  "billingAddress",
  "openingBalance",
  "creditLimit",
  "partyGroup",
];

/** Extra fields shown once a type is picked — empty until the user chooses one. */
export function fieldsForType(type: LibraryPartyType | ""): PartyFieldKey[] {
  if (!type) return [];
  return sourceForType(type) === "member" ? MEMBER_FIELDS : VENDOR_FIELDS;
}
