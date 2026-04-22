import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendInvoiceEditRequest } from "@/lib/googleSheets";
import { getCurrentCutoff } from "@/lib/cutoff";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  if (!user || user.role !== "member" || !user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    recepTaskPay: number;
    hoursClaimed: number;
    notes: string;
  };

  const cutoff = getCurrentCutoff();

  await appendInvoiceEditRequest({
    employeeId: user.employeeId,
    periodFrom: cutoff.from,
    periodTo: cutoff.to,
    recepTaskPay: Number(body.recepTaskPay) || 0,
    hoursClaimed: Number(body.hoursClaimed) || 0,
    notes: body.notes ?? "",
    status: "Pending",
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
