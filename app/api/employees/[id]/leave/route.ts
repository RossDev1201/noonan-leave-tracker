import { NextResponse } from "next/server";
import { computeEmployeeLeave, type LeaveEntry } from "@/lib/leave";
import { appendLeaveToSheet, fetchEmployeesFromSheet } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = params;
    const body = await request.json();

    const { date, days, type, note } = body as {
      date?: string;
      days?: number;
      type?: string;
      note?: string;
    };

    if (!date || days === undefined || !type) {
      return NextResponse.json(
        { error: "date, days, and type are required" },
        { status: 400 }
      );
    }

    const daysNum = Number(days);
    if (!Number.isFinite(daysNum) || daysNum <= 0) {
      return NextResponse.json(
        { error: "days must be a positive number" },
        { status: 400 }
      );
    }

    const entry: LeaveEntry = {
      date,
      days: daysNum,
      type,
      note
    };

    // Add row to Google Sheets Leaves tab
    await appendLeaveToSheet(id, entry);

    // Reload all employees + leaves and recalc balances
    const employees = await fetchEmployeesFromSheet();
    const enriched = computeEmployeeLeave(employees);

    return NextResponse.json({ employees: enriched });
  } catch (err) {
    console.error("Error in POST /api/employees/[id]/leave", err);
    const message =
      err instanceof Error ? err.message : "Failed to add leave entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
