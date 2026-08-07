/**
 * Date/time formatting locked to India Standard Time (Asia/Kolkata).
 *
 * The app is operated entirely from India, but production runs in UTC. Formatting with the
 * runtime's own clock (`Date#getHours()` / `getMonth()` …) therefore rendered chat, activity logs
 * and the audit trail in UTC — 5½ hours behind what staff expect. These helpers force IST via
 * `Intl`, so a timestamp reads the same whether it is formatted on the server or in any browser.
 */

const IST = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Wall-clock parts of an instant, evaluated in IST. */
function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: Number(get("month")),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** "07 Aug 2026" in IST. Passes the raw string through if it can't be parsed. */
export function formatDateIST(input: string | number | Date): string {
  if (input === "" || input == null) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "—";
  const { year, month, day } = istParts(d);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "07 Aug 2026, 3:45 PM" in IST. */
export function formatDateTimeIST(input: string | number | Date): string {
  if (input === "" || input == null) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "—";
  const { year, month, day, hour, minute } = istParts(d);
  let h = Number(hour);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${day} ${MONTHS[month - 1]} ${year}, ${h}:${minute} ${ampm}`;
}

/** "07 Aug 2026, 15:45" in IST — 24-hour, for dense tables like the audit log. */
export function formatDateTime24IST(input: string | number | Date): string {
  if (input === "" || input == null) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "—";
  const { year, month, day, hour, minute } = istParts(d);
  return `${day} ${MONTHS[month - 1]} ${year}, ${hour}:${minute}`;
}
