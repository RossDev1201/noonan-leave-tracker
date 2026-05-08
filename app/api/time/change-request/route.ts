import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendManualChangeRequest, getManualChangeRequests } from "@/lib/googleSheets";
import { getCutoffForDate } from "@/lib/cutoff";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee ID on session" }, { status: 400 });

  const requests = await getManualChangeRequests(employeeId);
  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee ID on session" }, { status: 400 });

  const body = await req.json() as {
    date?: string;
    requestedLoginTime?: string;
    requestedLogoutTime?: string;
    reason?: string;
  };

  if (!body.date || !body.requestedLoginTime) {
    return NextResponse.json({ error: "date and requestedLoginTime are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(body.requestedLoginTime)) {
    return NextResponse.json({ error: "Invalid loginTime format" }, { status: 400 });
  }
  if (body.requestedLogoutTime && !/^\d{2}:\d{2}$/.test(body.requestedLogoutTime)) {
    return NextResponse.json({ error: "Invalid logoutTime format" }, { status: 400 });
  }

  // Cannot request future dates
  const todayStr = new Date().toISOString().slice(0, 10);
  if (body.date > todayStr) {
    return NextResponse.json({ error: "Cannot request a correction for a future date" }, { status: 400 });
  }

  // Enforce cutoff deadline lock: records are locked at 11:59 PM on the period's last day
  const cutoff = getCutoffForDate(body.date);
  const lockTime = new Date(cutoff.to + "T23:59:59");
  if (new Date() > lockTime) {
    return NextResponse.json({
      error: `This cutoff period (${cutoff.label}) is locked as of ${cutoff.to} 11:59 PM. Only admin can make changes.`,
    }, { status: 403 });
  }

  // Once-per-day rule: block if a Pending or Approved request already exists for this date
  const existing = await getManualChangeRequests(employeeId);
  const activeForDate = existing.find(
    (r) => r.date === body.date && (r.status === "Pending" || r.status === "Approved")
  );
  if (activeForDate) {
    const msg =
      activeForDate.status === "Approved"
        ? "An approved correction already exists for this date."
        : "A pending request already exists for this date. Wait for admin review before submitting another.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const requestId = await appendManualChangeRequest({
    employeeId,
    date: body.date,
    requestedLoginTime: body.requestedLoginTime,
    requestedLogoutTime: body.requestedLogoutTime ?? "",
    reason: body.reason ?? "",
    status: "Pending",
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, requestId });
}
