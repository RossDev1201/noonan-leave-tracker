import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendLeaveRequest } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  if (!user || user.role !== "member" || !user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    leaveDate: string;
    days: number;
    type: string;
    reason: string;
  };

  if (!body.leaveDate || !body.days || body.days <= 0) {
    return NextResponse.json({ error: "leaveDate and days are required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  await appendLeaveRequest({
    employeeId: user.employeeId,
    requestDate: today,
    leaveDate: body.leaveDate,
    days: Number(body.days),
    type: body.type || "Annual",
    reason: body.reason || "",
    status: "Pending",
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
