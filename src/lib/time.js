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

const zoneLabels = new Map();

const zoneName = (tz, style) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style })
    .formatToParts(new Date())
    .find((d) => d.type === "timeZoneName")?.value ?? "";

/**
 * The conference timezone as written in the UI (DESIGN.md → Vocabulary): `label` from the
 * conference config when it sets one ("timezoneLabel"), else the zone's generic short code,
 * which is "ET" for US/Eastern all year (never "EST"/"EDT"). Where the generic name is a
 * country ("Germany Time"), the short abbreviation ("GMT+1") instead.
 */
export function zoneLabel(tz, label) {
  if (label) return label;
  if (!zoneLabels.has(tz)) {
    const generic = zoneName(tz, "shortGeneric");
    zoneLabels.set(
      tz,
      /^[A-Z]{1,5}$/.test(generic) ? generic : zoneName(tz, "short"),
    );
  }
  return zoneLabels.get(tz);
}

/** The zone label of a conference config: its `timezoneLabel`, else from its `timezone`. */
export function conferenceZone(conference) {
  return zoneLabel(conference.timezone, conference.timezoneLabel);
}

/** "Tue Nov 10 10:00 ET": an instant's day, time and zone in the conference timezone. */
export function formatWhen(iso, tz, label) {
  if (!iso) return "";
  const zone = zoneLabel(tz, label);
  return `${formatDay(dayKey(iso, tz))} ${formatTime(iso, tz)}${zone ? ` ${zone}` : ""}`;
}
