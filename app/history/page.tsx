"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/cutoff";
import type { SavedPayslipRow } from "@/lib/googleSheets";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string; employeeId?: string } | undefined;
  const isAdmin = user?.role === "admin";

  const [payslips, setPayslips] = useState<SavedPayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmpId, setFilterEmpId] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated") void fetch("/api/invoice/history")
      .then((r) => r.json())
      .then((d: unknown) => {
        setPayslips(Array.isArray(d) ? (d as SavedPayslipRow[]) : []);
        setLoading(false);
      });
  }, [status, router]);

  const displayed = filterEmpId
    ? payslips.filter((p) => p.employeeId === filterEmpId)
    : payslips;

  const sorted = [...displayed].sort((a, b) => b.periodFrom.localeCompare(a.periodFrom));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Payslip History</h1>
            <p className="text-xs text-slate-400 mt-0.5">All finalized payslips per cutoff period</p>
          </div>
          <button
            onClick={() => router.push(isAdmin ? "/" : "/dashboard")}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back
          </button>
        </div>

        {isAdmin && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Filter by Employee ID…"
              value={filterEmpId}
              onChange={(e) => setFilterEmpId(e.target.value)}
              className="w-56 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
            />
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl bg-slate-900 p-8 text-center text-slate-400 ring-1 ring-slate-800">
            No payslips found yet. They appear here once finalized on a cutoff day.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((p) => (
              <div
                key={p.payslipId}
                className="rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800 hover:ring-sky-700 transition-all"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      Invoice #{p.invoiceNo}
                      {isAdmin && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          — Emp: {p.employeeId}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Period: {p.periodFrom} → {p.periodTo}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-emerald-400">
                      {formatPeso(p.totalEarnings)}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Saved {p.savedAt ? new Date(p.savedAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
                  <span>Hours: <span className="text-slate-200 font-mono">{p.hoursRendered}h</span></span>
                  <span>Rate: <span className="text-slate-200 font-mono">{formatPeso(p.hourlyRate)}/h</span></span>
                  <span>Admin Pay: <span className="text-slate-200 font-mono">{formatPeso(p.adminPay)}</span></span>
                  <span>Time Bank: <span className="text-slate-200 font-mono">{p.timeBankBalance}</span></span>
                  <span>Internet: <span className="text-slate-200 font-mono">{formatPeso(p.internetFee)}</span></span>
                  <span>Medical: <span className="text-slate-200 font-mono">{formatPeso(p.medicalFee)}</span></span>
                  {p.leaveDeductions > 0 && (
                    <span className="col-span-2 text-amber-400">
                      Leave deduction: -{formatPeso(p.leaveDeductions)} ({p.leaveDaysTaken}d)
                    </span>
                  )}
                </div>

                {p.notes && (
                  <p className="mt-2 text-[11px] italic text-slate-500">{p.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
