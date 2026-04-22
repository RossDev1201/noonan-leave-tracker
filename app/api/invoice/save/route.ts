import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesForEmployee,
  fetchEmployeesFromSheet,
  savePayslip,
  getPayslipForCutoff,
} from "@/lib/googleSheets";
import { getCurrentCutoff, isCutoffDay } from "@/lib/cutoff";
import { buildPayslipData } from "@/lib/payslip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (!isCutoffDay()) {
    return NextResponse.json(
      { error: "Payslips can only be finalized on cutoff days (15th or last day of month)." },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    employeeId?: string;
    leaveDaysTaken?: number;
    notes?: string;
  };

  const employeeId = body.employeeId;
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const cutoff = getCurrentCutoff();

  const already = await getPayslipForCutoff(employeeId, cutoff);
  if (already) {
    return NextResponse.json({ error: "Payslip already finalized for this period" }, { status: 409 });
  }

  const [employees, entries] = await Promise.all([
    fetchEmployeesFromSheet(),
    getTimeEntriesForEmployee(employeeId),
  ]);

  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const payslip = buildPayslipData(emp.id, emp.fullName, emp.position, emp.hireDate, entries, cutoff, {
    leaveDaysTaken: body.leaveDaysTaken ?? 0,
    notes: body.notes,
    savedAt: new Date().toISOString(),
    isFinalized: true,
  });

  await savePayslip(payslip);
  return NextResponse.json({ success: true, payslip });
}
