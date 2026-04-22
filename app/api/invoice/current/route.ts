import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesForEmployee,
  getPayslipForCutoff,
  fetchEmployeesFromSheet,
  getContractConfigForEmployee,
  getEditRequestForPeriod,
} from "@/lib/googleSheets";
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

  let employeeId: string | null = searchParams.get("employeeId");
  if (user.role !== "admin") {
    if (!user.employeeId) return NextResponse.json({ error: "No employee ID" }, { status: 400 });
    employeeId = user.employeeId;
  }
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const cutoff = getCurrentCutoff();
  const [employees, entries, saved, contractConfig, editRequest] = await Promise.all([
    fetchEmployeesFromSheet(),
    getTimeEntriesForEmployee(employeeId),
    getPayslipForCutoff(employeeId, cutoff),
    getContractConfigForEmployee(employeeId),
    getEditRequestForPeriod(employeeId, cutoff.from, cutoff.to),
  ]);

  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const config = contractConfig ?? undefined;

  // Apply approved edit request values if present
  const approvedEdit = editRequest?.status === "Approved" ? editRequest : null;

  if (saved) {
    return NextResponse.json({
      payslip: buildPayslipData(emp.id, emp.fullName, emp.position, emp.hireDate, entries, cutoff, {
        leaveDaysTaken: saved.leaveDaysTaken,
        hoursClaimed: approvedEdit?.hoursClaimed ?? 0,
        recepTaskPay: approvedEdit?.recepTaskPay ?? 0,
        notes: approvedEdit?.notes ?? saved.notes,
        payslipId: saved.payslipId,
        savedAt: saved.savedAt,
        isFinalized: true,
        contractConfig: config,
      }),
      isFinalized: true,
      savedAt: saved.savedAt,
      editRequest: editRequest ?? null,
    });
  }

  const payslip = buildPayslipData(emp.id, emp.fullName, emp.position, emp.hireDate, entries, cutoff, {
    hoursClaimed: approvedEdit?.hoursClaimed ?? 0,
    recepTaskPay: approvedEdit?.recepTaskPay ?? 0,
    notes: approvedEdit?.notes,
    contractConfig: config,
  });
  return NextResponse.json({ payslip, isFinalized: false, editRequest: editRequest ?? null });
}
