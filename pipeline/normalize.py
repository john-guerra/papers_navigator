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
