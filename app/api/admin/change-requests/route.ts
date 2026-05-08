import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getManualChangeRequests,
  updateManualChangeRequestStatus,
  upsertTimeEntry,
} from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; name?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await getManualChangeRequests();
  return NextResponse.json({ requests });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; name?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    requestId: string;
    status: "Approved" | "Rejected";
  };

  if (!body.requestId || !["Approved", "Rejected"].includes(body.status)) {
    return NextResponse.json({ error: "requestId and valid status required" }, { status: 400 });
  }

  const allRequests = await getManualChangeRequests();
  const target = allRequests.find((r) => r.requestId === body.requestId);
  if (!target) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const reviewedBy = user.name ?? "admin";
  const ok = await updateManualChangeRequestStatus(body.requestId, body.status, reviewedBy);
  if (!ok) return NextResponse.json({ error: "Failed to update request" }, { status: 500 });

  // On approval, apply the time entry change immediately
  if (body.status === "Approved") {
    await upsertTimeEntry(
      target.employeeId,
      target.date,
      target.requestedLoginTime,
      target.requestedLogoutTime
    );
  }

  return NextResponse.json({ success: true });
}
