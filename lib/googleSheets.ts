// lib/googleSheets.ts
import { google } from "googleapis";
import type { EmployeeRaw, LeaveEntry } from "./leave";

// Import your service account JSON directly (file must be in project root)
import serviceAccount from "../noonan-leave-tracker-c097e5e73e07.json";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

const sa = serviceAccount as ServiceAccount;

// ✅ Your spreadsheet ID from the URL:
// https://docs.google.com/spreadsheets/d/THIS_ID/edit
const SPREADSHEET_ID = "1OE6gwRSwdZ7C-YVyP-2ai58CiHSh9G4Y1dqRBPHuYtY";

// ✅ Sheet/tab names & ranges
const EMPLOYEES_RANGE = "Employees!A2:E"; // id, fullName, position, hireDate, startingBalance
const LEAVES_RANGE = "Leaves!A2:E";       // employeeId, date, days, type, note

const SERVICE_ACCOUNT_EMAIL = sa.client_email;
const SERVICE_ACCOUNT_PRIVATE_KEY = sa.private_key;

function getSheetsClient() {
  console.log("Using Sheets config:", {
    SPREADSHEET_ID,
    SERVICE_ACCOUNT_EMAIL,
    hasPrivateKey: !!SERVICE_ACCOUNT_PRIVATE_KEY
  });

  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    console.error("Google Sheets config missing", {
      SPREADSHEET_ID,
      SERVICE_ACCOUNT_EMAIL,
      hasPrivateKey: !!SERVICE_ACCOUNT_PRIVATE_KEY
    });
    throw new Error("Google Sheets is not configured.");
  }

  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    // Value from JSON already has proper newlines
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

export async function fetchEmployeesFromSheet(): Promise<EmployeeRaw[]> {
  const sheets = getSheetsClient();

  try {
    // Read Employees sheet (skip header row)
    const employeesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: EMPLOYEES_RANGE
    });

    const employeeRows = employeesRes.data.values || [];

    const employees: EmployeeRaw[] = employeeRows.map((row) => {
      const [id, fullName, position, hireDate, startingBalance] = row;

      return {
        id: String(id),
        fullName: String(fullName),
        position: String(position ?? ""),
        hireDate: String(hireDate), // YYYY-MM-DD
        startingBalance: startingBalance ? Number(startingBalance) : 0,
        leaveTaken: []
      };
    });

    // Read Leaves sheet
    const leavesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: LEAVES_RANGE
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
        note: note ? String(note) : undefined
      };

      const key = String(employeeId);
      if (!leavesByEmployee[key]) leavesByEmployee[key] = [];
      leavesByEmployee[key].push(entry);
    }

    for (const emp of employees) {
      emp.leaveTaken = leavesByEmployee[emp.id] ?? [];
    }

    return employees;
  } catch (err) {
    console.error("Error reading from Google Sheets:", err);
    throw err;
  }
}

export async function appendLeaveToSheet(
  employeeId: string,
  entry: LeaveEntry
): Promise<void> {
  const sheets = getSheetsClient();

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leaves!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[employeeId, entry.date, entry.days, entry.type, entry.note ?? ""]]
      }
    });
  } catch (err) {
    console.error("Error appending to Leaves sheet:", err);
    throw err;
  }
}
