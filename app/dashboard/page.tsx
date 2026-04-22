"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/app/components/ThemeToggle";

type EmployeeSchedule = {
  startTime: string;
  endTime: string;
};

type ClockStatus = {
  status: "not_clocked_in" | "clocked_in" | "clocked_out";
  loginTime?: string;
  logoutTime?: string;
  date?: string;
  schedule?: EmployeeSchedule | null;
  attendanceStatus?: "on_time" | "late" | "no_schedule" | null;
  departureStatus?: "on_time" | "early" | "no_schedule" | null;
  isCutoffDay?: boolean;
};

type PeriodSummary = {
  daysWorked: number;
  hoursWorked: number;
  periodFrom: string;
  periodTo: string;
};

type LeaveForm = {
  leaveDate: string;
  days: string;
  type: string;
  reason: string;
};

function StatusBadge({ label, variant }: { label: string; variant: "late" | "early" | "on_time" }) {
  const styles = {
    late: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800",
    early: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
    on_time: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${styles[variant]}`}>
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTag, setActionTag] = useState<"late" | "early" | "on_time" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({
    leaveDate: today,
    days: "1",
    type: "Annual",
    reason: "",
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const user = session?.user as { role?: string; employeeId?: string; name?: string } | undefined;
  const name = user?.name ?? "there";

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && user?.role === "admin") router.push("/");
  }, [status, user, router]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "member") {
      void fetchStatus();
      void fetchSummary();
    }
  }, [status, user]);

  async function fetchStatus() {
    const res = await fetch("/api/time/status");
    if (res.ok) setClockStatus(await res.json() as ClockStatus);
  }

  async function fetchSummary() {
    const res = await fetch("/api/invoice/current");
    if (res.ok) {
      const data = await res.json() as { payslip?: { hoursRendered: number; cutoff: { from: string; to: string } } };
      if (data.payslip) {
        setSummary({
          daysWorked: Math.round((data.payslip.hoursRendered / 7.5) * 10) / 10,
          hoursWorked: data.payslip.hoursRendered,
          periodFrom: data.payslip.cutoff.from,
          periodTo: data.payslip.cutoff.to,
        });
      }
    }
  }

  async function handleClockIn() {
    setActionLoading(true);
    setActionError(null);
    setActionTag(null);
    const res = await fetch("/api/time/login", { method: "POST" });
    const data = await res.json() as { error?: string; loginTime?: string; attendanceStatus?: string };
    setActionLoading(false);
    if (res.ok) {
      if (data.attendanceStatus === "late") setActionTag("late");
      else if (data.attendanceStatus === "on_time") setActionTag("on_time");
      void fetchStatus();
      void fetchSummary();
    } else {
      setActionError(data.error ?? "Failed to clock in");
    }
  }

  async function handleClockOut() {
    setActionLoading(true);
    setActionError(null);
    setActionTag(null);
    const res = await fetch("/api/time/logout", { method: "POST" });
    const data = await res.json() as { error?: string; logoutTime?: string; departureStatus?: string };
    setActionLoading(false);
    if (res.ok) {
      if (data.departureStatus === "early") setActionTag("early");
      else if (data.departureStatus === "on_time") setActionTag("on_time");
      void fetchStatus();
      void fetchSummary();
    } else {
      setActionError(data.error ?? "Failed to clock out");
    }
  }

  async function handleLeaveRequest(e: React.FormEvent) {
    e.preventDefault();
    setLeaveSubmitting(true);
    setLeaveMessage(null);
    const res = await fetch("/api/leaves/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveDate: leaveForm.leaveDate,
        days: Number(leaveForm.days),
        type: leaveForm.type,
        reason: leaveForm.reason,
      }),
    });
    const data = await res.json() as { error?: string };
    setLeaveSubmitting(false);
    if (res.ok) {
      setLeaveMessage({ type: "success", text: "Leave request submitted! Awaiting admin review." });
      setLeaveForm({ leaveDate: today, days: "1", type: "Annual", reason: "" });
    } else {
      setLeaveMessage({ type: "error", text: data.error ?? "Failed to submit request" });
    }
  }

  if (status === "loading" || !clockStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-xl px-4 py-8">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-navy-700 dark:text-navy-300">Noonan Tracker</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button onClick={() => router.push("/history")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
              History
            </button>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
              Sign out
            </button>
          </div>
        </header>

        {/* ── Persistent welcome / goodbye banner ── */}
        {clockStatus.status === "clocked_in" && clockStatus.loginTime && (
          <div className="mb-4 rounded-2xl bg-navy-700 px-6 py-5 text-center shadow-md">
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-200">Good day!</p>
            <h2 className="mt-1 text-xl font-bold text-white">Welcome, {name}!</h2>
            <p className="mt-1 text-sm text-navy-200">
              You clocked in at <span className="font-mono font-semibold text-white">{clockStatus.loginTime}</span>
            </p>
            {clockStatus.attendanceStatus && clockStatus.attendanceStatus !== "no_schedule" && (
              <div className="mt-3 flex justify-center">
                <StatusBadge
                  label={clockStatus.attendanceStatus === "late" ? "Late Arrival" : "On Time"}
                  variant={clockStatus.attendanceStatus === "late" ? "late" : "on_time"}
                />
              </div>
            )}
          </div>
        )}

        {clockStatus.status === "clocked_out" && clockStatus.logoutTime && (
          <div className="mb-4 rounded-2xl bg-emerald-600 px-6 py-5 text-center shadow-md">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Shift Complete</p>
            <h2 className="mt-1 text-xl font-bold text-white">See you tomorrow, {name}!</h2>
            <p className="mt-1 text-sm text-emerald-100">
              Clocked out at <span className="font-mono font-semibold text-white">{clockStatus.logoutTime}</span>
            </p>
            {clockStatus.departureStatus && clockStatus.departureStatus !== "no_schedule" && (
              <div className="mt-3 flex justify-center">
                <StatusBadge
                  label={clockStatus.departureStatus === "early" ? "Early Departure" : "On Time"}
                  variant={clockStatus.departureStatus === "early" ? "early" : "on_time"}
                />
              </div>
            )}
            <button
              onClick={() => router.push("/invoice")}
              className="mt-4 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/30"
            >
              View Invoice →
            </button>
          </div>
        )}

        {/* Cutoff day banner (only when not clocked in yet) */}
        {clockStatus.status === "not_clocked_in" && clockStatus.isCutoffDay && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800">
            Today is a cutoff day (15th / end of month). Clock out to unlock your invoice.
          </div>
        )}

        <p className="mb-4 font-mono text-xs text-slate-400">{today}</p>

        {/* Clock card */}
        <section className="mb-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Today&apos;s Attendance
          </h2>

          {/* Scheduled hours */}
          {clockStatus.schedule && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
              <span className="text-slate-500">Schedule:</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {clockStatus.schedule.startTime} – {clockStatus.schedule.endTime}
              </span>
              <span className="ml-auto text-[11px] text-rose-500 font-medium">No grace period</span>
            </div>
          )}

          {/* Times display */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clock In</span>
              <span className="mt-1 block font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                {clockStatus.loginTime ?? "—"}
              </span>
              {clockStatus.attendanceStatus && clockStatus.attendanceStatus !== "no_schedule" && (
                <div className="mt-1.5">
                  <StatusBadge
                    label={clockStatus.attendanceStatus === "late" ? "Late" : "On Time"}
                    variant={clockStatus.attendanceStatus === "late" ? "late" : "on_time"}
                  />
                </div>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clock Out</span>
              <span className="mt-1 block font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                {clockStatus.logoutTime ?? "—"}
              </span>
              {clockStatus.departureStatus && clockStatus.departureStatus !== "no_schedule" && (
                <div className="mt-1.5">
                  <StatusBadge
                    label={clockStatus.departureStatus === "early" ? "Early Out" : "On Time"}
                    variant={clockStatus.departureStatus === "early" ? "early" : "on_time"}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action error */}
          {actionError && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800">
              {actionError}
            </p>
          )}

          {/* Tag shown right after action */}
          {actionTag && (
            <div className="mb-3 flex justify-center">
              <StatusBadge
                label={actionTag === "late" ? "Marked Late" : actionTag === "early" ? "Marked Early Out" : "Marked On Time"}
                variant={actionTag}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {clockStatus.status === "not_clocked_in" && (
              <button onClick={handleClockIn} disabled={actionLoading}
                className="flex-1 rounded-lg bg-navy-700 py-3 text-sm font-semibold text-white transition hover:bg-navy-600 disabled:opacity-50">
                {actionLoading ? "Clocking in…" : "Clock In"}
              </button>
            )}
            {clockStatus.status === "clocked_in" && (
              <button onClick={handleClockOut} disabled={actionLoading}
                className="flex-1 rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-50">
                {actionLoading ? "Clocking out…" : "Clock Out"}
              </button>
            )}
            {clockStatus.status === "clocked_out" && (
              <div className="flex-1 rounded-lg bg-slate-100 py-3 text-center text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Shift complete for today
              </div>
            )}
          </div>
        </section>

        {/* Current period + invoice */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Current Period</h2>
          {summary ? (
            <>
              <p className="mb-4 text-xs text-slate-400">{summary.periodFrom} → {summary.periodTo}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <span className="block text-2xl font-bold text-navy-700 dark:text-navy-300">{summary.daysWorked}</span>
                  <span className="text-xs text-slate-400">Days worked</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.hoursWorked}h</span>
                  <span className="text-xs text-slate-400">Hours rendered</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">No entries yet this period.</p>
          )}
          <button
            onClick={() => router.push("/invoice")}
            className="mt-4 w-full rounded-lg bg-navy-700 py-2.5 text-sm font-semibold text-white hover:bg-navy-600"
          >
            View &amp; Edit Invoice →
          </button>
        </section>

        {/* Leave Request */}
        <section className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Request Leave
          </h2>
          <form onSubmit={handleLeaveRequest} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Leave Date</label>
                <input
                  type="date"
                  required
                  value={leaveForm.leaveDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, leaveDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Days</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  required
                  value={leaveForm.days}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, days: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Leave Type</label>
              <select
                value={leaveForm.type}
                onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950"
              >
                <option>Annual</option>
                <option>Sick</option>
                <option>Unpaid</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Reason</label>
              <textarea
                rows={2}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional reason…"
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              disabled={leaveSubmitting}
              className="rounded-lg bg-navy-700 py-2.5 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {leaveSubmitting ? "Submitting…" : "Submit Leave Request"}
            </button>
            {leaveMessage && (
              <p className={`text-xs ${leaveMessage.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                {leaveMessage.text}
              </p>
            )}
          </form>
        </section>

      </div>
    </main>
  );
}
