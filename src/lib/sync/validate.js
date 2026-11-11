import { splitKey, STORES } from "./entries.js";

/** Validators shared by the merge and the My Papers file parser: files are untrusted. */
export const isPlainObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * Pseudo device standing for a local change the meta hasn't recorded. It only takes part in
 * `compare` (so such a change is never silently dominated) and is never stored or returned.
 * The leading "~" can't occur in a device id, and incoming vectors carrying it are rejected.
 */
export const UNRECORDED = "~unrecorded";
const BAD_DEVICES = new Set([
  "__proto__",
  "constructor",
  "prototype",
  UNRECORDED,
]);

export const isVector = (v) =>
  isPlainObject(v) &&
  Object.entries(v).every(
    ([d, n]) => !BAD_DEVICES.has(d) && Number.isInteger(n) && n > 0,
  );

export const isSyncKey = (key) =>
  key.includes("/") && STORES.includes(splitKey(key)[0]);
