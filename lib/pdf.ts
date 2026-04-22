import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PayslipData } from "./payslip";
import { formatPeso } from "./cutoff";

const NAVY = rgb(0.067, 0.165, 0.467);   // #112a77
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95);
const MID_GRAY = rgb(0.8, 0.8, 0.8);
const AMBER = rgb(0.87, 0.6, 0.05);

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

export async function generateInvoicePdf(p: PayslipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  let y = height - 20;
  const marginX = 36;
  const innerWidth = width - marginX * 2;

  // ── Header banner ──────────────────────────────────────────────────────────
  const bannerH = 62;
  page.drawRectangle({ x: marginX, y: y - bannerH, width: innerWidth, height: bannerH, color: NAVY });

  page.drawText("NOONAN", {
    x: marginX + 12, y: y - 18,
    font: bold, size: 8, color: rgb(0.7, 0.8, 0.95),
  });
  page.drawText("Service Provider Invoice", {
    x: marginX + 12, y: y - 32,
    font: bold, size: 14, color: WHITE,
  });

  // Right side of header
  page.drawText(`Service Invoice no. ${p.invoiceNo}`, {
    x: marginX + innerWidth - 180, y: y - 18,
    font: regular, size: 8, color: rgb(0.7, 0.8, 0.95),
  });
  page.drawText(`Date: ${formatDateLong(p.invoiceDate)}`, {
    x: marginX + innerWidth - 180, y: y - 30,
    font: regular, size: 8, color: rgb(0.7, 0.8, 0.95),
  });
  page.drawText(`Service Provider Code: ${p.serviceProviderCode}`, {
    x: marginX + innerWidth - 180, y: y - 42,
    font: regular, size: 8, color: rgb(0.7, 0.8, 0.95),
  });

  y -= bannerH;

  // ── Info grid (outer border) ───────────────────────────────────────────────
  const infoH = 60;
  page.drawRectangle({ x: marginX, y: y - infoH, width: innerWidth, height: infoH, borderColor: MID_GRAY, borderWidth: 0.5 });

  // Row 1: Service Start Date / (empty right)
  const row1Y = y - 14;
  page.drawText("Service Start Date:", { x: marginX + 6, y: row1Y, font: regular, size: 8, color: GRAY });
  page.drawText(toDisplayDate(p.hireDate), { x: marginX + 90, y: row1Y, font: bold, size: 8, color: DARK });

  // Vertical divider
  page.drawLine({ start: { x: marginX + innerWidth / 2, y: y }, end: { x: marginX + innerWidth / 2, y: y - infoH }, thickness: 0.5, color: MID_GRAY });
  // Horizontal divider between row1 and row2
  page.drawLine({ start: { x: marginX, y: y - 20 }, end: { x: marginX + innerWidth, y: y - 20 }, thickness: 0.5, color: MID_GRAY });

  // Row 2 left: Payment Period / Due Date / Hours
  const row2Y = y - 32;
  page.drawText("Payment Period:", { x: marginX + 6, y: row2Y, font: regular, size: 7.5, color: GRAY });
  page.drawText(truncate(p.cutoff.label, 32), { x: marginX + 75, y: row2Y, font: bold, size: 7.5, color: DARK });
  page.drawText("Payment Due Date:", { x: marginX + 6, y: row2Y - 10, font: regular, size: 7.5, color: GRAY });
  page.drawText(toDisplayDate(p.cutoff.dueDate), { x: marginX + 80, y: row2Y - 10, font: bold, size: 7.5, color: DARK });
  page.drawText("Hours Rendered:", { x: marginX + 6, y: row2Y - 20, font: regular, size: 7.5, color: GRAY });
  page.drawText(`${p.hoursRendered} hours`, { x: marginX + 72, y: row2Y - 20, font: bold, size: 7.5, color: DARK });

  // Row 2 right: Service Provider / Designation / Contract Value / Dept
  const halfX = marginX + innerWidth / 2 + 6;
  page.drawText("Service Provider:", { x: halfX, y: row2Y, font: regular, size: 7.5, color: GRAY });
  page.drawText(truncate(p.employeeName, 28), { x: halfX + 76, y: row2Y, font: bold, size: 7.5, color: DARK });
  page.drawText("Designation of Task:", { x: halfX, y: row2Y - 10, font: regular, size: 7.5, color: GRAY });
  page.drawText(truncate(p.position, 22), { x: halfX + 90, y: row2Y - 10, font: bold, size: 7.5, color: DARK });
  page.drawText("Contract Value:", { x: halfX, y: row2Y - 20, font: regular, size: 7.5, color: GRAY });
  page.drawText(formatPeso(p.contractValue), { x: halfX + 70, y: row2Y - 20, font: bold, size: 7.5, color: DARK });

  y -= infoH;

  // ── Earnings table header ──────────────────────────────────────────────────
  const colW = [innerWidth * 0.28, innerWidth * 0.22, innerWidth * 0.15, innerWidth * 0.13, innerWidth * 0.22];
  const cols = [marginX, marginX + colW[0], marginX + colW[0] + colW[1], marginX + colW[0] + colW[1] + colW[2], marginX + colW[0] + colW[1] + colW[2] + colW[3]];
  const rowH = 16;

  // Table header row
  page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, color: LIGHT_GRAY, borderColor: MID_GRAY, borderWidth: 0.5 });
  const headers = ["Earnings", "Notes", "Hours Rendered", "Rate", "Amount"];
  headers.forEach((h, i) => {
    const align = i >= 2 ? "right" : "left";
    const textW = bold.widthOfTextAtSize(h, 7.5);
    const tx = align === "right" ? cols[i] + colW[i] - textW - 4 : cols[i] + 4;
    page.drawText(h, { x: tx, y: y - rowH + 5, font: bold, size: 7.5, color: DARK });
  });

  // Column dividers for header
  for (let i = 1; i < cols.length; i++) {
    page.drawLine({ start: { x: cols[i], y }, end: { x: cols[i], y: y - rowH }, thickness: 0.5, color: MID_GRAY });
  }
  y -= rowH;

  // Earnings rows
  const earningsRows: Array<[string, string, string, string, string, boolean]> = [
    ["Admin Task Pay:", "", String(p.hoursAwarded), formatPeso(p.hourlyRate), formatPeso(p.adminTaskPay), false],
    ["Recep Task", "", "", "", formatPeso(p.recepTaskPay), false],
    ["Other Contract Clause", "Internet fee", "", "", formatPeso(p.internetFee), false],
    ["Other Contract Clause", "Medical Fee", "", "", formatPeso(p.medicalFee), false],
  ];

  if (p.leaveDeductions > 0) {
    earningsRows.push([
      "Leave Deduction",
      `${p.leaveDaysTaken}d taken`,
      "", "", `-${formatPeso(p.leaveDeductions)}`, true,
    ]);
  }

  for (const [label, note, hrs, rate, amount, isDeduction] of earningsRows) {
    page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, borderColor: MID_GRAY, borderWidth: 0.5 });
    if (isDeduction) page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, color: rgb(1, 0.98, 0.92) });
    const rowColor = isDeduction ? AMBER : DARK;
    page.drawText(label, { x: cols[0] + 4, y: y - rowH + 5, font: regular, size: 7.5, color: rowColor });
    if (note) page.drawText(note, { x: cols[1] + 4, y: y - rowH + 5, font: regular, size: 7.5, color: GRAY });
    if (hrs) {
      const tw = regular.widthOfTextAtSize(hrs, 7.5);
      page.drawText(hrs, { x: cols[2] + colW[2] - tw - 4, y: y - rowH + 5, font: regular, size: 7.5, color: DARK });
    }
    if (rate) {
      const tw = regular.widthOfTextAtSize(rate, 7.5);
      page.drawText(rate, { x: cols[3] + colW[3] - tw - 4, y: y - rowH + 5, font: regular, size: 7.5, color: DARK });
    }
    const amtW = bold.widthOfTextAtSize(amount, 7.5);
    page.drawText(amount, { x: cols[4] + colW[4] - amtW - 4, y: y - rowH + 5, font: isDeduction ? bold : regular, size: 7.5, color: rowColor });
    for (let i = 1; i < cols.length; i++) {
      page.drawLine({ start: { x: cols[i], y }, end: { x: cols[i], y: y - rowH }, thickness: 0.5, color: MID_GRAY });
    }
    y -= rowH;
  }

  // Total earnings row
  page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, color: LIGHT_GRAY, borderColor: MID_GRAY, borderWidth: 0.5 });
  page.drawText("Total Earnings:", { x: cols[0] + 4, y: y - rowH + 5, font: bold, size: 8, color: DARK });
  const totalW = bold.widthOfTextAtSize(formatPeso(p.totalEarnings), 9);
  page.drawText(formatPeso(p.totalEarnings), { x: cols[4] + colW[4] - totalW - 4, y: y - rowH + 5, font: bold, size: 9, color: NAVY });
  for (let i = 1; i < cols.length; i++) {
    page.drawLine({ start: { x: cols[i], y }, end: { x: cols[i], y: y - rowH }, thickness: 0.5, color: MID_GRAY });
  }
  y -= rowH + 4;

  // ── Time bank table ────────────────────────────────────────────────────────
  const tbColW = [innerWidth * 0.46, innerWidth * 0.18, innerWidth * 0.14, innerWidth * 0.22];
  const tbCols = [marginX, marginX + tbColW[0], marginX + tbColW[0] + tbColW[1], marginX + tbColW[0] + tbColW[1] + tbColW[2]];

  // Header
  page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, color: LIGHT_GRAY, borderColor: MID_GRAY, borderWidth: 0.5 });
  const tbHeaders = ["", "Contract Duration", "Monthly", "Total running balance awarded"];
  tbHeaders.forEach((h, i) => {
    if (!h) return;
    const tw = bold.widthOfTextAtSize(h, 7);
    const tx = tbCols[i] + tbColW[i] - tw - 4;
    page.drawText(h, { x: tx, y: y - rowH + 5, font: bold, size: 7, color: DARK });
  });
  for (let i = 1; i < tbCols.length; i++) {
    page.drawLine({ start: { x: tbCols[i], y }, end: { x: tbCols[i], y: y - rowH }, thickness: 0.5, color: MID_GRAY });
  }
  y -= rowH;

  // Time incentive row
  const tbRows: Array<[string, string, string, string, boolean]> = [
    ["Time incentive award for Service Provider", String(p.contractDurationMonths), String(p.timeBankPerMonth), String(p.timeBankTotal), false],
    ["Hours Claimed", "", "", String(p.hoursClaimed), false],
    ["Time Bank Balance:", "", "", String(p.timeBankBalance), true],
  ];

  for (const [label, dur, mo, total, isBold] of tbRows) {
    page.drawRectangle({ x: marginX, y: y - rowH, width: innerWidth, height: rowH, borderColor: MID_GRAY, borderWidth: 0.5 });
    page.drawText(label, { x: tbCols[0] + 4, y: y - rowH + 5, font: isBold ? bold : regular, size: 7.5, color: isBold ? DARK : GRAY });
    if (dur) {
      const tw = regular.widthOfTextAtSize(dur, 7.5);
      page.drawText(dur, { x: tbCols[1] + tbColW[1] - tw - 4, y: y - rowH + 5, font: regular, size: 7.5, color: DARK });
    }
    if (mo) {
      const tw = regular.widthOfTextAtSize(mo, 7.5);
      page.drawText(mo, { x: tbCols[2] + tbColW[2] - tw - 4, y: y - rowH + 5, font: regular, size: 7.5, color: DARK });
    }
    const totalFont = isBold ? bold : regular;
    const totalColor = isBold ? NAVY : DARK;
    const tw = totalFont.widthOfTextAtSize(total, 7.5);
    page.drawText(total, { x: tbCols[3] + tbColW[3] - tw - 4, y: y - rowH + 5, font: totalFont, size: 7.5, color: totalColor });
    for (let i = 1; i < tbCols.length; i++) {
      page.drawLine({ start: { x: tbCols[i], y }, end: { x: tbCols[i], y: y - rowH }, thickness: 0.5, color: MID_GRAY });
    }
    y -= rowH;
  }

  // ── Footer note ────────────────────────────────────────────────────────────
  y -= 6;
  page.drawRectangle({ x: marginX, y: y - 28, width: innerWidth, height: 28, borderColor: MID_GRAY, borderWidth: 0.5 });
  page.drawText(
    "Note: Time incentive award is redeemable within the year as productivity promotion.",
    { x: marginX + 6, y: y - 12, font: regular, size: 7, color: GRAY }
  );
  if (p.notes) {
    page.drawText(truncate(p.notes, 90), { x: marginX + 6, y: y - 22, font: regular, size: 7, color: GRAY });
  }

  return doc.save();
}
