// Australian public holidays (NSW) 2025–2026
const AU_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-27", // Australia Day observed
  "2025-04-18", // Good Friday
  "2025-04-19", // Easter Saturday
  "2025-04-21", // Easter Monday
  "2025-04-25", // ANZAC Day
  "2025-06-09", // King's Birthday
  "2025-08-04", // Bank Holiday
  "2025-10-06", // Labour Day
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-26", // Australia Day
  "2026-04-03", // Good Friday
  "2026-04-04", // Easter Saturday
  "2026-04-06", // Easter Monday
  "2026-04-25", // ANZAC Day
  "2026-04-27", // ANZAC Day observed (Apr 25 is Saturday → Monday)
  "2026-06-08", // King's Birthday
  "2026-08-03", // Bank Holiday
  "2026-10-05", // Labour Day
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
  "2026-12-28", // Boxing Day observed
]);

export function isWorkingDay(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00Z");
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !AU_HOLIDAYS.has(dateStr);
}

export function getWorkingDaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const current = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    if (isWorkingDay(dateStr)) days.push(dateStr);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}
