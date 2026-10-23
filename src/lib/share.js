const PREFIX = "#follow=";
const VALID_ID = /^[A-Za-z0-9_-]+$/;

/** "#follow=<id>.<id>…" from short ids; "" when there is nothing to share. */
export function encodeShareHash(shortIds) {
  return shortIds.length ? PREFIX + shortIds.join(".") : "";
}

/** Short ids from a location hash; anything malformed is dropped. */
export function decodeShareHash(hash) {
  if (!hash?.startsWith(PREFIX)) return [];
  return hash
    .slice(PREFIX.length)
    .split(".")
    .filter((id) => VALID_ID.test(id));
}

export function resolveShortIds(shortIds, papers) {
  const byShortId = new Map(papers.map((p) => [p.shortId, p.id]));
  const ids = [];
  const unknown = [];
  for (const shortId of shortIds) {
    if (byShortId.has(shortId)) ids.push(byShortId.get(shortId));
    else unknown.push(shortId);
  }
  return { ids, unknown };
}

/** Share URL for the current page with the followed papers in the hash. */
export function shareUrl(followed, papers, base = location.href) {
  const shortIds = new Map(papers.map((p) => [p.id, p.shortId]));
  const url = new URL(base);
  url.search = "";
  url.hash = encodeShareHash(followed.map((d) => shortIds.get(d.id)).filter(Boolean));
  return url.toString();
}
