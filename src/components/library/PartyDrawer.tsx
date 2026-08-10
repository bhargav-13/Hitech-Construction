"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import * as api from "@/lib/api";
import * as vyapar from "@/lib/vyaparApi";
import { GST_TYPES } from "@/lib/vyaparApi";
import { useDepartments } from "@/lib/useDepartments";
import {
  PARTY_TYPE_GROUPS,
  fieldsForType,
  sourceForType,
  vyaparTypeForPartyType,
  type LibraryParty,
  type LibraryPartyType,
  type PartyFieldKey,
} from "@/lib/libraryTypes";

/**
 * Add / edit a party. The form is built from the selected type: common fields first, then whatever
 * `fieldsForType` says that type needs. A type change re-shapes the form without clearing what's
 * already typed, so switching Client → Material Supplier keeps the name and phone.
 */
export function PartyDrawer({
  existing,
  roles,
  onClose,
  onSaved,
}: {
  existing?: LibraryParty;
  roles: api.RoleResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { departments } = useDepartments();
  const [type, setType] = useState<LibraryPartyType | "">(existing?.type ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [staffType, setStaffType] = useState<"OFFICE" | "SITE" | "">("");
  const [onPayroll, setOnPayroll] = useState(false);
  const [gstin, setGstin] = useState("");
  const [gstType, setGstType] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fields = useMemo(() => new Set(fieldsForType(type)), [type]);
  const has = (key: PartyFieldKey) => fields.has(key);
  // An existing party can't change which system it lives in, so its type is locked to that group.
  const lockedSource = existing?.source;

  async function submit() {
    if (!type) {
      setError("Pick a party type first.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const target = sourceForType(type);
    if (target === "member" && !existing && (!email.trim() || !password)) {
      setError("Staff and workers sign in, so email and password are required.");
      return;
    }
    if (target === "member" && !existing && roleId === "") {
      setError("Pick a role for this member.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (target === "member") {
        if (existing) {
          await api.updateUser(existing.sourceId, {
            fullName: name.trim(),
            phoneNumber: phone.trim() || undefined,
            ...(roleId === "" ? {} : { roleId }),
            departmentId: departmentId === "" ? null : departmentId,
            staffType: staffType || (type === "Worker" ? "SITE" : "OFFICE"),
            onPayroll,
          });
        } else {
          await api.createUser({
            email: email.trim(),
            password,
            fullName: name.trim(),
            phoneNumber: phone.trim() || undefined,
            roleId: roleId as number,
            departmentId: departmentId === "" ? null : departmentId,
            staffType: staffType || (type === "Worker" ? "SITE" : "OFFICE"),
            onPayroll,
          });
        }
      } else {
        const body: Partial<vyapar.Party> = {
          name: name.trim(),
          partyType: vyaparTypeForPartyType(type),
          phone: phone.trim() || null,
          email: email.trim() || null,
          gstin: gstin.trim() || null,
          gstType: gstType || null,
          state: state.trim() || null,
          city: city.trim() || null,
          billingAddress: billingAddress.trim() || null,
          // The finer library type has no column of its own — it rides in the party group.
          partyGroup: type,
          openingBalance: openingBalance === "" ? 0 : Number(openingBalance),
          creditLimit: creditLimit === "" ? null : Number(creditLimit),
        };
        if (existing) {
          await vyapar.updateParty(existing.sourceId, body);
        } else {
          await vyapar.createParty(body);
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to save this party.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? "Edit Party" : "Add Party"}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "Saving…" : "Save"}
    >
      <div className="space-y-4">
        <DrawerField label="Party Type" required>
          <Select
            value={type}
            onChange={(v) => setType(v as LibraryPartyType)}
            placeholder="Select party type"
            options={PARTY_TYPE_GROUPS.flatMap((group) =>
              group.types
                // Editing can't move a record between backing systems, so only same-source types show.
                .filter((t) => !lockedSource || sourceForType(t) === lockedSource)
                .map((t) => ({ value: t, label: `${group.label} · ${t}` }))
            )}
          />
          <p className="mt-1 text-xs text-gray-400">
            {type
              ? sourceForType(type) === "member"
                ? "Saved as a member — they get a login, a role and can be put on payroll."
                : "Saved as a Vyapar party — carries GST details and a ledger."
              : "The rest of the form depends on the type you pick."}
          </p>
        </DrawerField>

        <DrawerField label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Full name or firm name" />
        </DrawerField>

        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </DrawerField>
          <DrawerField label="Email" required={has("password") && !existing}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              disabled={existing?.source === "member"}
            />
          </DrawerField>
        </div>

        {!type && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Pick a party type above to see the rest of the fields.
          </div>
        )}

        {/* ---- Member-only fields ---- */}
        {has("password") && !existing && (
          <DrawerField label="Password" required>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </DrawerField>
        )}

        {has("role") && (
          <DrawerField label="Role" required={!existing}>
            <Select
              value={roleId === "" ? "" : String(roleId)}
              onChange={(v) => setRoleId(v ? Number(v) : "")}
              placeholder="Select role"
              options={roles.map((r) => ({ value: String(r.id), label: r.name }))}
            />
          </DrawerField>
        )}

        {has("department") && (
          <DrawerField label="Department">
            <Select
              value={departmentId === "" ? "" : String(departmentId)}
              onChange={(v) => setDepartmentId(v === "" ? "" : Number(v))}
              placeholder="No department"
              options={[
                { value: "", label: "No department" },
                ...departments.map((d) => ({ value: String(d.id), label: d.name })),
              ]}
            />
          </DrawerField>
        )}

        {has("staffType") && (
          <DrawerField label="Posting">
            <div className="flex gap-1 rounded-lg border border-gray-200 p-1">
              {([["OFFICE", "Office"], ["SITE", "Site"]] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStaffType(val)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                    staffType === val ? "bg-brand-accent text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </DrawerField>
        )}

        {has("onPayroll") && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onPayroll}
              onChange={(e) => setOnPayroll(e.target.checked)}
              className="h-4 w-4 accent-cyan-600"
            />
            On payroll — can punch and has a salary profile
          </label>
        )}

        {/* ---- Vendor / client fields ---- */}
        {has("gstin") && (
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="GSTIN">
              <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="input" />
            </DrawerField>
            <DrawerField label="GST Type">
              <Select
                value={gstType}
                onChange={setGstType}
                placeholder="Select"
                options={GST_TYPES.map((g) => ({ value: g, label: g }))}
              />
            </DrawerField>
          </div>
        )}

        {has("city") && (
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="City">
              <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
            </DrawerField>
            <DrawerField label="State">
              <input value={state} onChange={(e) => setState(e.target.value)} className="input" />
            </DrawerField>
          </div>
        )}

        {has("billingAddress") && (
          <DrawerField label="Billing Address">
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              rows={2}
              className="input resize-none"
            />
          </DrawerField>
        )}

        {has("openingBalance") && (
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="Opening Balance">
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="input"
                placeholder="0"
              />
            </DrawerField>
            <DrawerField label="Credit Limit">
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="input"
                placeholder="No limit"
              />
            </DrawerField>
          </div>
        )}

        {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
      </div>
    </Drawer>
  );
}
