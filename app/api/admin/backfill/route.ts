import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  fetchEmployeesFromSheet,
  getAllSchedules,
  getAllTimeEntries,
  bulkAppendTimeEntries,
} from "@/lib/googleSheets";
import { getWorkingDaysBetween } from "@/lib/holidays";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { from: string; to: string };
  if (!body.from || !body.to) {
    return NextResponse.json({ error: "from and to dates required" }, { status: 400 });
  }

  const workingDays = getWorkingDaysBetween(body.from, body.to);
  if (workingDays.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, workingDays: [] });
  }

  const [employees, schedules, existingMap] = await Promise.all([
    fetchEmployeesFromSheet(),
    getAllSchedules(),
    getAllTimeEntries(),
  ]);

  const toInsert: Array<[string, string, string, string, number]> = [];
  let skipped = 0;

  for (const emp of employees) {
    const schedule = schedules.find((s) => s.employeeId === emp.id);
    const loginTime = schedule?.startTime ?? "09:00";
    const logoutTime = schedule?.endTime ?? "17:00";
    const existingDates = new Set((existingMap[emp.id] ?? []).map((e) => e.date));

    for (const day of workingDays) {
      if (existingDates.has(day)) {
        skipped++;
      } else {
        toInsert.push([emp.id, day, loginTime, logoutTime, 7.5]);
      }
    }
  }

  await bulkAppendTimeEntries(toInsert);

  return NextResponse.json({
    inserted: toInsert.length,
    skipped,
    workingDays,
  });
}
