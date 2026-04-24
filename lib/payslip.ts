import type { TimeEntry, EmployeeSchedule } from "./googleSheets";
import type { CutoffPeriod } from "./cutoff";

export type PayslipData = {
  payslipId: string;
  invoiceNo: string;
  invoiceDate: string;        // YYYY-MM-DD
  serviceProviderCode: string;
  // Employee
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  hireDate: string;           // YYYY-MM-DD
  contractValue: number;
  // Period
  cutoff: CutoffPeriod;
  // Hours
  hoursRendered: number;
  hoursAwarded: number;
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
    // Only qualifies if worked MORE than 1 full hour past shift end
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

  // Hours = working weekdays in the full cutoff period × 7.5
  const workingDays = countWorkingDays(cutoff.from, cutoff.to);
  const hoursRendered = workingDays * HOURS_PER_DAY;
  const hoursAwarded = hoursRendered;

  const leaveDaysTaken = overrides.leaveDaysTaken ?? 0;
  // recepTaskPay is always fixed at half the monthly contract value
  const recepTaskPay = config.contractValue / 2;
  // Rate auto-adjusts: task pay ÷ working hours this cutoff
  const displayedHourlyRate = hoursAwarded > 0
    ? Math.round((recepTaskPay / hoursAwarded) * 100) / 100
    : config.hourlyRate;
  // Leave deductions use base rate (contractValue ÷ 150 = standard per-day rate)
  const baseHourlyRate = config.contractValue > 0 ? config.contractValue / 150 : config.hourlyRate;
  const leaveDeductions = leaveDaysTaken * baseHourlyRate * HOURS_PER_DAY;
  // Fees in ContractConfig are monthly — halve for per-cutoff invoice
  const internetFee = config.internetFee / 2;
  const medicalFee = config.medicalFee / 2;
  // Late arrivals + early clock-outs: deduct at minute rate (hourlyRate ÷ 60)
  const lateEarlyMinutes = overrides.schedule
    ? computeLateEarlyMinutes(allEntries, cutoff, overrides.schedule)
    : 0;
  const minuteRate = displayedHourlyRate / 60;
  const attendanceDeductions = Math.round(lateEarlyMinutes * minuteRate * 100) / 100;
  // Overtime: only whole hours past shift end that exceed the 1-hour threshold
  const otHours = overrides.schedule
    ? computeOvertimeHours(allEntries, cutoff, overrides.schedule)
    : 0;
  const overtimePay = Math.round(otHours * displayedHourlyRate * 100) / 100;
  const adminTaskPay = 0;
  const totalEarnings = recepTaskPay + internetFee + medicalFee - leaveDeductions - attendanceDeductions + overtimePay;

  // Contract duration from hire to cutoff end
  const hire = new Date(hireDate);
  const end = new Date(cutoff.to);
  const contractMonths =
    (end.getFullYear() - hire.getFullYear()) * 12 +
    (end.getMonth() - hire.getMonth());

  const timeBankPerMonth = 0.83;
  const timeBankTotal = Math.round(contractMonths * timeBankPerMonth * 100) / 100;
  // Cap hours claimed so time bank balance never goes negative
  const hoursClaimed = Math.min(overrides.hoursClaimed ?? 0, timeBankTotal);
  const timeBankBalance = Math.round((timeBankTotal - hoursClaimed) * 100) / 100;

  // Invoice number: MMPPYYYY — PP=01 for 1st–15th cutoff, PP=02 for 16th–end
  const [y, m] = cutoff.to.split("-");
  const fromDay = parseInt(cutoff.from.split("-")[2], 10);
  const instance = fromDay <= 15 ? "01" : "02";
  const invoiceNo = `${m}${instance}${y}`;

  // Service provider code: first name or employee ID
  const serviceProviderCode = employeeName.split(" ")[0] ?? employeeId;

  return {
    payslipId: overrides.payslipId ?? `${employeeId}-${cutoff.from}-${cutoff.to}`,
    invoiceNo,
    invoiceDate: new Date().toISOString().slice(0, 10),
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
    hourlyRate: displayedHourlyRate,
    adminTaskPay,
    recepTaskPay,
    internetFee,
    medicalFee,
    leaveDeductions,
    leaveDaysTaken,
    lateEarlyMinutes,
    attendanceDeductions,
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
