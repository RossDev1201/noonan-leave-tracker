"use client";

import { useEffect, useState } from "react";
import type { EmployeeWithLeave } from "@/lib/leave";

type LeaveFormState = {
  date: string;
  days: string;
  type: string;
  note: string;
  loading: boolean;
  error?: string;
  success?: string;
};

function makeInitialForm(): LeaveFormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    days: "",
    type: "Annual",
    note: "",
    loading: false,
    error: undefined,
    success: undefined,
  };
}

export const dynamic = "force-dynamic";

export default function HomePage() {
  const [employees, setEmployees] = useState<EmployeeWithLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, LeaveFormState>>({});

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  useEffect(() => {
    void fetchEmployees();
  }, []);

  async function fetchEmployees() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/employees", { cache: "no-store" });

      if (!res.ok) {
        let message = `Failed to fetch employees (status ${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const data: EmployeeWithLeave[] = await res.json();
      setEmployees(data);

      setForms((prev) => {
        const next: Record<string, LeaveFormState> = { ...prev };
        for (const emp of data) {
          if (!next[emp.id]) {
            next[emp.id] = makeInitialForm();
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Error in fetchEmployees:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to load employees";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function updateFormField(
    employeeId: string,
    field: keyof LeaveFormState,
    value: string | boolean
  ) {
    setForms((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] ?? makeInitialForm()),
        [field]: value as never,
      },
    }));
  }

  async function handleAddLeave(employeeId: string) {
    const form = forms[employeeId] ?? makeInitialForm();

    const daysNum = Number(form.days);
    if (!form.date || !form.days || isNaN(daysNum) || daysNum <= 0) {
      updateFormField(
        employeeId,
        "error",
        "Please enter a valid date and days (> 0)."
      );
      updateFormField(employeeId, "success", "");
      return;
    }

    try {
      updateFormField(employeeId, "loading", true);
      updateFormField(employeeId, "error", "");
      updateFormField(employeeId, "success", "");

      const res = await fetch(`/api/employees/${employeeId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          days: daysNum,
          type: form.type || "Annual",
          note: form.note || "",
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Failed to add leave entry");
      }

      const json = (await res.json()) as { employees: EmployeeWithLeave[] };
      setEmployees(json.employees);

      setForms((prev) => ({
        ...prev,
        [employeeId]: {
          ...makeInitialForm(),
          success: "Leave added and balance updated.",
          error: undefined,
        },
      }));
    } catch (err) {
      console.error(err);
      updateFormField(
        employeeId,
        "error",
        err instanceof Error ? err.message : "Failed to add leave entry."
      );
    } finally {
      updateFormField(employeeId, "loading", false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Noonan Leave Tracker
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Accrual is based on hire date and updates automatically to today.
              Data source:&nbsp;
              <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs">
                Google Sheet (Employees &amp; Leaves)
              </code>
              . Changes made here append rows to the Leaves sheet.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs text-slate-300">
            <span className="font-mono">Today: {isoToday}</span>
            <span>Accrual: 0.83 day / full month</span>
          </div>
        </header>

        {loading && (
          <div className="mb-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-slate-300">
            Loading employees…
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-rose-900/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="rounded-2xl bg-slate-900/60 p-4 shadow-lg ring-1 ring-slate-800">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Employees – Leave Overview</h2>
            <p className="text-xs text-slate-400 max-w-md">
              Leave accrues at 0.83 day per full month from hire date (with
              carryover). Employees can only use leave after 6 full months.
              Sheehan can record leave taken below to update balances.
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
                  const availableToUse = Number(emp.availableLeaveToUse ?? 0);

                  return (
                    <tr
                      key={emp.id}
                      className="rounded-xl bg-slate-900/80 align-top shadow-sm ring-1 ring-slate-800"
                    >
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{emp.fullName}</span>
                          <span className="text-xs text-slate-400">
                            ID: {emp.id}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-xs sm:text-sm">
                          {emp.position}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-xs sm:text-sm">
                        <div className="flex flex-col gap-0.5">
                          <span>Hire: {emp.hireDate}</span>
                          <span className="text-[11px] text-slate-400">
                            Tenure: {emp.tenureYears}y {emp.tenureMonths}m
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                          {accrued.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                          {taken.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            balance < 0
                              ? "bg-rose-500/10 text-rose-300"
                              : "bg-sky-500/10 text-sky-300"
                          }`}
                        >
                          {balance.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-xs sm:text-sm">
                        {emp.canUseLeave ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300">
                              Eligible
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Usable now:{" "}
                              <span className="font-mono">
                                {availableToUse.toFixed(2)}d
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-300">
                              Not eligible yet
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Full months so far: {emp.fullMonthsTenure}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-xs sm:text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-col gap-1">
                            <input
                              type="date"
                              className="w-full rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
                              value={form.date}
                              onChange={(e) =>
                                updateFormField(emp.id, "date", e.target.value)
                              }
                            />
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              placeholder="Days"
                              className="w-full rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
                              value={form.days}
                              onChange={(e) =>
                                updateFormField(emp.id, "days", e.target.value)
                              }
                            />
                            <select
                              className="w-full rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
                              value={form.type}
                              onChange={(e) =>
                                updateFormField(emp.id, "type", e.target.value)
                              }
                            >
                              <option value="Annual">Annual</option>
                              <option value="Sick">Sick</option>
                              <option value="Unpaid">Unpaid</option>
                              <option value="Other">Other</option>
                            </select>
                            <textarea
                              rows={2}
                              placeholder="Reason / note"
                              className="w-full resize-none rounded-md bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
                              value={form.note}
                              onChange={(e) =>
                                updateFormField(emp.id, "note", e.target.value)
                              }
                            />
                          </div>
                          <button
                            disabled={form.loading || !emp.canUseLeave}
                            onClick={() => handleAddLeave(emp.id)}
                            className={`mt-1 inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold ${
                              emp.canUseLeave
                                ? "bg-sky-600 hover:bg-sky-500 disabled:bg-sky-900"
                                : "bg-slate-700 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            {form.loading ? "Saving..." : "Add Leave"}
                          </button>
                          {form.error && (
                            <p className="text-[11px] text-rose-300">
                              {form.error}
                            </p>
                          )}
                          {form.success && (
                            <p className="text-[11px] text-emerald-300">
                              {form.success}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && employees.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-sm text-slate-400"
                    >
                      No employees found. Add them to the{" "}
                      <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs">
                        Employees
                      </code>{" "}
                      tab in the Google Sheet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[11px] text-slate-500">
            This tool uses a Google Sheet instead of a database. When Sheehan
            records leave here, the system appends to the{" "}
            <code>Leaves</code> sheet and recalculates all balances from hire
            date + accrual rules.
          </p>
        </section>
      </div>
    </main>
  );
}
