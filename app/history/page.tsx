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
    <main className="min-h-screen bg-noonan-cream text-black dark:bg-black dark:text-noonan-cream">
      <div className="mx-auto max-w-4xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between border-b border-noonan-lightgray pb-6 dark:border-[#333]">
          <div>
            <div className="mb-3 h-1 w-8 bg-noonan-red" />
            <h1 className="text-xl font-bold tracking-tight">Payslip History</h1>
            <p className="mt-1 text-xs text-noonan-gray dark:text-noonan-warmgray">All finalized payslips per cutoff period</p>
          </div>
          <button
            onClick={() => router.push(isAdmin ? "/" : "/dashboard")}
            className="text-xs text-noonan-gray hover:text-noonan-red dark:text-noonan-warmgray dark:hover:text-noonan-red"
          >
            ← Back
          </button>
        </div>

        {isAdmin && (
          <div className="mb-5">
            <input
              type="text"
              placeholder="Filter by Employee ID…"
              value={filterEmpId}
              onChange={(e) => setFilterEmpId(e.target.value)}
              className="w-56 border border-noonan-lightgray bg-white px-3 py-2 text-xs text-black outline-none focus:border-noonan-red dark:border-[#333] dark:bg-[#111] dark:text-noonan-cream"
            />
          </div>
        )}

        {loading ? (
          <p className="text-sm text-noonan-gray">Loading…</p>
        ) : sorted.length === 0 ? (
          <div className="border border-noonan-lightgray bg-white p-8 text-center text-noonan-gray dark:border-[#333] dark:bg-[#111]">
            No payslips found yet. They appear here once finalized on a cutoff day.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((p) => (
              <div
                key={p.payslipId}
                className="border border-noonan-lightgray bg-white p-5 transition-colors hover:border-noonan-red dark:border-[#333] dark:bg-[#111] dark:hover:border-noonan-red"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      Invoice #{p.invoiceNo}
                      {isAdmin && (
                        <span className="ml-2 text-xs font-normal text-noonan-gray dark:text-noonan-warmgray">
                          — Emp: {p.employeeId}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-noonan-gray dark:text-noonan-warmgray">
                      Period: {p.periodFrom} → {p.periodTo}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-noonan-red">
                      {formatPeso(p.totalEarnings)}
                    </span>
                    <p className="mt-0.5 text-[10px] text-noonan-gray dark:text-noonan-warmgray">
                      Saved {p.savedAt ? new Date(p.savedAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-noonan-gray dark:text-noonan-warmgray sm:grid-cols-4">
                  <span>Hours: <span className="font-mono font-medium text-black dark:text-noonan-cream">{p.hoursRendered}h</span></span>
                  <span>Rate: <span className="font-mono font-medium text-black dark:text-noonan-cream">{formatPeso(p.hourlyRate)}/h</span></span>
                  <span>Task Pay: <span className="font-mono font-medium text-black dark:text-noonan-cream">{formatPeso(p.adminPay)}</span></span>
                  <span>Time Bank: <span className="font-mono font-medium text-black dark:text-noonan-cream">{p.timeBankBalance}</span></span>
                  <span>Internet: <span className="font-mono font-medium text-black dark:text-noonan-cream">{formatPeso(p.internetFee)}</span></span>
                  <span>Medical: <span className="font-mono font-medium text-black dark:text-noonan-cream">{formatPeso(p.medicalFee)}</span></span>
                  {p.leaveDeductions > 0 && (
                    <span className="col-span-2 text-amber-600 dark:text-amber-400">
                      Leave deduction: -{formatPeso(p.leaveDeductions)} ({p.leaveDaysTaken}d)
                    </span>
                  )}
                </div>

                {p.notes && (
                  <p className="mt-2 text-[11px] italic text-noonan-gray dark:text-noonan-warmgray">{p.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
