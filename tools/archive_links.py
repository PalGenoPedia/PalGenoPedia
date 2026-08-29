#!/usr/bin/env python3
"""
archive_links.py — snapshot curated source & media URLs to the Wayback Machine.

READS   Pages/Historical_Massacres/details.csv        (source_link)
        Pages/War_Crimes_Stats/**/*_incidents.csv      (source_url_1/2, video_url, image_url)
        Pages/War_Crimes_Stats/**/*-resources.csv       (url)
        data/archive-policy.json   per-domain rules for article/report sources
        data/media-policy.json     per-domain rules for video_url / image_url
WRITES  data/archived-links.json    per-URL state   { "<url>": {...} }
        data/source-domains.json    source-domain inventory (dashboard reads it)
        data/media-domains.json     media-domain inventory (media dashboard reads it)
        data/archive-queue.txt      every source URL, deduped (ArchiveBox feed)
        data/media-queue.txt        every media URL, deduped
        data/archive-deferred.txt   URLs whose domain needs a non-Wayback method

── URL roles ───────────────────────────────────────────────────────────────
  primary    source_url_1, and historical source_link — the main citation
  secondary  source_url_2 (comma-separated), and *-resources.csv urls
  video      video_url        }  media — its own policy file, its own dashboard,
  image     image_url         }  usually needs ArchiveBox/manual, not Wayback

── Per-domain policy ───────────────────────────────────────────────────────
Both policy files share a shape, maintained by editors in the volunteer portal:

  { "version": 1, "updated": "...", "updated_by": "...",
    "domains": { "<domain>": { "priority": "high|normal|skip",
                               "method":   "wayback|archivetoday|archivebox|manual" } } }

`--policy-only` (the weekly run) touches a URL only when its domain has a rule
with priority high/normal. method "wayback" → the CDX + Save Page Now flow,
ordered: high-primary, high-secondary, normal-primary, normal-secondary, then
media (high, normal). Any other method → recorded `deferred` (status only, no
network) and written to archive-deferred.txt for the ArchiveBox / archive.today
layer. A domain with no rule, or priority "skip", is left alone.

Without `--policy-only` every collected URL gets the Wayback flow (a full
sweep, from a manual `workflow_dispatch` with mode=full).

Usage:
  python tools/archive_links.py [--policy-only] [--domains-only]
                               [--limit N] [--stale-days D]
                               [--time-budget S] [--sample N] [--check]
    --policy-only  obey archive-policy.json + media-policy.json (opt-in per domain)
    --domains-only just (re)write the two *-domains.json inventories and exit
    --limit        max NEW /save/ submissions this run (default 50)
    --stale-days   re-confirm an archived entry only if older than this (180)
    --time-budget  stop the loop after S seconds and write progress
    --sample N     only look at the first N URLs (local testing)
    --check        report what would happen, write nothing
"""
import csv, glob, json, os, re, sys, time, datetime, urllib.parse, urllib.request
import concurrent.futures as _cf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
STATE = os.path.join(DATA, "archived-links.json")
POLICY_FILE = os.path.join(DATA, "archive-policy.json")
MEDIA_POLICY_FILE = os.path.join(DATA, "media-policy.json")
SOURCE_DOMAINS_FILE = os.path.join(DATA, "source-domains.json")
MEDIA_DOMAINS_FILE = os.path.join(DATA, "media-domains.json")
QUEUE_FILE = os.path.join(DATA, "archive-queue.txt")
MEDIA_QUEUE_FILE = os.path.join(DATA, "media-queue.txt")
DEFERRED_FILE = os.path.join(DATA, "archive-deferred.txt")
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

INCIDENTS_GLOB = os.path.join(ROOT, "Pages/War_Crimes_Stats/**/*_incidents.csv")
RESOURCES_GLOB = os.path.join(ROOT, "Pages/War_Crimes_Stats/**/*-resources.csv")
DETAILS_CSV = os.path.join(ROOT, "Pages", "Historical_Massacres", "details.csv")


def domain_of(url):
    """Registrable-ish host: lowercase netloc with a leading `www.` removed.
    The key archive-policy.json / media-policy.json and the dashboards use."""
    h = urllib.parse.urlparse(url).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def _is_social(url):
    h = domain_of(url)
    return any(h == s or h.endswith("." + s) for s in SOCIAL)


# EXTRACT urls rather than split on separators. Splitting only on whitespace,
# ";" and "," left ~20 cells where two URLs are glued by a stray quote
# (`.../blast/""https://prc.org.uk/...`) as a single bogus "URL" that was
# POSTed to Save Page Now, counted against a real domain in the inventory, and
# could never archive. A findall keeps every genuinely-separated URL exactly as
# before, and additionally recovers the second URL out of a glued pair. Note the
# character class still permits ":" and "/", so a wrapped
# web.archive.org/web/<ts>/http://... stays ONE match and is dropped by
# SKIP_HOSTS below, unchanged.
URL_RE = re.compile(r"""https?://[^\s;,"'<>|]+""")


def _urls(val):
    """Every clean http(s) URL in one cell, dropping our own / archive hosts."""
    out = []
    for u in URL_RE.findall(val or ""):
        u = u.strip().rstrip("/").split("#")[0]
        if not u.lower().startswith(("http://", "https://")):
            continue
        h = domain_of(u)
        if any(h == s or h.endswith("." + s) for s in SKIP_HOSTS):
            continue
        out.append(u)
    return out


def _rows(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def collect_sources():
    """{url: 'primary'|'secondary'}. source_url_1 and the historical source_link
    are primary; source_url_2 and resource-list urls are secondary. If a URL is
    cited both ways, primary wins."""
    role = {}

    def add(val, r):
        for u in _urls(val):
            if r == "primary" or u not in role:
                role[u] = r

    if os.path.exists(DETAILS_CSV):
        for row in _rows(DETAILS_CSV):
            add(row.get("source_link"), "primary")
    for f in glob.glob(INCIDENTS_GLOB, recursive=True):
        for row in _rows(f):
            add(row.get("source_url_1"), "primary")
            add(row.get("source_url_2"), "secondary")
    for f in glob.glob(RESOURCES_GLOB, recursive=True):
        for row in _rows(f):
            add(row.get("url"), "secondary")
    return role


GALLERY_CSV = os.path.join(ROOT, "Pages", "Historical_Massacres", "gallery.csv")


def collect_media():
    """{url: 'video'|'image'}.

    - facility incident sheets: video_url / image_url
    - historical events: image_url / video_url columns on details.csv IF present,
      and Pages/Historical_Massacres/gallery.csv (the planned Event gallery —
      `url` + `type`) when it exists. Both are no-ops until those columns/files
      are added.
    """
    kind = {}

    def add(val, k):
        for u in _urls(val):
            if k == "video" or u not in kind:
                kind[u] = k

    for f in glob.glob(INCIDENTS_GLOB, recursive=True):
        for row in _rows(f):
            add(row.get("video_url"), "video")
            add(row.get("image_url"), "image")

    if os.path.exists(DETAILS_CSV):
        for row in _rows(DETAILS_CSV):
            add(row.get("video_url"), "video")
            add(row.get("image_url"), "image")

    if os.path.exists(GALLERY_CSV):
        for row in _rows(GALLERY_CSV):
            u = (row.get("url") or "").strip()
            t = (row.get("type") or row.get("media_type") or "").strip().lower()
            add(u, "video" if t.startswith("vid") else "image")

    return kind


def collect_all():
    """sorted list of every URL we track (sources + media), for queue + prune."""
    return sorted(set(collect_sources()) | set(collect_media()))


def load_state():
    if os.path.exists(STATE):
        try:
            return json.load(open(STATE, encoding="utf-8"))
        except Exception:
            pass
    return {}


def load_policy(path):
    """{domain: {"priority","method"}} from a policy file, {} if absent.
    Unknown values coerced to safe defaults."""
    try:
        raw = json.load(open(path, encoding="utf-8")).get("domains", {})
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


def write_inventory(path, rolemap, state, role_keys):
    """Write a *-domains.json: one row per domain in `rolemap` with its URL
    count, a per-role breakdown, live archived/pending/deferred counts (from
    `state`, restricted to this map's URLs), and the full `urls` list — each
    `{u, role, status, snap, method}` — so the dashboard can expand a domain."""
    primary_role = role_keys[0]
    inv = {}
    for u, rv in rolemap.items():
        d = domain_of(u)
        e = inv.get(d)
        if e is None:
            e = inv[d] = {"count": 0, "sample": u, "archived": 0,
                          "pending": 0, "deferred": 0, "urls": []}
            for k in role_keys:
                e[k] = 0
        e["count"] += 1
        e[rv] = e.get(rv, 0) + 1
        st = state.get(u, {})
        s = st.get("status") or "new"
        if s == "archived":
            e["archived"] += 1
        elif s == "requested":
            e["pending"] += 1
        elif s == "deferred":
            e["deferred"] += 1
        e["urls"].append({
            "u": u, "role": rv, "status": s,
            "snap": st.get("wayback") or "",
            "method": st.get("method") or "",
            "manual": bool(st.get("manual")),
        })
    for e in inv.values():
        e["urls"].sort(key=lambda x: (x["role"] != primary_role, x["u"]))
    payload = {"generated": TODAY, "domains": dict(sorted(inv.items()))}
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
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

    Short timeout + a couple of backoff retries: the CDX endpoint throttles hard
    under a few hundred sequential requests and a 30s stall per URL is what
    turned the seeding run into a 4-hour job."""
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


def _argv_int(args, name, default):
    for i, a in enumerate(args):
        if a == name and i + 1 < len(args):
            return int(args[i + 1])
    return default


def main():
    args = sys.argv[1:]
    check = "--check" in args
    domains_only = "--domains-only" in args
    policy_only = "--policy-only" in args
    limit = _argv_int(args, "--limit", 50)
    stale = _argv_int(args, "--stale-days", 180)
    sample = _argv_int(args, "--sample", 0)
    budget = _argv_int(args, "--time-budget", 0)   # seconds; 0 = no limit

    state = load_state()
    sources = collect_sources()
    media = collect_media()
    all_urls = sorted(set(sources) | set(media))
    if sample:
        all_urls = all_urls[:sample]
        keep = set(all_urls)
        sources = {u: r for u, r in sources.items() if u in keep}
        media = {u: k for u, k in media.items() if u in keep}

    # Drop state for URLs no longer cited anywhere — EXCEPT the ones an editor
    # recorded by hand from the dashboard. A source_link edited in the Sheet
    # (a typo fix, a swapped outlet) changes the key, and without this the very
    # next CSV push would silently delete a snapshot a human went and found.
    # Machine-derived state is cheap to rebuild; a manual entry is not.
    live = set(all_urls)
    orphan_manual = 0
    for dead in [u for u in state if u not in live]:
        if state[dead].get("manual"):
            orphan_manual += 1
            continue
        del state[dead]
    if orphan_manual:
        print("  note: %d manual snapshot(s) kept for URLs no longer cited in "
              "any CSV — a source link may have been edited in the Sheet"
              % orphan_manual)

    # ── --domains-only: refresh both inventories and stop ──────────────────
    if domains_only:
        n1 = write_inventory(SOURCE_DOMAINS_FILE, sources, state, ("primary", "secondary"))
        n2 = write_inventory(MEDIA_DOMAINS_FILE, media, state, ("video", "image"))
        if not check:
            with open(STATE, "w", encoding="utf-8", newline="\n") as fh:
                json.dump(dict(sorted(state.items())), fh, ensure_ascii=False, indent=1)
        print("archive_links: wrote source-domains.json (%d) + media-domains.json (%d)" % (n1, n2))
        return

    access = os.environ.get("IA_ACCESS", "").strip()
    secret = os.environ.get("IA_SECRET", "").strip()
    auth = "LOW %s:%s" % (access, secret) if access and secret else None
    if not auth:
        print("  note: no IA_ACCESS / IA_SECRET — Save Page Now runs unauthenticated (lower rate limit)")

    for u in all_urls:
        e = state.setdefault(u, {"status": "new"})
        e["social"] = _is_social(u)

    # ── decide the Wayback work set (ordered) ──────────────────────────────
    deferred_now = 0
    if policy_only:
        pol_src = load_policy(POLICY_FILE)
        pol_med = load_policy(MEDIA_POLICY_FILE)
        # Archiving is opt-in per domain, so "no rules" is a legitimate state —
        # but it is indistinguishable from a broken/absent policy file, and it
        # means this run will do nothing at all. Say which it is, every time.
        if not pol_src and not pol_med:
            missing = [f for f in (POLICY_FILE, MEDIA_POLICY_FILE)
                       if not os.path.exists(f)]
            print("  WARNING: no archiving policy is in effect — this run will "
                  "not archive anything.")
            if missing:
                print("           %s does not exist in the repo yet."
                      % ", ".join(os.path.relpath(f, ROOT) for f in missing))
            print("           Set each source domain's priority + method in the "
                  "volunteer portal (Archive priorities / Media archiving); "
                  "domains with no rule are skipped by design.")
        tiers = {"hp": [], "hs": [], "np": [], "ns": [], "mh": [], "mn": []}
        deferred = []

        for u, rolev in sources.items():
            if state[u].get("manual"):       # a human recorded a snapshot — leave it
                continue
            rule = pol_src.get(domain_of(u))
            if not rule or rule["priority"] == "skip":
                continue
            if rule["method"] != "wayback":
                deferred.append((u, rule["method"]))
                continue
            key = ("h" if rule["priority"] == "high" else "n") + ("p" if rolev == "primary" else "s")
            tiers[key].append(u)

        for u in media:
            if state[u].get("manual"):
                continue
            rule = pol_med.get(domain_of(u))
            if not rule or rule["priority"] == "skip":
                continue
            if rule["method"] != "wayback":
                deferred.append((u, rule["method"]))
                continue
            tiers["mh" if rule["priority"] == "high" else "mn"].append(u)

        work = (tiers["hp"] + tiers["hs"] + tiers["np"] + tiers["ns"]
                + tiers["mh"] + tiers["mn"])
        for u, meth in deferred:
            state[u].update(status="deferred", method=meth, checked=TODAY)
            state[u].pop("error", None)
            state[u].pop("last_response", None)
        deferred_now = len(deferred)
        print("  policy: sources %d/%d domains configured, media %d — "
              "%d wayback url(s) [%dh-pri %dh-sec %dn-pri %dn-sec / media %dh %dn], "
              "%d deferred to other methods"
              % (len(pol_src), len({domain_of(u) for u in sources}), len(pol_med),
                 len(work), len(tiers["hp"]), len(tiers["hs"]), len(tiers["np"]),
                 len(tiers["ns"]), len(tiers["mh"]), len(tiers["mn"]), deferred_now),
              flush=True)
    else:
        work = [u for u in all_urls if not state[u].get("manual")]

    stale_before = (datetime.date.today() - datetime.timedelta(days=stale)).isoformat()
    saved = confirmed = skipped = failed = 0
    started = time.time()
    stopped_early = 0

    # ── phase 1: CDX confirm, threaded ────────────────────────────────────
    to_check = [u for u in work
                if not state[u].get("manual")
                and not (state[u].get("status") == "archived"
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

    # ── phase 2: submit the still-unarchived to Save Page Now, serial ─────
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

    if not check:
        os.makedirs(DATA, exist_ok=True)
        with open(STATE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(dict(sorted(state.items())), fh, ensure_ascii=False, indent=1)
        with open(QUEUE_FILE, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(sorted(sources)) + "\n")
        with open(MEDIA_QUEUE_FILE, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(sorted(media)) + "\n")
        write_deferred(state)
        write_inventory(SOURCE_DOMAINS_FILE, sources, state, ("primary", "secondary"))
        write_inventory(MEDIA_DOMAINS_FILE, media, state, ("video", "image"))

    tot = len(all_urls)
    arch = sum(1 for v in state.values() if v.get("status") == "archived")
    pend = sum(1 for v in state.values() if v.get("status") == "requested")
    defr = sum(1 for v in state.values() if v.get("status") == "deferred")
    soc = sum(1 for v in state.values()
              if v.get("social") and v.get("status") not in ("archived", "deferred"))
    print("archive_links: %d urls (%d source, %d media) — %d archived, %d pending, "
          "%d deferred, %d not-yet — this run: +%d confirmed, %d submitted, "
          "%d failed, %d fresh-skip"
          % (tot, len(sources), len(media), arch, pend, defr,
             tot - arch - pend - defr, confirmed, saved, failed, skipped))
    if soc:
        print("  %d social-media link(s) not covered by a policy method — "
              "set their domains to archivetoday in the portal" % soc)
    if stopped_early:
        print("  %d url(s) not reached this run (time budget) — next run continues" % stopped_early)


if __name__ == "__main__":
    main()
