"""Change report between two versions of a conference's papers.raw.json."""

# Schedule fields whose changes matter to attendees (abstract/author edits are not reported).
WATCHED_FIELDS = ["sessionId", "sessionName", "room", "start", "end", "sessionStart", "sessionEnd"]


def _summary(paper: dict) -> dict:
    return {"id": paper["id"], "title": paper.get("title")}


def diff_papers(old: list[dict] | None, new: list[dict]) -> dict:
    """Compare papers by id: added/removed items, changed schedule fields and added/removed links
    (by URL). `old` may be None when there is no previous file. Output follows `new`'s order."""
    old_by_id = {p["id"]: p for p in old or []}
    new_ids = {p["id"] for p in new}
    added, changed = [], []
    for paper in new:
        before = old_by_id.get(paper["id"])
        if before is None:
            added.append(_summary(paper))
            continue
        fields = {
            key: [before.get(key), paper.get(key)]
            for key in WATCHED_FIELDS
            if before.get(key) != paper.get(key)
        }
        old_urls = {link["url"] for link in before.get("links") or []}
        new_urls = {link["url"] for link in paper.get("links") or []}
        links_added = [link for link in paper.get("links") or [] if link["url"] not in old_urls]
        links_removed = [link for link in before.get("links") or [] if link["url"] not in new_urls]
        if fields or links_added or links_removed:
            changed.append(
                {
                    **_summary(paper),
                    "fields": fields,
                    "linksAdded": links_added,
                    "linksRemoved": links_removed,
                }
            )
    removed = [_summary(p) for p in old or [] if p["id"] not in new_ids]
    return {"added": added, "removed": removed, "changed": changed}


def format_changes(changes: dict) -> str:
    """Human-readable report of `diff_papers` output."""
    added, removed, changed = changes["added"], changes["removed"], changes["changed"]
    if not (added or removed or changed):
        return "No changes vs the previous papers.raw.json."
    counts = f"{len(added)} added, {len(removed)} removed, {len(changed)} changed"
    lines = [f"Changes vs the previous papers.raw.json: {counts}"]
    lines += [f"  + {p['id']} {p['title']}" for p in added]
    lines += [f"  - {p['id']} {p['title']}" for p in removed]
    for p in changed:
        lines.append(f"  ~ {p['id']} {p['title']}")
        lines += [f"      {key}: {old} → {new}" for key, (old, new) in p["fields"].items()]
        lines += [f"      + link {link['label']}: {link['url']}" for link in p["linksAdded"]]
        lines += [f"      - link {link['label']}: {link['url']}" for link in p["linksRemoved"]]
    return "\n".join(lines)
