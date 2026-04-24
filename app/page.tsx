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

type ContractForm = {
  contractValue: string;
  hourlyRate: string;
  internetFee: string;
  medicalFee: string;
  department: string;
  loading: boolean;
  error?: string;
  success?: string;
};

type SavedContract = {
  employeeId: string;
  contractValue: number;
  hourlyRate: number;
  internetFee: number;
  medicalFee: number;
  department: string;
};

type InvoiceEditRequest = {
  requestId: string;
  employeeId: string;
  periodFrom: string;
  periodTo: string;
  recepTaskPay: number;
  hoursClaimed: number;
  notes: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  reviewedAt?: string;
};

function makeInitialForm(): LeaveFormState {
  return { date: new Date().toISOString().slice(0, 10), days: "", type: "Annual", note: "", loading: false };
}

function makeInitialSchedule(): ScheduleForm {
  return { startTime: "09:00", endTime: "17:00", loading: false };
}

function makeInitialContract(): ContractForm {
  return { contractValue: "45000", hourlyRate: "300", internetFee: "1250", medicalFee: "1250", department: "IT Department", loading: false };
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
  const [contracts, setContracts] = useState<Record<string, ContractForm>>({});
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([]);
  const [editRequests, setEditRequests] = useState<InvoiceEditRequest[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"leave" | "schedules" | "contracts" | "editRequests" | "attendance">("leave");

  // Attendance / manual punch state
  const [punchEmpId, setPunchEmpId] = useState("");
  const [punchDate, setPunchDate] = useState(new Date().toISOString().slice(0, 10));
  const [punchLogin, setPunchLogin] = useState("09:00");
  const [punchLogout, setPunchLogout] = useState("17:00");
  const [punchSaving, setPunchSaving] = useState(false);
  const [punchMessage, setPunchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Backfill state
  const [backfillFrom, setBackfillFrom] = useState("");
  const [backfillTo, setBackfillTo] = useState(new Date().toISOString().slice(0, 10));
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ inserted: number; skipped: number; workingDays: string[] } | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && user?.role === "member") { router.push("/dashboard"); return; }
    if (status === "authenticated" && user?.role === "admin") {
      void fetchEmployees();
      void fetchSchedules();
      void fetchContracts();
      void fetchEditRequests();
      // Default backfill from = current cutoff start (16th of month or 1st)
      const now = new Date();
      const day = now.getDate();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = String(now.getFullYear());
      setBackfillFrom(day <= 15 ? `${yyyy}-${mm}-01` : `${yyyy}-${mm}-16`);
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

  async function fetchContracts() {
    const res = await fetch("/api/admin/contract");
    if (res.ok) {
      const data = await res.json() as { configs: SavedContract[] };
      setSavedContracts(data.configs);
      setContracts((prev) => {
        const next = { ...prev };
        for (const c of data.configs) {
          if (!next[c.employeeId]) {
            next[c.employeeId] = {
              contractValue: String(c.contractValue),
              hourlyRate: String(c.hourlyRate),
              internetFee: String(c.internetFee),
              medicalFee: String(c.medicalFee),
              department: c.department,
              loading: false,
            };
          }
        }
        return next;
      });
    }
  }

  async function fetchEditRequests() {
    const res = await fetch("/api/admin/invoice-requests");
    if (res.ok) {
      const data = await res.json() as { requests: InvoiceEditRequest[] };
      setEditRequests(data.requests);
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

  function updateContractField(id: string, field: keyof ContractForm, value: string | boolean) {
    setContracts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? makeInitialContract()), [field]: value as never } }));
  }

  async function handleSaveContract(employeeId: string) {
    const form = contracts[employeeId] ?? makeInitialContract();
    updateContractField(employeeId, "loading", true);
    updateContractField(employeeId, "error", "");
    updateContractField(employeeId, "success", "");
    const res = await fetch("/api/admin/contract", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        contractValue: Number(form.contractValue) || 0,
        hourlyRate: Number(form.hourlyRate) || 0,
        internetFee: Number(form.internetFee) || 0,
        medicalFee: Number(form.medicalFee) || 0,
        department: form.department,
      }),
    });
    updateContractField(employeeId, "loading", false);
    if (res.ok) {
      updateContractField(employeeId, "success", "Saved.");
      void fetchContracts();
    } else {
      updateContractField(employeeId, "error", "Failed to save.");
    }
  }

  async function handleManualPunch() {
    if (!punchEmpId || !punchDate || !punchLogin) return;
    setPunchSaving(true);
    setPunchMessage(null);
    const res = await fetch("/api/admin/time-entry", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: punchEmpId,
        date: punchDate,
        loginTime: punchLogin,
        logoutTime: punchLogout,
      }),
    });
    setPunchSaving(false);
    if (res.ok) {
      setPunchMessage({ type: "success", text: `Saved: ${punchEmpId} on ${punchDate} — ${punchLogin} / ${punchLogout}` });
    } else {
      const j = await res.json() as { error?: string };
      setPunchMessage({ type: "error", text: j.error ?? "Failed to save" });
    }
  }

  async function handleBackfill() {
    if (!backfillFrom || !backfillTo) return;
    setBackfillRunning(true);
    setBackfillResult(null);
    const res = await fetch("/api/admin/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: backfillFrom, to: backfillTo }),
    });
    setBackfillRunning(false);
    if (res.ok) {
      const data = await res.json() as { inserted: number; skipped: number; workingDays: string[] };
      setBackfillResult(data);
    }
  }

  async function handleReviewEditRequest(requestId: string, status: "Approved" | "Rejected") {
    setReviewingId(requestId);
    const res = await fetch("/api/admin/invoice-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, status }),
    });
    setReviewingId(null);
    if (res.ok) void fetchEditRequests();
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
      <div className="flex min-h-screen items-center justify-center bg-noonan-cream dark:bg-black">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-black dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-noonan-red">Noonan Admin</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Leave &amp; Invoice Tracker · {user?.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-200 px-3 py-1.5 font-mono text-xs text-slate-600 dark:bg-[#1a1a1a] dark:text-slate-300">
              {today}
            </span>
            <ThemeToggle />
            <button
              onClick={() => router.push("/invoice")}
              className="rounded-lg bg-noonan-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-noonan-red-dark"
            >
              View Invoice
            </button>
            <button
              onClick={() => router.push("/history")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-[#1a1a1a] dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Payslip History
            </button>
            <button
              onClick={() => router.push("/help")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-[#1a1a1a] dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Help
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-300 dark:bg-[#1a1a1a] dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>

        {loading && <div className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-[#111]">Loading employees…</div>}
        {error && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800">{error}</div>}

        {/* Tab switcher */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-200 p-1 dark:bg-[#1a1a1a]">
          {([
            { key: "leave", label: "Leave" },
            { key: "schedules", label: "Schedules" },
            { key: "contracts", label: "Contracts" },
            { key: "editRequests", label: `Edit Requests${editRequests.filter(r => r.status === "Pending").length > 0 ? ` (${editRequests.filter(r => r.status === "Pending").length})` : ""}` },
            { key: "attendance", label: "Attendance" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${
                activeTab === key
                  ? "bg-white text-navy-700 shadow-sm dark:bg-slate-700 dark:text-navy-300"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── LEAVE TAB ── */}
        {activeTab === "leave" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
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
                      <tr key={emp.id} className="rounded-xl bg-slate-50 align-top shadow-sm ring-1 ring-slate-200 dark:bg-[#1a1a1a]/60 dark:border-[#444]">
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
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                            <input type="number" min={0} step={0.5} placeholder="Days" value={form.days} onChange={(e) => updateFormField(emp.id, "days", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                            <select value={form.type} onChange={(e) => updateFormField(emp.id, "type", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]">
                              <option>Annual</option><option>Sick</option><option>Unpaid</option><option>Other</option>
                            </select>
                            <textarea rows={2} placeholder="Note" value={form.note} onChange={(e) => updateFormField(emp.id, "note", e.target.value)}
                              className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                            <button disabled={form.loading || !emp.canUseLeave} onClick={() => handleAddLeave(emp.id)}
                              className={`mt-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                                emp.canUseLeave
                                  ? "bg-noonan-red text-white hover:bg-noonan-red-dark disabled:opacity-60"
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
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
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
                      <tr key={emp.id} className="rounded-xl bg-slate-50 align-middle shadow-sm ring-1 ring-slate-200 dark:bg-[#1a1a1a]/60 dark:border-[#444]">
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
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                        </td>
                        <td className="px-3 py-3">
                          <input type="time" value={form.endTime}
                            onChange={(e) => updateScheduleField(emp.id, "endTime", e.target.value)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <button disabled={form.loading} onClick={() => handleSaveSchedule(emp.id)}
                              className="rounded-md bg-noonan-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60">
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
        {/* ── CONTRACTS TAB ── */}
        {activeTab === "contracts" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
            <div className="mb-4">
              <h2 className="text-base font-semibold">Employee Contract Values</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Set per-employee contract value and pay rates. Admin Task Pay = Contract Value ÷ 2 per cutoff period.
                Requires a &quot;ContractConfig&quot; tab in your Google Sheet (A=employeeId, B=contractValue, C=hourlyRate, D=internetFee, E=medicalFee, F=department).
              </p>
            </div>
            <div className="space-y-4">
              {employees.map((emp) => {
                const saved = savedContracts.find((c) => c.employeeId === emp.id);
                const form = contracts[emp.id] ?? {
                  ...makeInitialContract(),
                  ...(saved ? {
                    contractValue: String(saved.contractValue),
                    hourlyRate: String(saved.hourlyRate),
                    internetFee: String(saved.internetFee),
                    medicalFee: String(saved.medicalFee),
                    department: saved.department,
                  } : {}),
                };
                return (
                  <div key={emp.id} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-[#1a1a1a]/60 dark:border-[#444]">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="font-medium text-sm">{emp.fullName}</span>
                      <span className="text-xs text-slate-400">{emp.id}</span>
                      {saved && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Saved
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-400">Contract Value (₱)</label>
                        <input type="number" min={0} step={1000} value={form.contractValue}
                          onChange={(e) => updateContractField(emp.id, "contractValue", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-400">Hourly Rate (₱)</label>
                        <input type="number" min={0} step={50} value={form.hourlyRate}
                          onChange={(e) => updateContractField(emp.id, "hourlyRate", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-400">Internet Fee (₱)</label>
                        <input type="number" min={0} step={100} value={form.internetFee}
                          onChange={(e) => updateContractField(emp.id, "internetFee", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-400">Medical Fee (₱)</label>
                        <input type="number" min={0} step={100} value={form.medicalFee}
                          onChange={(e) => updateContractField(emp.id, "medicalFee", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-400">Department</label>
                        <input type="text" value={form.department}
                          onChange={(e) => updateContractField(emp.id, "department", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-[#111]" />
                      </div>
                      <div className="flex items-end gap-2">
                        <button disabled={form.loading} onClick={() => handleSaveContract(emp.id)}
                          className="rounded-md bg-noonan-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-60">
                          {form.loading ? "…" : "Save"}
                        </button>
                        {form.success && <span className="text-xs text-emerald-600">{form.success}</span>}
                        {form.error && <span className="text-xs text-rose-500">{form.error}</span>}
                      </div>
                    </div>
                    {form.contractValue && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Admin Task Pay per cutoff: <span className="font-mono font-semibold text-noonan-red">
                          ₱{(Number(form.contractValue) / 2).toLocaleString()}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── EDIT REQUESTS TAB ── */}
        {activeTab === "editRequests" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
            <div className="mb-4">
              <h2 className="text-base font-semibold">Invoice Edit Requests</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Members submit invoice edits for approval. Approve to unlock PDF download for the member.
              </p>
            </div>
            {editRequests.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No edit requests yet.</p>
            ) : (
              <div className="space-y-3">
                {editRequests
                  .sort((a, b) => {
                    const order = { Pending: 0, Approved: 1, Rejected: 2 };
                    return (order[a.status] - order[b.status]) || b.requestedAt.localeCompare(a.requestedAt);
                  })
                  .map((req) => {
                    const emp = employees.find((e) => e.id === req.employeeId);
                    return (
                      <div key={req.requestId} className={`rounded-xl p-4 ring-1 ${
                        req.status === "Pending"
                          ? "bg-amber-50 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-800"
                          : req.status === "Approved"
                          ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-800"
                          : "bg-slate-50 ring-slate-200 dark:bg-[#1a1a1a]/60 dark:border-[#444]"
                      }`}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-sm">{emp?.fullName ?? req.employeeId}</span>
                            <span className="ml-2 text-xs text-slate-400">{req.periodFrom} → {req.periodTo}</span>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                            req.status === "Pending"
                              ? "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800"
                              : req.status === "Approved"
                              ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
                              : "bg-slate-200 text-slate-600 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600"
                          }`}>
                            {req.status}
                          </span>
                        </div>
                        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                          <div><span className="text-slate-400">Recep Pay:</span> <span className="font-mono font-medium">₱{req.recepTaskPay.toLocaleString()}</span></div>
                          <div><span className="text-slate-400">Hours Claimed:</span> <span className="font-mono font-medium">{req.hoursClaimed}</span></div>
                          <div><span className="text-slate-400">Submitted:</span> <span className="font-medium">{new Date(req.requestedAt).toLocaleDateString()}</span></div>
                          {req.notes && <div className="col-span-3"><span className="text-slate-400">Notes:</span> <span className="font-medium">{req.notes}</span></div>}
                        </div>
                        {req.status === "Pending" && (
                          <div className="flex gap-2">
                            <button
                              disabled={reviewingId === req.requestId}
                              onClick={() => handleReviewEditRequest(req.requestId, "Approved")}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            >
                              {reviewingId === req.requestId ? "…" : "Approve"}
                            </button>
                            <button
                              disabled={reviewingId === req.requestId}
                              onClick={() => handleReviewEditRequest(req.requestId, "Rejected")}
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                            >
                              {reviewingId === req.requestId ? "…" : "Reject"}
                            </button>
                          </div>
                        )}
                        {req.reviewedAt && (
                          <p className="mt-1 text-[11px] text-slate-400">Reviewed: {new Date(req.reviewedAt).toLocaleString()}</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        )}
        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "attendance" && (
          <div className="space-y-4">

            {/* Manual Punch Override */}
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
              <h2 className="mb-1 text-base font-semibold">Manual Punch Override</h2>
              <p className="mb-4 text-xs text-slate-400">Override or add a clock in/out entry for any employee on any date.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Employee</label>
                  <select
                    value={punchEmpId}
                    onChange={(e) => setPunchEmpId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  >
                    <option value="">— Select employee —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Date</label>
                  <input
                    type="date"
                    value={punchDate}
                    onChange={(e) => setPunchDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Clock In</label>
                  <input
                    type="time"
                    value={punchLogin}
                    onChange={(e) => setPunchLogin(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Clock Out</label>
                  <input
                    type="time"
                    value={punchLogout}
                    onChange={(e) => setPunchLogout(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    disabled={punchSaving || !punchEmpId || !punchDate || !punchLogin}
                    onClick={handleManualPunch}
                    className="w-full rounded-lg bg-noonan-red px-4 py-2 text-sm font-semibold text-white hover:bg-noonan-red-dark disabled:opacity-50"
                  >
                    {punchSaving ? "Saving…" : "Save Entry"}
                  </button>
                </div>
              </div>
              {punchMessage && (
                <p className={`mt-3 text-xs ${punchMessage.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {punchMessage.text}
                </p>
              )}
            </section>

            {/* Backfill */}
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#333]">
              <h2 className="mb-1 text-base font-semibold">Backfill Period</h2>
              <p className="mb-4 text-xs text-slate-400">
                Inserts attendance records for ALL employees for every working day in the range.
                Skips existing entries. Excludes weekends &amp; Australian public holidays (incl. ANZAC Day Apr 27).
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">From</label>
                  <input
                    type="date"
                    value={backfillFrom}
                    onChange={(e) => setBackfillFrom(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">To</label>
                  <input
                    type="date"
                    value={backfillTo}
                    onChange={(e) => setBackfillTo(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-black"
                  />
                </div>
                <button
                  disabled={backfillRunning || !backfillFrom || !backfillTo}
                  onClick={handleBackfill}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {backfillRunning ? "Running…" : "Run Backfill"}
                </button>
              </div>

              {backfillResult && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-[#1a1a1a]">
                  <div className="mb-2 flex gap-4 text-sm">
                    <span className="text-emerald-600 font-semibold">✓ {backfillResult.inserted} entries inserted</span>
                    <span className="text-slate-400">{backfillResult.skipped} skipped (already existed)</span>
                  </div>
                  <p className="mb-1 text-[11px] font-medium text-slate-400 uppercase tracking-wide">Working days in range ({backfillResult.workingDays.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {backfillResult.workingDays.map((d) => (
                      <span key={d} className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] ring-1 ring-slate-200 dark:bg-[#111] dark:border-[#444]">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

          </div>
        )}

      </div>
    </main>
  );
}
