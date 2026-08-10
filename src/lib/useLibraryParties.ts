"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import * as vyapar from "@/lib/vyaparApi";
import type { UserResponse } from "@/lib/api";
import type { Party } from "@/lib/vyaparApi";
import { PARTY_TYPES, type LibraryParty, type LibraryPartyType } from "@/lib/libraryTypes";

/**
 * Vyapar stores only CUSTOMER/SUPPLIER, so the finer library type (Material Supplier, Labour
 * Contractor…) is kept in the party's free-text `partyGroup`. A group that isn't a known type just
 * falls back to the broad one, which keeps parties created directly in Vyapar working here.
 */
function libraryTypeOfParty(party: Party): LibraryPartyType {
  const group = party.partyGroup?.trim();
  if (group && (PARTY_TYPES as readonly string[]).includes(group)) {
    return group as LibraryPartyType;
  }
  return party.partyType === "CUSTOMER" ? "Client" : "Other Vendor";
}

function memberToParty(user: UserResponse): LibraryParty {
  const subtitle = [user.role.name, user.departmentName].filter(Boolean).join(" · ");
  return {
    key: `member:${user.id}`,
    sourceId: user.id,
    source: "member",
    // Site postings are on-site workers; office postings are staff.
    type: user.staffType === "SITE" ? "Worker" : "Staff",
    name: user.fullName,
    phone: user.phoneNumber,
    email: user.email,
    photoUrl: user.photoUrl,
    isActive: user.isActive,
    subtitle: subtitle || null,
    balance: null,
  };
}

function vyaparToParty(party: Party): LibraryParty {
  const subtitle = [party.city, party.gstin].filter(Boolean).join(" · ");
  return {
    key: `vyapar:${party.id}`,
    sourceId: party.id,
    source: "vyapar",
    type: libraryTypeOfParty(party),
    name: party.name,
    phone: party.phone,
    email: party.email,
    photoUrl: null,
    isActive: party.isActive,
    subtitle: subtitle || null,
    balance: party.balance,
  };
}

/**
 * Loads every party from both backing systems and merges them into one list. Read-only — writes go
 * back through the source's own API so there's no second copy of the data to keep in sync.
 */
export function useLibraryParties() {
  const [parties, setParties] = useState<LibraryParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, vyaparRes] = await Promise.all([api.getUsers(0, 500), vyapar.getParties()]);
      setParties([
        ...usersRes.content.map(memberToParty),
        ...vyaparRes.map(vyaparToParty),
      ]);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { parties, loading, error, refresh };
}
