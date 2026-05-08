import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTimeEntriesForEmployee,
  getScheduleForEmployee,
  getManualChangeRequests,
  fetchEmployeesFromSheet,
} from "@/lib/googleSheets";
import { isWorkingDay } from "@/lib/holidays";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { role?: string; employeeId?: string; name?: string };
  const { searchParams } = new URL(req.url);

  // Admin can query any employee; member can only see own data
  const targetId =
    user.role === "admin" && searchParams.get("employeeId")
      ? searchParams.get("employeeId")!
      : user.employeeId;

  if (!targetId) return NextResponse.json({ error: "No employee ID" }, { status: 400 });

  const now = new Date();
  const year   = Number(searchParams.get("year")   ?? now.getFullYear());
  const month  = Number(searchParams.get("month")  ?? now.getMonth() + 1);
  const period = (Number(searchParams.get("period") ?? (now.getDate() <= 15 ? 1 : 2))) as 1 | 2;

  const mm      = String(month).padStart(2, "0");
  const yyyy    = String(year);
  const lastDay = new Date(year, month, 0).getDate();

  const from = period === 1 ? `${yyyy}-${mm}-01` : `${yyyy}-${mm}-16`;
  const to   = period === 1 ? `${yyyy}-${mm}-15` : `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
  const isLocked = new Date() > new Date(to + "T23:59:59");
  const todayStr = now.toISOString().slice(0, 10);

  // Resolve display name (admin viewing another employee needs a sheet lookup)
  let memberName = user.name ?? targetId;
  if (user.role === "admin" && targetId !== user.employeeId) {
    try {
      const employees = await fetchEmployeesFromSheet();
      const emp = employees.find((e) => e.id === targetId);
      if (emp) memberName = emp.fullName;
    } catch {
      // fallback to id
    }
  }

  const [entries, schedule, allChangeReqs] = await Promise.all([
    getTimeEntriesForEmployee(targetId),
    getScheduleForEmployee(targetId),
    getManualChangeRequests(targetId),
  ]);

  // Key: date → time entry (most relevant for this period)
  const entryMap = new Map(
    entries.filter((e) => e.date >= from && e.date <= to).map((e) => [e.date, e])
  );

  // Key: date → best change request (Pending > Approved > Rejected; most recent within each tier)
  const reqs = allChangeReqs
    .filter((r) => r.date >= from && r.date <= to)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  const changeByDate = new Map<string, (typeof reqs)[0]>();
  for (const r of reqs) {
    const existing = changeByDate.get(r.date);
    if (!existing) {
      changeByDate.set(r.date, r);
    } else {
      const tier = { Pending: 0, Approved: 1, Rejected: 2 };
      if (tier[r.status] < tier[existing.status]) changeByDate.set(r.date, r);
    }
  }

  // Summary counters
  let daysPresent = 0, daysAbsent = 0, restDays = 0, discrepancyCount = 0;
  let pendingReqs = 0, approvedReqs = 0, rejectedReqs = 0;

  // Count all requests in period (not deduplicated) for the summary
  for (const r of reqs) {
    if (r.status === "Pending") pendingReqs++;
    else if (r.status === "Approved") approvedReqs++;
    else rejectedReqs++;
  }

  // Build day-by-day records
  const days = [];
  const cursor = new Date(from + "T12:00:00Z");
  const endDate = new Date(to + "T12:00:00Z");

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayName = DAY_NAMES[cursor.getUTCDay()];
    const working  = isWorkingDay(dateStr);
    const isFuture = dateStr > todayStr;
    const entry    = entryMap.get(dateStr);
    const changeReq = changeByDate.get(dateStr);

    if (!working) {
      restDays++;
      days.push({
        date: dateStr,
        day: dayName,
        status: "rest_day",
        loginTime: null,
        logoutTime: null,
        discrepancy: false,
        discrepancyReason: null,
        manualEditRequest: null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    if (isFuture) {
      days.push({
        date: dateStr,
        day: dayName,
        status: "upcoming",
        loginTime: null,
        logoutTime: null,
        discrepancy: false,
        discrepancyReason: null,
        manualEditRequest: null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    let status: string;
    let discrepancy = false;
    let discrepancyReason: string | null = null;

    if (!entry?.loginTime) {
      status = "absent";
      daysAbsent++;
      discrepancy = true;
      discrepancyReason = "no_login_record";
    } else {
      status = "present";
      daysPresent++;

      if (schedule) {
        const loginMins  = toMinutes(entry.loginTime);
        const startMins  = toMinutes(schedule.startTime);
        const endMins    = toMinutes(schedule.endTime);
        const isLate     = loginMins > startMins;
        const isEarly    = entry.logoutTime ? toMinutes(entry.logoutTime) < endMins : false;
        const noLogout   = !entry.logoutTime;

        if (isLate) { discrepancy = true; discrepancyReason = "late_login"; }
        if (isEarly) { discrepancy = true; discrepancyReason = discrepancyReason ?? "early_logout"; }
        if (noLogout) { discrepancy = true; discrepancyReason = discrepancyReason ?? "missing_logout"; }
      } else if (!entry.logoutTime) {
        discrepancy = true;
        discrepancyReason = "missing_logout";
      }
    }

    if (discrepancy) discrepancyCount++;

    let manualEditRequest = null;
    if (changeReq) {
      manualEditRequest = {
        status: changeReq.status.toLowerCase() as "pending" | "approved" | "rejected",
        requestedBy: targetId,
        requestedAt: changeReq.requestedAt,
        reason: changeReq.reason,
        adminAction:
          changeReq.status === "Pending"
            ? ("awaiting_review" as const)
            : (changeReq.status.toLowerCase() as "approved" | "rejected"),
        approvedBy: changeReq.reviewedBy ?? null,
        approvedAt: changeReq.reviewedAt ?? null,
      };
    }

    days.push({
      date: dateStr,
      day: dayName,
      status,
      loginTime: entry?.loginTime ?? null,
      logoutTime: entry?.logoutTime ?? null,
      discrepancy,
      discrepancyReason,
      manualEditRequest,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json({
    member: {
      id: targetId,
      name: memberName,
      schedule: schedule
        ? { loginTime: schedule.startTime, logoutTime: schedule.endTime }
        : null,
    },
    cutoff: period === 1 ? "1st - 15th" : "16th - End of Month",
    period,
    month: MONTH_NAMES[month - 1],
    monthNum: month,
    year,
    from,
    to,
    cutoffLockDate: to + " 11:59 PM",
    isLocked,
    days,
    discrepancySummary: {
      totalDaysInCutoff: period === 1 ? 15 : lastDay - 15,
      daysPresent,
      daysAbsent,
      restDays,
      daysWithDiscrepancy: discrepancyCount,
      pendingEditRequests: pendingReqs,
      approvedEditRequests: approvedReqs,
      rejectedEditRequests: rejectedReqs,
    },
    manualEditRules: {
      memberCanRequest: !isLocked,
      requestFrequency: "once_per_day",
      requestDeadline: "before_cutoff_end",
      cutoffLockDate: to + " 11:59 PM",
      afterCutoff: { editsAllowed: false, exception: "admin_override_only" },
      notification: {
        notifyMemberOnApproval: true,
        notifyMemberOnRejection: true,
        notifyAdminOnNewRequest: true,
        cutoffReminderDaysBefore: 2,
      },
    },
  });
}
