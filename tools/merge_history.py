#!/usr/bin/env python3
"""
merge_history.py — concatenate the two era workbooks into the flat CSVs that
build_history.py / regenerate.py / archive_links.py read.

  Pages/Historical_Massacres/
    pre/*.csv       ← "Historical Events"          workbook (Nakba 1948 → 2022)
    recent/*.csv    ← "Historical Events (Ongoing)" workbook (Oct 2023 →)
    *.csv           ← GENERATED here — pre rows then recent rows, deduped on the
                      key column. Do NOT hand-edit; edit the sheets.

The split is by workbook now (was a derived split by date). `id` prefixes
(`hist*` vs `curr_*`) keep the two sets distinct, so a plain concat + dedupe
is safe.

Run before build_history.py.  `--check` exits 1 on drift.
"""
import csv, io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "Pages", "Historical_Massacres")

EVENT_FILES = ("events.csv", "events_ar.csv", "events_de.csv")
DETAIL_FILES = ("details.csv", "details_ar.csv", "details_de.csv")
FILES = EVENT_FILES + DETAIL_FILES
ERAS = ("pre", "recent")

# A rebuild that keeps less than this fraction of the rows the flat file
# already had is treated as source loss, not as an edit. Deleting a whole
# event is a handful of rows out of ~1,370; halving the file is a workbook
# that failed to export.
SHRINK_FLOOR = 0.5


class SourceLoss(Exception):
    """The era workbooks cannot account for what the flat CSVs already hold."""


ALLOW_SHRINK = False    # set from --allow-shrink in main()

# The two workbooks each self-count their `id` / `detail_id` from row 1, so
# those restart and collide across workbooks. Event ids carry a workbook prefix
# (`hist*` / `curr_*`) so `id` alone is unique; detail rows are keyed on the
# (prefixed event_id, detail_id) pair.
def _looks_broken(v):
    return (not v) or v.startswith("#") or v.lower() in ("#ref!", "#n/a", "#value!", "#name?")


# Returns (keyfn, dropfn). dropfn(row) → True to discard the row entirely
# (a detail row the copied workbook left as a #REF! formula after its base
# events were removed — it can't be joined to anything).
def _row_fns(fname, header):
    if fname in EVENT_FILES:
        i = header.index("id") if "id" in header else 0
        get = lambda row: row[i].strip() if 0 <= i < len(row) else ""
        return (get, lambda row: _looks_broken(get(row)))

    ei = header.index("event_id") if "event_id" in header else -1
    di = header.index("detail_id") if "detail_id" in header else -1
    ai = header.index("_anchor") if "_anchor" in header else -1
    def ev(row):
        return row[ei].strip() if 0 <= ei < len(row) else ""
    def dt(row):
        return row[di].strip() if 0 <= di < len(row) else ""
    def an(row):
        return row[ai].strip() if 0 <= ai < len(row) else ""
    # Translation rows are only usable if BOTH event_id and _anchor resolve —
    # build_history joins on (event_id, _anchor). A translation file has an
    # _anchor column; the base details.csv does not (ai == -1) so that check is
    # skipped there.
    #
    # Dedupe on the SAME key the consumer joins on. Deduping a translation file
    # on its own detail_id (a row-count formula that drifts) while
    # build_history.merge_translations joins on _anchor lets two rows with the
    # same _anchor both survive the merge — and merge_translations keeps
    # whichever it saw last, silently. The two keys must not drift apart.
    tkey = an if ai != -1 else dt
    return (lambda row: ev(row) + "|" + tkey(row),
            lambda row: _looks_broken(ev(row)) or (ai != -1 and _looks_broken(an(row))))


def _read(path):
    if not os.path.exists(path):
        return None, []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    return (rows[0], rows[1:]) if rows else (None, [])


def _count(path):
    """Non-blank data rows in a CSV, or 0 if it isn't there."""
    _, rows = _read(path)
    return sum(1 for r in rows if r and any((c or "").strip() for c in r))


def _era_rows(era, fname):
    """(the file exists, its non-blank row count) for one era's copy."""
    p = os.path.join(SRC, era, fname)
    return (os.path.exists(p), _count(p))


def preflight():
    """Refuse to rebuild from a half-present source set.

    Each era workbook syncs its six tabs as six separate commits and the build
    fires on every one of them, so a *stale* era is normal and harmless. An era
    going *missing* is not: `_merge_one` cannot tell "this workbook exported
    nothing" from "this workbook did not export", so it would rebuild the flat
    CSVs from the surviving era alone — and build_history.py, regenerate.py and
    build_sitemap.py would then delete every page, feed entry and sitemap URL
    belonging to the era that vanished, and the workflow would commit it.

    So: an era directory that exists must supply all six files with at least one
    real row each. An era directory that is absent entirely is fine (a workbook
    that has not had its first sync) and is reported, not enforced.

    Returns (present_eras, problems).
    """
    present, problems = [], []
    for era in ERAS:
        if not os.path.isdir(os.path.join(SRC, era)):
            print("merge_history: no %s/ directory yet — nothing to merge from it." % era)
            continue
        present.append(era)
        for f in FILES:
            exists, n = _era_rows(era, f)
            if not exists:
                problems.append("%s/%s is missing" % (era, f))
            elif n == 0:
                problems.append("%s/%s has no data rows" % (era, f))
    return present, problems


def _merge_one(fname, check):
    ph, pr = _read(os.path.join(SRC, "pre", fname))
    rh, rr = _read(os.path.join(SRC, "recent", fname))
    header = ph or rh
    if header is None:
        return None                       # no source for this file — leave it

    keyfn, dropfn = _row_fns(fname, header)
    seen, out = set(), []
    for row in pr + rr:
        if not row or not any((c or "").strip() for c in row):
            continue                       # trailing blank rows from the sheet
        if dropfn(row):
            continue                       # #REF! leftover — nothing to join it to
        k = keyfn(row)
        if k and k in seen:
            continue
        if k:
            seen.add(k)
        out.append(row)

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    w.writerows(out)
    data = buf.getvalue()

    dest = os.path.join(SRC, fname)

    # Second net, under preflight(): the source files are all present and
    # non-empty, but between them they no longer account for most of what the
    # flat file already held. That is a truncated export, not an edit.
    prev = _count(dest)
    if prev and len(out) < prev * SHRINK_FLOOR and not ALLOW_SHRINK:
        raise SourceLoss(
            "%s would drop from %d rows to %d (< %d%% kept). The era workbooks "
            "are present but one of them exported far less than last time. "
            "Fix the sync, or pass --allow-shrink if the deletion is real."
            % (fname, prev, len(out), int(SHRINK_FLOOR * 100)))

    if check:
        if not os.path.exists(dest):
            return True
        with open(dest, encoding="utf-8-sig", newline="") as fh:
            return fh.read() != data
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        fh.write(data)
    return True


def main():
    global ALLOW_SHRINK
    args = sys.argv[1:]
    check = "--check" in args
    ALLOW_SHRINK = "--allow-shrink" in args

    present, problems = preflight()
    if not present:
        # First two-workbook sync hasn't run yet — the committed flat files are
        # still canonical. Nothing to do.
        print("merge_history: no pre/ or recent/ yet — flat CSVs left as-is.")
        return
    if problems:
        print("merge_history: REFUSING to rebuild the flat CSVs — the era "
              "source set is incomplete:")
        for msg in problems:
            print("  - %s" % msg)
        print("  Rebuilding now would republish the site without that era. "
              "Re-run syncAll() for the affected workbook, then retry.")
        sys.exit(1)

    try:
        results = {f: _merge_one(f, check) for f in FILES}
    except SourceLoss as exc:
        print("merge_history: REFUSING to rebuild the flat CSVs — %s" % exc)
        sys.exit(1)

    built = [f for f, v in results.items() if v is not None]
    changed = [f for f, v in results.items() if v]

    if check:
        print("merge_history --check: %d of %d flat file(s) would change"
              % (len(changed), len(built)))
        sys.exit(1 if changed else 0)

    hdr, ev = _read(os.path.join(SRC, "events.csv"))
    ci = hdr.index("id") if hdr and "id" in hdr else 0
    n = sum(1 for r in ev if r and len(r) > ci and r[ci].strip())
    per_era = ", ".join("%s=%d" % (e, _era_rows(e, "events.csv")[1]) for e in present)
    print("merge_history: rebuilt %d flat file(s); %d events (%s)"
          % (len(built), n, per_era))


if __name__ == "__main__":
    main()
