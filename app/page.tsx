"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EmployeeWithLeave } from "@/lib/leave";
import { ThemeToggle } from "@/app/components/ThemeToggle";

type LeaveFormState = {
  date: string;
  days: string;
  type: string;
  note: string;
  loading: boolean;
  error?: string;
  success?: string;
};

type ScheduleForm = {
  startTime: string;
  endTime: string;
  loading: boolean;
  error?: string;
  success?: string;
};

type SavedSchedule = {
  employeeId: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
};

function makeInitialForm(): LeaveFormState {
  return { date: new Date().toISOString().slice(0, 10), days: "", type: "Annual", note: "", loading: false };
}

function makeInitialSchedule(): ScheduleForm {
  return { startTime: "09:00", endTime: "17:00", loading: false };
}

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string; employeeId?: string; name?: string } | undefined;

  const [employees, setEmployees] = useState<EmployeeWithLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, LeaveFormState>>({});
  const [schedules, setSchedules] = useState<Record<string, ScheduleForm>>({});
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<"leave" | "schedules">("leave");

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && user?.role === "member") { router.push("/dashboard"); return; }
    if (status === "authenticated" && user?.role === "admin") {
      void fetchEmployees();
      void fetchSchedules();
    }
  }, [status, user, router]);

  async function fetchEmployees() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/employees", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const data: EmployeeWithLeave[] = await res.json();
      setEmployees(data);
      setForms((prev) => {
        const next = { ...prev };
        for (const emp of data) if (!next[emp.id]) next[emp.id] = makeInitialForm();
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchedules() {
    const res = await fetch("/api/admin/schedule");
    if (res.ok) {
      const data = await res.json() as { schedules: SavedSchedule[] };
      setSavedSchedules(data.schedules);
      setSchedules((prev) => {
        const next = { ...prev };
        for (const s of data.schedules) {
          if (!next[s.employeeId]) {
            next[s.employeeId] = {
              startTime: s.startTime,
              endTime: s.endTime,
              loading: false,
            };
          }
        }
        return next;
      });
    }
  }

  function updateFormField(id: string, field: keyof LeaveFormState, value: string | boolean) {
    setForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? makeInitialForm()), [field]: value as never } }));
  }

  function updateScheduleField(id: string, field: keyof ScheduleForm, value: string | boolean) {
    setSchedules((prev) => ({ ...prev, [id]: { ...(prev[id] ?? makeInitialSchedule()), [field]: value as never } }));
  }

  async function handleAddLeave(employeeId: string) {
    const form = forms[employeeId] ?? makeInitialForm();
    const daysNum = Number(form.days);
    if (!form.date || !form.days || isNaN(daysNum) || daysNum <= 0) {
      updateFormField(employeeId, "error", "Please enter a valid date and days (> 0).");
      return;
    }
    try {
      updateFormField(employeeId, "loading", true);
      updateFormField(employeeId, "error", "");
      updateFormField(employeeId, "success", "");
      const res = await fetch(`/api/employees/${employeeId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, days: daysNum, type: form.type || "Annual", note: form.note || "" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add leave entry");
      }
      const json = (await res.json()) as { employees: EmployeeWithLeave[] };
      setEmployees(json.employees);
      setForms((prev) => ({ ...prev, [employeeId]: { ...makeInitialForm(), success: "Leave added." } }));
    } catch (err) {
      updateFormField(employeeId, "error", err instanceof Error ? err.message : "Failed");
    } finally {
      updateFormField(employeeId, "loading", false);
    }
  }

  async function handleSaveSchedule(employeeId: string) {
    const form = schedules[employeeId] ?? makeInitialSchedule();
    updateScheduleField(employeeId, "loading", true);
    updateScheduleField(employeeId, "error", "");
    updateScheduleField(employeeId, "success", "");
    const res = await fetch("/api/admin/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        startTime: form.startTime,
        endTime: form.endTime,
        graceMinutes: 0,
      }),
    });
    updateScheduleField(employeeId, "loading", false);
    if (res.ok) {
      updateScheduleField(employeeId, "success", "Saved.");
      void fetchSchedules();
    } else {
      updateScheduleField(employeeId, "error", "Failed to save.");
    }
  }

  if (status === "loading" || (status === "authenticated" && user?.role !== "admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy-700 dark:text-navy-300">Noonan Admin</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Leave &amp; Invoice Tracker · {user?.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-200 px-3 py-1.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {today}
            </span>
            <ThemeToggle />
            <button
              onClick={() => router.push("/invoice")}
              className="rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-600"
            >
              View Invoice
            </button>
            <button
              onClick={() => router.push("/history")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Payslip History
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>

        {loading && <div className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-900">Loading employees…</div>}
        {error && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800">{error}</div>}

        {/* Tab switcher */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {(["leave", "schedules"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? "bg-white text-navy-700 shadow-sm dark:bg-slate-700 dark:text-navy-300"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab === "leave" ? "Leave Overview" : "Employee Schedules"}
            </button>
          ))}
        </div>

        {/* ── LEAVE TAB ── */}
        {activeTab === "leave" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Employees — Leave Overview</h2>
              <p className="max-w-sm text-xs text-slate-400">
                Accrual: 0.83 day/month from hire date. Usable after 6 months.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Position</th>
                    <th className="px-3 py-2">Hire / Tenure</th>
                    <th className="px-3 py-2">Accrued</th>
                    <th className="px-3 py-2">Taken</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">Eligibility</th>
                    <th className="px-3 py-2">Record Leave</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const form = forms[emp.id] ?? makeInitialForm();
                    const accrued = Number(emp.accruedLeave ?? 0);
                    const taken = Number(emp.leaveTakenTotal ?? 0);
                    const balance = Number(emp.leaveBalance ?? 0);
                    const available = Number(emp.availableLeaveToUse ?? 0);
                    return (
                      <tr key={emp.id} className="rounded-xl bg-slate-50 align-top shadow-sm ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{emp.fullName}</span>
                            <span className="text-xs text-slate-400">ID: {emp.id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs sm:text-sm">{emp.position}</td>
                        <td className="px-3 py-3 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span>{emp.hireDate}</span>
                            <span className="text-[11px] text-slate-400">{emp.tenureYears}y {emp.tenureMonths}m</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            {accrued.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {taken.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            balance < 0
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                              : "bg-navy-100 text-navy-700 dark:bg-navy-900/30 dark:text-navy-300"
                          }`}>
                            {balance.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {emp.canUseLeave ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Eligible
                              </span>
                              <span className="text-[11px] text-slate-400">Usable: <span className="font-mono">{available.toFixed(2)}d</span></span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                Not yet
                              </span>
                              <span className="text-[11px] text-slate-400">{emp.fullMonthsTenure}/6 months</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="flex flex-col gap-1">
                            <input type="date" value={form.date} onChange={(e) => updateFormField(emp.id, "date", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
                            <input type="number" min={0} step={0.5} placeholder="Days" value={form.days} onChange={(e) => updateFormField(emp.id, "days", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
                            <select value={form.type} onChange={(e) => updateFormField(emp.id, "type", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900">
                              <option>Annual</option><option>Sick</option><option>Unpaid</option><option>Other</option>
                            </select>
                            <textarea rows={2} placeholder="Note" value={form.note} onChange={(e) => updateFormField(emp.id, "note", e.target.value)}
                              className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
                            <button disabled={form.loading || !emp.canUseLeave} onClick={() => handleAddLeave(emp.id)}
                              className={`mt-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                                emp.canUseLeave
                                  ? "bg-navy-700 text-white hover:bg-navy-600 disabled:opacity-60"
                                  : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                              }`}>
                              {form.loading ? "Saving…" : "Add Leave"}
                            </button>
                            {form.error && <p className="text-[11px] text-rose-500">{form.error}</p>}
                            {form.success && <p className="text-[11px] text-emerald-600">{form.success}</p>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && employees.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-400">
                        No employees found in the Google Sheet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── SCHEDULES TAB ── */}
        {activeTab === "schedules" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="mb-4">
              <h2 className="text-base font-semibold">Employee Schedules</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Set scheduled start/end times per employee. Used to tag late clock-ins and early clock-outs.
                Requires a &quot;Schedules&quot; tab in your Google Sheet (A=employeeId, B=startTime, C=endTime, D=graceMinutes). No grace period — late is late.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Start Time</th>
                    <th className="px-3 py-2">End Time</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const saved = savedSchedules.find((s) => s.employeeId === emp.id);
                    const form = schedules[emp.id] ?? { ...makeInitialSchedule(), ...(saved ? { startTime: saved.startTime, endTime: saved.endTime } : {}) };
                    return (
                      <tr key={emp.id} className="rounded-xl bg-slate-50 align-middle shadow-sm ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                        <td className="px-3 py-3">
                          <div>
                            <span className="font-medium">{emp.fullName}</span>
                            <span className="ml-2 text-xs text-slate-400">{emp.id}</span>
                            {saved && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Set
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <input type="time" value={form.startTime}
                            onChange={(e) => updateScheduleField(emp.id, "startTime", e.target.value)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
                        </td>
                        <td className="px-3 py-3">
                          <input type="time" value={form.endTime}
                            onChange={(e) => updateScheduleField(emp.id, "endTime", e.target.value)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button disabled={form.loading} onClick={() => handleSaveSchedule(emp.id)}
                              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
                              {form.loading ? "…" : "Save"}
                            </button>
                            {form.success && <span className="text-xs text-emerald-600">{form.success}</span>}
                            {form.error && <span className="text-xs text-rose-500">{form.error}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
