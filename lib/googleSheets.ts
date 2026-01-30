// lib/googleSheets.ts
import { google } from "googleapis";
import type { EmployeeRaw, LeaveEntry } from "./leave";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

function getSheetsClient() {
  console.log("Using Sheets config (server-side):", {
    SPREADSHEET_ID,
    SERVICE_ACCOUNT_EMAIL,
    hasPrivateKey: !!SERVICE_ACCOUNT_PRIVATE_KEY,
  });

  if (!SPREADSHEET_ID) {
    throw new Error("Google Sheets Spreadsheet ID is not set");
  }
  if (!SERVICE_ACCOUNT_EMAIL) {
    throw new Error("Google Sheets Service Account Email is not set");
  }
  if (!SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Google Sheets Service Account Private Key is not set");
  }

  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    // On Vercel and local, we paste the key as multi-line text
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

export async function fetchEmployeesFromSheet(): Promise<EmployeeRaw[]> {
  const sheets = getSheetsClient();

  // Read Employees sheet (skip header row)
  const employeesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID!,
    range: "Employees!A2:E",
  });

  const employeeRows = employeesRes.data.values || [];

  const employees: EmployeeRaw[] = employeeRows
    .filter((row) => row && row[0] && row[1]) // skip blank / incomplete rows
    .map((row) => {
      const [id, fullName, position, hireDate, startingBalance] = row;

      return {
        id: String(id),
        fullName: String(fullName),
        position: String(position ?? ""),
        hireDate: String(hireDate), // YYYY-MM-DD
        startingBalance: startingBalance ? Number(startingBalance) : 0,
        leaveTaken: [],
      };
    });

  // Read Leaves sheet
  const leavesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID!,
    range: "Leaves!A2:E",
  });

  const leaveRows = leavesRes.data.values || [];
  const leavesByEmployee: Record<string, LeaveEntry[]> = {};

  for (const row of leaveRows) {
    const [employeeId, date, days, type, note] = row;
    if (!employeeId || !date || !days || !type) continue;

    const entry: LeaveEntry = {
      date: String(date),
      days: Number(days),
      type: String(type),
      note: note ? String(note) : undefined,
    };

    const key = String(employeeId);
    if (!leavesByEmployee[key]) leavesByEmployee[key] = [];
    leavesByEmployee[key].push(entry);
  }

  for (const emp of employees) {
    emp.leaveTaken = leavesByEmployee[emp.id] ?? [];
  }

  return employees;
}

export async function appendLeaveToSheet(
  employeeId: string,
  entry: LeaveEntry,
): Promise<void> {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID!,
    range: "Leaves!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[employeeId, entry.date, entry.days, entry.type, entry.note ?? ""]],
    },
  });
}
