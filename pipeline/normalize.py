"""Normalized paper format shared by every conference fetcher (spec §5.2)."""

FIELDS = [
    "id",
    "shortId",
    "type",
    "typeLabel",
    "title",
    "abstract",
    "authors",
    "keywords",
    "sessionId",
    "sessionName",
    "room",
    "start",
    "end",
    "sessionStart",
    "sessionEnd",
    "url",
    "links",
    "award",
]

LIST_FIELDS = {"authors", "keywords", "links"}


def normalize_record(record: dict) -> dict:
    """Return a record with exactly FIELDS; missing lists become [], other fields None."""
    return {
        key: record.get(key) if record.get(key) is not None else ([] if key in LIST_FIELDS else None)
        for key in FIELDS
    }


def _spelling_rank(spelling: str, count: int):
    """Most used first; ties: sentence case ("Design study"), then fewer capitals, then A–Z."""
    sentence_case = spelling[:1].isupper() and spelling[1:] == spelling[1:].lower()
    return (-count, not sentence_case, sum(c.isupper() for c in spelling), spelling)


def _clean_keywords(keywords) -> list[str]:
    """Split "a; b" lists, collapse whitespace, drop trailing punctuation and empty values."""
    cleaned = []
    for keyword in keywords or []:
        for part in str(keyword).split(";"):
            part = " ".join(part.split()).rstrip(".,;: ")
            if part:
                cleaned.append(part)
    return cleaned


def unify_keywords(papers: list[dict]) -> list[dict]:
    """Copies of `papers` with cleaned keywords; spellings differing only by case share the most
    common one (deduped per paper)."""
    papers = [{**paper, "keywords": _clean_keywords(paper.get("keywords"))} for paper in papers]
    counts: dict[str, dict[str, int]] = {}
    for paper in papers:
        for keyword in paper["keywords"]:
            group = counts.setdefault(keyword.lower(), {})
            group[keyword] = group.get(keyword, 0) + 1
    canonical = {
        key: min(group, key=lambda s: _spelling_rank(s, group[s])) for key, group in counts.items()
    }
    unified = []
    for paper in papers:
        keywords = list(dict.fromkeys(canonical[k.lower()] for k in paper["keywords"]))
        unified.append({**paper, "keywords": keywords})
    return unified
