#!/usr/bin/env python3
"""
archive_links.py — snapshot every external source URL to the Wayback Machine.

READS   Pages/Historical_Massacres/details.csv        (source_link)
        Pages/War_Crimes_Stats/**/*_incidents.csv      (source_url_1/2, video_url)
        Pages/War_Crimes_Stats/**/*-resources.csv       (url)
WRITES  data/archived-links.json                        { "<url>": {...} }

Per URL:
  1. CDX check — http://web.archive.org/cdx/search/cdx — is there already a
     capture? (fast, no auth). If so, record it and move on.
  2. Otherwise POST to Save Page Now (https://web.archive.org/save/). With the
     IA_ACCESS / IA_SECRET S3 keys this is authenticated and gets a higher rate
     limit. We do NOT poll the job — the next run's CDX check picks up the
     snapshot once it lands.

State (`status`):
  archived  — a capture exists; `wayback` is the snapshot URL, `ts` its 14-digit
              timestamp, `checked` the date we last confirmed it
  requested — a /save/ was submitted; `requested` is the date
  failed    — the submit errored; retried next run

Usage:
  python tools/archive_links.py [--limit N] [--stale-days D]
                               [--time-budget S] [--sample N] [--check]
    --limit        max NEW /save/ submissions this run (default 50). `--limit 0`
                   = CDX-confirm only, submit nothing (fast, good for a first
                   pass). CDX checks always run for every URL reached.
    --stale-days   re-confirm an `archived` entry only if older than this
                   (default 180). Snapshots don't disappear, so this is rare.
    --time-budget  stop the loop cleanly after S seconds and write progress;
                   the URLs not reached carry to the next run (state is keyed
                   per URL, so nothing is redone). 0 = no limit (default).
    --sample N     only look at the first N URLs (local testing).
    --check        report what would happen, write nothing.

Social media (x.com, facebook.com, instagram.com, tiktok.com) frequently
captures as a login wall — the entry still records, flagged `social: true`,
so a human can archive.today those by hand.
"""
import csv, glob, json, os, re, sys, time, datetime, urllib.parse, urllib.request
import concurrent.futures as _cf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE = os.path.join(ROOT, "data", "archived-links.json")
TODAY = datetime.date.today().isoformat()

CDX = "http://web.archive.org/cdx/search/cdx"
SAVE = "https://web.archive.org/save/"
UA = "PalGenoPedia-archiver/1.0 (+https://palgenopedia.org)"

SOCIAL = ("x.com", "twitter.com", "facebook.com", "fb.com", "instagram.com",
          "tiktok.com", "threads.net")

SKIP_HOSTS = ("web.archive.org", "archive.org", "archive.ph", "archive.today",
              "palgenopedia.org", "localhost")


def collect_urls():
    urls = set()

    def add(val):
        for u in re.split(r"[\s;,]+", (val or "").strip()):
            u = u.strip().rstrip("/").split("#")[0]
            if not u.lower().startswith(("http://", "https://")):
                continue
            host = urllib.parse.urlparse(u).netloc.lower().lstrip("www.")
            if any(host == h or host.endswith("." + h) for h in SKIP_HOSTS):
                continue
            urls.add(u)

    def rows(path):
        with open(path, encoding="utf-8-sig", newline="") as fh:
            return list(csv.DictReader(fh))

    p = os.path.join(ROOT, "Pages", "Historical_Massacres", "details.csv")
    if os.path.exists(p):
        for r in rows(p):
            add(r.get("source_link"))
    for f in glob.glob(os.path.join(ROOT, "Pages/War_Crimes_Stats/**/*_incidents.csv"), recursive=True):
        for r in rows(f):
            add(r.get("source_url_1")); add(r.get("source_url_2")); add(r.get("video_url"))
    for f in glob.glob(os.path.join(ROOT, "Pages/War_Crimes_Stats/**/*-resources.csv"), recursive=True):
        for r in rows(f):
            add(r.get("url"))
    return sorted(urls)


def _get(url, headers=None, data=None, timeout=45):
    req = urllib.request.Request(url, data=data,
                                 headers={"User-Agent": UA, **(headers or {})},
                                 method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.getcode(), r.read().decode("utf-8", "replace")


def cdx_latest(url):
    """Most recent capture timestamp, or None (no capture *or* the API failed).

    The CDX endpoint throttles hard under a few hundred sequential requests, so
    a short timeout with a couple of backoff retries beats one long hang — a
    30s stall per URL is what turned the seeding run into a 4-hour job."""
    q = "%s?url=%s&output=json&limit=-1&fl=timestamp,statuscode&filter=statuscode:200" % (
        CDX, urllib.parse.quote(url, safe=""))
    for attempt in range(3):
        try:
            code, body = _get(q, timeout=12)
            rows = json.loads(body) if body.strip() else []
            return rows[-1][0] if len(rows) >= 2 else None   # [header, row]
        except Exception:
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    return None


def save_now(url, auth):
    hdr = {"Accept": "application/json"}
    if auth:
        hdr["Authorization"] = auth
    data = urllib.parse.urlencode({"url": url}).encode()
    code, body = _get(SAVE, headers=hdr, data=data, timeout=60)
    try:
        return json.loads(body)
    except Exception:
        return {"raw_status": code}


def main():
    args = sys.argv[1:]
    check = "--check" in args
    limit = 50
    stale = 180
    sample = 0
    budget = 0            # seconds; 0 = no limit
    for i, a in enumerate(args):
        if a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
        if a == "--stale-days" and i + 1 < len(args):
            stale = int(args[i + 1])
        if a == "--sample" and i + 1 < len(args):
            sample = int(args[i + 1])
        if a == "--time-budget" and i + 1 < len(args):
            budget = int(args[i + 1])

    access = os.environ.get("IA_ACCESS", "").strip()
    secret = os.environ.get("IA_SECRET", "").strip()
    auth = "LOW %s:%s" % (access, secret) if access and secret else None
    if not auth:
        print("  note: no IA_ACCESS / IA_SECRET — Save Page Now runs unauthenticated (lower rate limit)")

    state = {}
    if os.path.exists(STATE):
        state = json.load(open(STATE, encoding="utf-8"))

    urls = collect_urls()
    if sample:
        urls = urls[:sample]
    stale_before = (datetime.date.today() - datetime.timedelta(days=stale)).isoformat()
    saved = confirmed = skipped = failed = 0
    started = time.time()
    stopped_early = 0

    for url in urls:
        e = state.setdefault(url, {"status": "new"})
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        e["social"] = any(host == s or host.endswith("." + s) for s in SOCIAL)

    # ── phase 1: CDX confirm, threaded ──────────────────────────────────────
    # The CDX endpoint is the bottleneck (one IP, a few hundred sequential
    # calls -> heavy throttling). A small worker pool turns a multi-hour pass
    # into a ~20-40 min one. Save Page Now stays serial (phase 2) - it is
    # rate-limited per account and concurrency just gets you 429s.
    to_check = [u for u in urls
                if not (state[u].get("status") == "archived"
                        and state[u].get("checked", "") >= stale_before)]
    skipped = len(urls) - len(to_check)
    print("  phase 1: CDX-confirming %d url(s) (%d already fresh) with %d workers"
          % (len(to_check), skipped, 6), flush=True)

    done = 0
    with _cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(cdx_latest, u): u for u in to_check}
        for fut in _cf.as_completed(futs):
            u, e = futs[fut], state[futs[fut]]
            done += 1
            if done % 50 == 0:
                print("  ... %d/%d" % (done, len(to_check)), flush=True)
            try:
                ts = fut.result()
            except Exception as exc:
                e.update(status=e.get("status", "new"),
                         error=str(exc)[:200], checked=TODAY)
                failed += 1
                continue
            if ts:
                e.update(status="archived", ts=ts, checked=TODAY,
                         wayback="https://web.archive.org/web/%s/%s" % (ts, u))
                e.pop("requested", None)
                e.pop("error", None)
                confirmed += 1

    # ── phase 2: submit the still-unarchived to Save Page Now, serial ───────
    pending_save = [u for u in urls if state[u].get("status") not in ("archived",)]
    for u in pending_save:
        if saved >= limit:
            break
        if budget and time.time() - started > budget:
            stopped_early = len(pending_save) - saved
            print("  time budget (%ds) reached — %d submit(s) done, rest next run"
                  % (budget, saved), flush=True)
            break
        e = state[u]
        if check:
            print("  would save:", u)
            saved += 1
            continue
        try:
            res = save_now(u, auth)
            e.update(status="requested", requested=TODAY)
            if not (res.get("job_id") or res.get("url")):
                e["last_response"] = res
            saved += 1
            time.sleep(4 if auth else 8)
        except Exception as exc:
            e.update(status="failed", error=str(exc)[:200], checked=TODAY)
            failed += 1
            time.sleep(2)

    # prune entries whose URL no longer appears in any CSV
    live = set(urls)
    for dead in [u for u in state if u not in live]:
        del state[dead]

    if not check:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(dict(sorted(state.items())), fh, ensure_ascii=False, indent=1)
        # Stable deduped feed for a future ArchiveBox job (see PIPELINE.md ⑥).
        with open(os.path.join(ROOT, "data", "archive-queue.txt"), "w",
                  encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(urls) + "\n")

    tot = len(urls)
    arch = sum(1 for v in state.values() if v.get("status") == "archived")
    pend = sum(1 for v in state.values() if v.get("status") == "requested")
    soc = sum(1 for v in state.values() if v.get("social") and v.get("status") != "archived")
    print("archive_links: %d urls — %d archived, %d pending, %d not-yet — "
          "this run: +%d confirmed, %d submitted, %d failed, %d skipped"
          % (tot, arch, pend, tot - arch - pend, confirmed, saved, failed, skipped))
    if soc:
        print("  %d social-media links still unarchived — archive.today these by hand" % soc)
    if stopped_early:
        print("  %d url(s) not reached this run (time budget) — next run continues" % stopped_early)


if __name__ == "__main__":
    main()
