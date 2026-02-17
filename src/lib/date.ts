const MANILA_TIMEZONE = "Asia/Manila";

/**
 * Returns a Date object representing the current time in Manila.
 * NOTE: The Date object itself will still be in the system's timezone (likely UTC),
 * but relative to the system time, it represents the time shifted to Manila.
 * HOWEVER, for string formatting and day calculations, we should strictly use
 * Int.DateTimeFormat or careful manual offset if we want to be pure.
 *
 * Easier approach for "Presets": Use the formatted string component to construct the logical date.
 */
export function getManilaToday(): Date {
  // Create a date object from the current time
  const now = new Date();

  // Get string parts in Manila time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const part = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0");

  // Return a new Date object that effectively holds "Manila local time" values
  // in the local system context. This allows methods like .getDate(), .getDay() to works as expected
  // for the "Manila" date, assuming we don't convert back to UTC and expect it to match real UTC.
  return new Date(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

export function getManilaBusinessDate(): Date {
  const adjusted = adjustDateForWeekend(getManilaToday());
  const ymd = formatDateYMD(adjusted);
  return new Date(`${ymd}T12:00:00.000+08:00`);
}

/** YYYY-MM-DD */
export function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Count weekdays (Mon–Fri) between two dates, inclusive of both start and end.
 * Weekends (Sat/Sun) are excluded.
 */
export function countBusinessDays(from: Date, to: Date): number {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Monday (start of week) for the week containing d */
export function getMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/** Friday of the week containing d */
export function getFriday(d: Date): Date {
  const mon = getMonday(d);
  mon.setDate(mon.getDate() + 4);
  return mon;
}

/** 1 week: Monday to Friday of the current week (Manila time) */
export function getReportPreset1Week(): { from: string; to: string } {
  const today = getManilaToday();
  const mon = getMonday(today);
  const fri = getFriday(today);
  return { from: formatDateYMD(mon), to: formatDateYMD(fri) };
}

/** 2 weeks: Monday of previous week to Friday of current week (Manila time) */
export function getReportPreset2Weeks(): { from: string; to: string } {
  const today = getManilaToday();
  const monCurrent = getMonday(today);
  const monPrev = new Date(monCurrent);
  monPrev.setDate(monPrev.getDate() - 7);
  const fri = getFriday(today);
  return { from: formatDateYMD(monPrev), to: formatDateYMD(fri) };
}

/**
 * Adjusts the date to the next Monday if it falls on a weekend (Saturday or Sunday).
 * Otherwise returns the date as is.
 */
export function adjustDateForWeekend(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 6) { // Saturday
    d.setDate(d.getDate() + 2);
  } else if (day === 0) { // Sunday
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** 1 month: First day of current month to last day of current month (Manila time) */
export function getReportPreset1Month(): { from: string; to: string } {
  const today = getManilaToday();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: formatDateYMD(firstDay), to: formatDateYMD(lastDay) };
}

/**
 * Returns UTC Date objects corresponding to the start and end of the provided Manila dates.
 * fromStr, toStr: "YYYY-MM-DD"
 * 
 * Start: YYYY-MM-DD 00:00:00.000 Asia/Manila
 * End:   YYYY-MM-DD 23:59:59.999 Asia/Manila
 */
export function getManilaDateRange(fromStr: string, toStr: string): { from: Date; to: Date } {
  // Construct ISO strings with rigid +08:00 offset
  const fromISO = `${fromStr}T00:00:00.000+08:00`;
  const toISO = `${toStr}T23:59:59.999+08:00`;
  return {
    from: new Date(fromISO),
    to: new Date(toISO),
  };
}

/** Get all weekdays (Mon-Fri) strings between from and to (inclusive) */
export function getWeekdaysInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  // Normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) { // Skip Sun(0) and Sat(6)
      dates.push(formatDateYMD(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** 
 * Returns "YYYY-MM-DD HH:mm:ss" in Manila timezone
 */
export function formatDateTimeManila(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")} ${getPart("dayPeriod")}`;
}
