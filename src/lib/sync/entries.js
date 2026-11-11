import { cleanAttended } from "../attended.js";
import { cleanDisliked } from "../disliked.js";
import { cleanNotes } from "../notes.js";
import { cleanRatings } from "../ratings.js";
import { normalizeRule } from "../rules.js";

/** The stores a transfer syncs; an entry key is `<store>/<id>` (the id may contain ":" or "/"). */
export const STORES = [
  "followed",
  "rule",
  "exception",
  "note",
  "rating",
  "disliked",
  "attended",
];

export const keyOf = (store, id) => `${store}/${id}`;

/** Splits at the first "/" only. */
export function splitKey(key) {
  const i = key.indexOf("/");
  return [key.slice(0, i), key.slice(i + 1)];
}

const RULE_FIELDS = ["type", "value", "threshold", "level", "research"];

function ruleValue(rule) {
  const out = {};
  for (const f of RULE_FIELDS) if (rule[f] !== undefined) out[f] = rule[f];
  return out;
}

/** Flattens the state of every store into `{key: value}`, dropping derived fields. */
export function toEntries({
  followed = [],
  rules = [],
  exceptions = [],
  notes = {},
  ratings = {},
  disliked = {},
  attended = {},
} = {}) {
  const out = {};
  for (const f of followed ?? []) {
    if (f?.id)
      out[keyOf("followed", f.id)] = {
        reason: f.reason ?? "",
        addedOn: f.addedOn,
      };
  }
  for (const r of rules ?? []) {
    const n = normalizeRule(r);
    if (!n) continue;
    out[keyOf("rule", r.id ?? n.id)] = ruleValue(n);
  }
  for (const id of exceptions ?? []) out[keyOf("exception", id)] = true;
  for (const [id, v] of Object.entries(cleanNotes(notes)))
    out[keyOf("note", id)] = v;
  for (const [id, v] of Object.entries(cleanRatings(ratings)))
    out[keyOf("rating", id)] = v;
  for (const [id, v] of Object.entries(cleanDisliked(disliked)))
    out[keyOf("disliked", id)] = v;
  for (const [id, v] of Object.entries(cleanAttended(attended)))
    out[keyOf("attended", id)] = v;
  return out;
}

/** The inverse of `toEntries`, in key order. */
export function fromEntries(entries = {}) {
  const out = {
    followed: [],
    rules: [],
    exceptions: [],
    notes: {},
    ratings: {},
    disliked: {},
    attended: {},
  };
  for (const [key, value] of Object.entries(entries)) {
    const [store, id] = splitKey(key);
    if (store === "followed")
      out.followed.push({
        id,
        reason: value.reason ?? "",
        addedOn: value.addedOn,
      });
    else if (store === "rule") out.rules.push({ id, ...value });
    else if (store === "exception") out.exceptions.push(id);
    else if (store === "note") out.notes[id] = value;
    else if (store === "rating") out.ratings[id] = value;
    else if (store === "disliked") out.disliked[id] = value;
    else if (store === "attended") out.attended[id] = value;
  }
  return out;
}
