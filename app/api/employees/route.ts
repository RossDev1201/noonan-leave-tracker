import { NextResponse } from "next/server";
import { computeEmployeeLeave } from "@/lib/leave";
import { fetchEmployeesFromSheet } from "@/lib/googleSheets";

// force dynamic so it always calls Google Sheets
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const employees = await fetchEmployeesFromSheet();
    const enriched = computeEmployeeLeave(employees);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Error in GET /api/employees:", err);
    const message =
      err instanceof Error ? err.message : "Failed to load employees";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
