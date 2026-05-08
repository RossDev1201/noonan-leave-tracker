import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesForEmployee,
  fetchEmployeesFromSheet,
  savePayslip,
  getPayslipForCutoff,
  getContractConfigForEmployee,
  getScheduleForEmployee,
} from "@/lib/googleSheets";
import { getCurrentCutoff, getCutoffForDate } from "@/lib/cutoff";
import { buildPayslipData } from "@/lib/payslip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    employeeId?: string;
    leaveDaysTaken?: number;
    notes?: string;
    periodFrom?: string;  // optional: finalize a specific past period
    periodTo?: string;
  };

  const employeeId = body.employeeId;
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  // Use provided period dates or fall back to current cutoff
  let cutoff;
  if (body.periodFrom && body.periodTo) {
    cutoff = getCutoffForDate(body.periodFrom);
    // Verify the dates match a real cutoff boundary
    if (cutoff.from !== body.periodFrom || cutoff.to !== body.periodTo) {
      cutoff = { ...cutoff, from: body.periodFrom, to: body.periodTo };
    }
  } else {
    cutoff = getCurrentCutoff();
  }

  const already = await getPayslipForCutoff(employeeId, cutoff);
  if (already) {
    return NextResponse.json({ error: "Payslip already finalized for this period" }, { status: 409 });
  }

  const [employees, entries, contractConfig, schedule] = await Promise.all([
    fetchEmployeesFromSheet(),
    getTimeEntriesForEmployee(employeeId),
    getContractConfigForEmployee(employeeId),
    getScheduleForEmployee(employeeId),
  ]);

  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const payslip = buildPayslipData(
    emp.id, emp.fullName, emp.position, emp.hireDate,
    entries, cutoff,
    {
      leaveDaysTaken: body.leaveDaysTaken ?? 0,
      notes: body.notes,
      savedAt: new Date().toISOString(),
      isFinalized: true,
      contractConfig: contractConfig ?? undefined,
      schedule,
    }
  );

  await savePayslip(payslip);
  return NextResponse.json({ success: true, payslip });
}
