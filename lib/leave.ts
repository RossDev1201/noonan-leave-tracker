export type LeaveEntry = {
  date: string; // YYYY-MM-DD
  days: number;
  type: string;
  note?: string;
};

export type EmployeeRaw = {
  id: string;
  fullName: string;
  position: string;
  hireDate: string; // YYYY-MM-DD
  /**
   * startingBalance:
   *   Manual adjustment for total balance (e.g. initial credit).
   */
  startingBalance: number;
  leaveTaken: LeaveEntry[];
};

export type EmployeeWithLeave = EmployeeRaw & {
  tenureDays: number;
  tenureYears: number;
  tenureMonths: number;

  // TOTAL (all years) – accrual never resets
  accruedLeave: number;
  leaveTakenTotal: number;
  leaveBalance: number;

  // Eligibility to use leave (6-month rule)
  fullMonthsTenure: number;
  canUseLeave: boolean;
  availableLeaveToUse: number; // 0 until canUseLeave === true
};

const MONTHLY_ACCRUAL = 0.83; // fixed 0.83 day per full month

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function diffInDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcFrom = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const utcTo = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((utcTo - utcFrom) / msPerDay));
}

/**
 * Full months between two dates.
 * Used for BOTH accrual and the 6-month eligibility rule.
 */
function getFullMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  if (end.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

function getTenureComponents(hireDate: Date, today: Date) {
  let years = today.getUTCFullYear() - hireDate.getUTCFullYear();
  let months = today.getUTCMonth() - hireDate.getUTCMonth();
  let days = today.getUTCDate() - hireDate.getUTCDate();

  if (days < 0) {
    months -= 1;
    const temp = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    days += temp.getUTCDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

/**
 * Accrues 0.83 day per full month from hire date up to today.
 * No yearly reset – this is TOTAL accrued leave.
 */
function calculateAccruedLeave(hireDate: Date, today: Date): number {
  const months = getFullMonthsBetween(hireDate, today);
  return months * MONTHLY_ACCRUAL;
}

function sumLeaveTaken(entries: LeaveEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.days, 0);
}

/**
 * Main transformer:
 * - Tenure always from hire date → today (display).
 * - Accrual is total over entire employment (carry over every year).
 * - Employee can only USE leave after 6 full months.
 */
export function computeEmployeeLeave(
  rawEmployees: EmployeeRaw[],
  todayArg?: Date
): EmployeeWithLeave[] {
  const today = todayArg ?? new Date();

  return rawEmployees.map((emp) => {
    const hireDate = parseDate(emp.hireDate);

    const tenureDays = diffInDays(hireDate, today);
    const { years, months } = getTenureComponents(hireDate, today);

    const fullMonthsTenure = getFullMonthsBetween(hireDate, today);

    // Total accrual (no reset) + manual startingBalance
    const accruedLeaveTotal =
      calculateAccruedLeave(hireDate, today) + emp.startingBalance;

    const leaveTakenTotal = sumLeaveTaken(emp.leaveTaken);
    const leaveBalance = accruedLeaveTotal - leaveTakenTotal;

    // 6-month eligibility rule
    const canUseLeave = fullMonthsTenure >= 6;
    const availableLeaveToUse = canUseLeave ? leaveBalance : 0;

    return {
      ...emp,
      tenureDays,
      tenureYears: years,
      tenureMonths: months,

      accruedLeave: Number(accruedLeaveTotal.toFixed(2)),
      leaveTakenTotal: Number(leaveTakenTotal.toFixed(2)),
      leaveBalance: Number(leaveBalance.toFixed(2)),

      fullMonthsTenure,
      canUseLeave,
      availableLeaveToUse: Number(availableLeaveToUse.toFixed(2))
    };
  });
}
