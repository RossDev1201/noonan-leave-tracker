import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTimeEditRequests, updateTimeEditRequestStatus, upsertTimeEntry } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string; employeeId?: string };

  const requests = user.role === "admin"
    ? await getTimeEditRequests()
    : await getTimeEditRequests(user.employeeId);

  return NextResponse.json({ requests });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { requestId: string; status: "Approved" | "Rejected" };
  if (!body.requestId || !["Approved", "Rejected"].includes(body.status)) {
    return NextResponse.json({ error: "requestId and status required" }, { status: 400 });
  }

  const result = await updateTimeEditRequestStatus(body.requestId, body.status);
  if (!result.ok) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // On approval, apply the corrected times to TimeTracking
  if (body.status === "Approved" && result.request) {
    const { employeeId, targetDate, requestedLoginTime, requestedLogoutTime } = result.request;
    await upsertTimeEntry(employeeId, targetDate, requestedLoginTime, requestedLogoutTime);
  }

  return NextResponse.json({ ok: true });
}
