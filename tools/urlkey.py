#!/usr/bin/env python3
"""
urlkey.py — the one definition of "the same URL".

`data/archived-links.json` is keyed on URLs. Four places have to agree on the
key or a lookup silently misses and a source shows as unarchived when it isn't:

  tools/archive_links.py   writes the keys
  tools/build_records.py   archive_of()      reads them for the war-crimes pages
  tools/build_history.py   archived_badge()  reads them for the event pages
  tools/regenerate.py      archived_url      reads them for data/events.json

They used to hold four copy-pasted expressions with three different behaviours
(regenerate.py was missing the .strip(); the portal's Apps Script stripped only
one trailing slash). Import from here instead. The portal's `setArchivedUrl`
keeps its own copy — it is JavaScript and cannot import this — so if the rule
below ever changes, change it there too; the comment there says so.

Stdlib-only and side-effect-free, like every other generator.
"""

__all__ = ["url_key"]


def url_key(url):
    """Canonical archive key for one URL.

    Trailing slashes and #fragments do not identify a different document, so
    they are dropped. Nothing else is touched — no lowercasing (paths are
    case-sensitive), no query-string stripping (the query is often the whole
    identity, e.g. youtube.com/watch?v=...), no scheme normalisation.
    """
    return (url or "").strip().rstrip("/").split("#")[0]
