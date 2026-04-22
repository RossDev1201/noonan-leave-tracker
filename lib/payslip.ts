import type { TimeEntry } from "./googleSheets";
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
  leaveDeductions: number;    // admin-editable: leave days * rate * 7.5
  leaveDaysTaken: number;     // admin-editable
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
  } = {}
): PayslipData {
  const config = getContractConfig(employeeId);

  const periodEntries = allEntries.filter(
    (e) => e.employeeId === employeeId && e.date >= cutoff.from && e.date <= cutoff.to && !!e.logoutTime
  );

  const hoursRendered = periodEntries.length * HOURS_PER_DAY;
  const hoursAwarded = hoursRendered;

  const leaveDaysTaken = overrides.leaveDaysTaken ?? 0;
  const leaveDeductions = leaveDaysTaken * config.hourlyRate * HOURS_PER_DAY;
  const adminTaskPay = hoursAwarded * config.hourlyRate;
  const totalEarnings = adminTaskPay + config.internetFee + config.medicalFee - leaveDeductions;

  // Contract duration from hire to cutoff end
  const hire = new Date(hireDate);
  const end = new Date(cutoff.to);
  const contractMonths =
    (end.getFullYear() - hire.getFullYear()) * 12 +
    (end.getMonth() - hire.getMonth());

  const timeBankPerMonth = 0.83;
  const timeBankTotal = Math.round(contractMonths * timeBankPerMonth * 100) / 100;
  const hoursClaimed = overrides.hoursClaimed ?? 0;
  const timeBankBalance = Math.round((timeBankTotal - hoursClaimed) * 100) / 100;

  // Invoice number: MM-DD-YYYY from cutoff end date
  const [y, m, d] = cutoff.to.split("-");
  const invoiceNo = `${m}-${d}-${y}`;

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
    hourlyRate: config.hourlyRate,
    adminTaskPay,
    recepTaskPay: 0,
    internetFee: config.internetFee,
    medicalFee: config.medicalFee,
    leaveDeductions,
    leaveDaysTaken,
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
