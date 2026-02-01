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

/** YYYY-MM-DD for date inputs and query params */
export function formatDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
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

/** 1 week: Monday to Friday of the current week */
export function getReportPreset1Week(): { from: string; to: string } {
  const today = new Date();
  const mon = getMonday(today);
  const fri = getFriday(today);
  return { from: formatDateYMD(mon), to: formatDateYMD(fri) };
}

/** 2 weeks: Monday of previous week to Friday of current week */
export function getReportPreset2Weeks(): { from: string; to: string } {
  const today = new Date();
  const monCurrent = getMonday(today);
  const monPrev = new Date(monCurrent);
  monPrev.setDate(monPrev.getDate() - 7);
  const fri = getFriday(today);
  return { from: formatDateYMD(monPrev), to: formatDateYMD(fri) };
}
