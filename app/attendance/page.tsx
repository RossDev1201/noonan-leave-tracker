"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditRequest = {
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedAt: string;
  reason: string;
  adminAction: "awaiting_review" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
};

type AttendanceDay = {
  date: string;
  day: string;
  status: "present" | "absent" | "rest_day" | "upcoming";
  loginTime: string | null;
  logoutTime: string | null;
  discrepancy: boolean;
  discrepancyReason: string | null;
  manualEditRequest: EditRequest | null;
};

type AttendanceLog = {
  member: {
    id: string;
    name: string;
    schedule: { loginTime: string; logoutTime: string } | null;
  };
  cutoff: string;
  period: 1 | 2;
  month: string;
  monthNum: number;
  year: number;
  from: string;
  to: string;
  cutoffLockDate: string;
  isLocked: boolean;
  days: AttendanceDay[];
  discrepancySummary: {
    totalDaysInCutoff: number;
    daysPresent: number;
    daysAbsent: number;
    restDays: number;
    daysWithDiscrepancy: number;
    pendingEditRequests: number;
    approvedEditRequests: number;
    rejectedEditRequests: number;
  };
  manualEditRules: {
    memberCanRequest: boolean;
    requestFrequency: string;
    requestDeadline: string;
    cutoffLockDate: string;
    afterCutoff: { editsAllowed: boolean; exception: string };
  };
};

type EditForm = { loginTime: string; logoutTime: string; reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DISCREPANCY_LABELS: Record<string, string> = {
  late_login: "Late Login",
  early_logout: "Early Logout",
  no_login_record: "No Record",
  missing_logout: "Missing Clock-Out",
};

function statusStyle(day: AttendanceDay): string {
  if (day.status === "rest_day") return "bg-slate-50 dark:bg-[#161616]";
  if (day.status === "upcoming") return "bg-slate-50/50 dark:bg-[#111] opacity-60";
  if (day.status === "absent") return "bg-rose-50/60 dark:bg-rose-950/20";
  if (day.discrepancy) return "bg-amber-50/60 dark:bg-amber-950/20";
  return "bg-white dark:bg-[#111]";
}

function StatusDot({ day }: { day: AttendanceDay }) {
  if (day.status === "rest_day" || day.status === "upcoming") {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />;
  }
  if (day.status === "absent") {
    return <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />;
  }
  if (day.discrepancy) {
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />;
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
}

function StatusLabel({ day }: { day: AttendanceDay }) {
  const map: Record<string, { text: string; cls: string }> = {
    present:   { text: "Present",  cls: "text-emerald-600 dark:text-emerald-400" },
    absent:    { text: "Absent",   cls: "text-rose-600 dark:text-rose-400" },
    rest_day:  { text: "Rest Day", cls: "text-slate-400" },
    upcoming:  { text: "Upcoming", cls: "text-slate-400" },
  };
  const s = day.discrepancy && day.status === "present"
    ? { text: day.discrepancyReason ? DISCREPANCY_LABELS[day.discrepancyReason] ?? day.discrepancyReason : "Discrepancy",
        cls: "text-amber-600 dark:text-amber-400 font-semibold" }
    : (map[day.status] ?? { text: day.status, cls: "text-slate-400" });
  return <span className={`text-xs font-medium ${s.cls}`}>{s.text}</span>;
}

// ─── Action cell ─────────────────────────────────────────────────────────────

function ActionCell({
  day,
  isLocked,
  onEdit,
}: {
  day: AttendanceDay;
  isLocked: boolean;
  onEdit: (day: AttendanceDay) => void;
}) {
  if (day.status === "rest_day" || day.status === "upcoming") return null;

  const req = day.manualEditRequest;

  if (req) {
    if (req.status === "pending") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800">
          Pending Review
        </span>
      );
    }
    if (req.status === "approved") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
          Approved ✓
        </span>
      );
    }
    // Rejected — allow resubmit if not locked
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600">
          Rejected
        </span>
        {!isLocked && (
          <button
            onClick={() => onEdit(day)}
            className="text-[11px] font-semibold text-noonan-red hover:underline"
          >
            Resubmit →
          </button>
        )}
      </div>
    );
  }

  if (isLocked) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-slate-400">
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11 7H5V5a3 3 0 116 0v2zm1 0V5A4 4 0 004 5v2H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1z"/>
        </svg>
        Locked
      </span>
    );
  }

  return (
    <button
      onClick={() => onEdit(day)}
      className="rounded-lg border border-noonan-lightgray bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-noonan-red hover:text-noonan-red dark:border-[#333] dark:bg-[#111] dark:text-slate-300 dark:hover:border-noonan-red dark:hover:text-noonan-red"
    >
      Request Edit
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string; employeeId?: string } | undefined;

  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [period,    setPeriod]    = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);

  const [log,     setLog]     = useState<AttendanceLog | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline edit form state
  const [activeDate,      setActiveDate]      = useState<string | null>(null);
  const [editForm,        setEditForm]        = useState<EditForm>({ loginTime: "09:00", logoutTime: "17:00", reason: "" });
  const [editSubmitting,  setEditSubmitting]  = useState(false);
  const [editError,       setEditError]       = useState<string | null>(null);
  const [editSuccess,     setEditSuccess]     = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/time/attendance-log?year=${viewYear}&month=${viewMonth}&period=${period}`);
    if (res.ok) setLog(await res.json() as AttendanceLog);
    setLoading(false);
  }, [viewYear, viewMonth, period]);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated") void fetchLog();
  }, [status, fetchLog, router]);

  function openEditForm(day: AttendanceDay) {
    setActiveDate(day.date);
    setEditError(null);
    setEditSuccess(null);
    const schedule = log?.member.schedule;
    setEditForm({
      loginTime: day.loginTime ?? schedule?.loginTime ?? "09:00",
      logoutTime: day.logoutTime ?? schedule?.logoutTime ?? "17:00",
      reason: "",
    });
  }

  function closeEditForm() {
    setActiveDate(null);
    setEditError(null);
    setEditSuccess(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDate) return;
    setEditSubmitting(true);
    setEditError(null);
    const res = await fetch("/api/time/change-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: activeDate,
        requestedLoginTime: editForm.loginTime,
        requestedLogoutTime: editForm.logoutTime,
        reason: editForm.reason,
      }),
    });
    const data = await res.json() as { error?: string };
    setEditSubmitting(false);
    if (!res.ok) {
      setEditError(data.error ?? "Failed to submit");
    } else {
      setEditSuccess("Request submitted — awaiting admin review.");
      setActiveDate(null);
      void fetchLog();
    }
  }

  // Month navigation helpers
  function prevMonth() {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    const nowMonth = new Date().getMonth() + 1;
    const nowYear  = new Date().getFullYear();
    if (viewYear > nowYear || (viewYear === nowYear && viewMonth >= nowMonth)) return;
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }
  const isCurrentOrFuture =
    viewYear > now.getFullYear() ||
    (viewYear === now.getFullYear() && viewMonth >= now.getMonth() + 1);

  const s = log?.discrepancySummary;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* ── Header ── */}
        <header className="mb-6 flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push(user?.role === "admin" ? "/" : "/dashboard")}
              className="mb-2 text-xs text-slate-400 hover:text-noonan-red"
            >
              ← Back
            </button>
            <h1 className="text-lg font-bold text-noonan-red">Attendance Log</h1>
            {log && (
              <p className="mt-0.5 text-xs text-slate-400">
                {log.member.name} · {log.member.id}
                {log.member.schedule && (
                  <span className="ml-2 font-mono">
                    {log.member.schedule.loginTime}–{log.member.schedule.logoutTime}
                  </span>
                )}
              </p>
            )}
          </div>
          {/* Month navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="rounded-lg border border-noonan-lightgray bg-white px-2 py-1 text-xs hover:border-noonan-red dark:border-[#333] dark:bg-[#111]"
            >
              ‹
            </button>
            <span className="min-w-[110px] text-center text-xs font-semibold tabular-nums">
              {log?.month ?? "…"} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentOrFuture}
              className="rounded-lg border border-noonan-lightgray bg-white px-2 py-1 text-xs hover:border-noonan-red disabled:opacity-30 dark:border-[#333] dark:bg-[#111]"
            >
              ›
            </button>
          </div>
        </header>

        {/* ── Period tabs ── */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-200 p-1 dark:bg-[#1a1a1a]">
          {([
            { key: 1 as const, label: "1st – 15th" },
            { key: 2 as const, label: "16th – End of Month" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                period === key
                  ? "bg-white text-navy-700 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-noonan-lightgray bg-white p-8 text-center text-sm text-slate-400 dark:border-[#333] dark:bg-[#111]">
            Loading…
          </div>
        ) : !log ? (
          <div className="rounded-2xl border border-noonan-lightgray bg-white p-8 text-center text-sm text-slate-400 dark:border-[#333] dark:bg-[#111]">
            No data found.
          </div>
        ) : (
          <>
            {/* ── Cutoff info bar ── */}
            <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs ring-1 ${
              log.isLocked
                ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-[#1a1a1a] dark:ring-[#333]"
                : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900"
            }`}>
              <span>
                Cutoff period: <span className="font-mono font-semibold">{log.from}</span> →{" "}
                <span className="font-mono font-semibold">{log.to}</span>
              </span>
              <span className={`font-semibold ${log.isLocked ? "text-rose-500" : ""}`}>
                {log.isLocked
                  ? "Locked — admin override only"
                  : `Locks: ${log.cutoffLockDate}`}
              </span>
            </div>

            {/* ── Summary stats ── */}
            <div className="mb-4 grid grid-cols-5 gap-2">
              {[
                { label: "Present",      value: s!.daysPresent,          color: "emerald" },
                { label: "Absent",       value: s!.daysAbsent,           color: "rose" },
                { label: "Rest Days",    value: s!.restDays,             color: "slate" },
                { label: "Discrepancy",  value: s!.daysWithDiscrepancy,  color: "amber" },
                { label: "Pending",      value: s!.pendingEditRequests,  color: "navy" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl border border-noonan-lightgray bg-white p-3 text-center dark:border-[#333] dark:bg-[#111]"
                >
                  <span className={`block text-xl font-bold ${
                    color === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                    color === "rose"    ? "text-rose-600 dark:text-rose-400" :
                    color === "amber"   ? "text-amber-500" :
                    color === "navy"    ? "text-noonan-red" :
                                          "text-slate-400"
                  }`}>{value}</span>
                  <span className="text-[10px] font-medium text-slate-400">{label}</span>
                </div>
              ))}
            </div>

            {/* ── Discrepancy rule legend ── */}
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Present</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Discrepancy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500 inline-block" /> Absent</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300 inline-block dark:bg-slate-600" /> Rest / Upcoming</span>
            </div>

            {editSuccess && (
              <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900">
                {editSuccess}
              </p>
            )}

            {/* ── Day list ── */}
            <div className="space-y-1.5">
              {log.days.map((day) => (
                <div key={day.date}>
                  {/* Day row */}
                  <div className={`rounded-xl border border-noonan-lightgray px-4 py-3 ${statusStyle(day)} dark:border-[#333]`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Left: date + status */}
                      <div className="flex items-center gap-2.5">
                        <StatusDot day={day} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {day.date}
                            </span>
                            <span className="text-[11px] text-slate-400">{day.day}</span>
                          </div>
                          <StatusLabel day={day} />
                        </div>
                      </div>

                      {/* Middle: times */}
                      {day.status !== "rest_day" && day.status !== "upcoming" && (
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className={day.loginTime ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"}>
                            ↑ {day.loginTime ?? "—"}
                          </span>
                          <span className={day.logoutTime ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"}>
                            ↓ {day.logoutTime ?? "—"}
                          </span>
                        </div>
                      )}

                      {/* Right: action */}
                      <ActionCell
                        day={day}
                        isLocked={log.isLocked}
                        onEdit={openEditForm}
                      />
                    </div>

                    {/* Discrepancy detail */}
                    {day.discrepancy && day.discrepancyReason && (
                      <p className="mt-1.5 ml-[18px] text-[11px] text-amber-600 dark:text-amber-400">
                        ⚠ {DISCREPANCY_LABELS[day.discrepancyReason] ?? day.discrepancyReason}
                      </p>
                    )}

                    {/* Approved request note */}
                    {day.manualEditRequest?.status === "approved" && day.manualEditRequest.approvedBy && (
                      <p className="mt-1.5 ml-[18px] text-[11px] text-emerald-600 dark:text-emerald-400">
                        Approved by {day.manualEditRequest.approvedBy}
                        {day.manualEditRequest.approvedAt
                          ? ` on ${new Date(day.manualEditRequest.approvedAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    )}

                    {/* Pending request note */}
                    {day.manualEditRequest?.status === "pending" && (
                      <p className="mt-1.5 ml-[18px] text-[11px] text-amber-600 dark:text-amber-400">
                        Requested: {day.manualEditRequest.reason}
                      </p>
                    )}
                  </div>

                  {/* ── Inline edit form ── */}
                  {activeDate === day.date && (
                    <div className="mt-1 rounded-xl border border-noonan-red/30 bg-white px-4 py-4 ring-1 ring-noonan-red/20 dark:bg-[#111]">
                      <p className="mb-3 text-xs font-semibold text-slate-500">
                        Correction request for <span className="font-mono text-slate-700 dark:text-slate-200">{day.date}</span>
                      </p>
                      <form onSubmit={handleEditSubmit} className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-400">Clock In</label>
                            <input
                              type="time"
                              required
                              value={editForm.loginTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, loginTime: e.target.value }))}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-400">Clock Out</label>
                            <input
                              type="time"
                              value={editForm.logoutTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, logoutTime: e.target.value }))}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-400">
                            Reason <span className="text-rose-400">*</span>
                          </label>
                          <textarea
                            rows={2}
                            required
                            placeholder="Explain why this correction is needed…"
                            value={editForm.reason}
                            onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                            className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>
                        {editError && (
                          <p className="text-xs text-rose-500">{editError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={editSubmitting}
                            className="flex-1 rounded-lg bg-noonan-red py-2 text-xs font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60"
                          >
                            {editSubmitting ? "Submitting…" : "Submit Request"}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditForm}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-500 hover:border-slate-400 dark:border-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Rules footer ── */}
            <div className="mt-6 rounded-xl border border-noonan-lightgray bg-white px-4 py-4 text-[11px] text-slate-400 dark:border-[#333] dark:bg-[#111]">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Edit Request Rules</p>
              <ul className="space-y-1">
                <li>· One active request per day (rejected requests allow resubmission)</li>
                <li>· Requests must be submitted before <span className="font-mono font-medium text-slate-500">{log.manualEditRules.cutoffLockDate}</span></li>
                <li>· After cutoff: records are locked — admin override only</li>
                <li>· Approved requests are applied automatically to your time record</li>
              </ul>
            </div>

          </>
        )}
      </div>
    </main>
  );
}
