export type CutoffPeriod = {
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
  dueDate: string;  // YYYY-MM-DD (cutoff end + 8 days)
  label: string;    // "01/03/2026 to 15/03/2026"
  period: 1 | 2;    // 1 = 1st–15th, 2 = 16th–end
};

export function getCurrentCutoff(date?: Date): CutoffPeriod {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const mm = String(month).padStart(2, "0");
  const yyyy = String(year);

  let from: string, to: string;
  let period: 1 | 2;

  if (day <= 15) {
    from = `${yyyy}-${mm}-01`;
    to = `${yyyy}-${mm}-15`;
    period = 1;
  } else {
    from = `${yyyy}-${mm}-16`;
    const lastDay = new Date(year, month, 0).getDate();
    to = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
    period = 2;
  }

  const due = new Date(to);
  due.setDate(due.getDate() + 8);

  return {
    from,
    to,
    dueDate: due.toISOString().slice(0, 10),
    label: `${toDisplay(from)} to ${toDisplay(to)}`,
    period,
  };
}

export function getCutoffForDate(isoDate: string): CutoffPeriod {
  const [y, m, d] = isoDate.split("-").map(Number);
  return getCurrentCutoff(new Date(y, m - 1, d));
}

export function isCutoffDay(date?: Date): boolean {
  const d = date ?? new Date();
  const day = d.getDate();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return day === 15 || day === lastDay;
}

export function toDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatPeso(amount: number): string {
  const abs = Math.abs(amount);
  const str = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return amount < 0 ? `-₱${str}` : `₱${str}`;
}
