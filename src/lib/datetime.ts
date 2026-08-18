/**
 * Date/time handling locked to India Standard Time (Asia/Kolkata).
 *
 * The app is operated entirely from India, but neither end of the stack is guaranteed to run there.
 * The backend stores every timestamp as a JPA `LocalDateTime` (`BaseEntity.createdAt`, chat `at`,
 * activity `at`, audit rows …) and Jackson serialises those with **no timezone designator** —
 * `"2026-08-10T12:26:57.416257"`. JavaScript reads a zone-less datetime as *the runtime's own local
 * time*, so the same string became a different instant depending on where it was parsed:
 *
 *   • backend in Docker (UTC) + browser in IST  → chat/activity read 5½ hours early
 *   • backend on a dev box (IST) + Next SSR in Docker (UTC) → the same rows read 5½ hours late
 *
 * Formatting alone could not fix that — the instant was already wrong by the time it reached the
 * formatter. So parsing is pinned here too: a zone-less timestamp is defined to be **IST wall
 * clock** (the backend now pins its JVM to Asia/Kolkata and stamps the offset on the wire), while
 * anything that already carries a `Z` or a `±hh:mm` offset is honoured as the real instant it is.
 * Every timestamp therefore reads identically on the server, in an Indian browser and in a browser
 * abroad.
 *
 * Use these helpers for anything with a clock time. Plain `yyyy-MM-dd` values (due dates, invoice
 * dates) carry no time and are safest compared as strings — see `todayIST()`.
 */

const IST = "Asia/Kolkata";
/** India has had a fixed +05:30 offset since 1945 and observes no DST, so a literal is safe. */
const IST_OFFSET = "+05:30";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-08-10` — a date with no clock time at all. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** `2026-08-10T12:26:57.416257` / `2026-08-10 12:26` — ISO-ish, but with no Z and no ±hh:mm. */
const ZONELESS_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?$/;

/**
 * Turn a backend timestamp into the instant it actually represents.
 *
 * Zone-less strings are read as IST rather than as the runtime's local time — that is the whole
 * point of this module. Returns `null` when the value can't be understood, so callers can fall
 * back instead of rendering "Invalid Date".
 */
export function parseIST(input: string | number | Date | null | undefined): Date | null {
  if (input === "" || input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return new Date(input);

  const raw = input.trim();
  let normalised = raw;

  if (DATE_ONLY.test(raw)) {
    // Midnight *in India*. `new Date("2026-08-10")` would be UTC midnight, i.e. 05:30 IST — close
    // enough to look right, but it silently shifts the calendar day for anyone west of Greenwich.
    normalised = `${raw}T00:00:00${IST_OFFSET}`;
  } else {
    const m = ZONELESS_DATETIME.exec(raw);
    if (m) {
      // Postgres hands back microseconds; the Date parser only defines three fraction digits.
      const frac = m[3] ? `.${m[3].slice(0, 3).padEnd(3, "0")}` : "";
      normalised = `${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${frac}${IST_OFFSET}`;
    }
    // Anything else (trailing `Z`, an explicit offset, or a non-ISO string) is left alone — it
    // already pins down an instant, or only the platform parser can make sense of it.
  }

  const d = new Date(normalised);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Epoch millis of a backend timestamp, IST-aware. `0` when unparseable, for safe sorting. */
export function msIST(input: string | number | Date | null | undefined): number {
  return parseIST(input)?.getTime() ?? 0;
}

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

/** "3:45 PM" out of the 24-hour parts. */
function to12h(hour: string, minute: string): string {
  const h = Number(hour);
  return `${h % 12 || 12}:${minute} ${h >= 12 ? "PM" : "AM"}`;
}

/** Runs the formatter, or passes an unparseable string straight through. */
function render(
  input: string | number | Date | null | undefined,
  fn: (p: ReturnType<typeof istParts>) => string
): string {
  const d = parseIST(input);
  if (!d) return typeof input === "string" && input.trim() !== "" ? input : "—";
  return fn(istParts(d));
}

/** "07 Aug 2026" in IST. */
export function formatDateIST(input: string | number | Date | null | undefined): string {
  return render(input, (p) => `${p.day} ${MONTHS[p.month - 1]} ${p.year}`);
}

/** "07 Aug 2026, 3:45 PM" in IST. */
export function formatDateTimeIST(input: string | number | Date | null | undefined): string {
  return render(input, (p) => `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${to12h(p.hour, p.minute)}`);
}

/** "07 Aug 2026, 15:45" in IST — 24-hour, for dense tables like the audit log. */
export function formatDateTime24IST(input: string | number | Date | null | undefined): string {
  return render(input, (p) => `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`);
}

/** "3:45 PM" in IST — clock time only. */
export function formatTimeIST(input: string | number | Date | null | undefined): string {
  return render(input, (p) => to12h(p.hour, p.minute));
}

/** `yyyy-MM-dd` for an instant, evaluated in IST. */
export function dateKeyIST(input: string | number | Date | null | undefined = new Date()): string {
  const d = parseIST(input);
  if (!d) return "";
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${p.day}`;
}

/**
 * Today's date in India as `yyyy-MM-dd`.
 *
 * Due dates and other date-only fields are plain strings, so "is this overdue?" is a string
 * comparison against this — never against `new Date().getDate()`, which answers for whatever
 * timezone the code happens to be running in.
 */
export function todayIST(): string {
  return dateKeyIST(new Date());
}

/** True when both timestamps land on the same calendar day in India. */
export function sameDayIST(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined
): boolean {
  const ka = dateKeyIST(a);
  return ka !== "" && ka === dateKeyIST(b);
}

/**
 * Compact chat stamp: "3:45 PM" today, "Yesterday, 3:45 PM" yesterday, "07 Aug, 3:45 PM" before
 * that. Message bubbles previously showed the date only, so the time was missing entirely.
 */
export function formatChatStampIST(input: string | number | Date | null | undefined): string {
  const d = parseIST(input);
  if (!d) return typeof input === "string" && input.trim() !== "" ? input : "";
  const p = istParts(d);
  const time = to12h(p.hour, p.minute);
  const key = `${p.year}-${String(p.month).padStart(2, "0")}-${p.day}`;
  if (key === todayIST()) return time;
  if (key === dateKeyIST(new Date(Date.now() - 86_400_000))) return `Yesterday, ${time}`;
  return `${p.day} ${MONTHS[p.month - 1]}, ${time}`;
}
