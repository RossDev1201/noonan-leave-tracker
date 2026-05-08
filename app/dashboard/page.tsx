"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import type { TimeEditRequest } from "@/lib/googleSheets";

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
  cutoffDueDate?: string;
  daysUntilCutoffDeadline?: number;
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

type PeriodEntry = {
  date: string;
  loginTime: string;
  logoutTime: string;
  editRequest: TimeEditRequest | null;
};

type EditForm = {
  targetDate: string;
  requestedLoginTime: string;
  requestedLogoutTime: string;
  reason: string;
};

type ChangeRequestForm = {
  date: string;
  requestedLoginTime: string;
  requestedLogoutTime: string;
  reason: string;
};

type MyChangeRequest = {
  requestId: string;
  date: string;
  requestedLoginTime: string;
  requestedLogoutTime: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
};

function LiveClock() {
  const [phTime, setPhTime] = useState("");
  const [auTime, setAuTime] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      const fmt = (tz: string) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          hourCycle: "h23",
        }).format(now);
      setPhTime(fmt("Asia/Manila"));
      setAuTime(fmt("Australia/Sydney"));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-noonan-lightgray bg-white px-4 py-3 text-center dark:border-[#333] dark:bg-[#111]">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">PH Time</p>
        <p className="font-mono text-xl font-bold text-noonan-red">{phTime || "—"}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">Asia/Manila · UTC+8</p>
      </div>
      <div className="rounded-xl border border-noonan-lightgray bg-white px-4 py-3 text-center dark:border-[#333] dark:bg-[#111]">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">AU Time</p>
        <p className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400">{auTime || "—"}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">Australia/Sydney</p>
      </div>
    </div>
  );
}

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

function getClientHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTag, setActionTag] = useState<"late" | "early" | "on_time" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [leaveForm, setLeaveForm] = useState<LeaveForm>({
    leaveDate: new Date().toISOString().slice(0, 10),
    days: "1",
    type: "Annual",
    reason: "",
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Period entries + edit request state
  const [periodEntries, setPeriodEntries] = useState<PeriodEntry[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    targetDate: "",
    requestedLoginTime: "",
    requestedLogoutTime: "",
    reason: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editMessage, setEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Time correction request
  const [changeRequests, setChangeRequests] = useState<MyChangeRequest[]>([]);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionForm, setCorrectionForm] = useState<ChangeRequestForm>({
    date: "",
    requestedLoginTime: "09:00",
    requestedLogoutTime: "17:00",
    reason: "",
  });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      void fetchPeriodEntries();
      void fetchChangeRequests();
    }
  }, [status, user]);

  // Re-sync status every minute to keep the page accurate
  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "member") return;
    const id = setInterval(() => { void fetchStatus(); }, 60000);
    return () => clearInterval(id);
  }, [status, user]);

  async function fetchStatus() {
    const res = await fetch("/api/time/status");
    if (res.ok) setClockStatus(await res.json() as ClockStatus);
  }

  async function fetchSummary() {
    const res = await fetch("/api/invoice/current");
    if (res.ok) {
      const data = await res.json() as { payslip?: { actualDaysWorked?: number; hoursRendered: number; cutoff: { from: string; to: string } } };
      if (data.payslip) {
        setSummary({
          daysWorked: data.payslip.actualDaysWorked ?? Math.round((data.payslip.hoursRendered / 7.5) * 10) / 10,
          hoursWorked: data.payslip.hoursRendered,
          periodFrom: data.payslip.cutoff.from,
          periodTo: data.payslip.cutoff.to,
        });
      }
    }
  }

  async function fetchPeriodEntries() {
    const res = await fetch("/api/time/entries");
    if (res.ok) {
      const data = await res.json() as { entries: PeriodEntry[] };
      setPeriodEntries(data.entries);
    }
  }

  async function fetchChangeRequests() {
    const res = await fetch("/api/time/change-request");
    if (res.ok) {
      const data = await res.json() as { requests: MyChangeRequest[] };
      setChangeRequests(data.requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
    }
  }

  async function handleClockIn() {
    setActionLoading(true);
    setActionError(null);
    setActionTag(null);
    const res = await fetch("/api/time/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientTime: getClientHHMM() }),
    });
    const data = await res.json() as { error?: string; loginTime?: string; attendanceStatus?: string };
    setActionLoading(false);
    if (res.ok) {
      if (data.attendanceStatus === "late") setActionTag("late");
      else if (data.attendanceStatus === "on_time") setActionTag("on_time");
      void fetchStatus();
      void fetchSummary();
      void fetchPeriodEntries();
    } else {
      setActionError(data.error ?? "Failed to clock in");
    }
  }

  async function handleClockOut() {
    setActionLoading(true);
    setActionError(null);
    setActionTag(null);
    const res = await fetch("/api/time/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientTime: getClientHHMM() }),
    });
    const data = await res.json() as { error?: string; logoutTime?: string; departureStatus?: string };
    setActionLoading(false);
    if (res.ok) {
      if (data.departureStatus === "early") setActionTag("early");
      else if (data.departureStatus === "on_time") setActionTag("on_time");
      void fetchStatus();
      void fetchSummary();
      void fetchPeriodEntries();
    } else {
      setActionError(data.error ?? "Failed to clock out");
    }
  }

  function openEditForm(entry: PeriodEntry) {
    setEditingDate(entry.date);
    setEditForm({
      targetDate: entry.date,
      requestedLoginTime: entry.loginTime,
      requestedLogoutTime: entry.logoutTime || "",
      reason: "",
    });
    setEditMessage(null);
  }

  async function handleSubmitEditRequest(e: React.FormEvent) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditMessage(null);
    const res = await fetch("/api/time/request-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json() as { error?: string };
    setEditSubmitting(false);
    if (res.ok) {
      setEditMessage({ type: "success", text: "Request submitted! Awaiting admin review." });
      setEditingDate(null);
      void fetchPeriodEntries();
    } else {
      setEditMessage({ type: "error", text: data.error ?? "Failed to submit" });
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
      setLeaveForm({ leaveDate: new Date().toISOString().slice(0, 10), days: "1", type: "Annual", reason: "" });
    } else {
      setLeaveMessage({ type: "error", text: data.error ?? "Failed to submit request" });
    }
  }

  async function handleCorrectionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCorrectionSubmitting(true);
    setCorrectionMessage(null);
    const res = await fetch("/api/time/change-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correctionForm),
    });
    const data = await res.json() as { error?: string };
    setCorrectionSubmitting(false);
    if (res.ok) {
      setCorrectionMessage({ type: "success", text: "Correction request submitted! Awaiting admin approval." });
      setCorrectionForm({ date: "", requestedLoginTime: "09:00", requestedLogoutTime: "17:00", reason: "" });
      setShowCorrectionForm(false);
      void fetchChangeRequests();
    } else {
      setCorrectionMessage({ type: "error", text: data.error ?? "Failed to submit" });
    }
  }

  if (status === "loading" || !clockStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-noonan-cream dark:bg-black">
        <div className="text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  const today = clockStatus.date ?? new Date().toISOString().slice(0, 10);
  const daysLeft = clockStatus.daysUntilCutoffDeadline ?? 99;
  const showCutoffWarning = daysLeft >= 0 && daysLeft <= 3;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-xl px-4 py-8">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-noonan-red">Noonan Tracker</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button onClick={() => router.push("/attendance")}
              className="rounded-lg border border-noonan-lightgray bg-white px-3 py-1.5 text-xs font-medium text-noonan-gray hover:border-noonan-red hover:text-noonan-red dark:border-[#333] dark:bg-[#111] dark:text-noonan-cream">
              Attendance
            </button>
            <button onClick={() => router.push("/history")}
              className="rounded-lg border border-noonan-lightgray bg-white px-3 py-1.5 text-xs font-medium text-noonan-gray hover:border-noonan-red hover:text-noonan-red dark:border-[#333] dark:bg-[#111] dark:text-noonan-cream">
              History
            </button>
            <button onClick={() => router.push("/help")}
              className="rounded-lg border border-noonan-lightgray bg-white px-3 py-1.5 text-xs font-medium text-noonan-gray hover:border-noonan-red hover:text-noonan-red dark:border-[#333] dark:bg-[#111] dark:text-noonan-cream">
              Help
            </button>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
              Sign out
            </button>
          </div>
        </header>

        {/* Live dual clock */}
        <LiveClock />

        {/* ── Persistent welcome / goodbye banner ── */}
        {clockStatus.status === "clocked_in" && clockStatus.loginTime && (
          <div className="mb-4 rounded-2xl bg-noonan-red px-6 py-5 text-center shadow-md">
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

        {/* Cutoff deadline warning */}
        {showCutoffWarning && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${
            daysLeft === 0
              ? "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:ring-rose-800"
              : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800"
          }`}>
            {daysLeft === 0
              ? `Payroll cutoff deadline is TODAY (${clockStatus.cutoffDueDate}). Submit any time corrections or overtime now.`
              : `Payroll cutoff deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${clockStatus.cutoffDueDate}). Records lock after this date.`
            }
          </div>
        )}

        {/* Cutoff day banner */}
        {clockStatus.status === "not_clocked_in" && clockStatus.isCutoffDay && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800">
            Today is a cutoff day (15th / end of month). Clock out to unlock your invoice.
          </div>
        )}

        <p className="mb-4 font-mono text-xs text-slate-400">{today}</p>

        {/* Clock card */}
        <section className="mb-4 rounded-2xl border border-noonan-lightgray bg-white p-6 dark:border-[#333] dark:bg-[#111]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Today&apos;s Attendance
          </h2>

          {clockStatus.schedule && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-noonan-lightgray bg-noonan-cream px-3 py-2 text-xs dark:border-[#333] dark:bg-[#1a1a1a]">
              <span className="text-slate-500">Schedule:</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {clockStatus.schedule.startTime} – {clockStatus.schedule.endTime}
              </span>
              <span className="ml-auto text-[11px] text-rose-500 font-medium">No grace period</span>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="border border-noonan-lightgray bg-noonan-cream p-3 dark:border-[#333] dark:bg-[#1a1a1a]">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clock In</span>
              <span className="mt-1 block font-mono text-lg font-bold text-black dark:text-noonan-cream">
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
            <div className="border border-noonan-lightgray bg-noonan-cream p-3 dark:border-[#333] dark:bg-[#1a1a1a]">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clock Out</span>
              <span className="mt-1 block font-mono text-lg font-bold text-black dark:text-noonan-cream">
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

          {actionError && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800">
              {actionError}
            </p>
          )}

          {actionTag && (
            <div className="mb-3 flex justify-center">
              <StatusBadge
                label={actionTag === "late" ? "Marked Late" : actionTag === "early" ? "Marked Early Out" : "Marked On Time"}
                variant={actionTag}
              />
            </div>
          )}

          <div className="flex gap-3">
            {clockStatus.status === "not_clocked_in" && (
              <button onClick={handleClockIn} disabled={actionLoading}
                className="flex-1 rounded-lg bg-noonan-red py-3 text-sm font-semibold text-white transition hover:bg-noonan-red-dark disabled:opacity-50">
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
              <div className="flex-1 border border-noonan-lightgray bg-noonan-lightgray py-3 text-center text-sm font-semibold text-noonan-gray dark:border-[#333] dark:bg-[#1a1a1a] dark:text-noonan-warmgray">
                Shift complete for today
              </div>
            )}
          </div>
        </section>

        {/* Current period + invoice */}
        <section className="mb-4 rounded-2xl border border-noonan-lightgray bg-white p-6 dark:border-[#333] dark:bg-[#111]">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Current Period</h2>
          {summary ? (
            <>
              <p className="mb-4 text-xs text-slate-400">{summary.periodFrom} → {summary.periodTo}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <span className="block text-2xl font-bold text-noonan-red">{summary.daysWorked}</span>
                  <span className="text-xs text-slate-400">Days worked</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.hoursWorked}h</span>
                  <span className="text-xs text-slate-400">Hours logged</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">No entries yet this period.</p>
          )}
          <button
            onClick={() => router.push("/invoice")}
            className="mt-4 w-full rounded-lg bg-noonan-red py-2.5 text-sm font-semibold text-white hover:bg-noonan-red-dark"
          >
            View &amp; Edit Invoice →
          </button>
        </section>

        {/* Period time entries with edit request */}
        {periodEntries.length > 0 && (
          <section className="mb-4 rounded-2xl border border-noonan-lightgray bg-white p-6 dark:border-[#333] dark:bg-[#111]">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              This Period — Clock Records
            </h2>
            <div className="space-y-2">
              {periodEntries.map((entry) => {
                const hasPending = entry.editRequest?.status === "Pending";
                const hasApproved = entry.editRequest?.status === "Approved";
                const isEditing = editingDate === entry.date;
                return (
                  <div key={entry.date}>
                    <div className="flex items-center gap-3 rounded-lg border border-noonan-lightgray bg-noonan-cream px-3 py-2 dark:border-[#333] dark:bg-[#1a1a1a]">
                      <span className="w-24 font-mono text-xs text-slate-500">{entry.date}</span>
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {entry.loginTime} → {entry.logoutTime || "—"}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {hasPending && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            Edit Pending
                          </span>
                        )}
                        {hasApproved && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Edited
                          </span>
                        )}
                        {!hasPending && (
                          <button
                            onClick={() => isEditing ? setEditingDate(null) : openEditForm(entry)}
                            className="rounded-md bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                          >
                            {isEditing ? "Cancel" : "Request Edit"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline edit form */}
                    {isEditing && (
                      <form onSubmit={handleSubmitEditRequest} className="mt-1 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                        <p className="mb-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                          Request correction for {entry.date}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Clock In</label>
                            <input type="time" required value={editForm.requestedLoginTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, requestedLoginTime: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-900" />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Clock Out</label>
                            <input type="time" required value={editForm.requestedLogoutTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, requestedLogoutTime: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-900" />
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Reason</label>
                          <input type="text" value={editForm.reason} placeholder="e.g. forgot to clock out"
                            onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-900" />
                        </div>
                        <button type="submit" disabled={editSubmitting}
                          className="mt-2 rounded-md bg-noonan-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60">
                          {editSubmitting ? "Submitting…" : "Submit Request"}
                        </button>
                        {editMessage && (
                          <p className={`mt-1.5 text-[11px] ${editMessage.type === "success" ? "text-emerald-600" : "text-rose-500"}`}>
                            {editMessage.text}
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Time Correction Requests ── */}
        <section className="mb-4 rounded-2xl border border-noonan-lightgray bg-white p-6 dark:border-[#333] dark:bg-[#111]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Time Corrections
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Request a correction for past attendance records. Admin approval required.
              </p>
            </div>
            <button
              onClick={() => { setShowCorrectionForm((v) => !v); setCorrectionMessage(null); }}
              className="rounded-lg bg-noonan-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-noonan-red-dark"
            >
              {showCorrectionForm ? "Cancel" : "+ New Request"}
            </button>
          </div>

          {showCorrectionForm && (
            <form onSubmit={handleCorrectionSubmit} className="mb-4 flex flex-col gap-3 rounded-xl border border-noonan-lightgray bg-slate-50 p-4 dark:border-[#333] dark:bg-[#1a1a1a]">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Date to Correct</label>
                  <input
                    type="date"
                    required
                    max={today}
                    value={correctionForm.date}
                    onChange={(e) => setCorrectionForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Requested Clock In</label>
                  <input
                    type="time"
                    required
                    value={correctionForm.requestedLoginTime}
                    onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedLoginTime: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Requested Clock Out</label>
                  <input
                    type="time"
                    value={correctionForm.requestedLogoutTime}
                    onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedLogoutTime: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why this correction is needed…"
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={correctionSubmitting}
                className="rounded-lg bg-noonan-red py-2.5 text-sm font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60"
              >
                {correctionSubmitting ? "Submitting…" : "Submit Correction Request"}
              </button>
              {correctionMessage && (
                <p className={`text-xs ${correctionMessage.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {correctionMessage.text}
                </p>
              )}
            </form>
          )}

          {changeRequests.length === 0 ? (
            <p className="text-xs text-slate-400">No correction requests submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {changeRequests.slice(0, 5).map((r) => (
                <div key={r.requestId} className={`rounded-xl p-3 ring-1 text-xs ${
                  r.status === "Pending"
                    ? "bg-amber-50 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-800"
                    : r.status === "Approved"
                    ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-800"
                    : "bg-slate-50 ring-slate-200 dark:bg-[#1a1a1a] dark:ring-slate-700"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{r.date}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${
                      r.status === "Pending"
                        ? "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800"
                        : r.status === "Approved"
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
                        : "bg-slate-200 text-slate-600 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {r.requestedLoginTime} – {r.requestedLogoutTime || "—"}
                    {r.reason && <span className="ml-2 italic">· {r.reason}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Leave Request */}
        <section className="rounded-2xl border border-noonan-lightgray bg-white p-6 dark:border-[#333] dark:bg-[#111]">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Request Leave
          </h2>
          <form onSubmit={handleLeaveRequest} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Leave Date</label>
                <input
                  type="date" required value={leaveForm.leaveDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, leaveDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Days</label>
                <input
                  type="number" min={0.5} step={0.5} required value={leaveForm.days}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, days: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Leave Type</label>
              <select value={leaveForm.type} onChange={(e) => setLeaveForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950">
                <option>Annual</option>
                <option>Sick</option>
                <option>Unpaid</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Reason</label>
              <textarea rows={2} value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional reason…"
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <button type="submit" disabled={leaveSubmitting}
              className="rounded-lg bg-noonan-red py-2.5 text-sm font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60">
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
