/** What "Add N to My Papers" would do for the listed papers (DESIGN.md → Add bar). */
export function planAdd(papers, inMyPapers) {
  const fresh = papers.filter((p) => !inMyPapers.has(p.id));
  return { total: papers.length, fresh, already: papers.length - fresh.length };
}

/**
 * Reason recorded for papers added in bulk: the visible constraints, without the default
 * type selection (which narrows every view and would only add noise).
 */
export function selectionReason({
  query,
  authors = [],
  affiliations = [],
  keywords = [],
  sessions = [],
  types = [],
  defaultTypes = [],
  typeLabel = (t) => t,
  region = false,
}) {
  const isDefaultTypes =
    types.length === defaultTypes.length &&
    types.every((t) => defaultTypes.includes(t));
  return (
    [
      query && `🔍 ${query}`,
      authors.length && `👤 ${authors.join(", ")}`,
      affiliations.length && `🏫 ${affiliations.join(", ")}`,
      keywords.length && `Keyword: ${keywords.join(", ")}`,
      sessions.length && `Session: ${sessions.join(", ")}`,
      !isDefaultTypes &&
        types.length &&
        `Type: ${types.map(typeLabel).join(", ")}`,
      region && "Map region",
    ]
      .filter(Boolean)
      .join(" · ") || "All matching papers"
  );
}

/** Adds `fresh` with `reason`; the returned undo removes exactly those papers (and no others). */
export function addWithUndo(store, fresh, reason) {
  const ids = fresh.map((p) => p.id);
  store.add(fresh, reason);
  return () => store.remove(ids);
}
