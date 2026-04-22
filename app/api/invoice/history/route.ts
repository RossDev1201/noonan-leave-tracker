import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPayslipsForEmployee, getAllPayslips } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { role?: string; employeeId?: string };
  const { searchParams } = new URL(req.url);
  const queryId = searchParams.get("employeeId");

  if (user.role === "admin") {
    const payslips = queryId
      ? await getPayslipsForEmployee(queryId)
      : await getAllPayslips();
    return NextResponse.json(payslips);
  }

  // Member: own history only
  if (!user.employeeId) {
    return NextResponse.json({ error: "No employee ID" }, { status: 400 });
  }
  const payslips = await getPayslipsForEmployee(user.employeeId);
  return NextResponse.json(payslips);
}
