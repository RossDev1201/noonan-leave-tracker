import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTodayStatus, recordLogin, getScheduleForEmployee } from "@/lib/googleSheets";
import { getPHDate, getPHTime } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee ID on session" }, { status: 400 });

  const today = getPHDate();
  const existing = await getTodayStatus(employeeId, today);
  if (existing.status !== "not_clocked_in") {
    return NextResponse.json({ error: "Already clocked in today" }, { status: 409 });
  }

  const loginTime = getPHTime();

  const schedule = await getScheduleForEmployee(employeeId);
  let attendanceStatus: "on_time" | "late" | "no_schedule" = "no_schedule";
  if (schedule) {
    // No grace — any minute past the scheduled start is late
    attendanceStatus = toMinutes(loginTime) > toMinutes(schedule.startTime) ? "late" : "on_time";
  }

  await recordLogin(employeeId, today, loginTime);
  return NextResponse.json({ success: true, date: today, loginTime, attendanceStatus, schedule });
}
