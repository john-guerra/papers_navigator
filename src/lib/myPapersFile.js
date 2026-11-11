import { isEntry } from "./followed.js";
import { cleanNotes } from "./notes.js";
import { cleanRatings } from "./ratings.js";
import { cleanDisliked } from "./disliked.js";
import { cleanAttended } from "./attended.js";
import { STORES, splitKey } from "./sync/entries.js";

const DAMAGED = "This file's change history is damaged.";
const BAD_DEVICES = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function cleanSync(sync) {
  if (!isPlain(sync)) throw new Error(DAMAGED);
  const out = {};
  for (const [key, r] of Object.entries(sync)) {
    const ok =
      isPlain(r) &&
      isPlain(r.v) &&
      Object.entries(r.v).every(
        ([d, n]) => !BAD_DEVICES.has(d) && Number.isInteger(n) && n > 0,
      ) &&
      typeof r.t === "string" &&
      (r.deleted === undefined || r.deleted === true);
    if (!ok) throw new Error(DAMAGED);
    if (!key.includes("/") || !STORES.includes(splitKey(key)[0])) continue;
    out[key] = {
      v: { ...r.v },
      t: r.t,
      ...(r.deleted ? { deleted: true } : {}),
    };
  }
  return out;
}

/** "iPhone" | "iPad" | "Android" | "Mac" | "Windows" | "other device", for naming this device. */
export function deviceLabel(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? "";
  const platform = nav?.platform ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(platform) && nav.maxTouchPoints > 1) return "iPad";
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) return "Mac";
  if (/Win/.test(platform) || /Windows/.test(ua)) return "Windows";
  return "other device";
}

/**
 * My Papers export format v2: hand-added papers, watch rules and exceptions together (#49),
 * paper notes (#152, `{paperId: text}`, on any paper) and ratings (#203, `{paperId: 1..5}`);
 * older versions ignore the fields they don't know.
 */
export function exportMyPapers(
  {
    followed,
    rules = [],
    exceptions = [],
    notes = {},
    ratings = {},
    disliked = {},
    attended = {},
  },
  { device, deviceName, sync } = {},
) {
  const v3 = sync
    ? {
        device,
        deviceName,
        sync: Object.fromEntries(
          Object.entries(sync).map(([k, r]) => [
            k,
            { v: r.v, t: r.t, ...(r.deleted ? { deleted: true } : {}) },
          ]),
        ),
      }
    : {};
  return JSON.stringify(
    {
      version: sync ? 3 : 2,
      followed,
      rules,
      exceptions,
      notes,
      ratings,
      disliked,
      attended,
      ...v3,
    },
    null,
    2,
  );
}

/**
 * Note shown by Export when the file will carry private text, "My research" abstracts (#27) or
 * paper notes (#152): they stay out of share links, so the export is the one place they leave
 * the browser. "" when there are none.
 */
export function exportNote(
  rules = [],
  notes = {},
  ratings = {},
  attended = {},
) {
  const parts = [
    Object.keys(notes).length && "your notes",
    Object.keys(ratings).length && "your ratings",
    Object.keys(attended).length && "the papers you attended",
    rules.some((r) => r.research?.length) &&
      "the abstracts of your research topics",
  ].filter(Boolean);
  return parts.length ? `Includes ${parts.join(" and ")}` : "";
}

/**
 * Reads an exported My Papers file: v2 objects or the original plain list of followed papers.
 * Throws on anything else, so imports fail loudly instead of silently changing the list.
 */
export function parseMyPapersFile(text) {
  const data = JSON.parse(text);
  if (isPlain(data) && data.version > 3)
    throw new Error(
      "This file was made by a newer version of Papers Navigator. Reload the page and try again.",
    );
  const papers = Array.isArray(data) ? data : data?.followed;
  if (Array.isArray(papers) && !papers.every(isEntry))
    throw new Error("Some papers in this file are missing their id.");
  if (Array.isArray(data))
    return {
      followed: data,
      rules: [],
      exceptions: [],
      notes: {},
      ratings: {},
      disliked: {},
      attended: {},
    };
  if (data && Array.isArray(data.followed)) {
    let v3 = {};
    if (data.version === 3) {
      if (
        data.device !== undefined &&
        (typeof data.device !== "string" || data.device.length > 40)
      )
        throw new Error(DAMAGED);
      v3 = {
        version: 3,
        sync: cleanSync(data.sync),
        ...(data.device !== undefined ? { device: data.device } : {}),
        ...(typeof data.deviceName === "string"
          ? { deviceName: data.deviceName.slice(0, 40) }
          : {}),
      };
    }
    return {
      ...v3,
      followed: data.followed,
      rules: Array.isArray(data.rules) ? data.rules : [],
      exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
      notes: cleanNotes(data.notes),
      ratings: cleanRatings(data.ratings),
      disliked: cleanDisliked(data.disliked),
      attended: cleanAttended(data.attended),
    };
  }
  throw new Error("This file is not a My Papers export.");
}
