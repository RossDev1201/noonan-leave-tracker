import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTodayStatus, recordLogout, getScheduleForEmployee } from "@/lib/googleSheets";

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
  if (existing.status === "not_clocked_in") {
    return NextResponse.json({ error: "Not clocked in today" }, { status: 409 });
  }
  if (existing.status === "clocked_out") {
    return NextResponse.json({ error: "Already clocked out today" }, { status: 409 });
  }

  // Prefer client-supplied local time so timezone is correct
  let logoutTime: string;
  try {
    const body = await req.json() as { clientTime?: string };
    if (body.clientTime && /^\d{2}:\d{2}$/.test(body.clientTime)) {
      logoutTime = body.clientTime;
    } else {
      const now = new Date();
      logoutTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
  } catch {
    const now = new Date();
    logoutTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  const schedule = await getScheduleForEmployee(employeeId);
  let departureStatus: "on_time" | "early" | "no_schedule" = "no_schedule";
  if (schedule) {
    // No grace — any logout before scheduled end is early
    departureStatus = toMinutes(logoutTime) < toMinutes(schedule.endTime) ? "early" : "on_time";
  }

  await recordLogout(employeeId, today, logoutTime);
  return NextResponse.json({ success: true, date: today, logoutTime, departureStatus, schedule });
}
