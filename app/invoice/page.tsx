"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { formatPeso, getRecentCutoffs } from "@/lib/cutoff";
import type { CutoffPeriod } from "@/lib/cutoff";
import type { PayslipData } from "@/lib/payslip";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import type { InvoiceEditRequest } from "@/lib/googleSheets";

type InvoiceResponse = {
  payslip: PayslipData;
  isFinalized: boolean;
  savedAt?: string;
  editRequest: InvoiceEditRequest | null;
};

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

function EditRequestBadge({ status }: { status: "Pending" | "Approved" | "Rejected" }) {
  const styles = {
    Pending: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
    Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
    Rejected: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800",
  };
  const labels = { Pending: "⏳ Awaiting Approval", Approved: "✓ Approved", Rejected: "✗ Rejected" };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function InvoicePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string; employeeId?: string; name?: string } | undefined;

  const [data, setData] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit state
  const [leaveDays, setLeaveDays] = useState("0");
  const [hoursClaimed, setHoursClaimed] = useState("0");
  const [notes, setNotes] = useState("");
  const [editMode, setEditMode] = useState(false);

  const isAdmin = user?.role === "admin";
  const isMember = user?.role === "member";

  // Admin can always finalize (no cutoff day restriction)
  const canAdminEdit = isAdmin && !data?.isFinalized;
  const canMemberEdit = isMember;

  const [adminEmpId, setAdminEmpId] = useState("");

  // Period selector — admin can view/finalize past periods
  const recentCutoffs: CutoffPeriod[] = getRecentCutoffs(6);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");  // "from|to"

  const activeCutoff = selectedPeriod
    ? recentCutoffs.find((c) => `${c.from}|${c.to}` === selectedPeriod) ?? recentCutoffs[0]
    : recentCutoffs[0];

  const fetchInvoice = useCallback(async (empId?: string, cutoff?: CutoffPeriod) => {
    setLoading(true);
    let url = empId ? `/api/invoice/current?employeeId=${empId}` : "/api/invoice/current";
    if (cutoff) url += `${url.includes("?") ? "&" : "?"}periodFrom=${cutoff.from}&periodTo=${cutoff.to}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json() as InvoiceResponse;
      setData(json);
      setLeaveDays(String(json.payslip.leaveDaysTaken ?? 0));
      setHoursClaimed(String(json.payslip.hoursClaimed ?? 0));
      setNotes(json.payslip.notes ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated") {
      if (isAdmin) {
        if (adminEmpId) void fetchInvoice(adminEmpId, activeCutoff);
      } else {
        void fetchInvoice(undefined, activeCutoff);
      }
    }
  }, [status, isAdmin, adminEmpId, selectedPeriod, fetchInvoice, router]);

  function getPreviewPayslip(): PayslipData | null {
    if (!data?.payslip) return null;
    const p = data.payslip;
    const claimed = Number(hoursClaimed) || 0;
    const leavD = Number(leaveDays) || 0;
    const baseHourlyRate = p.contractValue > 0 ? p.contractValue / 150 : p.hourlyRate;
    const leaveDeductions = leavD * baseHourlyRate * 7.5;
    const totalEarnings = p.recepTaskPay + p.internetFee + p.medicalFee - leaveDeductions - p.attendanceDeductions + p.overtimePay;
    const timeBankBalance = Math.round((p.timeBankTotal - claimed) * 100) / 100;
    return { ...p, hoursClaimed: claimed, leaveDaysTaken: leavD, leaveDeductions, totalEarnings, timeBankBalance, notes };
  }

  async function handleFinalize() {
    if (!data) return;
    setSaving(true);
    setMessage(null);
    const employeeId = isAdmin ? data.payslip.employeeId : user?.employeeId;
    const res = await fetch("/api/invoice/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        leaveDaysTaken: Number(leaveDays),
        notes,
        periodFrom: activeCutoff.from,
        periodTo: activeCutoff.to,
      }),
    });
    const json = await res.json() as { error?: string };
    if (res.ok) {
      setMessage({ type: "success", text: "Payslip finalized and saved." });
      void fetchInvoice(isAdmin ? data.payslip.employeeId : undefined, activeCutoff);
      setEditMode(false);
    } else {
      setMessage({ type: "error", text: json.error ?? "Failed to save" });
    }
    setSaving(false);
  }

  async function handleSubmitEditRequest() {
    setSubmitting(true);
    setMessage(null);
    const res = await fetch("/api/invoice/submit-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoursClaimed: Number(hoursClaimed) || 0, notes }),
    });
    const json = await res.json() as { error?: string };
    setSubmitting(false);
    if (res.ok) {
      setMessage({ type: "success", text: "Edit request submitted! Awaiting admin approval." });
      void fetchInvoice(undefined, activeCutoff);
    } else {
      setMessage({ type: "error", text: json.error ?? "Failed to submit request" });
    }
  }

  function handleDownloadPdf() {
    window.print();
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  const p = getPreviewPayslip() ?? data?.payslip;
  const editRequest = data?.editRequest ?? null;
  const editStatus = editRequest?.status ?? null;

  const memberCanDownload = isAdmin || editStatus === "Approved";
  const memberCanSubmit = isMember && (editStatus === null || editStatus === "Rejected");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* Nav */}
        <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => router.push(isAdmin ? "/" : "/dashboard")}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            ← Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button onClick={() => router.push("/history")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
              History
            </button>

            {/* Period selector */}
            <select
              value={selectedPeriod}
              onChange={(e) => { setSelectedPeriod(e.target.value); setData(null); }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-noonan-red dark:border-slate-700 dark:bg-slate-900"
            >
              {recentCutoffs.map((c, i) => (
                <option key={c.from} value={`${c.from}|${c.to}`}>
                  {i === 0 ? "Current: " : ""}{c.label}
                </option>
              ))}
            </select>

            {isAdmin && (
              <input type="text" placeholder="Employee ID" value={adminEmpId}
                onChange={(e) => setAdminEmpId(e.target.value)}
                className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900" />
            )}
          </div>
        </div>

        {!p ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {isAdmin ? "Enter an employee ID above to view their invoice." : "No invoice data available."}
          </div>
        ) : (
          <>
            {/* Member edit request status banner */}
            {isMember && editRequest && (
              <div className={`print:hidden mb-4 rounded-2xl px-5 py-4 ring-1 ${
                editStatus === "Approved"
                  ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-800"
                  : editStatus === "Rejected"
                  ? "bg-rose-50 ring-rose-200 dark:bg-rose-900/20 dark:ring-rose-800"
                  : "bg-amber-50 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-800"
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Invoice Edit Request</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Submitted {new Date(editRequest.requestedAt).toLocaleString()}
                    </p>
                    {editStatus === "Rejected" && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Your request was rejected. You may edit and resubmit below.</p>
                    )}
                    {editStatus === "Approved" && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Your edits have been approved. You can now download your invoice.</p>
                    )}
                    {editStatus === "Pending" && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Waiting for Sheehan to review your submission.</p>
                    )}
                  </div>
                  <EditRequestBadge status={editRequest.status} />
                </div>
              </div>
            )}

            {/* Member edit form */}
            {canMemberEdit && memberCanSubmit && (
              <div className="print:hidden mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Edit Invoice Fields
                  <span className="ml-2 text-xs font-normal text-slate-400">— submit for admin approval to unlock download</span>
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Time Bank Hours to Redeem
                      {data?.payslip && (
                        <span className="ml-1 font-normal text-slate-400">(max: {data.payslip.timeBankTotal})</span>
                      )}
                    </label>
                    <input type="number" min={0} step={0.5}
                      max={data?.payslip?.timeBankTotal ?? undefined}
                      value={hoursClaimed}
                      onChange={(e) => setHoursClaimed(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Notes</label>
                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={handleSubmitEditRequest} disabled={submitting}
                    className="rounded-lg bg-navy-700 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
                    {submitting ? "Submitting…" : "Submit for Approval"}
                  </button>
                  {editStatus === "Rejected" && (
                    <span className="text-xs text-slate-400">Resubmitting will replace your previous request.</span>
                  )}
                </div>
              </div>
            )}

            {/* Pending — locked edit notice */}
            {isMember && editStatus === "Pending" && (
              <div className="print:hidden mb-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your edit request is pending review. You cannot modify it until Sheehan approves or rejects it.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div><span className="text-slate-400">Time Bank Redeem:</span> <span className="font-mono font-medium">{editRequest?.hoursClaimed ?? 0} hrs</span></div>
                  {editRequest?.notes && <div className="col-span-2 sm:col-span-1"><span className="text-slate-400">Notes:</span> <span className="font-medium">{editRequest.notes}</span></div>}
                </div>
              </div>
            )}

            {/* Invoice document */}
            <div className="overflow-hidden rounded-2xl shadow-xl" style={{ background: "#fef6e4" }}>

              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b-4 border-noonan-red" style={{ background: "#fef6e4" }}>
                <div>
                  <img src="/noonan-logo-red.svg" alt="Noonan Real Estate Agency" className="h-14 w-auto" />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[3px] text-noonan-gray">Service Provider Invoice</p>
                </div>
                <div className="text-right text-xs text-noonan-gray mt-1 space-y-0.5">
                  <p className="font-mono text-sm font-bold text-noonan-red">Service Invoice no. {p.invoiceNo}</p>
                  <p>Date: {formatDateLong(p.invoiceDate)}</p>
                  <p>Service Provider Code: {p.serviceProviderCode}</p>
                </div>
              </div>

              <div className="p-6 space-y-0">
                {/* Info grid */}
                <div className="border border-noonan-gray/30">
                  <div className="grid grid-cols-2 border-b border-noonan-gray/30">
                    <div className="border-r border-noonan-gray/30 px-4 py-2 text-xs">
                      <span className="text-noonan-gray">Service Start Date:</span>{" "}
                      <span className="font-semibold text-slate-800">{toDisplayDate(p.hireDate)}</span>
                    </div>
                    <div className="px-4 py-2 text-xs" />
                  </div>
                  <div className="grid grid-cols-2">
                    <div className="border-r border-noonan-gray/30 px-4 py-2 space-y-1">
                      <div className="text-xs"><span className="text-noonan-gray">Payment Period:</span>{" "}<span className="font-semibold text-slate-800">{p.cutoff.label}</span></div>
                      <div className="text-xs"><span className="text-noonan-gray">Payment Due Date:</span>{" "}<span className="font-medium text-slate-800">{toDisplayDate(p.cutoff.dueDate)}</span></div>
                      <div className="text-xs"><span className="text-noonan-gray">Hours Logged:</span>{" "}<span className="font-medium text-slate-800">{p.hoursRendered}h ({p.actualDaysWorked} days)</span></div>
                      <div className="text-xs text-noonan-gray/70"><span className="text-noonan-gray">Expected to Date:</span>{" "}<span className="font-medium text-slate-700">{p.hoursAwarded}h ({p.expectedDaysToDate} days)</span></div>
                    </div>
                    <div className="px-4 py-2 space-y-1">
                      <div className="text-xs"><span className="text-noonan-gray">Service Provider:</span>{" "}<span className="font-semibold text-slate-800">{p.employeeName}</span></div>
                      <div className="text-xs"><span className="text-noonan-gray">Designation of Task:</span>{" "}<span className="font-medium text-slate-800">{p.position}</span></div>
                      <div className="text-xs"><span className="text-noonan-gray">Contract Value:</span>{" "}<span className="font-medium text-slate-800">{formatPeso(p.contractValue)}</span></div>
                      <div className="text-xs"><span className="text-noonan-gray">Department Assisted:</span>{" "}<span className="font-medium text-slate-800">{p.department}</span></div>
                    </div>
                  </div>
                </div>

                {/* Earnings table */}
                <table className="w-full border border-t-0 border-noonan-gray/30 text-xs">
                  <thead>
                    <tr className="text-left" style={{ background: "#c42032" }}>
                      <th className="px-3 py-2 font-semibold text-white w-1/3">Earnings</th>
                      <th className="px-3 py-2 font-semibold text-white">Notes</th>
                      <th className="px-3 py-2 font-semibold text-white text-right">Hours</th>
                      <th className="px-3 py-2 font-semibold text-white text-right">Rate</th>
                      <th className="px-3 py-2 font-semibold text-white text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-noonan-gray/20">
                    <tr>
                      <td className="px-3 py-2 text-slate-800">Recep Task</td>
                      <td className="px-3 py-2 text-noonan-gray text-[11px]">prorated ({p.actualDaysWorked} of {p.expectedDaysToDate} days)</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.hoursRendered}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{formatPeso(p.hourlyRate)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{formatPeso(p.recepTaskPay)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-800">Other Contract Clause</td>
                      <td className="px-3 py-2 text-noonan-gray">Internet fee</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{formatPeso(p.internetFee)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-800">Other Contract Clause</td>
                      <td className="px-3 py-2 text-noonan-gray">Medical Fee</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{formatPeso(p.medicalFee)}</td>
                    </tr>
                    {p.overtimePay > 0 && (
                      <tr className="bg-emerald-50">
                        <td className="px-3 py-2 text-emerald-700">Overtime Pay</td>
                        <td className="px-3 py-2 text-emerald-600 text-[11px]">{p.otHours}h OT (≥1h past schedule)</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{p.otHours}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatPeso(p.hourlyRate)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">+{formatPeso(p.overtimePay)}</td>
                      </tr>
                    )}
                    {p.leaveDeductions > 0 && (
                      <tr className="bg-amber-50">
                        <td className="px-3 py-2 text-amber-700">Leave Deduction</td>
                        <td className="px-3 py-2 text-amber-600">{p.leaveDaysTaken}d taken</td>
                        <td className="px-3 py-2" /><td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right font-mono text-amber-700">-{formatPeso(p.leaveDeductions)}</td>
                      </tr>
                    )}
                    {p.attendanceDeductions > 0 && (
                      <tr className="bg-rose-50">
                        <td className="px-3 py-2 text-rose-700">Attendance Deduction</td>
                        <td className="px-3 py-2 text-rose-500 text-[11px]">{p.lateEarlyMinutes} min late/early</td>
                        <td className="px-3 py-2" /><td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right font-mono text-rose-700">-{formatPeso(p.attendanceDeductions)}</td>
                      </tr>
                    )}
                    <tr className="font-bold" style={{ background: "rgba(196,32,50,0.08)" }}>
                      <td className="px-3 py-2 text-slate-800">Total Earnings:</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-noonan-red">{formatPeso(p.totalEarnings)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Time bank */}
                <table className="w-full border border-t-0 border-noonan-gray/30 text-xs">
                  <thead>
                    <tr className="text-left" style={{ background: "#595959" }}>
                      <th className="px-3 py-2 font-semibold text-white w-1/2" />
                      <th className="px-3 py-2 font-semibold text-white text-right">Contract Duration</th>
                      <th className="px-3 py-2 font-semibold text-white text-right">Monthly</th>
                      <th className="px-3 py-2 font-semibold text-white text-right">Total running balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-noonan-gray/20">
                    <tr>
                      <td className="px-3 py-2 text-slate-800">Time incentive award for Service Provider</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.contractDurationMonths}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.timeBankPerMonth}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.timeBankTotal}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-noonan-gray">Hours Claimed</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-slate-800">{p.hoursClaimed}</td>
                    </tr>
                    <tr className="font-semibold" style={{ background: "rgba(196,32,50,0.08)" }}>
                      <td className="px-3 py-2 text-slate-800">Time Bank Balance:</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-noonan-red">{p.timeBankBalance}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Footer note */}
                <div className="border border-t-0 border-noonan-gray/30 px-4 py-3">
                  <p className="text-[10px] italic text-noonan-gray">
                    Note: Time incentive award is redeemable within the year as productivity promotion.
                  </p>
                  {p.notes && <p className="mt-1 text-[10px] text-noonan-gray">{p.notes}</p>}
                </div>
              </div>

              {/* Status bar */}
              <div className={`print:hidden flex items-center gap-2 px-6 py-3 text-xs font-medium ${
                data?.isFinalized ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                <div className={`h-2 w-2 rounded-full ${data?.isFinalized ? "bg-emerald-500" : "bg-amber-500"}`} />
                {data?.isFinalized
                  ? `Finalized — saved ${data.savedAt ? new Date(data.savedAt).toLocaleString() : ""}`
                  : `Draft — ${activeCutoff.label}`}
              </div>
            </div>

            {/* Print button */}
            <div className="print:hidden mt-4 flex items-center justify-end gap-3">
              {isMember && !memberCanDownload && (
                <p className="text-xs text-slate-400">
                  {editStatus === "Pending"
                    ? "Print unlocks after admin approval."
                    : "Submit your edits above for admin approval to print."}
                </p>
              )}
              <button onClick={handleDownloadPdf} disabled={!memberCanDownload}
                className="flex items-center gap-2 rounded-lg bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-40">
                🖨 Print / Save as PDF
              </button>
            </div>

            {/* Member message */}
            {message && (
              <p className={`print:hidden mt-3 text-xs text-center ${message.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                {message.text}
              </p>
            )}

            {/* Admin controls */}
            {isAdmin && (
              <div className="print:hidden mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">Admin Controls</h3>
                <p className="mb-3 text-xs text-slate-400">Period: {activeCutoff.label}</p>

                {!data?.isFinalized ? (
                  <>
                    <button onClick={() => setEditMode((v) => !v)}
                      className="mb-3 text-xs text-navy-600 underline dark:text-navy-300">
                      {editMode ? "Cancel edit" : "Edit leave deductions"}
                    </button>
                    {editMode && (
                      <div className="mb-4 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Leave days taken this period</label>
                          <input type="number" min={0} step={0.5} value={leaveDays}
                            onChange={(e) => setLeaveDays(e.target.value)}
                            className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                          {Number(leaveDays) > 0 && p && (
                            <p className="mt-1 text-[11px] text-amber-500">
                              Deduction: {formatPeso(Number(leaveDays) * (p.contractValue / 150) * 7.5)}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Notes</label>
                          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                            className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                        </div>
                      </div>
                    )}
                    <button onClick={handleFinalize} disabled={saving}
                      className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
                      {saving ? "Saving…" : "Finalize & Save Payslip"}
                    </button>
                    {message && (
                      <p className={`mt-2 text-xs ${message.type === "success" ? "text-emerald-600" : "text-rose-500"}`}>
                        {message.text}
                      </p>
                    )}
                  </>
                ) : (
                  <div>
                    <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">This payslip is finalized.</p>
                    <button onClick={() => setEditMode((v) => !v)} className="text-xs text-navy-600 underline dark:text-navy-300">
                      {editMode ? "Cancel" : "Edit leave deductions"}
                    </button>
                    {editMode && (
                      <FinalizedLeaveEdit
                        payslipId={p.payslipId}
                        currentDays={p.leaveDaysTaken}
                        onSaved={() => { setEditMode(false); void fetchInvoice(isAdmin ? p.employeeId : undefined, activeCutoff); }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function FinalizedLeaveEdit({ payslipId, currentDays, onSaved }: { payslipId: string; currentDays: number; onSaved: () => void }) {
  const [days, setDays] = useState(String(currentDays));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr("");
    const res = await fetch(`/api/invoice/${payslipId}/leaves`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaveDaysTaken: Number(days) }),
    });
    const json = await res.json() as { error?: string };
    setSaving(false);
    if (res.ok) onSaved();
    else setErr(json.error ?? "Failed");
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input type="number" min={0} step={0.5} value={days} onChange={(e) => setDays(e.target.value)}
        className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
      <button onClick={save} disabled={saving}
        className="rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
        {saving ? "…" : "Update"}
      </button>
      {err && <p className="text-xs text-rose-500">{err}</p>}
    </div>
  );
}
