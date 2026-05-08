import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTodayStatus, getScheduleForEmployee } from "@/lib/googleSheets";
import { isCutoffDay, getCurrentCutoff } from "@/lib/cutoff";
import { getPHDate } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "No employee ID on session" }, { status: 400 });

  const today = getPHDate();
  const clockStatus = await getTodayStatus(employeeId, today);
  const schedule = await getScheduleForEmployee(employeeId);

  let attendanceStatus: "on_time" | "late" | "no_schedule" | null = null;
  let departureStatus: "on_time" | "early" | "no_schedule" | null = null;

  if (schedule && clockStatus.loginTime) {
    attendanceStatus = toMinutes(clockStatus.loginTime) > toMinutes(schedule.startTime) ? "late" : "on_time";
  } else if (!schedule && clockStatus.loginTime) {
    attendanceStatus = "no_schedule";
  }

  if (schedule && clockStatus.logoutTime) {
    departureStatus = toMinutes(clockStatus.logoutTime) < toMinutes(schedule.endTime) ? "early" : "on_time";
  } else if (!schedule && clockStatus.logoutTime) {
    departureStatus = "no_schedule";
  }

  const cutoff = getCurrentCutoff();
  const daysUntilCutoffDeadline = Math.ceil(
    (new Date(cutoff.dueDate).getTime() - new Date(today).getTime()) / 86400000
  );

  return NextResponse.json({
    ...clockStatus,
    date: today,
    schedule,
    attendanceStatus,
    departureStatus,
    isCutoffDay: isCutoffDay(),
    cutoffDueDate: cutoff.dueDate,
    daysUntilCutoffDeadline,
  });
}
