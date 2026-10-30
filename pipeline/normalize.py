"""Normalized paper format shared by every conference fetcher (spec §5.2)."""

import re
import unicodedata

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
    """Regular hyphen spacing first (not "Topology- based"), then most used; ties: sentence case
    ("Design study"), then fewer capitals, then A–Z."""
    sentence_case = spelling[:1].isupper() and spelling[1:] == spelling[1:].lower()
    odd_hyphen = bool(_ODD_HYPHEN.search(spelling))
    return (odd_hyphen, -count, not sentence_case, sum(c.isupper() for c in spelling), spelling)


# A trailing run of dotted initials ("e.g.", "U.S.", "Vol. A.") keeps its final period.
_ABBREVIATION = re.compile(r"(?:^|\s)(?:\w\.)+$")
# Hyphens and dashes (after NFKC) plus whitespace: "Color map" ≡ "Colormap" ≡ "Color-map".
_SEPARATORS = re.compile(r"[\s\-‐-―−]+")
# A hyphen with a space on one side only, e.g. a line-break artifact ("Topology- based").
_ODD_HYPHEN = re.compile(r"\w- \w|\w -\w")
# The leading letters of a keyword ("human" in "human-AI interaction", "mRNA" in "mRNA vaccines").
_FIRST_LETTERS = re.compile(r"[^\W\d_]+")
# A lone lowercase letter used as a variable ("k-means", "t-test"): don't capitalize it.
_VARIABLE_PREFIX = re.compile(r"^[a-z][\-‐]")


def _strip_trailing(part: str) -> str:
    while True:
        stripped = part.rstrip(",;: ")
        if stripped.endswith(".") and not _ABBREVIATION.search(stripped):
            stripped = stripped.rstrip(".")
        if stripped == part:
            return part
        part = stripped


def _clean_keywords(keywords) -> list[str]:
    """NFKC, split "a; b" lists, collapse whitespace, drop trailing punctuation (but not the period
    of an abbreviation) and empty values."""
    cleaned = []
    for keyword in keywords or []:
        for part in unicodedata.normalize("NFKC", str(keyword)).split(";"):
            part = _strip_trailing(" ".join(part.split()))
            if part:
                cleaned.append(part)
    return cleaned


def _group_key(keyword: str) -> str:
    """Spellings that differ only by case, hyphens/dashes or spaces share a key."""
    return _SEPARATORS.sub("", keyword.casefold())


def _capitalized(keyword: str) -> str:
    """Capitalize a lowercase first word ("data visualization" → "Data visualization", "human-AI
    interaction" → "Human-AI interaction") so labels look consistent. First words written in
    mixed case ("iPhone", "mRNA") and variable prefixes ("k-means", "t-SNE") are kept."""
    first = _FIRST_LETTERS.match(keyword)
    if not first or first.group() != first.group().lower() or _VARIABLE_PREFIX.match(keyword):
        return keyword
    return keyword[:1].upper() + keyword[1:]


def unify_keywords(papers: list[dict]) -> list[dict]:
    """Copies of `papers` with cleaned keywords; spellings differing only by case, hyphens or
    spaces share the most common one (deduped per paper). All-lowercase spellings count as their
    sentence-cased form, so a capitalized label always wins."""
    papers = [{**paper, "keywords": _clean_keywords(paper.get("keywords"))} for paper in papers]
    counts: dict[str, dict[str, int]] = {}
    for paper in papers:
        for keyword in paper["keywords"]:
            group = counts.setdefault(_group_key(keyword), {})
            spelling = _capitalized(keyword)
            group[spelling] = group.get(spelling, 0) + 1
    canonical = {
        key: min(group, key=lambda s: _spelling_rank(s, group[s])) for key, group in counts.items()
    }
    unified = []
    for paper in papers:
        keywords = list(dict.fromkeys(canonical[_group_key(k)] for k in paper["keywords"]))
        unified.append({**paper, "keywords": keywords})
    return unified
