import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { upsertTimeEntry, getTimeEntriesForEmployee } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  const entries = await getTimeEntriesForEmployee(employeeId);
  return NextResponse.json({ entries });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    employeeId: string;
    date: string;
    loginTime: string;
    logoutTime: string;
  };

  if (!body.employeeId || !body.date || !body.loginTime) {
    return NextResponse.json({ error: "employeeId, date, loginTime required" }, { status: 400 });
  }

  await upsertTimeEntry(body.employeeId, body.date, body.loginTime, body.logoutTime ?? "");
  return NextResponse.json({ ok: true });
}
