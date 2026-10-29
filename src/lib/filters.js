const unique = (values) => [
  ...new Set(values.filter((v) => v != null && v !== "")),
];

/** Values of each facet for one paper (deduplicated within the paper). */
const ACCESSORS = {
  type: (p) => unique([p.type]),
  authors: (p) => unique((p.authors ?? []).map((a) => a.name)),
  affiliations: (p) => unique((p.authors ?? []).map((a) => a.affiliation)),
  keywords: (p) => unique(p.keywords ?? []),
  sessionName: (p) => unique([p.sessionName]),
};

/** Filter option name → facet key. */
const FILTER_FACETS = {
  types: "type",
  authors: "authors",
  affiliations: "affiliations",
  keywords: "keywords",
  sessions: "sessionName",
};

export function facetValues(papers, key) {
  const counts = new Map();
  for (const paper of papers) {
    for (const value of ACCESSORS[key](paper))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (a, b) =>
        b.count - a.count || String(a.value).localeCompare(String(b.value)),
    );
}

/** AND across facets, OR within a facet; empty or missing facets don't filter. */
export function applyFilters(papers, filters = {}) {
  const active = Object.entries(FILTER_FACETS)
    .filter(([name]) => filters[name]?.length)
    .map(([name, key]) => [new Set(filters[name]), ACCESSORS[key]]);
  return papers.filter((paper) =>
    active.every(([selected, accessor]) =>
      accessor(paper).some((v) => selected.has(v)),
    ),
  );
}

/** type → display name: its label if all papers of that type share one, else overrides[type] ?? type. */
export function typeNames(papers, overrides = {}) {
  const labels = new Map();
  for (const { type, typeLabel } of papers) {
    if (!labels.has(type)) labels.set(type, new Set());
    labels.get(type).add(typeLabel ?? type);
  }
  return new Map(
    [...labels].map(([type, set]) => [
      type,
      set.size === 1 ? [...set][0] : (overrides[type] ?? type),
    ]),
  );
}
