import { redirect } from "next/navigation";

/**
 * Party Groups is now a tab on the Parties page, not its own route. Keep this path working for old
 * links and bookmarks by redirecting into that tab.
 */
export default function PartyGroupsRedirect() {
  redirect("/vyapar/parties?tab=groups");
}
