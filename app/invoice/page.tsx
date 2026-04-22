"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { formatPeso, isCutoffDay } from "@/lib/cutoff";
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
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit state
  const [leaveDays, setLeaveDays] = useState("0");
  const [recepPay, setRecepPay] = useState("0");
  const [hoursClaimed, setHoursClaimed] = useState("0");
  const [notes, setNotes] = useState("");
  const [editMode, setEditMode] = useState(false);

  const isAdmin = user?.role === "admin";
  const isMember = user?.role === "member";
  const onCutoff = isCutoffDay();
  const canAdminEdit = isAdmin && onCutoff && !data?.isFinalized;
  const canMemberEdit = isMember;

  const [adminEmpId, setAdminEmpId] = useState("");

  const fetchInvoice = useCallback(async (empId?: string) => {
    setLoading(true);
    const url = empId ? `/api/invoice/current?employeeId=${empId}` : "/api/invoice/current";
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json() as InvoiceResponse;
      setData(json);
      setLeaveDays(String(json.payslip.leaveDaysTaken ?? 0));
      setRecepPay(String(json.payslip.recepTaskPay ?? 0));
      setHoursClaimed(String(json.payslip.hoursClaimed ?? 0));
      setNotes(json.payslip.notes ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated") {
      if (isAdmin) { if (adminEmpId) void fetchInvoice(adminEmpId); }
      else void fetchInvoice();
    }
  }, [status, isAdmin, adminEmpId, fetchInvoice, router]);

  function getPreviewPayslip(): PayslipData | null {
    if (!data?.payslip) return null;
    const p = data.payslip;
    const recep = Number(recepPay) || 0;
    const claimed = Number(hoursClaimed) || 0;
    const leavD = Number(leaveDays) || 0;
    const leaveDeductions = leavD * p.hourlyRate * 7.5;
    const totalEarnings = p.adminTaskPay + recep + p.internetFee + p.medicalFee - leaveDeductions;
    const timeBankBalance = Math.round((p.timeBankTotal - claimed) * 100) / 100;
    return { ...p, recepTaskPay: recep, hoursClaimed: claimed, leaveDaysTaken: leavD, leaveDeductions, totalEarnings, timeBankBalance, notes };
  }

  async function handleFinalize() {
    if (!data) return;
    setSaving(true);
    setMessage(null);
    const employeeId = isAdmin ? data.payslip.employeeId : user?.employeeId;
    const res = await fetch("/api/invoice/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, leaveDaysTaken: Number(leaveDays), notes }),
    });
    const json = await res.json() as { error?: string };
    if (res.ok) {
      setMessage({ type: "success", text: "Payslip finalized and saved." });
      void fetchInvoice(isAdmin ? data.payslip.employeeId : undefined);
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
      body: JSON.stringify({
        recepTaskPay: Number(recepPay) || 0,
        hoursClaimed: Number(hoursClaimed) || 0,
        notes,
      }),
    });
    const json = await res.json() as { error?: string };
    setSubmitting(false);
    if (res.ok) {
      setMessage({ type: "success", text: "Edit request submitted! Awaiting admin approval." });
      void fetchInvoice();
    } else {
      setMessage({ type: "error", text: json.error ?? "Failed to submit request" });
    }
  }

  async function handleDownloadPdf() {
    const preview = getPreviewPayslip();
    if (!preview) return;
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/invoice/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      if (!res.ok) {
        setMessage({ type: "error", text: "PDF generation failed." });
        setDownloading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${preview.invoiceNo}-${preview.employeeName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage({ type: "error", text: "PDF generation failed." });
      console.error(e);
    }
    setDownloading(false);
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

  // Members can download only if their edit request is approved
  // Admins can always download
  const memberCanDownload = isAdmin || editStatus === "Approved";

  // Members can submit if: no request yet, or previous request was rejected
  const memberCanSubmit = isMember && (editStatus === null || editStatus === "Rejected");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* Nav */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.push(isAdmin ? "/" : "/dashboard")}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => router.push("/history")}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              History
            </button>
            {isAdmin && (
              <input
                type="text"
                placeholder="Employee ID"
                value={adminEmpId}
                onChange={(e) => setAdminEmpId(e.target.value)}
                className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-900"
              />
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
              <div className={`mb-4 rounded-2xl px-5 py-4 ring-1 ${
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
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                        Your request was rejected. You may edit and resubmit below.
                      </p>
                    )}
                    {editStatus === "Approved" && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        Your edits have been approved. You can now download your invoice.
                      </p>
                    )}
                    {editStatus === "Pending" && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Waiting for Sheehan to review your submission.
                      </p>
                    )}
                  </div>
                  <EditRequestBadge status={editRequest.status} />
                </div>
              </div>
            )}

            {/* Member edit form */}
            {canMemberEdit && memberCanSubmit && (
              <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Edit Invoice Fields
                  <span className="ml-2 text-xs font-normal text-slate-400">— submit for admin approval to unlock download</span>
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Recep Task Pay (₱)</label>
                    <input type="number" min={0} step={100} value={recepPay} onChange={(e) => setRecepPay(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Hours Claimed (time bank)</label>
                    <input type="number" min={0} step={0.5} value={hoursClaimed} onChange={(e) => setHoursClaimed(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Notes</label>
                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleSubmitEditRequest}
                    disabled={submitting}
                    className="rounded-lg bg-navy-700 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
                  >
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
              <div className="mb-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your edit request is pending review. You cannot modify it until Sheehan approves or rejects it.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div><span className="text-slate-400">Recep Pay:</span> <span className="font-mono font-medium">{formatPeso(editRequest?.recepTaskPay ?? 0)}</span></div>
                  <div><span className="text-slate-400">Hours Claimed:</span> <span className="font-mono font-medium">{editRequest?.hoursClaimed ?? 0}</span></div>
                  {editRequest?.notes && <div className="col-span-2 sm:col-span-1"><span className="text-slate-400">Notes:</span> <span className="font-medium">{editRequest.notes}</span></div>}
                </div>
              </div>
            )}

            {/* Invoice document */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
              {/* Header banner */}
              <div className="flex items-center justify-between bg-navy-700 px-6 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-navy-200">Noonan</p>
                  <p className="text-lg font-bold text-white">Service Provider Invoice</p>
                </div>
                <div className="text-right text-xs text-navy-200">
                  <p className="font-mono">Service Invoice no. {p.invoiceNo}</p>
                  <p>Date: {formatDateLong(p.invoiceDate)}</p>
                  <p>Service Provider Code: {p.serviceProviderCode}</p>
                </div>
              </div>

              <div className="p-6 space-y-0">
                {/* Info grid */}
                <div className="border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="border-r border-slate-200 px-4 py-2 text-xs dark:border-slate-700">
                      <span className="text-slate-500">Service Start Date:</span>{" "}
                      <span className="font-medium">{toDisplayDate(p.hireDate)}</span>
                    </div>
                    <div className="px-4 py-2 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="border-r border-slate-200 px-4 py-2 space-y-1 dark:border-slate-700">
                      <div className="text-xs"><span className="text-slate-500">Payment Period:</span>{" "}<span className="font-semibold">{p.cutoff.label}</span></div>
                      <div className="text-xs"><span className="text-slate-500">Payment Due Date:</span>{" "}<span className="font-medium">{toDisplayDate(p.cutoff.dueDate)}</span></div>
                      <div className="text-xs"><span className="text-slate-500">Hours Rendered:</span>{" "}<span className="font-medium">{p.hoursRendered} hours</span></div>
                      <div className="text-xs"><span className="text-slate-500">Hours Awarded for cut off:</span>{" "}<span className="font-medium">{p.hoursAwarded} hours</span></div>
                    </div>
                    <div className="px-4 py-2 space-y-1">
                      <div className="text-xs"><span className="text-slate-500">Service Provider:</span>{" "}<span className="font-semibold">{p.employeeName}</span></div>
                      <div className="text-xs"><span className="text-slate-500">Designation of Task:</span>{" "}<span className="font-medium">{p.position}</span></div>
                      <div className="text-xs"><span className="text-slate-500">Contract Value:</span>{" "}<span className="font-medium">{formatPeso(p.contractValue)}</span></div>
                      <div className="text-xs"><span className="text-slate-500">Department Assisted:</span>{" "}<span className="font-medium">{p.department}</span></div>
                    </div>
                  </div>
                </div>

                {/* Earnings table */}
                <table className="w-full border border-t-0 border-slate-200 text-xs dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-100 text-left dark:bg-slate-800">
                      <th className="px-3 py-2 font-semibold w-1/3">Earnings</th>
                      <th className="px-3 py-2 font-semibold">Notes</th>
                      <th className="px-3 py-2 font-semibold text-right">Hours</th>
                      <th className="px-3 py-2 font-semibold text-right">Rate</th>
                      <th className="px-3 py-2 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="px-3 py-2">Admin Task Pay:</td>
                      <td className="px-3 py-2 text-slate-400 text-[11px]">½ of contract value</td>
                      <td className="px-3 py-2 text-right font-mono">{p.hoursAwarded}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(p.hourlyRate)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatPeso(p.adminTaskPay)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-400">Recep Task</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(p.recepTaskPay)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Other Contract Clause</td>
                      <td className="px-3 py-2 text-slate-500">Internet fee</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(p.internetFee)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Other Contract Clause</td>
                      <td className="px-3 py-2 text-slate-500">Medical Fee</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(p.medicalFee)}</td>
                    </tr>
                    {p.leaveDeductions > 0 && (
                      <tr className="bg-amber-50 dark:bg-amber-900/20">
                        <td className="px-3 py-2 text-amber-700 dark:text-amber-300">Leave Deduction</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">{p.leaveDaysTaken}d taken</td>
                        <td className="px-3 py-2" /><td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right font-mono text-amber-700 dark:text-amber-300">-{formatPeso(p.leaveDeductions)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-100 font-bold dark:bg-slate-800">
                      <td className="px-3 py-2">Total Earnings:</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-navy-700 dark:text-navy-300">{formatPeso(p.totalEarnings)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Time bank */}
                <table className="w-full border border-t-0 border-slate-200 text-xs dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-100 text-left dark:bg-slate-800">
                      <th className="px-3 py-2 font-semibold w-1/2" />
                      <th className="px-3 py-2 font-semibold text-right">Contract Duration</th>
                      <th className="px-3 py-2 font-semibold text-right">Monthly</th>
                      <th className="px-3 py-2 font-semibold text-right">Total running balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="px-3 py-2">Time incentive award for Service Provider</td>
                      <td className="px-3 py-2 text-right font-mono">{p.contractDurationMonths}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.timeBankPerMonth}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.timeBankTotal}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-500">Hours Claimed</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono">{p.hoursClaimed}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="px-3 py-2">Time Bank Balance:</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-mono text-navy-700 dark:text-navy-300">{p.timeBankBalance}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Footer note */}
                <div className="border border-t-0 border-slate-200 px-4 py-3 dark:border-slate-700">
                  <p className="text-[10px] italic text-slate-500">
                    Note: Time incentive award is redeemable within the year as productivity promotion.
                  </p>
                  {p.notes && <p className="mt-1 text-[10px] text-slate-500">{p.notes}</p>}
                </div>
              </div>

              {/* Status bar */}
              <div className={`flex items-center gap-2 px-6 py-3 text-xs font-medium ${
                data?.isFinalized
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              }`}>
                <div className={`h-2 w-2 rounded-full ${data?.isFinalized ? "bg-emerald-500" : "bg-amber-500"}`} />
                {data?.isFinalized
                  ? `Finalized — saved ${data.savedAt ? new Date(data.savedAt).toLocaleString() : ""}`
                  : "Draft — not yet finalized"}
              </div>
            </div>

            {/* Download PDF button */}
            <div className="mt-4 flex items-center justify-end gap-3">
              {isMember && !memberCanDownload && (
                <p className="text-xs text-slate-400">
                  {editStatus === "Pending"
                    ? "Download unlocks after admin approval."
                    : "Submit your edits above for admin approval to download."}
                </p>
              )}
              <button
                onClick={handleDownloadPdf}
                disabled={downloading || !memberCanDownload}
                className="flex items-center gap-2 rounded-lg bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {downloading ? "Generating…" : "⬇ Download PDF"}
              </button>
            </div>

            {/* Member message */}
            {message && (
              <p className={`mt-3 text-xs text-center ${message.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                {message.text}
              </p>
            )}

            {/* Admin controls */}
            {isAdmin && (
              <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Admin Controls</h3>

                {!data?.isFinalized && (
                  <>
                    {canAdminEdit ? (
                      <>
                        <button onClick={() => setEditMode((v) => !v)}
                          className="mb-3 text-xs text-navy-600 underline dark:text-navy-300">
                          {editMode ? "Cancel edit" : "Edit leave deductions"}
                        </button>
                        {editMode && (
                          <div className="mb-4 space-y-3">
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Leave days taken this period</label>
                              <input type="number" min={0} step={0.5} value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)}
                                className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 dark:border-slate-700 dark:bg-slate-950" />
                              {Number(leaveDays) > 0 && p && (
                                <p className="mt-1 text-[11px] text-amber-500">
                                  Deduction: {formatPeso(Number(leaveDays) * p.hourlyRate * 7.5)}
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
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">Finalization is only available on cutoff days (15th or last day of month).</p>
                    )}
                  </>
                )}

                {data?.isFinalized && (
                  <div>
                    <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">This payslip is finalized.</p>
                    <button onClick={() => setEditMode((v) => !v)} className="text-xs text-navy-600 underline dark:text-navy-300">
                      {editMode ? "Cancel" : "Edit leave deductions"}
                    </button>
                    {editMode && (
                      <FinalizedLeaveEdit
                        payslipId={p.payslipId}
                        currentDays={p.leaveDaysTaken}
                        onSaved={() => { setEditMode(false); void fetchInvoice(isAdmin ? p.employeeId : undefined); }}
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
