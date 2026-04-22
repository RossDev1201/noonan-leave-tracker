import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTimeEntriesForEmployee, getPayslipForCutoff, fetchEmployeesFromSheet } from "@/lib/googleSheets";
import { getCurrentCutoff } from "@/lib/cutoff";
import { buildPayslipData } from "@/lib/payslip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { role?: string; employeeId?: string };
  const { searchParams } = new URL(req.url);

  // Admin can query any employee; member can only see their own
  let employeeId: string | null = searchParams.get("employeeId");
  if (user.role !== "admin") {
    if (!user.employeeId) return NextResponse.json({ error: "No employee ID" }, { status: 400 });
    employeeId = user.employeeId;
  }
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const cutoff = getCurrentCutoff();
  const [employees, entries, saved] = await Promise.all([
    fetchEmployeesFromSheet(),
    getTimeEntriesForEmployee(employeeId),
    getPayslipForCutoff(employeeId, cutoff),
  ]);

  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  // If saved, return the saved version
  if (saved) {
    return NextResponse.json({
      payslip: buildPayslipData(emp.id, emp.fullName, emp.position, emp.hireDate, entries, cutoff, {
        leaveDaysTaken: saved.leaveDaysTaken,
        hoursClaimed: 0,
        payslipId: saved.payslipId,
        savedAt: saved.savedAt,
        isFinalized: true,
        notes: saved.notes,
      }),
      isFinalized: true,
      savedAt: saved.savedAt,
    });
  }

  // Otherwise build from live data
  const payslip = buildPayslipData(emp.id, emp.fullName, emp.position, emp.hireDate, entries, cutoff);
  return NextResponse.json({ payslip, isFinalized: false });
}
