import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendTimeEditRequest, getTimeEditRequests } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  if (!user || user.role !== "member" || !user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    targetDate: string;
    requestedLoginTime: string;
    requestedLogoutTime: string;
    reason: string;
  };

  if (!body.targetDate || !body.requestedLoginTime || !body.requestedLogoutTime) {
    return NextResponse.json({ error: "targetDate, requestedLoginTime, and requestedLogoutTime are required" }, { status: 400 });
  }

  // Block if there's already a pending request for this date
  const existing = await getTimeEditRequests(user.employeeId);
  const hasPending = existing.some(
    (r) => r.targetDate === body.targetDate && r.status === "Pending"
  );
  if (hasPending) {
    return NextResponse.json({ error: "A pending edit request already exists for this date" }, { status: 409 });
  }

  await appendTimeEditRequest({
    employeeId: user.employeeId,
    targetDate: body.targetDate,
    requestedLoginTime: body.requestedLoginTime,
    requestedLogoutTime: body.requestedLogoutTime,
    reason: body.reason ?? "",
    status: "Pending",
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
