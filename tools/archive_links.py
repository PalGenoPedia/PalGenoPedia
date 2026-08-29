#!/usr/bin/env python3
"""
archive_links.py — snapshot curated source URLs to the Wayback Machine.

READS   Pages/Historical_Massacres/details.csv        (source_link)
        Pages/War_Crimes_Stats/**/*_incidents.csv      (source_url_1/2, video_url)
        Pages/War_Crimes_Stats/**/*-resources.csv       (url)
        data/archive-policy.json                        per-domain rules (see below)
WRITES  data/archived-links.json    per-URL state   { "<url>": {...} }
        data/source-domains.json    domain inventory the portal dashboard reads
        data/archive-queue.txt      every URL, deduped (future ArchiveBox feed)
        data/archive-deferred.txt   URLs whose domain needs a non-Wayback method

── Per-domain policy ────────────────────────────────────────────────────────
`data/archive-policy.json` is maintained by editors in the volunteer portal
(contribute.palgenopedia.org → "Archive priorities"). Shape:

  { "version": 1, "updated": "...", "updated_by": "...",
    "domains": { "<domain>": { "priority": "high|normal|skip",
                               "method":   "wayback|archivetoday|archivebox|manual" } } }

`--policy-only` (the weekly workflow) touches a URL only when its domain has a
rule with priority high/normal. method "wayback" → the CDX + Save Page Now
flow below, high domains first. Any other method → recorded as `deferred`
(status only, no network) and written to archive-deferred.txt for the planned
ArchiveBox / archive.today layer. A domain with no rule, or priority "skip",
is left completely alone — archiving is opt-in per domain.

Without `--policy-only` every collected URL gets the Wayback flow (a full
sweep, still available from a manual `workflow_dispatch`).

── Per URL (Wayback flow) ──────────────────────────────────────────────────
  1. CDX check — http://web.archive.org/cdx/search/cdx — already captured?
     (fast, no auth, run through a small thread pool). If so, record it.
  2. Otherwise POST to Save Page Now (https://web.archive.org/save/), serial.
     With IA_ACCESS / IA_SECRET this is authenticated (higher rate limit). We
     do NOT poll — the next run's CDX check picks the snapshot up once it lands.

State (`status`):
  archived  — a capture exists; `wayback` is the snapshot URL, `ts` its 14-digit
              timestamp, `checked` the date we last confirmed it
  requested — a /save/ was submitted; `requested` is the date
  deferred  — domain method is not Wayback; `method` says which layer owns it
  failed    — the submit errored; retried next run

Usage:
  python tools/archive_links.py [--policy-only] [--domains-only]
                               [--limit N] [--stale-days D]
                               [--time-budget S] [--sample N] [--check]
    --policy-only  obey data/archive-policy.json (opt-in per domain). The
                   scheduled workflow uses this.
    --domains-only just (re)write data/source-domains.json and exit. No network.
                   Run on every CSV change so the portal always has a fresh list.
    --limit        max NEW /save/ submissions this run (default 50). `--limit 0`
                   = CDX-confirm only, submit nothing.
    --stale-days   re-confirm an `archived` entry only if older than this
                   (default 180). Snapshots don't disappear, so this is rare.
    --time-budget  stop the loop cleanly after S seconds and write progress;
                   the URLs not reached carry to the next run.
    --sample N     only look at the first N URLs (local testing).
    --check        report what would happen, write nothing.
"""
import csv, glob, json, os, re, sys, time, datetime, urllib.parse, urllib.request
import concurrent.futures as _cf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE = os.path.join(ROOT, "data", "archived-links.json")
POLICY_FILE = os.path.join(ROOT, "data", "archive-policy.json")
DOMAINS_FILE = os.path.join(ROOT, "data", "source-domains.json")
QUEUE_FILE = os.path.join(ROOT, "data", "archive-queue.txt")
DEFERRED_FILE = os.path.join(ROOT, "data", "archive-deferred.txt")
TODAY = datetime.date.today().isoformat()

CDX = "http://web.archive.org/cdx/search/cdx"
SAVE = "https://web.archive.org/save/"
UA = "PalGenoPedia-archiver/1.0 (+https://palgenopedia.org)"

PRIORITIES = ("high", "normal", "skip")
METHODS = ("wayback", "archivetoday", "archivebox", "manual")

SOCIAL = ("x.com", "twitter.com", "facebook.com", "fb.com", "instagram.com",
          "tiktok.com", "threads.net")

SKIP_HOSTS = ("web.archive.org", "archive.org", "archive.ph", "archive.today",
              "palgenopedia.org", "localhost")


def domain_of(url):
    """Registrable-ish host: lowercase netloc with a leading `www.` removed.
    Matches the key the portal dashboard and archive-policy.json use."""
    h = urllib.parse.urlparse(url).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def _is_social(url):
    h = domain_of(url)
    return any(h == s or h.endswith("." + s) for s in SOCIAL)


def collect_urls():
    urls = set()

    def add(val):
        for u in re.split(r"[\s;,]+", (val or "").strip()):
            u = u.strip().rstrip("/").split("#")[0]
            if not u.lower().startswith(("http://", "https://")):
                continue
            host = domain_of(u)
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


def collect_domains(urls=None):
    """{domain: {count, sample}} over every collected URL."""
    inv = {}
    for u in (urls if urls is not None else collect_urls()):
        e = inv.setdefault(domain_of(u), {"count": 0, "sample": u})
        e["count"] += 1
    return inv


def load_state():
    if os.path.exists(STATE):
        try:
            return json.load(open(STATE, encoding="utf-8"))
        except Exception:
            pass
    return {}


def load_policy():
    """{domain: {"priority","method"}} from data/archive-policy.json, {} if absent.
    Unknown priority/method values are coerced to safe defaults."""
    try:
        raw = json.load(open(POLICY_FILE, encoding="utf-8")).get("domains", {})
    except Exception:
        return {}
    out = {}
    for dom, rule in raw.items():
        prio = str((rule or {}).get("priority", "")).lower()
        meth = str((rule or {}).get("method", "")).lower()
        out[dom.lower()] = {
            "priority": prio if prio in PRIORITIES else "normal",
            "method": meth if meth in METHODS else "wayback",
        }
    return out


def write_domains(state, urls=None):
    inv = collect_domains(urls)
    for u, v in state.items():
        d = domain_of(u)
        if d not in inv:
            continue
        st = v.get("status")
        inv[d]["archived"] = inv[d].get("archived", 0) + (st == "archived")
        inv[d]["pending"] = inv[d].get("pending", 0) + (st == "requested")
        inv[d]["deferred"] = inv[d].get("deferred", 0) + (st == "deferred")
    for d in inv:
        for k in ("archived", "pending", "deferred"):
            inv[d].setdefault(k, 0)
    payload = {"generated": TODAY, "domains": dict(sorted(inv.items()))}
    with open(DOMAINS_FILE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    return len(inv)


def write_deferred(state):
    groups = {}
    for u, v in state.items():
        if v.get("status") == "deferred":
            groups.setdefault(v.get("method", "manual"), []).append(u)
    lines = []
    for m in ("archivetoday", "archivebox", "manual"):
        if groups.get(m):
            lines.append("# " + m)
            lines.extend(sorted(groups[m]))
            lines.append("")
    with open(DEFERRED_FILE, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + ("\n" if lines else ""))


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


def _arg(args, name, default):
    for i, a in enumerate(args):
        if a == name and i + 1 < len(args):
            return int(args[i + 1])
    return default


def main():
    args = sys.argv[1:]
    check = "--check" in args
    domains_only = "--domains-only" in args
    policy_only = "--policy-only" in args
    limit = _arg(args, "--limit", 50)
    stale = _arg(args, "--stale-days", 180)
    sample = _arg(args, "--sample", 0)
    budget = _arg(args, "--time-budget", 0)   # seconds; 0 = no limit

    state = load_state()

    # ── --domains-only: refresh the portal's inventory and stop ─────────────
    if domains_only:
        urls = collect_urls()
        # drop state for URLs no longer in any CSV so the counts stay honest
        live = set(urls)
        for dead in [u for u in state if u not in live]:
            del state[dead]
        n = write_domains(state, urls)
        if not check:
            with open(STATE, "w", encoding="utf-8", newline="\n") as fh:
                json.dump(dict(sorted(state.items())), fh, ensure_ascii=False, indent=1)
        print("archive_links: wrote data/source-domains.json — %d domains" % n)
        return

    access = os.environ.get("IA_ACCESS", "").strip()
    secret = os.environ.get("IA_SECRET", "").strip()
    auth = "LOW %s:%s" % (access, secret) if access and secret else None
    if not auth:
        print("  note: no IA_ACCESS / IA_SECRET — Save Page Now runs unauthenticated (lower rate limit)")

    urls = collect_urls()
    if sample:
        urls = urls[:sample]

    for url in urls:
        e = state.setdefault(url, {"status": "new"})
        e["social"] = _is_social(url)

    # ── decide the Wayback work set ────────────────────────────────────────
    policy = load_policy() if policy_only else {}
    deferred_now = 0
    if policy_only:
        high, normal, deferred = [], [], []
        for u in urls:
            rule = policy.get(domain_of(u))
            if not rule or rule["priority"] == "skip":
                continue
            if rule["method"] == "wayback":
                (high if rule["priority"] == "high" else normal).append(u)
            else:
                deferred.append((u, rule["method"]))
        work = high + normal
        for u, meth in deferred:
            state[u].update(status="deferred", method=meth, checked=TODAY)
            state[u].pop("error", None)
            state[u].pop("last_response", None)
        deferred_now = len(deferred)
        n_skip = len(policy) - len({domain_of(u) for u in work} |
                                   {domain_of(u) for u, _ in deferred})
        print("  policy: %d domain(s) configured — %d wayback url(s) "
              "(%d high / %d normal), %d deferred to other methods, "
              "%d configured domain(s) set to skip; every other domain untouched"
              % (len(policy), len(work), len(high), len(normal),
                 deferred_now, max(n_skip, 0)), flush=True)
    else:
        work = urls

    stale_before = (datetime.date.today() - datetime.timedelta(days=stale)).isoformat()
    saved = confirmed = skipped = failed = 0
    started = time.time()
    stopped_early = 0

    # ── phase 1: CDX confirm, threaded ─────────────────────────────────────
    # The CDX endpoint is the bottleneck (one IP, a few hundred sequential
    # calls -> heavy throttling). A small worker pool turns a multi-hour pass
    # into a ~20-40 min one. Save Page Now stays serial (phase 2) - it is
    # rate-limited per account and concurrency just gets you 429s.
    to_check = [u for u in work
                if not (state[u].get("status") == "archived"
                        and state[u].get("checked", "") >= stale_before)]
    skipped = len(work) - len(to_check)

    if not check:
        print("  phase 1: CDX-confirming %d url(s) (%d already fresh) with 6 workers"
              % (len(to_check), skipped), flush=True)
        done = 0
        with _cf.ThreadPoolExecutor(max_workers=6) as ex:
            futs = {ex.submit(cdx_latest, u): u for u in to_check}
            for fut in _cf.as_completed(futs):
                u = futs[fut]
                e = state[u]
                done += 1
                if done % 50 == 0:
                    print("  ... %d/%d" % (done, len(to_check)), flush=True)
                try:
                    ts = fut.result()
                except Exception as exc:
                    e.update(error=str(exc)[:200], checked=TODAY)
                    failed += 1
                    continue
                if ts:
                    e.update(status="archived", ts=ts, checked=TODAY,
                             wayback="https://web.archive.org/web/%s/%s" % (ts, u))
                    e.pop("requested", None)
                    e.pop("error", None)
                    confirmed += 1

    # ── phase 2: submit the still-unarchived to Save Page Now, serial ──────
    pending_save = [u for u in work if state[u].get("status") != "archived"]
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
        with open(QUEUE_FILE, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(urls) + "\n")
        write_deferred(state)
        write_domains(state, urls)

    tot = len(urls)
    arch = sum(1 for v in state.values() if v.get("status") == "archived")
    pend = sum(1 for v in state.values() if v.get("status") == "requested")
    defr = sum(1 for v in state.values() if v.get("status") == "deferred")
    soc = sum(1 for v in state.values()
              if v.get("social") and v.get("status") not in ("archived", "deferred"))
    print("archive_links: %d urls — %d archived, %d pending, %d deferred, %d not-yet — "
          "this run: +%d confirmed, %d submitted, %d failed, %d fresh-skip"
          % (tot, arch, pend, defr, tot - arch - pend - defr,
             confirmed, saved, failed, skipped))
    if soc:
        print("  %d social-media link(s) not covered by a policy method — "
              "set their domains to archivetoday in the portal" % soc)
    if stopped_early:
        print("  %d url(s) not reached this run (time budget) — next run continues" % stopped_early)


if __name__ == "__main__":
    main()
