import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTodayStatus, recordLogin, getScheduleForEmployee } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee ID on session" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const existing = await getTodayStatus(employeeId, today);
  if (existing.status !== "not_clocked_in") {
    return NextResponse.json({ error: "Already clocked in today" }, { status: 409 });
  }

  // Prefer client-supplied local time so timezone is correct
  let loginTime: string;
  try {
    const body = await req.json() as { clientTime?: string };
    if (body.clientTime && /^\d{2}:\d{2}$/.test(body.clientTime)) {
      loginTime = body.clientTime;
    } else {
      const now = new Date();
      loginTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
  } catch {
    const now = new Date();
    loginTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  const schedule = await getScheduleForEmployee(employeeId);
  let attendanceStatus: "on_time" | "late" | "no_schedule" = "no_schedule";
  if (schedule) {
    // No grace — any minute past the scheduled start is late
    attendanceStatus = toMinutes(loginTime) > toMinutes(schedule.startTime) ? "late" : "on_time";
  }

  await recordLogin(employeeId, today, loginTime);
  return NextResponse.json({ success: true, date: today, loginTime, attendanceStatus, schedule });
}
