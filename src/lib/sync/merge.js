import { bump, compare, join } from "./clock.js";
import { identity, splitKey } from "./entries.js";
import { UNRECORDED, isPlainObject, isSyncKey, isVector } from "./validate.js";

/**
 * Merge of an imported transfer file into this device's data. Pure: decides, per entry key,
 * what the file changes (`apply`) and what the person has to choose (`clashes`). No note text
 * is ever dropped without that choice. What changes is an entry's `identity`: when both sides
 * have the same one (a paper both follow, a talk both marked attended), this device keeps its
 * own metadata (reason, date, time) and only takes the version.
 */

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isNoteKey = (key) => splitKey(key)[0] === "note";

const later = (a = "", b = "") => (b > a ? b : a);

/** `{value}` or `{deleted: true}`, plus `v` and `t`. */
function side(value, deleted, v, t) {
  return deleted ? { deleted: true, v, t } : { value, v, t };
}

/**
 * This device's record of `key` (null when it has never had it), plus `unrecorded`: a live value
 * the meta doesn't describe (no record, a tombstone, or a different identity).
 */
function localSide(local, key) {
  const meta =
    own(local.meta, key) && isPlainObject(local.meta[key])
      ? local.meta[key]
      : null;
  const v = isVector(meta?.v) ? meta.v : {};
  const t = typeof meta?.t === "string" ? meta.t : "";
  if (own(local.entries, key) && local.entries[key] !== undefined) {
    const value = local.entries[key];
    const unrecorded =
      !meta || meta.deleted === true || meta.h !== identity(key, value);
    return { side: { value, v, t }, unrecorded };
  }
  if (meta?.deleted === true)
    return { side: { deleted: true, v, t }, unrecorded: false };
  return null;
}

/** The file's record of `key`, or null when it is missing or malformed. */
function incomingSide(incoming, key) {
  const r = incoming.sync[key];
  if (!isPlainObject(r) || !isVector(r.v) || typeof r.t !== "string")
    return null;
  if (r.deleted === true) return { deleted: true, v: r.v, t: r.t };
  if (!own(incoming.entries, key) || incoming.entries[key] === undefined)
    return null;
  return { value: incoming.entries[key], v: r.v, t: r.t };
}

const sameValue = (key, a, b) =>
  a.deleted || b.deleted
    ? !!a.deleted && !!b.deleted
    : identity(key, a.value) === identity(key, b.value);

const isNoteText = (key, s) =>
  isNoteKey(key) && !s.deleted && typeof s.value === "string";

/** The longer note when one starts with the other's whole (trimmed) text, else null. */
function prefixWinner(key, a, b) {
  if (!isNoteText(key, a) || !isNoteText(key, b)) return null;
  const x = a.value.trim();
  const y = b.value.trim();
  if (x.startsWith(y)) return a;
  if (y.startsWith(x)) return b;
  return null;
}

/** What applying `next` over `prev` (null = absent) means to the person. */
function kind(key, prev, next) {
  const had = prev && !prev.deleted;
  if (next.deleted) return had ? "removed" : null;
  if (!had) return "added";
  return sameValue(key, prev, next) ? "same" : "changed";
}

/**
 * @param local `{entries: {[key]: value}, meta: {[key]: {v, t, h, deleted?}}}`
 * @param incoming `{entries: {[key]: value}, sync: {[key]: {v, t, deleted?}}, device}`
 * @returns `{apply: {[key]: {value?, deleted?, v, t}}, clashes, counts}`
 */
export function mergeTransfer(local, incoming) {
  const apply = {};
  const clashes = [];
  const counts = { added: 0, changed: 0, removed: 0, same: 0 };
  const loc = {
    entries: isPlainObject(local?.entries) ? local.entries : {},
    meta: isPlainObject(local?.meta) ? local.meta : {},
  };
  const inc = {
    entries: isPlainObject(incoming?.entries) ? incoming.entries : {},
    sync: isPlainObject(incoming?.sync) ? incoming.sync : {},
  };

  for (const key of Object.keys(inc.sync)) {
    if (!isSyncKey(key)) continue;
    const theirs = incomingSide(inc, key);
    if (!theirs) continue;
    const found = localSide(loc, key);

    if (!found) {
      apply[key] = side(theirs.value, theirs.deleted, theirs.v, theirs.t);
      const k = kind(key, null, theirs);
      if (k) counts[k]++;
      continue;
    }

    const mine = found.side;
    // An unrecorded local change counts as one more event, so it can't be dominated.
    const order = compare(
      found.unrecorded ? bump(mine.v, UNRECORDED) : mine.v,
      theirs.v,
    );
    if (order === "a" || order === "equal") {
      counts.same++;
      continue;
    }
    if (order === "b") {
      // Same identity: only the version moves on (this device's metadata stays)
      const keep = !mine.deleted && sameValue(key, mine, theirs);
      apply[key] = keep
        ? { value: mine.value, v: theirs.v, t: theirs.t }
        : side(theirs.value, theirs.deleted, theirs.v, theirs.t);
      const k = kind(key, mine, theirs);
      if (k) counts[k]++;
      else counts.same++;
      continue;
    }

    // Concurrent.
    const v = join(mine.v, theirs.v);
    const t = later(mine.t, theirs.t);
    if (sameValue(key, mine, theirs)) {
      apply[key] = side(mine.value, mine.deleted, v, t);
      counts.same++;
      continue;
    }
    const winner = prefixWinner(key, mine, theirs);
    // An unrecorded local text kept under the joined vector might not dominate the file's, so
    // the other device could keep its shorter text: let the person choose (resolveClash bumps).
    if (winner && !(winner === mine && found.unrecorded)) {
      apply[key] = { value: winner.value, v, t };
      counts[winner === mine ? "same" : "changed"]++;
      continue;
    }
    clashes.push({ key, local: mine, incoming: theirs });
  }

  return { apply, clashes, counts };
}

/** Resolves a clash as the person chose: "local", "incoming" or "both" (note texts only). */
export function resolveClash(clash, choice, device) {
  const { key, local, incoming } = clash;
  const v = bump(join(local.v, incoming.v), device);
  const t = later(local.t, incoming.t);
  if (choice === "both") {
    if (!isNoteText(key, local) || !isNoteText(key, incoming))
      throw new Error(`"both" needs two note texts (${key})`);
    return { key, value: `${local.value}\n\n${incoming.value}`, v, t };
  }
  if (choice !== "local" && choice !== "incoming")
    throw new Error(`Unknown clash choice: ${choice}`);
  const s = choice === "local" ? local : incoming;
  return s.deleted
    ? { key, deleted: true, v, t }
    : { key, value: s.value, v, t };
}

/**
 * "Newest for all": the later `t` wins (ties keep local), except that two note texts are kept
 * both, and a note text always beats a deletion or a non-text.
 */
export function newestForAll(clashes, device) {
  return clashes.map((c) => {
    const mineText = isNoteText(c.key, c.local);
    const theirText = isNoteText(c.key, c.incoming);
    let choice;
    if (mineText && theirText) choice = "both";
    else if (mineText) choice = "local";
    else if (theirText) choice = "incoming";
    else
      choice = (c.incoming.t ?? "") > (c.local.t ?? "") ? "incoming" : "local";
    return resolveClash(c, choice, device);
  });
}
