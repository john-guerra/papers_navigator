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


# Short words that stay lowercase in Title Case ("Theory of Mind").
_MINOR_WORDS = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "via", "with"}


def _mixed_casing(spelling: str) -> bool:
    """True when words after the first, split at spaces and hyphens, mix Capitalized and lowercase
    ("Time-series Classification"); acronyms, mixed-case words and minor words don't count."""
    words = [w for w in re.split(r"[\s\-\u2010-\u2015]+", spelling)[1:] if w.isalpha()]
    words = [w for w in words if w.lower() not in _MINOR_WORDS]
    capitalized = any(w[0].isupper() and w[1:] == w[1:].lower() for w in words)
    return capitalized and any(w == w.lower() for w in words)


def _spelling_rank(spelling: str, count: int):
    """Consistent casing first (not "Time-series Classification"), then most used; ties: sentence
    case ("Design study"), then fewer capitals, then A–Z."""
    sentence_case = spelling[:1].isupper() and spelling[1:] == spelling[1:].lower()
    return (_mixed_casing(spelling), -count, not sentence_case, sum(c.isupper() for c in spelling), spelling)


def _canonical(spellings: dict[str, int]) -> str:
    """Pick the spacing/hyphen form ("multimodal" vs "multi-modal") by its uses in any casing,
    avoiding odd hyphen spacing ("Topology- based"); ties go to the form whose best spelling ranks
    first. Then pick that form's best casing."""
    forms: dict[str, dict[str, int]] = {}
    for spelling, count in spellings.items():
        forms.setdefault(spelling.casefold(), {})[spelling] = count

    def best(form):
        return min(form, key=lambda s: _spelling_rank(s, form[s]))

    def form_rank(form):
        top = best(form)
        return (bool(_ODD_HYPHEN.search(top)), -sum(form.values()), _spelling_rank(top, form[top]))

    return best(min(forms.values(), key=form_rank))


# A trailing run of dotted initials ("e.g.", "U.S.", "Vol. A.") keeps its final period.
_ABBREVIATION = re.compile(r"(?:^|\s)(?:\w\.)+$")
# Hyphens and dashes (after NFKC) plus whitespace: "Color map" ≡ "Colormap" ≡ "Color-map".
_SEPARATORS = re.compile(r"[\s\-‐-―−]+")
# A hyphen with a space on one side only, e.g. a line-break artifact ("Topology- based").
_ODD_HYPHEN = re.compile(r"\w- \w|\w -\w")
# The leading letters of a keyword ("human" in "human-AI interaction", "mRNA" in "mRNA vaccines").
_FIRST_LETTERS = re.compile(r"[^\W\d_]+")
# A fragment left over from splitting a list ("and Decision Making", "& design pattern"); all-caps
# "OR"/"AND" may be an acronym and is kept.
_LEADING_CONJUNCTION = re.compile(r"^(?:[Aa]nd|[Oo]r|&)\s+")
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
    of an abbreviation), a leading "and"/"or"/"&" and empty values."""
    cleaned = []
    for keyword in keywords or []:
        for part in unicodedata.normalize("NFKC", str(keyword)).split(";"):
            part = _LEADING_CONJUNCTION.sub("", _strip_trailing(" ".join(part.split())))
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
    canonical = {key: _canonical(group) for key, group in counts.items()}
    unified = []
    for paper in papers:
        keywords = list(dict.fromkeys(canonical[_group_key(k)] for k in paper["keywords"]))
        unified.append({**paper, "keywords": keywords})
    return unified
