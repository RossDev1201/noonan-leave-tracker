import { google } from "googleapis";
import type { EmployeeRaw, LeaveEntry } from "./leave";
import type { PayslipData } from "./payslip";
import type { CutoffPeriod } from "./cutoff";

export type TimeEntry = {
  rowIndex: number;
  employeeId: string;
  date: string;      // YYYY-MM-DD
  loginTime: string; // HH:MM
  logoutTime: string; // HH:MM or ""
  hoursWorked: number; // 7.5 for a complete day, 0 if incomplete
};

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
const SERVICE_ACCOUNT_PRIVATE_KEY = (
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? ""
).replace(/\\n/g, "\n");

const EMPLOYEES_RANGE = "Employees!A2:E";
const LEAVES_RANGE = "Leaves!A2:E";
const TIME_RANGE = "TimeTracking!A2:E";
const PAYSLIPS_RANGE = "Payslips!A2:P";

const PAID_HOURS_PER_DAY = 7.5;

function getSheetsClient() {
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Google Sheets environment variables are not configured.");
  }

  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

// ─── Employees & Leave ────────────────────────────────────────────────────────

export async function fetchEmployeesFromSheet(): Promise<EmployeeRaw[]> {
  const sheets = getSheetsClient();

  const [employeesRes, leavesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: EMPLOYEES_RANGE }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: LEAVES_RANGE }),
  ]);

  const employees: EmployeeRaw[] = (employeesRes.data.values ?? []).map((row) => {
    const [id, fullName, position, hireDate, startingBalance] = row;
    return {
      id: String(id),
      fullName: String(fullName),
      position: String(position ?? ""),
      hireDate: String(hireDate),
      startingBalance: startingBalance ? Number(startingBalance) : 0,
      leaveTaken: [],
    };
  });

  const leavesByEmployee: Record<string, LeaveEntry[]> = {};
  for (const row of leavesRes.data.values ?? []) {
    const [employeeId, date, days, type, note] = row;
    if (!employeeId || !date || !days || !type) continue;
    const key = String(employeeId);
    if (!leavesByEmployee[key]) leavesByEmployee[key] = [];
    leavesByEmployee[key].push({
      date: String(date),
      days: Number(days),
      type: String(type),
      note: note ? String(note) : undefined,
    });
  }

  for (const emp of employees) {
    emp.leaveTaken = leavesByEmployee[emp.id] ?? [];
  }

  return employees;
}

export async function appendLeaveToSheet(
  employeeId: string,
  entry: LeaveEntry
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Leaves!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[employeeId, entry.date, entry.days, entry.type, entry.note ?? ""]],
    },
  });
}

// ─── Time Tracking ────────────────────────────────────────────────────────────

export async function recordLogin(
  employeeId: string,
  date: string,
  loginTime: string
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "TimeTracking!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[employeeId, date, loginTime, "", ""]],
    },
  });
}

export async function recordLogout(
  employeeId: string,
  date: string,
  logoutTime: string
): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: TIME_RANGE,
  });

  const rows = res.data.values ?? [];
  let targetRow = -1;

  for (let i = 0; i < rows.length; i++) {
    const [empId, rowDate, , logoutVal] = rows[i];
    if (String(empId) === employeeId && String(rowDate) === date && !logoutVal) {
      targetRow = i + 2; // +1 for 1-index, +1 for header row
    }
  }

  if (targetRow === -1) return false;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `TimeTracking!D${targetRow}:E${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[logoutTime, PAID_HOURS_PER_DAY]],
    },
  });

  return true;
}

export async function getTodayStatus(
  employeeId: string,
  date: string
): Promise<{ status: "not_clocked_in" | "clocked_in" | "clocked_out"; loginTime?: string; logoutTime?: string }> {
  const sheets = getSheetsClient();

  let rows: string[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TIME_RANGE,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    // TimeTracking sheet missing or unreadable — treat as not clocked in
    return { status: "not_clocked_in" };
  }

  let best: { loginTime: string; logoutTime: string } | null = null;
  for (const row of rows) {
    const [empId, rowDate, loginTime, logoutTime] = row;
    if (String(empId) === employeeId && String(rowDate) === date) {
      best = { loginTime: String(loginTime ?? ""), logoutTime: String(logoutTime ?? "") };
    }
  }

  if (!best) return { status: "not_clocked_in" };
  if (!best.logoutTime) return { status: "clocked_in", loginTime: best.loginTime };
  return { status: "clocked_out", loginTime: best.loginTime, logoutTime: best.logoutTime };
}

export async function getTimeEntriesForEmployee(employeeId: string): Promise<TimeEntry[]> {
  const sheets = getSheetsClient();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TIME_RANGE,
    });
    return (res.data.values ?? [])
      .map((row, i) => {
        const [empId, date, loginTime, logoutTime] = row;
        return {
          rowIndex: i + 2,
          employeeId: String(empId ?? ""),
          date: String(date ?? ""),
          loginTime: String(loginTime ?? ""),
          logoutTime: String(logoutTime ?? ""),
          hoursWorked: logoutTime ? PAID_HOURS_PER_DAY : 0,
        };
      })
      .filter((e) => e.employeeId === employeeId && e.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// ─── Payslips ─────────────────────────────────────────────────────────────────

export type SavedPayslipRow = {
  payslipId: string;
  employeeId: string;
  periodFrom: string;
  periodTo: string;
  invoiceNo: string;
  hoursRendered: number;
  hoursAwarded: number;
  hourlyRate: number;
  adminPay: number;
  internetFee: number;
  medicalFee: number;
  leaveDeductions: number;
  leaveDaysTaken: number;
  totalEarnings: number;
  timeBankBalance: number;
  savedAt: string;
  notes: string;
};

export async function getPayslipsForEmployee(employeeId: string): Promise<SavedPayslipRow[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: PAYSLIPS_RANGE,
    });
    return (res.data.values ?? [])
      .map((row) => ({
        payslipId: String(row[0] ?? ""),
        employeeId: String(row[1] ?? ""),
        periodFrom: String(row[2] ?? ""),
        periodTo: String(row[3] ?? ""),
        invoiceNo: String(row[4] ?? ""),
        hoursRendered: Number(row[5] ?? 0),
        hoursAwarded: Number(row[6] ?? 0),
        hourlyRate: Number(row[7] ?? 0),
        adminPay: Number(row[8] ?? 0),
        internetFee: Number(row[9] ?? 0),
        medicalFee: Number(row[10] ?? 0),
        leaveDeductions: Number(row[11] ?? 0),
        leaveDaysTaken: Number(row[12] ?? 0),
        totalEarnings: Number(row[13] ?? 0),
        timeBankBalance: Number(row[14] ?? 0),
        savedAt: String(row[15] ?? ""),
        notes: String(row[16] ?? ""),
      }))
      .filter((r) => r.employeeId === employeeId && r.payslipId);
  } catch {
    return [];
  }
}

export async function getAllPayslips(): Promise<SavedPayslipRow[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: PAYSLIPS_RANGE,
    });
    return (res.data.values ?? [])
      .filter((row) => row[0] && row[1])
      .map((row) => ({
        payslipId: String(row[0]),
        employeeId: String(row[1]),
        periodFrom: String(row[2] ?? ""),
        periodTo: String(row[3] ?? ""),
        invoiceNo: String(row[4] ?? ""),
        hoursRendered: Number(row[5] ?? 0),
        hoursAwarded: Number(row[6] ?? 0),
        hourlyRate: Number(row[7] ?? 0),
        adminPay: Number(row[8] ?? 0),
        internetFee: Number(row[9] ?? 0),
        medicalFee: Number(row[10] ?? 0),
        leaveDeductions: Number(row[11] ?? 0),
        leaveDaysTaken: Number(row[12] ?? 0),
        totalEarnings: Number(row[13] ?? 0),
        timeBankBalance: Number(row[14] ?? 0),
        savedAt: String(row[15] ?? ""),
        notes: String(row[16] ?? ""),
      }));
  } catch {
    return [];
  }
}

export async function savePayslip(data: PayslipData): Promise<void> {
  const sheets = getSheetsClient();
  const row = [
    data.payslipId,
    data.employeeId,
    data.cutoff.from,
    data.cutoff.to,
    data.invoiceNo,
    data.hoursRendered,
    data.hoursAwarded,
    data.hourlyRate,
    data.adminTaskPay,
    data.internetFee,
    data.medicalFee,
    data.leaveDeductions,
    data.leaveDaysTaken,
    data.totalEarnings,
    data.timeBankBalance,
    data.savedAt ?? new Date().toISOString(),
    data.notes ?? "",
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Payslips!A:Q",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function updatePayslipLeaves(
  payslipId: string,
  leaveDaysTaken: number,
  leaveDeductions: number,
  totalEarnings: number
): Promise<boolean> {
  const sheets = getSheetsClient();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: PAYSLIPS_RANGE,
    });
  } catch {
    return false;
  }

  const rows = res.data.values ?? [];
  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === payslipId) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) return false;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Payslips!L${targetRow}:N${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[leaveDeductions, leaveDaysTaken, totalEarnings]] },
  });
  return true;
}

export async function getPayslipForCutoff(
  employeeId: string,
  cutoff: CutoffPeriod
): Promise<SavedPayslipRow | null> {
  const all = await getPayslipsForEmployee(employeeId);
  return all.find((p) => p.periodFrom === cutoff.from && p.periodTo === cutoff.to) ?? null;
}

// ─── Logins ───────────────────────────────────────────────────────────────────

const LOGINS_RANGE = "Logins!A2:D";

export type LoginEntry = {
  username: string;
  password: string;
  role: "admin" | "member";
  employeeId?: string;
};

export async function fetchLogins(): Promise<LoginEntry[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: LOGINS_RANGE,
    });
    return (res.data.values ?? [])
      .filter((r) => r[0] && r[1])
      .map((r) => ({
        username: String(r[0]).trim(),
        password: String(r[1]).trim(),
        role: String(r[2]).trim() === "admin" ? "admin" : "member",
        employeeId: r[3] ? String(r[3]).trim() : undefined,
      }));
  } catch {
    return [];
  }
}

// ─── Schedules ────────────────────────────────────────────────────────────────

const SCHEDULES_RANGE = "Schedules!A2:D";

export type EmployeeSchedule = {
  employeeId: string;
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  graceMinutes: number;
};

export async function getAllSchedules(): Promise<EmployeeSchedule[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SCHEDULES_RANGE,
    });
    return (res.data.values ?? [])
      .filter((r) => r[0])
      .map((r) => ({
        employeeId: String(r[0]),
        startTime: String(r[1] ?? "09:00"),
        endTime: String(r[2] ?? "17:00"),
        graceMinutes: Number(r[3] ?? 5),
      }));
  } catch {
    return [];
  }
}

export async function getScheduleForEmployee(employeeId: string): Promise<EmployeeSchedule | null> {
  const all = await getAllSchedules();
  return all.find((s) => s.employeeId === employeeId) ?? null;
}

export async function upsertSchedule(schedule: EmployeeSchedule): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SCHEDULES_RANGE,
  });

  const rows = res.data.values ?? [];
  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === schedule.employeeId) {
      targetRow = i + 2;
      break;
    }
  }

  const rowData = [
    schedule.employeeId,
    schedule.startTime,
    schedule.endTime,
    schedule.graceMinutes,
  ];

  if (targetRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Schedules!A${targetRow}:D${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Schedules!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  }
}

// ─── Contract Config ──────────────────────────────────────────────────────────

const CONTRACT_RANGE = "ContractConfig!A2:F";

export type ContractConfig = {
  employeeId: string;
  contractValue: number;
  hourlyRate: number;
  internetFee: number;
  medicalFee: number;
  department: string;
};

export async function getAllContractConfigs(): Promise<ContractConfig[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: CONTRACT_RANGE,
    });
    return (res.data.values ?? [])
      .filter((r) => r[0])
      .map((r) => ({
        employeeId: String(r[0]),
        contractValue: Number(r[1] ?? 0),
        hourlyRate: Number(r[2] ?? 0),
        internetFee: Number(r[3] ?? 0),
        medicalFee: Number(r[4] ?? 0),
        department: String(r[5] ?? "IT Department"),
      }));
  } catch {
    return [];
  }
}

export async function getContractConfigForEmployee(employeeId: string): Promise<ContractConfig | null> {
  const all = await getAllContractConfigs();
  return all.find((c) => c.employeeId === employeeId) ?? null;
}

export async function upsertContractConfig(config: ContractConfig): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: CONTRACT_RANGE,
  });
  const rows = res.data.values ?? [];
  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === config.employeeId) {
      targetRow = i + 2;
      break;
    }
  }
  const rowData = [
    config.employeeId,
    config.contractValue,
    config.hourlyRate,
    config.internetFee,
    config.medicalFee,
    config.department,
  ];
  if (targetRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `ContractConfig!A${targetRow}:F${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "ContractConfig!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  }
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

const LEAVE_REQUESTS_RANGE = "LeaveRequests!A2:I";

export type LeaveRequestEntry = {
  requestId: string;
  employeeId: string;
  requestDate: string;
  leaveDate: string;
  days: number;
  type: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
};

export async function appendLeaveRequest(
  req: Omit<LeaveRequestEntry, "requestId">
): Promise<void> {
  const sheets = getSheetsClient();
  const requestId = `lr-${req.employeeId}-${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "LeaveRequests!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        requestId, req.employeeId, req.requestDate, req.leaveDate,
        req.days, req.type, req.reason, req.status, req.requestedAt,
      ]],
    },
  });
}

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequestEntry[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: LEAVE_REQUESTS_RANGE,
    });
    const all = (res.data.values ?? [])
      .filter((r) => r[0])
      .map((r) => ({
        requestId: String(r[0]),
        employeeId: String(r[1] ?? ""),
        requestDate: String(r[2] ?? ""),
        leaveDate: String(r[3] ?? ""),
        days: Number(r[4] ?? 0),
        type: String(r[5] ?? "Annual"),
        reason: String(r[6] ?? ""),
        status: String(r[7] ?? "Pending") as "Pending" | "Approved" | "Rejected",
        requestedAt: String(r[8] ?? ""),
      }));
    return employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
  } catch {
    return [];
  }
}

// ─── Invoice Edit Requests ────────────────────────────────────────────────────

const INVOICE_EDIT_REQUESTS_RANGE = "InvoiceEditRequests!A2:J";

export type InvoiceEditRequest = {
  requestId: string;
  employeeId: string;
  periodFrom: string;
  periodTo: string;
  recepTaskPay: number;
  hoursClaimed: number;
  notes: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  reviewedAt?: string;
};

export async function appendInvoiceEditRequest(
  req: Omit<InvoiceEditRequest, "requestId">
): Promise<void> {
  const sheets = getSheetsClient();
  const requestId = `ier-${req.employeeId}-${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "InvoiceEditRequests!A:J",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        requestId, req.employeeId, req.periodFrom, req.periodTo,
        req.recepTaskPay, req.hoursClaimed, req.notes, req.status, req.requestedAt, "",
      ]],
    },
  });
}

export async function getInvoiceEditRequests(employeeId?: string): Promise<InvoiceEditRequest[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: INVOICE_EDIT_REQUESTS_RANGE,
    });
    const all = (res.data.values ?? [])
      .filter((r) => r[0])
      .map((r) => ({
        requestId: String(r[0]),
        employeeId: String(r[1] ?? ""),
        periodFrom: String(r[2] ?? ""),
        periodTo: String(r[3] ?? ""),
        recepTaskPay: Number(r[4] ?? 0),
        hoursClaimed: Number(r[5] ?? 0),
        notes: String(r[6] ?? ""),
        status: String(r[7] ?? "Pending") as "Pending" | "Approved" | "Rejected",
        requestedAt: String(r[8] ?? ""),
        reviewedAt: r[9] ? String(r[9]) : undefined,
      }));
    return employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
  } catch {
    return [];
  }
}

export async function updateInvoiceEditRequestStatus(
  requestId: string,
  status: "Approved" | "Rejected"
): Promise<boolean> {
  const sheets = getSheetsClient();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: INVOICE_EDIT_REQUESTS_RANGE,
    });
  } catch {
    return false;
  }
  const rows = res.data.values ?? [];
  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === requestId) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `InvoiceEditRequests!H${targetRow}:J${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status, new Date().toISOString(), ""]] },
  });
  return true;
}

export async function getEditRequestForPeriod(
  employeeId: string,
  periodFrom: string,
  periodTo: string
): Promise<InvoiceEditRequest | null> {
  const all = await getInvoiceEditRequests(employeeId);
  const forPeriod = all
    .filter((r) => r.periodFrom === periodFrom && r.periodTo === periodTo)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return forPeriod[0] ?? null;
}

export async function upsertTimeEntry(
  employeeId: string,
  date: string,
  loginTime: string,
  logoutTime: string
): Promise<void> {
  const sheets = getSheetsClient();
  let rows: string[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TIME_RANGE,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    rows = [];
  }

  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === employeeId && String(rows[i][1]) === date) {
      targetRow = i + 2;
      break;
    }
  }

  const rowData = [employeeId, date, loginTime, logoutTime, logoutTime ? PAID_HOURS_PER_DAY : 0];

  if (targetRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `TimeTracking!A${targetRow}:E${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "TimeTracking!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  }
}

// ─── Manual Change Requests ───────────────────────────────────────────────────

const CHANGE_REQUESTS_RANGE = "ManualChangeRequests!A2:J";

export type ManualChangeRequest = {
  requestId: string;
  employeeId: string;
  date: string;
  requestedLoginTime: string;
  requestedLogoutTime: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export async function appendManualChangeRequest(
  req: Omit<ManualChangeRequest, "requestId">
): Promise<string> {
  const sheets = getSheetsClient();
  const requestId = `mcr-${req.employeeId}-${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "ManualChangeRequests!A:J",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        requestId, req.employeeId, req.date,
        req.requestedLoginTime, req.requestedLogoutTime,
        req.reason, req.status, req.requestedAt, "", "",
      ]],
    },
  });
  return requestId;
}

export async function getManualChangeRequests(employeeId?: string): Promise<ManualChangeRequest[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: CHANGE_REQUESTS_RANGE,
    });
    const all = (res.data.values ?? [])
      .filter((r) => r[0])
      .map((r) => ({
        requestId: String(r[0]),
        employeeId: String(r[1] ?? ""),
        date: String(r[2] ?? ""),
        requestedLoginTime: String(r[3] ?? ""),
        requestedLogoutTime: String(r[4] ?? ""),
        reason: String(r[5] ?? ""),
        status: String(r[6] ?? "Pending") as "Pending" | "Approved" | "Rejected",
        requestedAt: String(r[7] ?? ""),
        reviewedAt: r[8] ? String(r[8]) : undefined,
        reviewedBy: r[9] ? String(r[9]) : undefined,
      }));
    return employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
  } catch {
    return [];
  }
}

export async function updateManualChangeRequestStatus(
  requestId: string,
  status: "Approved" | "Rejected",
  reviewedBy: string
): Promise<boolean> {
  const sheets = getSheetsClient();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: CHANGE_REQUESTS_RANGE,
    });
  } catch {
    return false;
  }
  const rows = res.data.values ?? [];
  let targetRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === requestId) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `ManualChangeRequests!G${targetRow}:J${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status, new Date().toISOString(), reviewedBy, ""]] },
  });
  return true;
}

export async function bulkAppendTimeEntries(
  rows: Array<[string, string, string, string, number]>
): Promise<void> {
  if (rows.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "TimeTracking!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

export async function getAllTimeEntries(): Promise<Record<string, TimeEntry[]>> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: TIME_RANGE,
  });

  const result: Record<string, TimeEntry[]> = {};

  (res.data.values ?? []).forEach((row, i) => {
    const [empId, date, loginTime, logoutTime] = row;
    if (!empId || !date) return;

    const key = String(empId);
    if (!result[key]) result[key] = [];

    result[key].push({
      rowIndex: i + 2,
      employeeId: key,
      date: String(date),
      loginTime: String(loginTime ?? ""),
      logoutTime: String(logoutTime ?? ""),
      hoursWorked: logoutTime ? PAID_HOURS_PER_DAY : 0,
    });
  });

  return result;
}
