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
    # translation rows are only usable if BOTH event_id and _anchor resolve —
    # build_history joins on (event_id, _anchor). A translation file has an
    # _anchor column; the base details.csv does not (ai == -1) so that check
    # is skipped there.
    return (lambda row: ev(row) + "|" + dt(row),
            lambda row: _looks_broken(ev(row)) or (ai != -1 and _looks_broken(an(row))))


def _read(path):
    if not os.path.exists(path):
        return None, []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    return (rows[0], rows[1:]) if rows else (None, [])


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
    if check:
        if not os.path.exists(dest):
            return True
        with open(dest, encoding="utf-8-sig", newline="") as fh:
            return fh.read() != data
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        fh.write(data)
    return True


def main():
    check = "--check" in sys.argv[1:]
    have_src = os.path.isdir(os.path.join(SRC, "pre")) or os.path.isdir(os.path.join(SRC, "recent"))
    if not have_src:
        # First two-workbook sync hasn't run yet — the committed flat files are
        # still canonical. Nothing to do.
        print("merge_history: no pre/ or recent/ yet — flat CSVs left as-is.")
        return

    results = {f: _merge_one(f, check) for f in FILES}
    built = [f for f, v in results.items() if v is not None]
    changed = [f for f, v in results.items() if v]

    if check:
        print("merge_history --check: %d of %d flat file(s) would change"
              % (len(changed), len(built)))
        sys.exit(1 if changed else 0)

    hdr, ev = _read(os.path.join(SRC, "events.csv"))
    ci = hdr.index("id") if hdr and "id" in hdr else 0
    n = sum(1 for r in ev if r and len(r) > ci and r[ci].strip())
    print("merge_history: rebuilt %d flat file(s); %d events" % (len(built), n))


if __name__ == "__main__":
    main()
