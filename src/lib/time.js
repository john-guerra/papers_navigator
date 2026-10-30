const formatters = new Map();

function formatter(tz, options) {
  const key = tz + JSON.stringify(options);
  if (!formatters.has(key))
    formatters.set(
      key,
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...options }),
    );
  return formatters.get(key);
}

/** "YYYY-MM-DD" of an instant in the given timezone. */
export function dayKey(iso, tz) {
  return formatter(tz, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "HH:MM" (24h) of an instant in the given timezone. */
export function formatTime(iso, tz) {
  return formatter(tz, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "Tue Nov 10" for a "YYYY-MM-DD" day key. */
export function formatDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(",", "");
}
