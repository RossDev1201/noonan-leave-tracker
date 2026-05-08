import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTimeEntriesForEmployee, getTimeEditRequests } from "@/lib/googleSheets";
import { getCurrentCutoff } from "@/lib/cutoff";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string };
  if (!user.employeeId) return NextResponse.json({ error: "No employee ID" }, { status: 400 });

  const cutoff = getCurrentCutoff();
  const [allEntries, editRequests] = await Promise.all([
    getTimeEntriesForEmployee(user.employeeId),
    getTimeEditRequests(user.employeeId),
  ]);

  const periodEntries = allEntries
    .filter((e) => e.date >= cutoff.from && e.date <= cutoff.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Attach latest edit request status per date
  const entriesWithStatus = periodEntries.map((e) => {
    const req = editRequests
      .filter((r) => r.targetDate === e.date)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    return { ...e, editRequest: req ?? null };
  });

  return NextResponse.json({ entries: entriesWithStatus, cutoff });
}
