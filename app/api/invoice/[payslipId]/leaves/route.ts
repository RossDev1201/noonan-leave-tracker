import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updatePayslipLeaves, getAllPayslips } from "@/lib/googleSheets";
import { getContractConfig } from "@/lib/payslip";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 7.5;

export async function PATCH(
  req: Request,
  { params }: { params: { payslipId: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json()) as { leaveDaysTaken?: number };
  const leaveDays = Math.max(0, Number(body.leaveDaysTaken ?? 0));

  // Look up the payslip to get the employee ID and rate
  const all = await getAllPayslips();
  const row = all.find((p) => p.payslipId === params.payslipId);
  if (!row) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

  const config = getContractConfig(row.employeeId);
  const leaveDeductions = leaveDays * config.hourlyRate * HOURS_PER_DAY;
  const totalEarnings = row.adminPay + row.internetFee + row.medicalFee - leaveDeductions;

  const ok = await updatePayslipLeaves(params.payslipId, leaveDays, leaveDeductions, totalEarnings);
  if (!ok) return NextResponse.json({ error: "Payslip not found in sheet" }, { status: 404 });

  return NextResponse.json({ success: true, leaveDaysTaken: leaveDays, leaveDeductions, totalEarnings });
}
