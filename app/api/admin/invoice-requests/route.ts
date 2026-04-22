import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvoiceEditRequests, updateInvoiceEditRequestStatus } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requests = await getInvoiceEditRequests();
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const ok = await updateInvoiceEditRequestStatus(body.requestId, body.status);
  if (!ok) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
