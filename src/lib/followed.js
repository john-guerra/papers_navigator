const SEPARATOR = " · ";

const isEntry = (d) => d && typeof d.id === "string" && d.id.length > 0;

function joinReasons(a, b) {
  const parts = [a, b]
    .flatMap((r) => (r ? r.split(SEPARATOR) : []))
    .filter((r, i, all) => r && all.indexOf(r) === i);
  return parts.join(SEPARATOR);
}

function mergeLists(current, incoming) {
  const byId = new Map(current.map((d) => [d.id, { ...d }]));
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (existing) existing.reason = joinReasons(existing.reason, entry.reason);
    else byId.set(entry.id, { id: entry.id, reason: entry.reason ?? "", addedOn: entry.addedOn });
  }
  return [...byId.values()];
}

function parseList(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw new Error("invalid followed papers file: not JSON");
  }
  if (!Array.isArray(list) || !list.every(isEntry)) {
    throw new Error("invalid followed papers file: expected a list of {id, reason, addedOn}");
  }
  return list.map(({ id, reason = "", addedOn = new Date().toISOString() }) => ({
    id,
    reason,
    addedOn,
  }));
}

/**
 * Followed papers persisted in localStorage. Behaves like a reactive widget without UI:
 * `.value` is the list and every change dispatches `input`, so `Generators.input(store)`
 * works in Framework.
 */
export function createFollowedStore(conferenceId, storage = globalThis.localStorage) {
  const key = `papersNavigator:${conferenceId}:followed`;
  const store = new EventTarget();

  let value;
  try {
    value = parseList(storage?.getItem(key) ?? "[]");
  } catch {
    value = [];
  }

  const set = (next) => {
    value = next;
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Could not save followed papers", error);
    }
    store.dispatchEvent(new Event("input"));
  };

  Object.defineProperty(store, "value", { get: () => value });
  Object.assign(store, {
    add(papers, reason, now = new Date()) {
      const addedOn = now.toISOString();
      set(mergeLists(value, papers.map((p) => ({ id: p.id, reason, addedOn }))));
    },
    remove(ids) {
      const drop = new Set(ids);
      set(value.filter((d) => !drop.has(d.id)));
    },
    replace(list) {
      set(list.filter(isEntry).map((d) => ({ ...d })));
    },
    merge(list) {
      set(mergeLists(value, list.filter(isEntry)));
    },
    has(id) {
      return value.some((d) => d.id === id);
    },
    exportJSON() {
      return JSON.stringify(value, null, 2);
    },
    importJSON(text) {
      set(parseList(text));
    },
  });
  return store;
}

/** Joins followed entries with paper records; entries no longer in the program are `missing`. */
export function resolveFollowed(followed, papers) {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const items = [];
  const missing = [];
  for (const entry of followed) {
    const paper = byId.get(entry.id);
    if (paper) items.push({ ...paper, reason: entry.reason, addedOn: entry.addedOn });
    else missing.push(entry);
  }
  return { items, missing };
}
