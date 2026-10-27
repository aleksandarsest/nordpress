import { format } from "date-fns";

// Formats `date` as wall-clock time in `timeZone`. Built on Intl rather than
// a timezone-aware Date subclass so rendering stays deterministic, which
// prerendering with Cache Components requires.
export function formatInZone(date: Date, timeZone: string, pattern: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
  const wallClock = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return format(wallClock, pattern);
}

// Offset of `timeZone` from UTC at `instant`, in milliseconds.
function zoneOffset(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// Parses an ISO date-time. Without an explicit offset it is read as wall-clock
// time in `timeZone`, like WordPress's `date` field.
export function parseInZone(value: string, timeZone: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
      value.trim(),
    );
  if (!match) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return new Date(guess - zoneOffset(guess, timeZone));
}
