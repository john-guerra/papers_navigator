import { hashText } from "../myResearch.js";

/** Vector clocks: `{deviceId: counter}`. All functions return new objects. */

export function bump(v, device) {
  return { ...v, [device]: (v?.[device] ?? 0) + 1 };
}

/** "a" when a dominates b, "b" when b dominates a, "concurrent" when neither does. */
export function compare(a = {}, b = {}) {
  let aAhead = false;
  let bAhead = false;
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[d] ?? 0;
    const y = b[d] ?? 0;
    if (x > y) aAhead = true;
    else if (y > x) bAhead = true;
  }
  if (aAhead && bAhead) return "concurrent";
  if (aAhead) return "a";
  if (bAhead) return "b";
  return "equal";
}

export function join(a = {}, b = {}) {
  const out = { ...a };
  for (const [d, n] of Object.entries(b)) out[d] = Math.max(out[d] ?? 0, n);
  return out;
}

/** JSON with object keys sorted recursively; arrays keep their order. */
function stableJson(value) {
  if (Array.isArray(value))
    return `[${value.map((x) => stableJson(x) ?? "null").join(",")}]`;
  if (value && typeof value === "object") {
    const parts = [];
    for (const k of Object.keys(value).sort()) {
      const s = stableJson(value[k]);
      if (s !== undefined) parts.push(`${JSON.stringify(k)}:${s}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hash of a value, independent of key order. Two 32-bit FNV hashes (the second salted) plus the
 * length, so a missed change (= data loss) needs a collision on all three.
 */
export function stableHash(value) {
  const json = stableJson(value) ?? "undefined";
  return hashText(json) + hashText("\u0001" + json) + json.length.toString(36);
}
