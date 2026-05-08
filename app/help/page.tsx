"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/app/components/ThemeToggle";

type Section = {
  id: string;
  title: string;
  role: "admin" | "member" | "both";
  steps: { q: string; a: string }[];
};

const sections: Section[] = [
  // ── ADMIN ──────────────────────────────────────────────────────────────────
  {
    id: "admin-leave",
    title: "Leave Overview",
    role: "admin",
    steps: [
      {
        q: "How do I view all employees' leaves?",
        a: "Go to the Admin Dashboard and click the Leave Overview tab. All employees and their current leave balance, days taken, and accrual are listed here.",
      },
      {
        q: "How do I record a leave day for an employee?",
        a: "In the Leave Overview tab, find the employee row. Enter the leave date, number of days, and type, then click Save. This deducts from the payslip at the next cutoff.",
      },
      {
        q: "How does leave accrual work?",
        a: "Employees accrue 0.83 leave days per month (10 days/year). Accrual begins after 6 months of service. The balance shown is total accrued minus days taken.",
      },
    ],
  },
  {
    id: "admin-schedules",
    title: "Managing Schedules",
    role: "admin",
    steps: [
      {
        q: "How do I set a work schedule for an employee?",
        a: "Go to the Schedules tab. Enter the employee's ID, set their Start Time and End Time (HH:MM format), then click Save Schedule. The schedule is used to compute late arrivals and early departures.",
      },
      {
        q: "What happens if no schedule is set?",
        a: "Without a schedule, clock-in and clock-out times are recorded but no late/early tags or deductions are applied on the invoice.",
      },
      {
        q: "Is there a grace period for late arrivals?",
        a: "No. The system applies deductions from the first minute past the scheduled start time. Every late/early minute is deducted at the minute rate (hourlyRate ÷ 60).",
      },
    ],
  },
  {
    id: "admin-contracts",
    title: "Contract Configuration",
    role: "admin",
    steps: [
      {
        q: "How do I set a contract value for an employee?",
        a: "Go to the Contracts tab. Search or select the employee, enter their monthly Contract Value, Internet Fee, and Medical Fee (all monthly amounts), then save. The system automatically halves the fees for each bi-monthly cutoff.",
      },
      {
        q: "How is the Recep Task Pay calculated?",
        a: "It is always fixed at half the monthly Contract Value. Example: ₱45,000/month → ₱22,500 per cutoff. The displayed hourly rate auto-adjusts: ₱22,500 ÷ working hours (e.g. 82.5h) = ₱272.73.",
      },
      {
        q: "What are the allowance fees for?",
        a: "Internet Fee and Medical Fee are fixed monthly allowances (e.g. ₱2,500 each = ₱5,000/month). Per cutoff invoice, each appears as ₱1,250 (halved). These are stored as monthly values in the Contracts tab.",
      },
    ],
  },
  {
    id: "admin-editrequests",
    title: "Invoice Edit Requests",
    role: "admin",
    steps: [
      {
        q: "How do I approve or reject a member's edit request?",
        a: "Go to the Edit Requests tab. Pending requests are listed with the submitted time bank hours and notes. Click Approve to unlock the member's invoice PDF download, or Reject to send it back.",
      },
      {
        q: "What does the member edit?",
        a: "Members can only submit how many time bank hours they want to redeem in a given period, plus a notes field. The Recep Task Pay is fixed and cannot be changed by members.",
      },
      {
        q: "Can a member resubmit after rejection?",
        a: "Yes. Once rejected, the member's edit form becomes active again and they can submit a revised request.",
      },
    ],
  },
  {
    id: "admin-finalize",
    title: "Finalizing Payslips",
    role: "admin",
    steps: [
      {
        q: "When can I finalize a payslip?",
        a: "Finalization is only available on cutoff days — the 15th and the last day of each month. On those days, the Finalize button appears on the invoice page.",
      },
      {
        q: "What does finalizing do?",
        a: "It saves the current payslip data (earnings, deductions, time bank) to the Payslips Google Sheet. The payslip then appears in the History page and is locked from further changes (except leave day edits).",
      },
      {
        q: "Can I edit leave deductions after finalization?",
        a: "Yes. On the invoice page, admins can edit leave days even on a finalized payslip via the Edit leave deductions link.",
      },
    ],
  },
  // ── MEMBER ─────────────────────────────────────────────────────────────────
  {
    id: "member-clock",
    title: "Clocking In & Out",
    role: "member",
    steps: [
      {
        q: "How do I clock in?",
        a: "Open your Member Dashboard and click Clock In. The system records the current time. You can only clock in once per day.",
      },
      {
        q: "How do I clock out?",
        a: "Click Clock Out when your shift ends. The system records your clock-out time, marks your attendance status (On Time / Early Out), and completes the day's record.",
      },
      {
        q: "What if I forget to clock out?",
        a: "Contact your admin. They can record a manual or backfill entry for that day via the Admin panel.",
      },
      {
        q: "What do Late / Early Out badges mean?",
        a: "Late means your clock-in was after your scheduled start time. Early Out means you clocked out before your scheduled end time. These affect your invoice deductions.",
      },
    ],
  },
  {
    id: "member-invoice",
    title: "Viewing Your Invoice",
    role: "member",
    steps: [
      {
        q: "Where do I see my invoice?",
        a: "Click View & Edit Invoice from your dashboard, or navigate to /invoice. Your current period invoice is always available.",
      },
      {
        q: "Why is the Download / Print button disabled?",
        a: "You must first submit an edit request (even if you have no changes — just leave the time bank field at 0 and click Submit). The admin must approve it before your Print button unlocks.",
      },
      {
        q: "How do I submit an edit request?",
        a: "On the invoice page, fill in 'Time Bank Hours to Redeem' (how many of your accrued time bank hours you want to use this period) and any notes, then click Submit for Approval.",
      },
      {
        q: "How is my hourly rate calculated?",
        a: "Rate = (Contract Value ÷ 2) ÷ Working Hours in the period. For a ₱45,000 contract over 82.5 hours, the rate is ₱272.73/hour.",
      },
    ],
  },
  {
    id: "member-timebank",
    title: "Time Bank",
    role: "member",
    steps: [
      {
        q: "What is the Time Bank?",
        a: "You earn 0.83 hours per month of service (approximately 10 hours/year). This is a productivity incentive redeemable within the year.",
      },
      {
        q: "How do I redeem time bank hours?",
        a: "In your invoice edit request, enter the number of hours you want to redeem in the 'Time Bank Hours to Redeem' field. The balance shown is your total accrued hours minus any previously claimed hours.",
      },
      {
        q: "Can my time bank balance go negative?",
        a: "No. The system caps the hours you can claim to your current accrued balance.",
      },
    ],
  },
  {
    id: "member-deductions",
    title: "Deductions & Overtime",
    role: "member",
    steps: [
      {
        q: "How are late/early deductions calculated?",
        a: "Each minute late (clock-in after scheduled start) or early (clock-out before scheduled end) is deducted at your minute rate: hourlyRate ÷ 60. All late and early minutes across the cutoff period are summed.",
      },
      {
        q: "How does overtime pay work?",
        a: "You must work MORE than 1 full hour past your scheduled end time for OT to qualify. Only whole hours count. Example: scheduled end 4:30 PM, logout 6:15 PM = 1h 45min → only 1 hour of OT is approved.",
      },
      {
        q: "Why does overtime only count in whole hours?",
        a: "Noonan's OT policy requires exceeding the 1-hour threshold first, then approves only complete hours worked beyond that. Partial hours (e.g. 45 min extra) do not qualify.",
      },
    ],
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-noonan-lightgray dark:border-[#333] last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between py-4 text-left"
      >
        <span className="pr-4 text-sm font-medium text-black dark:text-noonan-cream">{q}</span>
        <span className={`mt-0.5 shrink-0 text-noonan-red transition-transform ${open ? "rotate-45" : ""}`}>
          ＋
        </span>
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-noonan-gray dark:text-noonan-warmgray">
          {a}
        </p>
      )}
    </div>
  );
}

export default function HelpPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  const [activeRole, setActiveRole] = useState<"admin" | "member">(isAdmin ? "admin" : "member");

  const filtered = sections.filter((s) => s.role === activeRole || s.role === "both");

  return (
    <main className="min-h-screen bg-noonan-cream text-black dark:bg-black dark:text-noonan-cream">
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push(isAdmin ? "/" : "/dashboard")}
              className="mb-4 text-xs text-noonan-gray hover:text-noonan-red dark:text-noonan-warmgray"
            >
              ← Back
            </button>
            <div className="mb-3 h-1 w-8 bg-noonan-red" />
            <h1 className="text-2xl font-bold tracking-tight">Help &amp; Procedures</h1>
            <p className="mt-1 text-sm text-noonan-gray dark:text-noonan-warmgray">
              Step-by-step guidance for using the Noonan tracker
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Role switcher — admins only */}
        {isAdmin && (
          <div className="mb-8 flex border border-noonan-lightgray dark:border-[#333]">
            {(["admin", "member"] as const).map((role) => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                  activeRole === role
                    ? "bg-noonan-red text-white"
                    : "bg-white text-noonan-gray hover:bg-noonan-lightgray dark:bg-[#111] dark:text-noonan-warmgray dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {role === "admin" ? "Admin Guide" : "Member Guide"}
              </button>
            ))}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-6">
          {filtered.map((section) => (
            <div key={section.id} className="border border-noonan-lightgray bg-white dark:border-[#333] dark:bg-[#111]">
              {/* Section header */}
              <div className="flex items-center gap-3 border-b border-noonan-lightgray bg-noonan-lightgray px-5 py-3 dark:border-[#333] dark:bg-[#1a1a1a]">
                <div className="h-3 w-1 bg-noonan-red" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-black dark:text-noonan-cream">
                  {section.title}
                </h2>
              </div>
              {/* FAQ items */}
              <div className="px-5">
                {section.steps.map((step, i) => (
                  <FAQItem key={i} q={step.q} a={step.a} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[11px] uppercase tracking-widest text-noonan-gray dark:text-noonan-warmgray">
          Noonan Real Estate Agency &copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
