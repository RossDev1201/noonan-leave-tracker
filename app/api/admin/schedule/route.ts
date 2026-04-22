import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllSchedules, upsertSchedule } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schedules = await getAllSchedules();
  return NextResponse.json({ schedules });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    employeeId?: string;
    startTime?: string;
    endTime?: string;
    graceMinutes?: number;
  };

  if (!body.employeeId || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: "employeeId, startTime, and endTime are required" }, { status: 400 });
  }

  await upsertSchedule({
    employeeId: body.employeeId,
    startTime: body.startTime,
    endTime: body.endTime,
    graceMinutes: body.graceMinutes ?? 5,
  });

  return NextResponse.json({ success: true });
}
