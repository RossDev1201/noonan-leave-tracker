import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { TimeEntry } from "./googleSheets";

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  periodFrom: string;
  periodTo: string;
  employeeId: string;
  employeeName: string;
  position: string;
  entries: TimeEntry[];
  totalDays: number;
  totalHours: number;
};

const NAVY = rgb(0.067, 0.227, 0.537);
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const ROW_ALT = rgb(0.96, 0.97, 0.99);
const ROW_BASE = rgb(1, 1, 1);

export function buildInvoiceData(
  employeeId: string,
  employeeName: string,
  position: string,
  entries: TimeEntry[],
  month: string // YYYY-MM
): InvoiceData {
  const completed = entries.filter(
    (e) => e.logoutTime && e.date.startsWith(month)
  );

  const sorted = completed.sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((e) => e.date);

  const [year, mon] = month.split("-");
  const lastDay = new Date(Number(year), Number(mon), 0).getDate();

  return {
    invoiceNumber: `INV-${employeeId}-${month.replace("-", "")}`,
    invoiceDate: new Date().toISOString().slice(0, 10),
    periodFrom: `${month}-01`,
    periodTo: `${month}-${String(lastDay).padStart(2, "0")}`,
    employeeId,
    employeeName,
    position,
    entries: sorted,
    totalDays: sorted.length,
    totalHours: sorted.length * 7.5,
  };
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const M = 50; // left/right margin
  const colW = width - 2 * M;

  let y = height - 45;

  // ── Header ──────────────────────────────────────────────────────────────────
  page.drawText("NOONAN", { x: M, y, size: 28, font: bold, color: NAVY });
  page.drawText("SERVICE INVOICE", {
    x: width - M - 140,
    y: y + 4,
    size: 13,
    font: bold,
    color: NAVY,
  });

  y -= 18;
  page.drawText("Leave & Time Tracker", { x: M, y, size: 9, font: regular, color: GRAY });

  y -= 12;
  page.drawRectangle({ x: M, y, width: colW, height: 1.5, color: NAVY });

  y -= 22;

  // ── Invoice meta (right) + FROM (left) ──────────────────────────────────────
  const metaX = width - M - 210;
  const startY = y;

  page.drawText("Invoice No:", { x: metaX, y, size: 9, font: bold, color: GRAY });
  page.drawText(data.invoiceNumber, { x: metaX + 70, y, size: 9, font: regular, color: BLACK });

  y -= 14;
  page.drawText("Date:", { x: metaX, y, size: 9, font: bold, color: GRAY });
  page.drawText(data.invoiceDate, { x: metaX + 70, y, size: 9, font: regular, color: BLACK });

  y -= 14;
  page.drawText("Period:", { x: metaX, y, size: 9, font: bold, color: GRAY });
  page.drawText(`${data.periodFrom}  →  ${data.periodTo}`, {
    x: metaX + 70,
    y,
    size: 9,
    font: regular,
    color: BLACK,
  });

  // FROM block (left column)
  let leftY = startY;
  page.drawText("FROM", { x: M, y: leftY, size: 8, font: bold, color: GRAY });
  leftY -= 14;
  page.drawText(data.employeeName, { x: M, y: leftY, size: 13, font: bold, color: BLACK });
  leftY -= 14;
  page.drawText(`Employee ID: ${data.employeeId}`, { x: M, y: leftY, size: 9, font: regular, color: GRAY });
  leftY -= 12;
  page.drawText(data.position, { x: M, y: leftY, size: 9, font: regular, color: GRAY });

  y = Math.min(y, leftY) - 20;

  // ── Section divider ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y, width: colW, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  page.drawText("SERVICES RENDERED — TIME LOG", {
    x: M,
    y,
    size: 11,
    font: bold,
    color: NAVY,
  });
  y -= 6;

  // ── Table header row ─────────────────────────────────────────────────────────
  const ROW_H = 18;
  const COL = {
    date: M,
    login: M + 120,
    logout: M + 230,
    hours: M + 340,
    status: M + 420,
  };

  y -= ROW_H;
  page.drawRectangle({ x: M, y, width: colW, height: ROW_H, color: NAVY });

  const hY = y + 5;
  [
    [COL.date, "Date"],
    [COL.login, "Clock In"],
    [COL.logout, "Clock Out"],
    [COL.hours, "Hours"],
    [COL.status, "Status"],
  ].forEach(([x, label]) => {
    page.drawText(String(label), { x: Number(x) + 5, y: hY, size: 8, font: bold, color: WHITE });
  });

  // ── Table rows ───────────────────────────────────────────────────────────────
  for (let i = 0; i < data.entries.length; i++) {
    if (y < 120) break; // avoid overflow (pagination not implemented)

    const entry = data.entries[i];
    const bg = i % 2 === 0 ? ROW_BASE : ROW_ALT;

    y -= ROW_H;
    page.drawRectangle({ x: M, y, width: colW, height: ROW_H, color: bg });

    const rY = y + 5;
    page.drawText(entry.date, { x: COL.date + 5, y: rY, size: 8, font: regular, color: BLACK });
    page.drawText(entry.loginTime || "—", { x: COL.login + 5, y: rY, size: 8, font: regular, color: BLACK });
    page.drawText(entry.logoutTime || "—", { x: COL.logout + 5, y: rY, size: 8, font: regular, color: BLACK });
    page.drawText(
      entry.logoutTime ? `${entry.hoursWorked}h` : "—",
      { x: COL.hours + 5, y: rY, size: 8, font: regular, color: BLACK }
    );

    const isComplete = !!entry.logoutTime;
    const statusColor = isComplete ? rgb(0.1, 0.55, 0.25) : rgb(0.8, 0.4, 0.1);
    page.drawText(isComplete ? "Complete" : "Incomplete", {
      x: COL.status + 5,
      y: rY,
      size: 7,
      font: bold,
      color: statusColor,
    });
  }

  // ── Bottom border for table ──────────────────────────────────────────────────
  y -= 1;
  page.drawRectangle({ x: M, y, width: colW, height: 1, color: rgb(0.8, 0.8, 0.8) });

  y -= 25;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totX = width - M - 240;

  page.drawRectangle({ x: totX, y: y - 6, width: 240, height: 56, color: rgb(0.95, 0.97, 1) });

  page.drawText("Total Days Worked:", { x: totX + 10, y, size: 10, font: bold, color: BLACK });
  page.drawText(String(data.totalDays), {
    x: totX + 220,
    y,
    size: 10,
    font: bold,
    color: NAVY,
  });

  y -= 18;
  page.drawText("Total Hours (7.5h/day):", { x: totX + 10, y, size: 10, font: bold, color: BLACK });
  page.drawText(`${data.totalHours}h`, {
    x: totX + 220,
    y,
    size: 10,
    font: bold,
    color: NAVY,
  });

  y -= 18;
  page.drawText("Breaks excluded per day:", { x: totX + 10, y, size: 8, font: regular, color: GRAY });
  page.drawText("2×15min + 1hr lunch", { x: totX + 145, y, size: 8, font: regular, color: GRAY });

  y -= 30;

  // ── Note ─────────────────────────────────────────────────────────────────────
  page.drawText(
    "* Payable hours are calculated at 7.5 hours per completed working day, exclusive of all scheduled breaks.",
    { x: M, y, size: 7.5, font: regular, color: GRAY }
  );

  // ── Footer ────────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y: 28, width: colW, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
  page.drawText(`Generated by Noonan Leave Tracker  •  ${data.invoiceDate}`, {
    x: M,
    y: 16,
    size: 7.5,
    font: regular,
    color: GRAY,
  });

  return doc.save();
}
