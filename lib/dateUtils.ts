const AU_TZ = "Australia/Sydney";
const PH_TZ = "Asia/Manila";

function getTimeParts(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
  };
}

export function getAustralianDate(): string {
  return getTimeParts(AU_TZ).date;
}

export function getAustralianTime(): string {
  return getTimeParts(AU_TZ).time;
}

export function getAustralianNow(): Date {
  const { y, m, d } = getTimeParts(AU_TZ);
  return new Date(y, m - 1, d);
}

export function getPHDate(): string {
  return getTimeParts(PH_TZ).date;
}

export function getPHTime(): string {
  return getTimeParts(PH_TZ).time;
}
