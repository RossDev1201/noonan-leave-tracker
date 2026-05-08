import type { TimeEntry, EmployeeSchedule } from "./googleSheets";
import type { CutoffPeriod } from "./cutoff";
import { getAustralianDate, getPHDate } from "./dateUtils";

export type PayslipData = {
  payslipId: string;
  invoiceNo: string;
  invoiceDate: string;
  serviceProviderCode: string;
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  hireDate: string;
  contractValue: number;
  cutoff: CutoffPeriod;
  // Hours
  hoursRendered: number;    // actual logged hours this period
  hoursAwarded: number;     // expected hours up to today
  actualDaysWorked: number;
  expectedDaysToDate: number;
  // Earnings
  hourlyRate: number;
  adminTaskPay: number;
  recepTaskPay: number;
  internetFee: number;
  medicalFee: number;
  leaveDeductions: number;
  leaveDaysTaken: number;
  lateEarlyMinutes: number;
  attendanceDeductions: number;
  absenceDays: number;
  absenceDeductions: number;
  otHours: number;
  overtimePay: number;
  totalEarnings: number;
  // Time bank
  contractDurationMonths: number;
  timeBankPerMonth: number;
  timeBankTotal: number;
  hoursClaimed: number;
  timeBankBalance: number;
  // Meta
  savedAt?: string;
  notes?: string;
  isFinalized?: boolean;
};

const HOURS_PER_DAY = 7.5;

function countWorkingDays(from: string, to: string): number {
  const end = new Date(to);
  let count = 0;
  const cur = new Date(from);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function computeLateEarlyMinutes(
  entries: TimeEntry[],
  cutoff: CutoffPeriod,
  schedule: EmployeeSchedule
): number {
  const schedStart = toMinutes(schedule.startTime);
  const schedEnd = toMinutes(schedule.endTime);
  let total = 0;
  for (const e of entries) {
    if (e.date < cutoff.from || e.date > cutoff.to || !e.logoutTime) continue;
    const lateMin = Math.max(0, toMinutes(e.loginTime) - schedStart);
    const earlyMin = Math.max(0, schedEnd - toMinutes(e.logoutTime));
    total += lateMin + earlyMin;
  }
  return total;
}

function computeOvertimeHours(
  entries: TimeEntry[],
  cutoff: CutoffPeriod,
  schedule: EmployeeSchedule
): number {
  const schedEnd = toMinutes(schedule.endTime);
  let total = 0;
  for (const e of entries) {
    if (e.date < cutoff.from || e.date > cutoff.to || !e.logoutTime) continue;
    const extraMinutes = Math.max(0, toMinutes(e.logoutTime) - schedEnd);
    if (extraMinutes >= 60) {
      total += Math.floor(extraMinutes / 60);
    }
  }
  return total;
}

export function getContractConfig(employeeId: string): {
  contractValue: number;
  hourlyRate: number;
  department: string;
  internetFee: number;
  medicalFee: number;
} {
  for (let i = 1; i <= 50; i++) {
    const id = process.env[`MEMBER${i}_EMPLOYEE_ID`];
    if (id === employeeId) {
      return {
        contractValue: Number(process.env[`MEMBER${i}_CONTRACT_VALUE`]) || 45000,
        hourlyRate: Number(process.env[`MEMBER${i}_HOURLY_RATE`]) || 300,
        department: process.env[`MEMBER${i}_DEPARTMENT`] || "IT Department",
        internetFee: Number(process.env[`MEMBER${i}_INTERNET_FEE`]) || 1250,
        medicalFee: Number(process.env[`MEMBER${i}_MEDICAL_FEE`]) || 1250,
      };
    }
  }
  return {
    contractValue: 45000,
    hourlyRate: 300,
    department: "IT Department",
    internetFee: 1250,
    medicalFee: 1250,
  };
}

type ContractConfigInput = {
  contractValue: number;
  hourlyRate: number;
  internetFee: number;
  medicalFee: number;
  department: string;
};

export function buildPayslipData(
  employeeId: string,
  employeeName: string,
  position: string,
  hireDate: string,
  allEntries: TimeEntry[],
  cutoff: CutoffPeriod,
  overrides: {
    leaveDaysTaken?: number;
    hoursClaimed?: number;
    notes?: string;
    payslipId?: string;
    savedAt?: string;
    isFinalized?: boolean;
    contractConfig?: ContractConfigInput;
    schedule?: EmployeeSchedule | null;
  } = {}
): PayslipData {
  const config: ContractConfigInput = overrides.contractConfig ?? getContractConfig(employeeId);

  // ── Actual attendance from TimeTracking ────────────────────────────────────
  const periodEntries = allEntries.filter(
    (e) => e.date >= cutoff.from && e.date <= cutoff.to
  );
  const completedEntries = periodEntries.filter((e) => !!e.logoutTime);
  const inProgressEntries = periodEntries.filter((e) => !e.logoutTime);
  const actualDaysWorked = completedEntries.length;
  const hoursRendered = actualDaysWorked * HOURS_PER_DAY;

  // Expected working days up to today (capped at cutoff end)
  const today = getPHDate();
  const periodCap = today <= cutoff.to ? today : cutoff.to;
  const expectedDaysToDate = countWorkingDays(cutoff.from, periodCap);
  const hoursAwarded = expectedDaysToDate * HOURS_PER_DAY;

  const leaveDaysTaken = overrides.leaveDaysTaken ?? 0;

  // Total working days in the full cutoff period (for rate and proration)
  const totalWorkingDays = countWorkingDays(cutoff.from, cutoff.to);
  const totalPeriodHours = totalWorkingDays * HOURS_PER_DAY;

  // recepTaskPay is PRORATED: (contractValue/2) × (daysActuallyWorked / totalDaysInPeriod)
  // This keeps the invoice in sync with actual attendance — you earn as you go
  const fullRecepTaskPay = config.contractValue / 2;
  const recepTaskPay = totalWorkingDays > 0
    ? Math.round((fullRecepTaskPay * actualDaysWorked / totalWorkingDays) * 100) / 100
    : 0;

  // Hourly rate = full contract half ÷ full period hours (for display reference)
  const displayedHourlyRate = totalPeriodHours > 0
    ? Math.round((fullRecepTaskPay / totalPeriodHours) * 100) / 100
    : config.hourlyRate;

  // Base rate for deductions (contractValue ÷ 150 = standard per-hour rate)
  const baseHourlyRate = config.contractValue > 0 ? config.contractValue / 150 : config.hourlyRate;

  const leaveDeductions = leaveDaysTaken * baseHourlyRate * HOURS_PER_DAY;

  // Absence deductions are no longer needed — proration of recepTaskPay handles it.
  // Keeping fields at 0 for backwards compatibility.
  const absenceDays = 0;
  const absenceDeductions = 0;

  // Fees: half-month contractual allowances (fixed regardless of days)
  const internetFee = config.internetFee / 2;
  const medicalFee = config.medicalFee / 2;

  // Late/early minute deductions from schedule
  const lateEarlyMinutes = overrides.schedule
    ? computeLateEarlyMinutes(allEntries, cutoff, overrides.schedule)
    : 0;
  const minuteRate = displayedHourlyRate / 60;
  const attendanceDeductions = Math.round(lateEarlyMinutes * minuteRate * 100) / 100;

  // Overtime: whole hours logged past shift end (must exceed 1-hour threshold)
  const otHours = overrides.schedule
    ? computeOvertimeHours(allEntries, cutoff, overrides.schedule)
    : 0;
  const overtimePay = Math.round(otHours * displayedHourlyRate * 100) / 100;

  const adminTaskPay = 0;
  const totalEarnings =
    recepTaskPay + internetFee + medicalFee
    - leaveDeductions - attendanceDeductions
    + overtimePay;

  // Contract duration from hire to cutoff end
  const hire = new Date(hireDate);
  const end = new Date(cutoff.to);
  const contractMonths =
    (end.getFullYear() - hire.getFullYear()) * 12 +
    (end.getMonth() - hire.getMonth());

  const timeBankPerMonth = 0.83;
  const timeBankTotal = Math.round(contractMonths * timeBankPerMonth * 100) / 100;
  const hoursClaimed = Math.min(overrides.hoursClaimed ?? 0, timeBankTotal);
  const timeBankBalance = Math.round((timeBankTotal - hoursClaimed) * 100) / 100;

  // Invoice number: MMPPYYYY
  const [y, m] = cutoff.to.split("-");
  const fromDay = parseInt(cutoff.from.split("-")[2], 10);
  const instance = fromDay <= 15 ? "01" : "02";
  const invoiceNo = `${m}${instance}${y}`;

  const serviceProviderCode = employeeName.split(" ")[0] ?? employeeId;

  return {
    payslipId: overrides.payslipId ?? `${employeeId}-${cutoff.from}-${cutoff.to}`,
    invoiceNo,
    invoiceDate: getAustralianDate(),
    serviceProviderCode,
    employeeId,
    employeeName,
    position,
    department: config.department,
    hireDate,
    contractValue: config.contractValue,
    cutoff,
    hoursRendered,
    hoursAwarded,
    actualDaysWorked,
    expectedDaysToDate,
    hourlyRate: displayedHourlyRate,
    adminTaskPay,
    recepTaskPay,
    internetFee,
    medicalFee,
    leaveDeductions,
    leaveDaysTaken,
    lateEarlyMinutes,
    attendanceDeductions,
    absenceDays,
    absenceDeductions,
    otHours,
    overtimePay,
    totalEarnings,
    contractDurationMonths: contractMonths,
    timeBankPerMonth,
    timeBankTotal,
    hoursClaimed,
    timeBankBalance,
    notes: overrides.notes,
    savedAt: overrides.savedAt,
    isFinalized: overrides.isFinalized ?? false,
  };
}
